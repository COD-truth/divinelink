import { useEffect, useMemo, useState } from "react";
import { db, type LabReagent } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, ArrowDown, ArrowUp, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { COMMON_REAGENTS } from "@/lib/seedCatalogues";

const DICT = {
  fr: {
    stockValue: "Valeur stock", lowReagents: "Réactifs bas", reagent: "Réactif",
    lowAlert: (n: number) => `${n} réactif(s) sous le seuil.`, searchPh: "Rechercher un réactif…",
    none: "Aucun réactif. Ajoutez-en un pour suivre les entrées/sorties.", stock: "Stock",
    entry: "Entrée", exit: "Sortie", editTitle: "Modifier le réactif", newTitle: "Nouveau réactif",
    name: "Nom", unit: "Unité", unitPh: "test, flacon…", minThreshold: "Seuil min.", unitCost: "Coût unitaire", expiration: "Péremption", exp: "exp.",
    cancel: "Annuler", save: "Enregistrer", nameReq: "Nom requis", savedToast: "Réactif enregistré",
    entryTitle: "Entrée", exitTitle: "Sortie", currentStock: "Stock actuel", qty: "Quantité",
    reason: "Motif (optionnel)", supplyPh: "Approvisionnement…", analysisPh: "Analyse patient…",
    add: "Ajouter", withdraw: "Retirer", qtyInvalid: "Quantité invalide", insufficient: "Stock insuffisant",
    deleteTitle: "Supprimer le réactif ?", delete: "Supprimer",
  },
  en: {
    stockValue: "Stock value", lowReagents: "Low reagents", reagent: "Reagent",
    lowAlert: (n: number) => `${n} reagent(s) below threshold.`, searchPh: "Search a reagent…",
    none: "No reagents. Add one to track entries/exits.", stock: "Stock",
    entry: "Entry", exit: "Exit", editTitle: "Edit reagent", newTitle: "New reagent",
    name: "Name", unit: "Unit", unitPh: "test, vial…", minThreshold: "Min. threshold", unitCost: "Unit cost", expiration: "Expiry", exp: "exp.",
    cancel: "Cancel", save: "Save", nameReq: "Name required", savedToast: "Reagent saved",
    entryTitle: "Entry", exitTitle: "Exit", currentStock: "Current stock", qty: "Quantity",
    reason: "Reason (optional)", supplyPh: "Supply…", analysisPh: "Patient analysis…",
    add: "Add", withdraw: "Withdraw", qtyInvalid: "Invalid quantity", insufficient: "Insufficient stock",
    deleteTitle: "Delete reagent?", delete: "Delete",
  },
};

