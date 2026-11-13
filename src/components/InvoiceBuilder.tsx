import { useEffect, useMemo, useState } from "react";
import { db, type Patient, type PaymentLineItem, type PaymentMethod, type PaymentStatus, type Drug } from "@/lib/db";
import { decryptPatients } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { logAudit } from "@/lib/audit";
import { generateThermalReceipt, type ReceiptLineItem } from "./ReceiptGenerator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pill, Printer } from "lucide-react";
import { toast } from "sonner";

interface Row { name: string; quantity: number; unitPrice: number; lot?: string; drugId?: number; category?: string; }

const DICT = {
  fr: {
    cash: "💵 Espèces", other: "Autre", title: "🧾 Nouvelle facture", patient: "Patient",
    choosePatient: "Choisir un patient…", freeLine: "Ligne libre", addPharm: "Ajouter du stock pharmacie",
    noStock: "Aucun article en stock", noLines: "Aucune ligne. Ajoutez une consultation, un examen, ou un article.",
    designation: "Désignation (ex: Consultation, NFS…)", lotNote: "Les N° de lot des articles pharmacie apparaîtront sur la facture.",
    totalDue: "Total à payer", paidNow: "Payé maintenant", remaining: "Reste",
    settled: "· Soldé ✅", partial: "· Acompte 🟡", unpaid: "· Impayé 🔴",
    cancel: "Annuler", save: "Enregistrer", savePrint: "Enregistrer & imprimer",
    pickPatient: "Choisissez un patient", addLine: "Ajoutez au moins une ligne",
    invoiceSaved: (n: string) => `Facture ${n} enregistrée`, error: "Erreur: ", failed: "échec",
  },
  en: {
    cash: "💵 Cash", other: "Other", title: "🧾 New invoice", patient: "Patient",
    choosePatient: "Select a patient…", freeLine: "Free line", addPharm: "Add pharmacy stock",
    noStock: "No item in stock", noLines: "No line. Add a consultation, an exam, or an item.",
    designation: "Description (e.g. Consultation, CBC…)", lotNote: "Pharmacy batch numbers will appear on the invoice.",
    totalDue: "Total due", paidNow: "Paid now", remaining: "Remaining",
    settled: "· Settled ✅", partial: "· Part-paid 🟡", unpaid: "· Unpaid 🔴",
    cancel: "Cancel", save: "Save", savePrint: "Save & print",
    pickPatient: "Choose a patient", addLine: "Add at least one line",
    invoiceSaved: (n: string) => `Invoice ${n} saved`, error: "Error: ", failed: "failed",
  },
};
const methodOptions = (L: typeof DICT.fr): { value: PaymentMethod; label: string }[] => [
  { value: "cash", label: L.cash },
  { value: "orange_money", label: "🟠 Orange Money" },
  { value: "mtn_momo", label: "📱 MTN MoMo" },
  { value: "other", label: L.other },
];

