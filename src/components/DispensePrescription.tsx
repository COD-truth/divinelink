import { useEffect, useMemo, useState } from "react";
import { db, generatePatientId, generateAnonCode, type Patient, type Drug } from "@/lib/db";
import { decryptPatients, encryptPatientForSave } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { logAudit } from "@/lib/audit";
import { generateThermalReceipt, type ReceiptLineItem } from "./ReceiptGenerator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, UserPlus, Printer, Pill, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

interface Line { drugId?: number; name: string; unitPrice: number; qtyPrescribed: number; qtyDispensed: number; free: boolean; }

const DICT = {
  fr: {
    title: "🧾 Ordonnance / Dispensation", patient: "Patient", choose: "Choisir un patient…", quickNew: "＋ Nouveau",
    addDrug: "Ajouter un médicament", pickDrug: "Médicament (stock)…", prescribed: "Prescrit", dispensed: "Donné", free: "Gratuit",
    noLines: "Ajoutez les médicaments prescrits.", total: "Total à payer", save: "Enregistrer", savePrint: "Enregistrer & reçu",
    cancel: "Annuler", pickPatient: "Choisissez un patient", addLine: "Ajoutez au moins un médicament",
    saved: (n: number) => `Ordonnance enregistrée (${n} donné)`, insufficient: (d: string) => `Stock insuffisant: ${d}`,
    qpTitle: "Nouveau patient (rapide)", qpName: "Nom complet", qpAge: "Âge", qpSex: "Sexe", qpPhone: "Téléphone", qpSave: "Créer", qpNameReq: "Nom requis",
    note: "Tout est enregistré (même gratuit). Le reçu est optionnel.",
    searchDrug: "Rechercher ou saisir un médicament…", createDrug: (n: string) => `＋ Créer « ${n} »`, noDrug: "Aucun médicament. Tapez pour en créer un.",
    ndTitle: "Nouveau médicament", ndPrice: "Prix de vente (FCFA)", ndStock: "Stock initial", ndUnit: "Unité", ndSave: "Créer & ajouter",
    drugCreated: (n: string) => `${n} créé (pharmacie + magasin)`,
    walkIn: "Vente libre", walkInName: "Vente libre / Client comptant", walkInHint: "sans nom de patient",
    unitPriceLbl: "Prix U.", qtyLbl: "Qté", walkInTitle: "🛒 Vente libre",
  },
  en: {
    title: "🧾 Prescription / Dispensing", patient: "Patient", choose: "Select a patient…", quickNew: "＋ New",
    addDrug: "Add a drug", pickDrug: "Drug (in stock)…", prescribed: "Prescribed", dispensed: "Given", free: "Free",
    noLines: "Add the prescribed drugs.", total: "Total due", save: "Save", savePrint: "Save & receipt",
    cancel: "Cancel", pickPatient: "Choose a patient", addLine: "Add at least one drug",
    saved: (n: number) => `Prescription saved (${n} given)`, insufficient: (d: string) => `Insufficient stock: ${d}`,
    qpTitle: "New patient (quick)", qpName: "Full name", qpAge: "Age", qpSex: "Sex", qpPhone: "Phone", qpSave: "Create", qpNameReq: "Name required",
    note: "Everything is recorded (free included). The receipt is optional.",
    searchDrug: "Search or type a drug…", createDrug: (n: string) => `＋ Create "${n}"`, noDrug: "No drug. Type to create one.",
    ndTitle: "New drug", ndPrice: "Sell price (FCFA)", ndStock: "Initial stock", ndUnit: "Unit", ndSave: "Create & add",
    drugCreated: (n: string) => `${n} created (pharmacy + store)`,
    walkIn: "Walk-in sale", walkInName: "Walk-in / Over-the-counter", walkInHint: "no patient name",
    unitPriceLbl: "Unit price", qtyLbl: "Qty", walkInTitle: "🛒 Walk-in sale",
  },
};

function dobFromAge(age: number): string { const d = new Date(); d.setFullYear(d.getFullYear() - age); return d.toISOString().slice(0, 10); }

