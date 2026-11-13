import { useEffect, useMemo, useState } from "react";
import { db, type Prescription, type Drug } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/lib/audit";
import { generateThermalReceipt, generateFacture, type ReceiptLineItem } from "./ReceiptGenerator";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Pencil, Trash2, Printer, Plus, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { toast } from "sonner";

type RxLine = { drugId?: number; name: string; unitPrice: number; qtyPrescribed: number; qtyDispensed: number; free?: boolean; posology?: string };

const fmtDT = (s?: string) => s ? new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const momentOf = (s?: string) => { if (!s) return ""; const h = new Date(s).getHours(); return h < 12 ? "🌅 Matin" : h < 17 ? "☀️ Après-midi" : "🌙 Soir"; };

/** Search-or-type box for a line's drug name — same list as the ordonnance. */
function LineDrugInput({ drugs, value, onName, onPickDrug }: { drugs: Drug[]; value: string; onName: (v: string) => void; onPickDrug: (d: Drug) => void }) {
  const [open, setOpen] = useState(false);
  const ql = value.trim().toLowerCase();
  const matches = drugs.filter(d => !ql || d.name.toLowerCase().includes(ql)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30);
  return (
    <div className="relative flex-1 min-w-0">
      <Input className="h-8" value={value} placeholder="Rechercher ou saisir un article…"
        onChange={e => { onName(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.map(d => (
            <button key={d.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex justify-between gap-2"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onPickDrug(d); setOpen(false); }}>
              <span className="truncate">{d.name}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{(d.sellPrice || 0).toLocaleString()} F · {d.stock}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrdonnancesTab() {
  const { user } = useAuth();
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };

  const [rows, setRows] = useState<Prescription[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [edit, setEdit] = useState<Prescription | null>(null);
  const [eLines, setELines] = useState<RxLine[]>([]);
  const [eDate, setEDate] = useState("");
  const [eTime, setETime] = useState("");
  const [del, setDel] = useState<Prescription | null>(null);

  const load = async () => {
    const all = await db.prescriptions.orderBy("createdAt").reverse().toArray();
    setRows(all.filter(r => !r.deleted && inClinic(r.clinicId)));
    setDrugs((await db.drugs.toArray()).filter(d => inClinic(d.clinicId)));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => (r.patientName || "").toLowerCase().includes(q) || (r.invoiceNumber || "").toLowerCase().includes(q) || (r.lines || []).some(l => l.name.toLowerCase().includes(q)));
  }, [rows, search]);

  const startEdit = (r: Prescription) => {
    setEdit(r); setELines((r.lines || []).map(l => ({ ...l })));
    const dt = r.createdAt ? new Date(r.createdAt) : new Date();
    setEDate(dt.toISOString().slice(0, 10)); setETime(dt.toTimeString().slice(0, 5));
  };
  const eUpd = (i: number, patch: Partial<RxLine>) => setELines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const eRm = (i: number) => setELines(ls => ls.filter((_, idx) => idx !== i));
  const eAdd = () => setELines(ls => [...ls, { name: "", unitPrice: 0, qtyPrescribed: 1, qtyDispensed: 1, free: false, posology: "" }]);
  const eTotal = useMemo(() => eLines.reduce((s, l) => s + (l.free ? 0 : (l.qtyDispensed || 0) * (l.unitPrice || 0)), 0), [eLines]);

  const saveEdit = async () => {
    if (!edit) return;
    const clean = eLines.filter(l => l.name.trim());
    const total = clean.reduce((s, l) => s + (l.free ? 0 : (l.qtyDispensed || 0) * (l.unitPrice || 0)), 0);
    const now = new Date().toISOString();
    // editable date + time of the ordonnance
    const when = (() => { const d = new Date(`${eDate || edit.createdAt?.slice(0, 10)}T${(eTime || "12:00")}:00`); return isNaN(d.getTime()) ? (edit.createdAt || now) : d.toISOString(); })();
    await db.prescriptions.update(edit.id!, { lines: clean, total, createdAt: when, updatedAt: now });
    // keep the linked facture (payment) in sync — items + amounts
    if (edit.invoiceNumber) {
      const pays = await db.payments.toArray();
      const pay = pays.find(p => p.invoiceNumber === edit.invoiceNumber && inClinic(p.clinicId));
      if (pay) {
        const billItems = clean.filter(l => (l.qtyDispensed || 0) > 0 && !l.free && (l.unitPrice || 0) > 0)
          .map(l => ({ name: l.posology ? `${l.name} — ${l.posology}` : l.name, quantity: l.qtyDispensed, unitPrice: l.unitPrice, drugId: l.drugId, category: "Pharmacie" }));
        const covered = pay.insuranceCovered || 0;
        const paidNow = Math.max(0, total - covered);
        await db.payments.update(pay.id!, {
          items: billItems as any, amountDue: total, amountPaid: covered > 0 ? paidNow : total,
          label: billItems.map(i => i.name).slice(0, 3).join(", "), paidAt: when, updatedAt: now,
        });
      }
    }
    await logAudit("prescription_edit", user?.name || "—", { resource: "prescription", resourceId: edit.id, message: `Ordonnance ${edit.invoiceNumber || edit.id} corrigée · ${edit.patientName || ""} · total ${total.toLocaleString()} F` });
    toast.success("Ordonnance corrigée. ⚠️ Le stock n'est pas recalculé — ajustez-le dans Transactions si une quantité a changé.");
    setEdit(null); load();
  };

  const doDelete = async (r: Prescription) => {
    await db.prescriptions.update(r.id!, { deleted: true, updatedAt: new Date().toISOString() });
    await logAudit("prescription_delete", user?.name || "—", { resource: "prescription", resourceId: r.id, message: `Ordonnance ${r.invoiceNumber || r.id} supprimée · ${r.patientName || ""}` });
    toast.success("Ordonnance supprimée (la facture et le stock restent — à corriger séparément si besoin).");
    setDel(null); load();
  };

  const reprint = (r: Prescription, kind: "thermal" | "facture") => {
    const items: ReceiptLineItem[] = (r.lines || []).filter(l => (l.qtyDispensed || 0) > 0 && !l.free && (l.unitPrice || 0) > 0)
      .map(l => ({ description: l.posology ? `${l.name} — ${l.posology}` : l.name, quantity: l.qtyDispensed, unitPrice: l.unitPrice }));
    const data = { receiptNumber: r.invoiceNumber || String(r.id || ""), date: fmtDT(r.createdAt), patientName: r.patientName || "—", cashier: r.prescribedBy, items, paymentMethod: "cash", status: "paid" as const, amountPaid: r.total, amountDue: r.total };
    if (kind === "facture") generateFacture(data); else generateThermalReceipt(data);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher un patient, un médicament, un n° de facture…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Aucune ordonnance.</p>}

      <div className="space-y-2">
        {filtered.slice(0, 200).map(r => {
          const isOpen = !!open[r.id!];
          return (
            <Card key={r.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <button className="flex-1 min-w-0 flex items-center gap-2 text-left" onClick={() => setOpen(m => ({ ...m, [r.id!]: !isOpen }))}>
                    {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.patientName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{fmtDT(r.createdAt)} · {momentOf(r.createdAt)} · {(r.lines || []).length} article(s) · {r.prescribedBy || "—"}{r.invoiceNumber ? ` · ${r.invoiceNumber}` : ""}</p>
                    </div>
                  </button>
                  <span className="font-bold whitespace-nowrap">{(r.total || 0).toLocaleString()} F</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Corriger" onClick={() => startEdit(r)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Facture A4" onClick={() => reprint(r, "facture")}><FileText className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Reçu" onClick={() => reprint(r, "thermal")}><Printer className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Supprimer" onClick={() => setDel(r)}><Trash2 className="w-4 h-4" /></Button>
                </div>
                {isOpen && (
                  <div className="mt-2 rounded-md border overflow-hidden">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground">
                      <span className="flex-1">Article</span><span className="w-28">Posologie</span><span className="w-16 text-center">Pres./Donné</span><span className="w-16 text-right">P.U.</span><span className="w-16 text-right">Total</span>
                    </div>
                    {(r.lines || []).map((l, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2 py-1 border-t text-sm">
                        <span className="flex-1 min-w-0 truncate">{l.name}{l.free ? " (gratuit)" : ""}</span>
                        <span className="w-28 text-xs text-muted-foreground truncate">{l.posology || "—"}</span>
                        <span className="w-16 text-center text-xs">{l.qtyPrescribed}/{l.qtyDispensed}</span>
                        <span className="w-16 text-right text-xs">{(l.unitPrice || 0).toLocaleString()}</span>
                        <span className="w-16 text-right font-medium">{l.free ? "—" : ((l.qtyDispensed || 0) * (l.unitPrice || 0)).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Edit dialog ── */}
      <Dialog open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Corriger l'ordonnance — {edit?.patientName}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Date</label><Input type="date" className="h-8" value={eDate} onChange={e => setEDate(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Heure</label><Input type="time" className="h-8" value={eTime} onChange={e => setETime(e.target.value)} /></div>
            </div>
            <div className="rounded-md border overflow-hidden">
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground">
                <span className="flex-1">Article</span><span className="w-16 text-center">P.U.</span><span className="w-12 text-center">Pres.</span><span className="w-12 text-center">Donné</span><span className="w-7" />
              </div>
              {eLines.map((l, i) => (
                <div key={i} className="border-t px-2 py-1.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <LineDrugInput drugs={drugs} value={l.name} onName={v => eUpd(i, { name: v })} onPickDrug={d => eUpd(i, { name: d.name, unitPrice: d.sellPrice || 0, drugId: d.id })} />
                    <Input type="number" min={0} className="w-16 h-8 text-center px-1" value={l.unitPrice} onChange={e => eUpd(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    <Input type="number" min={0} className="w-12 h-8 text-center px-1" value={l.qtyPrescribed} onChange={e => eUpd(i, { qtyPrescribed: parseInt(e.target.value) || 0 })} />
                    <Input type="number" min={0} className="w-12 h-8 text-center px-1" value={l.qtyDispensed} onChange={e => eUpd(i, { qtyDispensed: parseInt(e.target.value) || 0 })} />
                    <Button size="icon" variant="ghost" className="h-8 w-7 shrink-0 text-destructive" onClick={() => eRm(i)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Posologie</span>
                    <Input className="h-7 w-40 px-2" placeholder="matin-midi-soir / 1-0-1" value={l.posology || ""} onChange={e => eUpd(i, { posology: e.target.value })} />
                    <label className="flex items-center gap-1 ml-auto"><input type="checkbox" className="w-3.5 h-3.5" checked={!!l.free} onChange={e => eUpd(i, { free: e.target.checked })} /> Gratuit</label>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={eAdd}><Plus className="w-4 h-4" /> Ajouter une ligne</Button>
            <div className="rounded-lg border bg-muted/30 p-2.5 flex justify-between items-center"><span className="text-sm">Total</span><span className="font-bold">{eTotal.toLocaleString()} FCFA</span></div>
            <p className="text-[11px] text-amber-600">⚠️ La correction met à jour l'ordonnance et la facture liée. Le stock n'est pas recalculé automatiquement — si une quantité a changé, ajustez le stock dans Transactions.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
            <Button onClick={saveEdit}>Enregistrer les corrections</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!del} onOpenChange={v => !v && setDel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer cette ordonnance ?</DialogTitle></DialogHeader>
          {del && <p className="text-sm">{del.patientName} · {fmtDT(del.createdAt)} · {(del.total || 0).toLocaleString()} F</p>}
          <p className="text-xs text-muted-foreground">L'ordonnance est retirée de la liste (tracée dans l'audit). La facture et le stock ne sont pas touchés — corrigez-les séparément si nécessaire.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => del && doDelete(del)}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
