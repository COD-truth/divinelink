import { useEffect, useMemo, useState } from "react";
import { db, type MagasinItem, type MagasinBox, type Drug, type EquipmentItem } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, Search, ArrowRight, PackagePlus, Plus, Pencil, Trash2, Box, TriangleAlert, Pill, Wrench } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { mirrorMagasinToDrug } from "@/lib/drugMirror";

// Stored type values stay in French (used in logic + DB); labels translate for display.
const TYPES = ["Médicament", "Réactif", "Consommable", "Équipement", "Autre"];
const TYPE_LABELS: Record<string, { fr: string; en: string }> = {
  "Médicament": { fr: "Médicament", en: "Medication" },
  "Réactif": { fr: "Réactif", en: "Reagent" },
  "Consommable": { fr: "Consommable", en: "Consumable" },
  "Équipement": { fr: "Équipement", en: "Equipment" },
  "Autre": { fr: "Autre", en: "Other" },
};

const DICT = {
  fr: {
    title: "Magasin", newBox: "Nouvelle boîte", newItem: "Nouvel article",
    intro: "Réserve centrale. Transférez vers la Pharmacie ou l'Équipement — vous choisissez la destination.",
    lowAlert: (n: number) => `${n} article(s) en réserve basse.`, searchPh: "Rechercher…",
    none: "Aucun article. Créez une boîte puis ajoutez des articles.", noBox: "Sans boîte",
    magasin: "Magasin", entry: "Entrée", transfer: "Transférer",
    renameBox: "Renommer la boîte", boxNamePh: "Nom de la boîte (ex: Consommables, Solutés…)",
    cancel: "Annuler", save: "Enregistrer", editItem: "Modifier l'article",
    name: "Nom", box: "Boîte", type: "Type", unit: "Unité", stockMag: "Stock magasin",
    minThreshold: "Seuil min.", buyPrice: "Prix d'achat", sellPrice: "Prix de vente",
    batch: "N° de lot", expiry: "Péremption", entryTitle: "Entrée magasin",
    qtyReceived: "Quantité reçue", add: "Ajouter", transferTitle: "Transfert",
    destination: "Destination", pharmacy: "🏥 Pharmacie (comptoir)", equipment: "🔧 Équipement", reagentDest: "🧪 Réactifs (labo)",
    transferredReagent: (q: number) => `${q} transféré → Réactifs`,
    qty: "Quantité", deleteItem: "Supprimer l'article ?", delete: "Supprimer",
    nameReq: "Nom requis", itemSaved: "Article enregistré", qtyInvalid: "Quantité invalide",
    inMagasin: (q: number) => `+${q} en magasin`, notEnough: "Pas assez au magasin",
    transferredPharm: (q: number) => `${q} transféré → Pharmacie`,
    transferredEquip: (q: number) => `${q} transféré → Équipement`,
    transferReason: "Transfert magasin → équipement", error: "Erreur: ", failed: "échec",
  },
  en: {
    title: "Warehouse", newBox: "New box", newItem: "New item",
    intro: "Central store. Transfer to the Pharmacy or Equipment — you choose the destination.",
    lowAlert: (n: number) => `${n} item(s) low in store.`, searchPh: "Search…",
    none: "No items. Create a box, then add items.", noBox: "No box",
    magasin: "Store", entry: "Receive", transfer: "Transfer",
    renameBox: "Rename box", boxNamePh: "Box name (e.g. Consumables, IV fluids…)",
    cancel: "Cancel", save: "Save", editItem: "Edit item",
    name: "Name", box: "Box", type: "Type", unit: "Unit", stockMag: "Store stock",
    minThreshold: "Min. threshold", buyPrice: "Buy price", sellPrice: "Sell price",
    batch: "Batch no.", expiry: "Expiry", entryTitle: "Store entry",
    qtyReceived: "Quantity received", add: "Add", transferTitle: "Transfer",
    destination: "Destination", pharmacy: "🏥 Pharmacy (counter)", equipment: "🔧 Equipment", reagentDest: "🧪 Reagents (lab)",
    transferredReagent: (q: number) => `${q} transferred → Reagents`,
    qty: "Quantity", deleteItem: "Delete item?", delete: "Delete",
    nameReq: "Name required", itemSaved: "Item saved", qtyInvalid: "Invalid quantity",
    inMagasin: (q: number) => `+${q} in store`, notEnough: "Not enough in store",
    transferredPharm: (q: number) => `${q} transferred → Pharmacy`,
    transferredEquip: (q: number) => `${q} transferred → Equipment`,
    transferReason: "Store → equipment transfer", error: "Error: ", failed: "failed",
  },
};