/** Tolerant expiry check for "YYYY-MM-DD", "DD/MM/YYYY" or "MM/YYYY". */
function isExpired(s?: string): boolean {
  if (!s) return false;
  const t = s.trim();
  let d: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) d = new Date(t);
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) { const [dd, mm, yy] = t.split("/"); d = new Date(+yy, +mm, 0); }
  else if (/^\d{2}\/\d{4}$/.test(t)) { const [mm, yy] = t.split("/"); d = new Date(+yy, +mm, 0); }
  if (!d || isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export function LabReagents() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };
  const [reagents, setReagents] = useState<LabReagent[]>([]);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<LabReagent | "new" | null>(null);
  const [form, setForm] = useState({ name: "", unit: "test", stock: "", minStock: "", unitCost: "", expiration: "" });
  const [move, setMove] = useState<{ r: LabReagent; type: "in" | "out" } | null>(null);
  const [moveQty, setMoveQty] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [del, setDel] = useState<LabReagent | null>(null);

  const load = async () => setReagents((await db.labReagents.toArray()).filter(r => inClinic(r.clinicId)).sort((a, b) => a.name.localeCompare(b.name)));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return reagents.filter(r => !q || r.name.toLowerCase().includes(q)); }, [reagents, search]);
  const totalValue = reagents.reduce((s, r) => s + (r.stock || 0) * (r.unitCost || 0), 0);
  const lowCount = reagents.filter(r => (r.minStock ?? 0) > 0 && r.stock <= (r.minStock ?? 0)).length;

  const openEdit = (r?: LabReagent) => {
    if (r) setForm({ name: r.name, unit: r.unit || "test", stock: String(r.stock ?? ""), minStock: String(r.minStock ?? ""), unitCost: String(r.unitCost ?? ""), expiration: r.expiration || "" });
    else setForm({ name: "", unit: "test", stock: "", minStock: "", unitCost: "", expiration: "" });
    setEdit(r || "new");
  };
  const save = async () => {
    if (!form.name.trim()) { toast.error(L.nameReq); return; }
    const now = new Date().toISOString();
    const data = { name: form.name.trim(), unit: form.unit || "test", stock: parseInt(form.stock) || 0, minStock: parseInt(form.minStock) || 0, unitCost: parseFloat(form.unitCost) || 0, expiration: form.expiration || undefined, updatedAt: now };
    if (edit && edit !== "new" && edit.id) { await db.labReagents.update(edit.id, data); await logAudit("reagent_update", user?.name || "—", { resource: "reagent", resourceId: edit.id, message: data.name }); }
    else { const id = await db.labReagents.add({ ...data, clinicId: cid(), createdAt: now } as any); await logAudit("reagent_create", user?.name || "—", { resource: "reagent", resourceId: id as any, message: data.name }); }
    setEdit(null); await load(); toast.success(L.savedToast);
  };
  const remove = async () => { if (del?.id) { await db.labReagents.delete(del.id); await logAudit("reagent_delete", user?.name || "—", { resource: "reagent", resourceId: del.id, message: del.name }); setDel(null); await load(); } };

  const doMove = async () => {
    if (!move) return; const qty = parseInt(moveQty) || 0;
    if (qty <= 0) { toast.error(L.qtyInvalid); return; }
    if (move.type === "out" && qty > move.r.stock) { toast.error(L.insufficient); return; }
    const now = new Date().toISOString();
    const newStock = move.type === "in" ? move.r.stock + qty : move.r.stock - qty;
    await db.labReagents.update(move.r.id!, { stock: newStock, updatedAt: now });
    await db.labReagentMovements.add({ reagentId: move.r.id!, reagentName: move.r.name, type: move.type, quantity: qty, reason: moveReason || undefined, performedBy: user?.name, clinicId: cid(), createdAt: now } as any);
    await logAudit(move.type === "in" ? "reagent_in" : "reagent_out", user?.name || "—", { resource: "reagent", resourceId: move.r.id, message: `${move.r.name} ${move.type === "in" ? "+" : "-"}${qty} ${move.r.unit}${moveReason ? " · " + moveReason : ""}` });
    toast.success(move.type === "in" ? `${L.entry} +${qty}` : `${L.exit} -${qty}`);
    setMove(null); setMoveQty(""); setMoveReason(""); await load();
  };

  const f = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-3 flex-1">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{L.stockValue}</p><p className="text-lg font-bold">{f(totalValue)} FCFA</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{L.lowReagents}</p><p className="text-lg font-bold text-warning">{lowCount}</p></CardContent></Card>
        </div>
        <Button size="sm" onClick={() => openEdit()} className="gap-1"><Plus className="w-4 h-4" /> {L.reagent}</Button>
      </div>

      {lowCount > 0 && <Card className="border-warning/50 bg-warning/5"><CardContent className="p-3 flex items-center gap-2 text-sm"><TriangleAlert className="w-4 h-4 text-warning" /> {L.lowAlert(lowCount)}</CardContent></Card>}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={L.searchPh} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">{L.none}</p>}
        {filtered.map(r => {
          const low = (r.minStock ?? 0) > 0 && r.stock <= (r.minStock ?? 0);
          return (
            <Card key={r.id}><CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.unitCost ? `${f(r.unitCost)} FCFA/${r.unit}` : r.unit}{r.expiration ? ` · ${isExpired(r.expiration) ? "⚠ " : ""}${L.exp} ${r.expiration}` : ""}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground">{L.stock}</p>
                  <p className={`text-xl font-bold leading-none ${low ? "text-warning" : ""}`}>{r.stock} <span className="text-xs font-normal">{r.unit}</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-9 flex-1 gap-1" onClick={() => { setMove({ r, type: "in" }); setMoveQty(""); setMoveReason(""); }}><ArrowDown className="w-4 h-4 text-green-600" /> {L.entry}</Button>
                <Button size="sm" variant="outline" className="h-9 flex-1 gap-1" disabled={r.stock <= 0} onClick={() => { setMove({ r, type: "out" }); setMoveQty(""); setMoveReason(""); }}><ArrowUp className="w-4 h-4 text-red-600" /> {L.exit}</Button>
                <Button size="icon" variant="ghost" className="h-9 w-9 flex-shrink-0" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="h-9 w-9 flex-shrink-0 text-destructive" onClick={() => setDel(r)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </CardContent></Card>
          );
        })}
      </div>

      {/* edit */}
      <Dialog open={!!edit} onOpenChange={v => { if (!v) setEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{edit && edit !== "new" ? L.editTitle : L.newTitle}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><label className="text-sm">{L.name} *</label><Input list="common-reagents" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <datalist id="common-reagents">{COMMON_REAGENTS.map(r => <option key={r} value={r} />)}</datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-sm">{L.unit}</label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder={L.unitPh} /></div>
              <div><label className="text-sm">{L.stock}</label><Input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} /></div>
              <div><label className="text-sm">{L.minThreshold}</label><Input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} /></div>
              <div><label className="text-sm">{L.unitCost}</label><Input type="number" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} /></div>
              <div><label className="text-sm">{L.expiration}</label><Input value={form.expiration} onChange={e => setForm(f => ({ ...f, expiration: e.target.value }))} placeholder="2027-05 ou JJ/MM/AAAA" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>{L.cancel}</Button><Button onClick={save}>{L.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* move */}
      <Dialog open={!!move} onOpenChange={v => { if (!v) setMove(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{move?.type === "in" ? L.entryTitle : L.exitTitle} — {move?.r.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{L.currentStock} : <b>{move?.r.stock} {move?.r.unit}</b></p>
            <div><label className="text-sm">{L.qty}</label><Input type="number" min={1} value={moveQty} onChange={e => setMoveQty(e.target.value)} autoFocus /></div>
            <div><label className="text-sm">{L.reason}</label><Input value={moveReason} onChange={e => setMoveReason(e.target.value)} placeholder={move?.type === "in" ? L.supplyPh : L.analysisPh} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMove(null)}>{L.cancel}</Button><Button onClick={doMove}>{move?.type === "in" ? L.add : L.withdraw}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete */}
      <Dialog open={!!del} onOpenChange={v => { if (!v) setDel(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.deleteTitle}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{del?.name}</p>
          <DialogFooter><Button variant="outline" onClick={() => setDel(null)}>{L.cancel}</Button><Button variant="destructive" onClick={remove}>{L.delete}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