export function DispensePrescription({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void }) {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };

  const [patients, setPatients] = useState<Patient[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [patientId, setPatientId] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [qpOpen, setQpOpen] = useState(false);
  const [qp, setQp] = useState({ name: "", age: "", sex: "" as "M" | "F" | "", phone: "" });
  // Drug search box (type-to-filter + create new inline)
  const [drugQuery, setDrugQuery] = useState("");
  const [drugMenu, setDrugMenu] = useState(false);
  const [newDrug, setNewDrug] = useState<{ open: boolean; name: string; price: string; stock: string; unit: string }>({ open: false, name: "", price: "", stock: "", unit: "unité" });

  const reload = async () => {
    setPatients((await decryptPatients(await db.patients.toArray())).filter(p => !p.deleted && inClinic(p.clinicId)));
    setDrugs((await db.drugs.toArray()).filter(d => inClinic(d.clinicId)));
  };
  useEffect(() => { if (open) { reload(); setPatientId(""); setWalkIn(false); setLines([]); } }, [open]);

  const patient = patients.find(p => String(p.id) === patientId);
  const total = useMemo(() => lines.reduce((s, l) => s + (l.free ? 0 : l.qtyDispensed * l.unitPrice), 0), [lines]);

  const pickDrug = (d: Drug) => {
    setLines(ls => [...ls, { drugId: d.id, name: d.name, unitPrice: d.sellPrice || 0, qtyPrescribed: 1, qtyDispensed: d.stock > 0 ? 1 : 0, free: false }]);
    setDrugQuery(""); setDrugMenu(false);
  };
  // Create a brand-new drug from the search box: real Drug record (asks
  // price/stock) + mirror into the Magasin, then add it as a line.
  const createNewDrug = async () => {
    const name = newDrug.name.trim(); if (!name) { toast.error(L.qpNameReq); return; }
    const now = new Date().toISOString();
    const c = cid();
    const price = parseFloat(newDrug.price) || 0;
    const stock = parseInt(newDrug.stock) || 0;
    const drug = {
      name, category: "Médicament", stock, stockMagasin: 0, initialStock: stock,
      unit: newDrug.unit || "unité", buyPrice: 0, sellPrice: price, minStock: 5,
      status: stock > 0 ? "in_stock" : "out", clinicId: c, createdAt: now, updatedAt: now,
    } as Drug;
    const id = await db.drugs.add(drug);
    await logAudit("drug_create", user?.name || "—", { resource: "drug", resourceId: id, message: `${name} · stock=${stock} (ordonnance)` });
    // One-way model: a drug created on the Pharmacie counter stays here; it does
    // NOT create or change anything in the Magasin.
    await reload();
    setLines(ls => [...ls, { drugId: id, name, unitPrice: price, qtyPrescribed: 1, qtyDispensed: stock > 0 ? 1 : 0, free: false }]);
    setNewDrug({ open: false, name: "", price: "", stock: "", unit: "unité" });
    setDrugQuery(""); setDrugMenu(false);
    toast.success(L.drugCreated(name));
  };
  const upd = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const rm = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));

  const saveQuickPatient = async () => {
    if (!qp.name.trim()) { toast.error(L.qpNameReq); return; }
    const parts = qp.name.trim().split(/\s+/);
    const ageNum = qp.age ? parseInt(qp.age) : undefined;
    const now = new Date().toISOString();
    const payload = await encryptPatientForSave({ firstName: parts[0], lastName: parts.slice(1).join(" ") || "", phone: qp.phone.trim(), dob: ageNum !== undefined ? dobFromAge(ageNum) : "", address: "", medicalAlerts: "", ageYears: ageNum });
    const pid = await generatePatientId();
    const uid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const newId = await db.patients.add({ ...(payload as any), uid, deleted: false, patientId: pid, anonCode: generateAnonCode(), clinicId: cid(), sex: qp.sex || undefined, registeredBy: user?.name || "—", registeredById: user?.id, registeredAt: now, visitType: "new_consultation", reasonForVisit: lang === "en" ? "Pharmacy" : "Pharmacie", createdAt: now, updatedAt: now }) as number;
    await logAudit("patient_create", user?.name || "—", { resource: "patient", resourceId: pid, message: `${qp.name.trim()} (pharmacie)` });
    await reload(); setPatientId(String(newId)); setQpOpen(false); setQp({ name: "", age: "", sex: "", phone: "" });
  };

  const doSave = async (print: boolean) => {
    if (!walkIn && !patient) { toast.error(L.pickPatient); return; }
    const pid = walkIn ? undefined : patient!.id;
    const pname = walkIn ? L.walkInName : `${patient!.firstName} ${patient!.lastName}`.trim();
    const pcode = walkIn ? undefined : patient!.patientId;
    const clean = lines.filter(l => l.name.trim() && (l.qtyPrescribed > 0 || l.qtyDispensed > 0));
    if (!clean.length) { toast.error(L.addLine); return; }
    // stock check for dispensed lines
    for (const l of clean) {
      if (l.qtyDispensed > 0 && l.drugId) {
        const d = drugs.find(x => x.id === l.drugId);
        if (d && l.qtyDispensed > d.stock) { toast.error(L.insufficient(l.name)); return; }
      }
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const c = cid();
      const invoiceNumber = String((await db.payments.count()) + 1).padStart(7, "0");
      // Deduct dispensed drugs + log each as a dispensing transaction (free still recorded).
      for (const l of clean) {
        if (l.qtyDispensed > 0 && l.drugId) {
          const d = await db.drugs.get(l.drugId); if (!d) continue;
          const before = d.stock || 0; const after = Math.max(0, before - l.qtyDispensed);
          await db.drugs.update(l.drugId, { stock: after, updatedAt: now });
          await db.drugTransactions.add({
            drugId: l.drugId, type: "out", quantity: l.qtyDispensed, price: l.free ? 0 : l.unitPrice,
            patientId: pid, paymentStatus: l.free ? "paid" : "paid", exitReason: "dispensed",
            performedBy: user?.name, stockBefore: before, stockAfter: after,
            notes: `Prescrit ${l.qtyPrescribed}, donné ${l.qtyDispensed}${l.free ? " · gratuit" : ""}${walkIn ? " · vente libre" : ""}`, clinicId: c, createdAt: now,
          } as any);
          await logAudit("drug_dispense", user?.name || "—", { resource: "drug", resourceId: l.drugId, message: `${l.name} -${l.qtyDispensed} · ${pname}${l.free ? " (gratuit)" : ""}` });
        }
      }
      // Billable facture from non-free dispensed lines
      const billItems = clean.filter(l => l.qtyDispensed > 0 && !l.free && l.unitPrice > 0)
        .map(l => ({ name: l.name, quantity: l.qtyDispensed, unitPrice: l.unitPrice, drugId: l.drugId, category: "Pharmacie" }));
      if (billItems.length) {
        await db.payments.add({
          patientId: pid ?? 0, patientName: pname, invoiceNumber, items: billItems,
          label: billItems.map(i => i.name).slice(0, 3).join(", "),
          amountDue: total, amountPaid: total, balance: 0, status: "paid", method: "cash", paidAt: now,
          installments: [{ id: (globalThis.crypto?.randomUUID?.() || String(Date.now())), amount: total, method: "cash", paidAt: now, receivedBy: user?.name }],
          clinicId: c, createdAt: now, updatedAt: now,
        } as any);
      }
      // Prescription record (prescribed vs given) for history/stats
      await db.prescriptions.add({
        uid: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        patientId: pid ?? 0, patientName: pname,
        lines: clean, total, invoiceNumber: billItems.length ? invoiceNumber : undefined,
        prescribedBy: user?.name, clinicId: c, createdAt: now, updatedAt: now,
      } as any);

      if (print && billItems.length) {
        const items: ReceiptLineItem[] = billItems.map(i => ({ description: i.name, quantity: i.quantity, unitPrice: i.unitPrice }));
        generateThermalReceipt({ receiptNumber: invoiceNumber, date: new Date().toLocaleString("fr-FR"), patientName: pname, patientId: pcode, cashier: user?.name, items, paymentMethod: "cash", status: "paid", amountPaid: total, amountDue: total });
      }
      toast.success(L.saved(clean.filter(l => l.qtyDispensed > 0).length));
      onSaved?.(); onOpenChange(false);
    } catch (e: any) { toast.error("Erreur: " + (e?.message || "échec")); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{walkIn ? L.walkInTitle : L.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{L.patient}</label>
                <Button type="button" size="sm" variant={walkIn ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setWalkIn(v => !v)}>
                  <ShoppingBag className="w-3.5 h-3.5" /> {L.walkIn}
                </Button>
              </div>
              {walkIn ? (
                <div className="mt-1 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">{L.walkInName} — {L.walkInHint}</div>
              ) : (
                <div className="flex gap-2 mt-1">
                  <Select value={patientId} onValueChange={setPatientId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder={L.choose} /></SelectTrigger>
                    <SelectContent>{patients.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName} {p.patientId ? `· ${p.patientId}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className="gap-1 whitespace-nowrap" onClick={() => { setQp({ name: "", age: "", sex: "", phone: "" }); setQpOpen(true); }}><UserPlus className="w-4 h-4" /> {L.quickNew}</Button>
                </div>
              )}
            </div>

            {/* Drug search box — type to filter the whole catalogue, or create
                a new drug inline (mirrored to the Magasin). */}
            <div className="relative">
              <div className="flex items-center gap-2 rounded-md border px-2 h-9">
                <Pill className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  className="flex-1 bg-transparent outline-none text-sm"
                  placeholder={L.searchDrug}
                  value={drugQuery}
                  onChange={e => { setDrugQuery(e.target.value); setDrugMenu(true); }}
                  onFocus={() => setDrugMenu(true)}
                  onBlur={() => setTimeout(() => setDrugMenu(false), 150)}
                />
              </div>
              {drugMenu && (() => {
                const q = drugQuery.trim().toLowerCase();
                const matches = drugs
                  .filter(d => !q || d.name.toLowerCase().includes(q))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .slice(0, 40);
                const exact = !!q && drugs.some(d => d.name.trim().toLowerCase() === q);
                return (
                  <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-popover shadow-md">
                    {matches.length === 0 && !q && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">{L.noDrug}</div>
                    )}
                    {matches.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between gap-2"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => pickDrug(d)}
                      >
                        <span className="truncate">{d.name}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{(d.sellPrice || 0).toLocaleString()} F · {d.stock}</span>
                      </button>
                    ))}
                    {q && !exact && (
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm font-medium text-primary hover:bg-accent border-t"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setNewDrug({ open: true, name: drugQuery.trim(), price: "", stock: "", unit: "unité" })}
                      >
                        {L.createDrug(drugQuery.trim())}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="space-y-2">
              {lines.length === 0 && <p className="text-sm text-muted-foreground">{L.noLines}</p>}
              {lines.length > 0 && (
                <div className="hidden sm:flex gap-2 text-[10px] uppercase text-muted-foreground px-1">
                  <span className="flex-1">Médicament</span>
                  <span className="w-20 text-center">{L.unitPriceLbl}</span>
                  {walkIn ? (
                    <span className="w-16 text-center">{L.qtyLbl}</span>
                  ) : (
                    <>
                      <span className="w-16 text-center">{L.prescribed}</span>
                      <span className="w-16 text-center">{L.dispensed}</span>
                      <span className="w-14 text-center">{L.free}</span>
                    </>
                  )}
                  <span className="w-20 text-right">Total</span><span className="w-8" />
                </div>
              )}
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm truncate">{l.name}</span>
                  <Input type="number" min={0} className={`w-20 h-8 ${!l.free && l.unitPrice <= 0 ? "border-destructive text-destructive focus-visible:ring-destructive" : ""}`} value={l.unitPrice} onChange={e => upd(i, { unitPrice: parseFloat(e.target.value) || 0 })} title={L.unitPriceLbl} placeholder="0" />
                  {walkIn ? (
                    <Input type="number" min={0} className="w-16 h-8" value={l.qtyDispensed} onChange={e => { const q = parseInt(e.target.value) || 0; upd(i, { qtyDispensed: q, qtyPrescribed: q }); }} title={L.qtyLbl} />
                  ) : (
                    <>
                      <Input type="number" min={0} className="w-16 h-8" value={l.qtyPrescribed} onChange={e => upd(i, { qtyPrescribed: parseInt(e.target.value) || 0 })} title={L.prescribed} />
                      <Input type="number" min={0} className="w-16 h-8" value={l.qtyDispensed} onChange={e => upd(i, { qtyDispensed: parseInt(e.target.value) || 0 })} title={L.dispensed} />
                      <label className="w-14 flex justify-center"><input type="checkbox" checked={l.free} onChange={e => upd(i, { free: e.target.checked })} /></label>
                    </>
                  )}
                  <span className="w-20 text-right text-sm">{l.free ? "—" : (l.qtyDispensed * l.unitPrice).toLocaleString()}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => rm(i)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              ))}
            </div>

            <div className="rounded-lg border p-3 flex justify-between items-center bg-muted/30">
              <span className="text-sm">{L.total}</span><span className="font-bold">{total.toLocaleString()} FCFA</span>
            </div>
            <p className="text-xs text-muted-foreground">{L.note}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{L.cancel}</Button>
            <Button variant="secondary" onClick={() => doSave(false)} disabled={saving}>{L.save}</Button>
            <Button onClick={() => doSave(true)} disabled={saving} className="gap-1"><Printer className="w-4 h-4" /> {L.savePrint}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* quick patient */}
      <Dialog open={qpOpen} onOpenChange={setQpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.qpTitle}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><label className="text-sm">{L.qpName} *</label><Input value={qp.name} onChange={e => setQp(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-sm">{L.qpAge}</label><Input type="number" value={qp.age} onChange={e => setQp(f => ({ ...f, age: e.target.value }))} /></div>
              <div className="col-span-2"><label className="text-sm">{L.qpSex}</label>
                <div className="flex gap-2">
                  <Button type="button" variant={qp.sex === "M" ? "default" : "outline"} className="flex-1" onClick={() => setQp(f => ({ ...f, sex: "M" }))}>M</Button>
                  <Button type="button" variant={qp.sex === "F" ? "default" : "outline"} className="flex-1" onClick={() => setQp(f => ({ ...f, sex: "F" }))}>F</Button>
                </div>
              </div>
            </div>
            <div><label className="text-sm">{L.qpPhone}</label><Input value={qp.phone} onChange={e => setQp(f => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setQpOpen(false)}>{L.cancel}</Button><Button onClick={saveQuickPatient}>{L.qpSave}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* new drug (created from the search box) */}
      <Dialog open={newDrug.open} onOpenChange={v => setNewDrug(n => ({ ...n, open: v }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.ndTitle}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><label className="text-sm">{L.qpName} *</label><Input value={newDrug.name} onChange={e => setNewDrug(n => ({ ...n, name: e.target.value }))} autoFocus /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-sm">{L.ndPrice}</label><Input type="number" min={0} value={newDrug.price} onChange={e => setNewDrug(n => ({ ...n, price: e.target.value }))} /></div>
              <div><label className="text-sm">{L.ndStock}</label><Input type="number" min={0} value={newDrug.stock} onChange={e => setNewDrug(n => ({ ...n, stock: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm">{L.ndUnit}</label><Input value={newDrug.unit} onChange={e => setNewDrug(n => ({ ...n, unit: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground">{L.drugCreated(newDrug.name || "…")}</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewDrug(n => ({ ...n, open: false }))}>{L.cancel}</Button><Button onClick={createNewDrug}>{L.ndSave}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