export function MagasinPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const typeLabel = (t: string) => (TYPE_LABELS[t]?.[lang]) || t;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const [boxes, setBoxes] = useState<MagasinBox[]>([]);
  const [items, setItems] = useState<MagasinItem[]>([]);
  const [search, setSearch] = useState("");

  // dialogs
  const [boxDialog, setBoxDialog] = useState<MagasinBox | null>(null);
  const [boxLabel, setBoxLabel] = useState("");
  const [itemDialog, setItemDialog] = useState<MagasinItem | "new" | null>(null);
  const [form, setForm] = useState({ name: "", boxId: "", type: "Consommable", unit: "unité", stockMagasin: "", minStockMagasin: "", buyPrice: "", sellPrice: "", batchNumber: "", expiration: "" });
  const [recv, setRecv] = useState<MagasinItem | null>(null);
  const [recvQty, setRecvQty] = useState("");
  const [transfer, setTransfer] = useState<MagasinItem | null>(null);
  const [tQty, setTQty] = useState("");
  const [tDest, setTDest] = useState<"pharmacy" | "equipment" | "reagent">("pharmacy");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<MagasinItem | null>(null);

  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };
  const load = async () => {
    setBoxes((await db.magasinBoxes.toArray()).filter(b => inClinic(b.clinicId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    setItems((await db.magasinItems.toArray()).filter(i => inClinic(i.clinicId)));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => !q || i.name.toLowerCase().includes(q) || (i.type || "").toLowerCase().includes(q));
  }, [items, search]);
  const lowCount = items.filter(i => (i.minStockMagasin ?? 0) > 0 && i.stockMagasin <= (i.minStockMagasin ?? 0)).length;
  const grouped = useMemo(() => {
    const g: { box: MagasinBox | null; list: MagasinItem[] }[] = [];
    boxes.forEach(b => { const list = filtered.filter(i => i.boxId === b.id); if (list.length) g.push({ box: b, list }); });
    const orphan = filtered.filter(i => !i.boxId || !boxes.some(b => b.id === i.boxId));
    if (orphan.length) g.push({ box: null, list: orphan });
    return g;
  }, [filtered, boxes]);

  // ── boxes ──
  const openBox = (b?: MagasinBox) => { setBoxDialog(b || { label: "" } as MagasinBox); setBoxLabel(b?.label || ""); };
  const saveBox = async () => {
    if (!boxLabel.trim()) return;
    const now = new Date().toISOString();
    if (boxDialog?.id) await db.magasinBoxes.update(boxDialog.id, { label: boxLabel.trim(), updatedAt: now });
    else await db.magasinBoxes.add({ label: boxLabel.trim(), order: boxes.length, clinicId: cid(), createdAt: now } as any);
    await logAudit("magasin_box", user?.name || "—", { resource: "magasin_box", resourceId: boxDialog?.id, message: boxLabel.trim() });
    setBoxDialog(null); await load();
  };

  // ── items ──
  const openItem = (it?: MagasinItem) => {
    if (it) setForm({ name: it.name, boxId: it.boxId ? String(it.boxId) : "", type: it.type || "Consommable", unit: it.unit || "unité", stockMagasin: String(it.stockMagasin ?? ""), minStockMagasin: String(it.minStockMagasin ?? ""), buyPrice: String(it.buyPrice ?? ""), sellPrice: String(it.sellPrice ?? ""), batchNumber: it.batchNumber || "", expiration: it.expiration || "" });
    else setForm({ name: "", boxId: "", type: "Consommable", unit: "unité", stockMagasin: "", minStockMagasin: "", buyPrice: "", sellPrice: "", batchNumber: "", expiration: "" });
    setItemDialog(it || "new");
  };
  const saveItem = async () => {
    if (!form.name.trim()) { toast.error(L.nameReq); return; }
    const now = new Date().toISOString();
    const data = {
      name: form.name.trim(), boxId: form.boxId ? Number(form.boxId) : undefined, type: form.type, unit: form.unit || "unité",
      stockMagasin: parseInt(form.stockMagasin) || 0, minStockMagasin: parseInt(form.minStockMagasin) || 0,
      buyPrice: parseFloat(form.buyPrice) || undefined, sellPrice: parseFloat(form.sellPrice) || undefined,
      batchNumber: form.batchNumber || undefined, expiration: form.expiration || undefined, updatedAt: now,
    };
    if (itemDialog && itemDialog !== "new" && itemDialog.id) await db.magasinItems.update(itemDialog.id, data);
    else {
      await db.magasinItems.add({ ...data, clinicId: cid(), createdAt: now } as any);
      // Mirror a new Médicament into the Pharmacie (separate stock, starts at 0)
      // so the same drug exists on both desks.
      try { await mirrorMagasinToDrug({ ...data, clinicId: cid() }); } catch { /* best-effort */ }
    }
    await logAudit("magasin_item", user?.name || "—", { resource: "magasin_item", resourceId: (itemDialog !== "new" && itemDialog?.id) || undefined, message: `${data.name} · ${data.type}` });
    setItemDialog(null); await load();
    toast.success(L.itemSaved);
  };
  const removeItem = async () => { if (del?.id) { await db.magasinItems.delete(del.id); await logAudit("magasin_delete", user?.name || "—", { resource: "magasin_item", resourceId: del.id, message: del.name }); setDel(null); await load(); } };

  const doReceive = async () => {
    if (!recv) return; const qty = parseInt(recvQty) || 0;
    if (qty <= 0) { toast.error(L.qtyInvalid); return; }
    await db.magasinItems.update(recv.id!, { stockMagasin: (recv.stockMagasin || 0) + qty, updatedAt: new Date().toISOString() });
    await logAudit("magasin_receive", user?.name || "—", { resource: "magasin_item", resourceId: recv.id, message: `${recv.name} +${qty} ${recv.unit}` });
    setRecv(null); setRecvQty(""); await load(); toast.success(L.inMagasin(qty));
  };

  const doTransfer = async () => {
    if (!transfer) return;
    const qty = parseInt(tQty) || 0;
    if (qty <= 0) { toast.error(L.qtyInvalid); return; }
    if (qty > transfer.stockMagasin) { toast.error(L.notEnough); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const c = cid();
      await db.magasinItems.update(transfer.id!, { stockMagasin: transfer.stockMagasin - qty, updatedAt: now });
      if (tDest === "pharmacy") {
        const existing = (await db.drugs.toArray()).find(d => inClinic(d.clinicId) && d.name.toLowerCase() === transfer.name.toLowerCase());
        let drugId = existing?.id; let drugUid = existing?.uid;
        if (existing?.id) {
          await db.drugs.update(existing.id, { stock: (existing.stock || 0) + qty, updatedAt: now });
        } else {
          const u = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
          drugUid = u;
          drugId = await db.drugs.add({ name: transfer.name, category: transfer.type || "Médicament", stock: qty, unit: transfer.unit || "unité", packSize: 1, buyPrice: transfer.buyPrice || 0, sellPrice: transfer.sellPrice || 0, minStock: 5, batchNumber: transfer.batchNumber, expiration: transfer.expiration, status: "in_stock", uid: u, syncBaseStock: 0, syncBaseAt: now, clinicId: c, createdAt: now, updatedAt: now } as any) as number;
        }
        // Log the transfer as an append-only stock event (needed for multi-device
        // sync; drugUid is backfilled at sync time if absent).
        await db.drugTransactions.add({ uid: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`), drugUid, drugId: drugId || 0, type: "in", quantity: qty, price: transfer.buyPrice || 0, performedBy: user?.name, notes: "Transfert magasin → pharmacie", clinicId: c, createdAt: now } as any);
        toast.success(L.transferredPharm(qty));
      } else if (tDest === "reagent") {
        const existing = (await db.labReagents.toArray()).find(r => inClinic(r.clinicId) && r.name.toLowerCase() === transfer.name.toLowerCase());
        if (existing?.id) {
          await db.labReagents.update(existing.id, { stock: (existing.stock || 0) + qty, updatedAt: now });
        } else {
          await db.labReagents.add({ name: transfer.name, unit: transfer.unit || "test", stock: qty, minStock: 0, unitCost: transfer.buyPrice || 0, clinicId: c, createdAt: now, updatedAt: now } as any);
        }
        toast.success(L.transferredReagent(qty));
      } else {
        const existing = (await db.equipmentItems.toArray()).find(e => inClinic(e.clinicId) && e.name.toLowerCase() === transfer.name.toLowerCase());
        let newStock = qty;
        if (existing?.id) { newStock = (existing.stock || 0) + qty; await db.equipmentItems.update(existing.id, { stock: newStock, updatedAt: now }); }
        else { await db.equipmentItems.add({ name: transfer.name, stock: qty, lowStockThreshold: 2, unit: transfer.unit, clinicId: c, createdAt: now, updatedAt: now } as any); }
        await db.equipmentMovements.add({ itemId: existing?.id || 0, itemName: transfer.name, quantityChange: qty, newStock, reason: L.transferReason, userName: user?.name || "", clinicId: c, createdAt: now } as any);
        toast.success(L.transferredEquip(qty));
      }
      const destName = tDest === "pharmacy" ? "Pharmacie" : tDest === "reagent" ? "Réactifs" : "Équipement";
      await logAudit("magasin_transfer", user?.name || "—", { resource: "magasin_item", resourceId: transfer.id, message: `${transfer.name} ${qty} ${transfer.unit} → ${destName}` });
      setTransfer(null); setTQty(""); await load();
    } catch (e: any) { toast.error(L.error + (e?.message || L.failed)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold flex items-center gap-2"><Warehouse className="w-5 h-5" /> {L.title}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openBox()} className="gap-1"><Box className="w-4 h-4" /> {L.newBox}</Button>
          <Button size="sm" onClick={() => openItem()} className="gap-1"><Plus className="w-4 h-4" /> {L.newItem}</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{L.intro}</p>

      {lowCount > 0 && (
        <Card className="border-warning/50 bg-warning/5"><CardContent className="p-3 flex items-center gap-2 text-sm">
          <TriangleAlert className="w-4 h-4 text-warning" /> {L.lowAlert(lowCount)}
        </CardContent></Card>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={L.searchPh} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {grouped.length === 0 && <p className="text-sm text-muted-foreground">{L.none}</p>}

      {grouped.map(({ box, list }) => (
        <div key={box?.id ?? "none"} className="space-y-2">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{box?.label || L.noBox}</span>
            {box && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openBox(box)}><Pencil className="w-3 h-3" /></Button>}
          </div>
          {list.map(it => {
            const low = (it.minStockMagasin ?? 0) > 0 && it.stockMagasin <= (it.minStockMagasin ?? 0);
            return (
              <Card key={it.id}><CardContent className="p-3 flex items-center gap-3">
                {it.type === "Médicament" ? <Pill className="w-4 h-4 text-primary flex-shrink-0" /> : it.type === "Équipement" ? <Wrench className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <Box className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{it.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{typeLabel(it.type)}</Badge>
                    {it.sellPrice ? <span>{it.sellPrice.toLocaleString()} FCFA</span> : null}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground">{L.magasin}</p>
                  <p className={`text-xl font-bold leading-none ${low ? "text-warning" : ""}`}>{it.stockMagasin} <span className="text-xs font-normal">{it.unit}</span></p>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setRecv(it); setRecvQty(""); }}><PackagePlus className="w-3.5 h-3.5" /> {L.entry}</Button>
                  <Button size="sm" className="h-7 gap-1 text-xs" disabled={it.stockMagasin <= 0} onClick={() => { setTransfer(it); setTQty(""); setTDest(it.type === "Équipement" ? "equipment" : it.type === "Réactif" ? "reagent" : "pharmacy"); }}><ArrowRight className="w-3.5 h-3.5" /> {L.transfer}</Button>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openItem(it)}><Pencil className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setDel(it)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </CardContent></Card>
            );
          })}
        </div>
      ))}

      {/* Box dialog */}
      <Dialog open={!!boxDialog} onOpenChange={v => { if (!v) setBoxDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{boxDialog?.id ? L.renameBox : L.newBox}</DialogTitle></DialogHeader>
          <Input placeholder={L.boxNamePh} value={boxLabel} onChange={e => setBoxLabel(e.target.value)} autoFocus />
          <DialogFooter><Button variant="outline" onClick={() => setBoxDialog(null)}>{L.cancel}</Button><Button onClick={saveBox}>{L.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item dialog */}
      <Dialog open={!!itemDialog} onOpenChange={v => { if (!v) setItemDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{itemDialog && itemDialog !== "new" ? L.editItem : L.newItem}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-sm">{L.name} *</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="text-sm">{L.box}</label>
              <Select value={form.boxId} onValueChange={v => setForm(f => ({ ...f, boxId: v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{boxes.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-sm">{L.type}</label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-sm">{L.unit}</label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
            <div><label className="text-sm">{L.stockMag}</label><Input type="number" value={form.stockMagasin} onChange={e => setForm(f => ({ ...f, stockMagasin: e.target.value }))} /></div>
            <div><label className="text-sm">{L.minThreshold}</label><Input type="number" value={form.minStockMagasin} onChange={e => setForm(f => ({ ...f, minStockMagasin: e.target.value }))} /></div>
            <div><label className="text-sm">{L.buyPrice}</label><Input type="number" value={form.buyPrice} onChange={e => setForm(f => ({ ...f, buyPrice: e.target.value }))} /></div>
            <div><label className="text-sm">{L.sellPrice}</label><Input type="number" value={form.sellPrice} onChange={e => setForm(f => ({ ...f, sellPrice: e.target.value }))} /></div>
            <div><label className="text-sm">{L.batch}</label><Input value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} /></div>
            <div><label className="text-sm">{L.expiry}</label><Input type="date" value={form.expiration} onChange={e => setForm(f => ({ ...f, expiration: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setItemDialog(null)}>{L.cancel}</Button><Button onClick={saveItem}>{L.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      <Dialog open={!!recv} onOpenChange={v => { if (!v) setRecv(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.entryTitle} — {recv?.name}</DialogTitle></DialogHeader>
          <div><label className="text-sm">{L.qtyReceived} ({recv?.unit})</label><Input type="number" min={1} value={recvQty} onChange={e => setRecvQty(e.target.value)} autoFocus /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRecv(null)}>{L.cancel}</Button><Button onClick={doReceive}>{L.add}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={!!transfer} onOpenChange={v => { if (!v) setTransfer(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.transferTitle} — {transfer?.name}</DialogTitle></DialogHeader>
          {transfer && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{L.magasin} : <b>{transfer.stockMagasin} {transfer.unit}</b></p>
              <div><label className="text-sm">{L.destination}</label>
                <Select value={tDest} onValueChange={v => setTDest(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pharmacy">{L.pharmacy}</SelectItem>
                    <SelectItem value="reagent">{L.reagentDest}</SelectItem>
                    <SelectItem value="equipment">{L.equipment}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-sm">{L.qty}</label><Input type="number" min={1} max={transfer.stockMagasin} value={tQty} onChange={e => setTQty(e.target.value)} autoFocus /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setTransfer(null)} disabled={busy}>{L.cancel}</Button><Button onClick={doTransfer} disabled={busy}>{L.transfer}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!del} onOpenChange={v => { if (!v) setDel(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{L.deleteItem}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{del?.name}</p>
          <DialogFooter><Button variant="outline" onClick={() => setDel(null)}>{L.cancel}</Button><Button variant="destructive" onClick={removeItem}>{L.delete}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