export function InvoiceBuilder({ open, onOpenChange, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const METHODS = methodOptions(L);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [patientId, setPatientId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amountPaidStr, setAmountPaidStr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const active = localStorage.getItem("divinelink.clinicId");
      const inClinic = (c?: string) => !active || !c || String(c) === String(active);
      setPatients((await decryptPatients(await db.patients.toArray())).filter(p => !p.deleted && inClinic(p.clinicId)));
      setDrugs((await db.drugs.toArray()).filter(d => inClinic(d.clinicId) && d.stock > 0));
      setRows([]); setPatientId(""); setMethod("cash"); setAmountPaidStr("");
    })();
  }, [open]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0), [rows]);

  // Default the "paid now" field to the full total whenever the total changes
  // (cashier can lower it to record an acompte).
  useEffect(() => { setAmountPaidStr(total ? String(total) : ""); }, [total]);

  const addFreeRow = () => setRows(r => [...r, { name: "", quantity: 1, unitPrice: 0 }]);
  const addDrug = (id: string) => {
    const d = drugs.find(x => String(x.id) === id);
    if (!d) return;
    setRows(r => [...r, { name: d.name, quantity: 1, unitPrice: d.sellPrice || 0, lot: d.batchNumber, drugId: d.id, category: d.category }]);
  };
  const updateRow = (i: number, patch: Partial<Row>) => setRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  const removeRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));

  const patient = patients.find(p => String(p.id) === patientId);
  const amountPaid = Math.max(0, Math.min(total, parseFloat(amountPaidStr) || 0));
  const status: PaymentStatus = amountPaid >= total && total > 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
  const balance = total - amountPaid;

  const save = async (andPrint: boolean) => {
    if (!patient) { toast.error(L.pickPatient); return; }
    const clean = rows.filter(r => r.name.trim() && r.quantity > 0);
    if (!clean.length) { toast.error(L.addLine); return; }
    setSaving(true);
    try {
      const active = localStorage.getItem("divinelink.clinicId") || undefined;
      const now = new Date().toISOString();
      const invoiceNumber = String((await db.payments.count()) + 1).padStart(7, "0");
      const items: PaymentLineItem[] = clean.map(r => ({
        name: r.name.trim(), quantity: r.quantity, unitPrice: r.unitPrice,
        lot: r.lot || undefined, drugId: r.drugId, category: r.category,
      }));

      await db.payments.add({
        patientId: patient.id!,
        invoiceNumber,
        items,
        label: items.map(i => i.name).slice(0, 3).join(", ") + (items.length > 3 ? "…" : ""),
        amountDue: total,
        amountPaid,
        balance,
        status,
        method,
        paidAt: amountPaid > 0 ? now : undefined,
        installments: amountPaid > 0 ? [{
          id: (globalThis.crypto?.randomUUID?.() || String(Date.now())),
          amount: amountPaid, method, paidAt: now, receivedBy: user?.name,
        }] : [],
        clinicId: active,
        createdAt: now,
        updatedAt: now,
      } as any);

      // Decrement pharmacy stock for every line that came from the pharmacy,
      // and log it as a dispensing transaction.
      for (const r of clean) {
        if (!r.drugId) continue;
        const d = await db.drugs.get(r.drugId);
        if (!d) continue;
        const newStock = Math.max(0, (d.stock || 0) - r.quantity);
        await db.drugs.update(r.drugId, { stock: newStock, updatedAt: now });
        await db.drugTransactions.add({
          drugId: r.drugId, type: "out", quantity: r.quantity, price: r.unitPrice,
          patientId: patient.id, paymentStatus: status, exitReason: "dispensed",
          batchNumber: r.lot, performedBy: user?.name, clinicId: active, createdAt: now,
        } as any);
      }

      if (andPrint) {
        const receiptItems: ReceiptLineItem[] = items.map(i => ({
          description: i.name, lot: i.lot, quantity: i.quantity, unitPrice: i.unitPrice,
        }));
        generateThermalReceipt({
          receiptNumber: invoiceNumber,
          date: new Date().toLocaleString("fr-FR"),
          patientName: `${patient.firstName} ${patient.lastName}`.trim(),
          patientId: patient.patientId,
          cashier: user?.name,
          items: receiptItems,
          paymentMethod: method,
          status,
          amountPaid,
          amountDue: total,
        });
      }

      await logAudit("invoice_create", user?.name || "—", { resource: "invoice", resourceId: invoiceNumber, message: `${patient.firstName} ${patient.lastName} · ${total} FCFA (${status})` });
      toast.success(L.invoiceSaved(invoiceNumber));
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(L.error + (e?.message || L.failed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{L.title}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          {/* Patient */}
          <div>
            <label className="text-sm font-medium">{L.patient}</label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue placeholder={L.choosePatient} /></SelectTrigger>
              <SelectContent>
                {patients.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.firstName} {p.lastName} {p.patientId ? `· ${p.patientId}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add buttons */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addFreeRow} className="gap-1">
              <Plus className="w-4 h-4" /> {L.freeLine}
            </Button>
            <Select value="" onValueChange={addDrug}>
              <SelectTrigger className="w-auto h-9 gap-1"><Pill className="w-4 h-4" /><SelectValue placeholder={L.addPharm} /></SelectTrigger>
              <SelectContent>
                {drugs.length === 0 && <div className="px-2 py-1 text-sm text-muted-foreground">{L.noStock}</div>}
                {drugs.map(d => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name} · {(d.sellPrice || 0).toLocaleString()} FCFA · stock {d.stock}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items table */}
          <div className="space-y-2">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">{L.noLines}</p>}
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="flex-1" placeholder={L.designation} value={row.name}
                  onChange={e => updateRow(i, { name: e.target.value })} />
                <Input className="w-16" type="number" min={1} value={row.quantity}
                  onChange={e => updateRow(i, { quantity: parseInt(e.target.value) || 1 })} title="Qté" />
                <Input className="w-28" type="number" min={0} value={row.unitPrice}
                  onChange={e => updateRow(i, { unitPrice: parseFloat(e.target.value) || 0 })} title="Prix unitaire" />
                <span className="w-24 text-right text-sm font-medium">{(row.quantity * row.unitPrice).toLocaleString()} F</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}
            {rows.some(r => r.lot) && (
              <p className="text-xs text-muted-foreground">{L.lotNote}</p>
            )}
          </div>

          {/* Totals + payment */}
          <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <div className="flex justify-between text-sm"><span>{L.totalDue}</span><span className="font-bold">{total.toLocaleString()} FCFA</span></div>
            <div className="flex items-center gap-2">
              <span className="text-sm w-28">{L.paidNow}</span>
              <Input type="number" min={0} max={total} value={amountPaidStr} onChange={e => setAmountPaidStr(e.target.value)} className="w-32" />
              <Select value={method} onValueChange={v => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-between text-sm">
              <span>{L.remaining}</span>
              <span className={balance > 0 ? "font-bold text-red-600" : "font-bold text-green-600"}>
                {balance.toLocaleString()} FCFA {balance <= 0 ? L.settled : status === "partial" ? L.partial : L.unpaid}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{L.cancel}</Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={saving}>{L.save}</Button>
          <Button onClick={() => save(true)} disabled={saving} className="gap-1">
            <Printer className="w-4 h-4" /> {L.savePrint}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
