import React, { useCallback, useEffect, useMemo, useState } from "react";
import { db, type EquipmentItem, type EquipmentMovement, type EquipmentBox } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, History, Package, TriangleAlert as AlertTriangle, Pencil, Trash2, ArrowUp, ArrowDown, FolderPlus, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dateFormat";
import { decryptPatients } from "@/lib/patientCrypto";
import { getClinicId } from "@/lib/clinicSettings";

interface MovementDialogState { item: EquipmentItem; mode: "add" | "remove"; }
interface HistoryDialogState { item: EquipmentItem; movements: EquipmentMovement[]; }

export function EquipmentPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const fr = lang === "fr";
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [boxes, setBoxes] = useState<EquipmentBox[]>([]);
  const [movementDialog, setMovementDialog] = useState<MovementDialogState | null>(null);
  const [historyDialog, setHistoryDialog] = useState<HistoryDialogState | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [patientRef, setPatientRef] = useState("");
  const [patients, setPatients] = useState<{ id: number; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Box dialogs
  const [boxDialog, setBoxDialog] = useState<EquipmentBox | "new" | null>(null);
  const [boxLabel, setBoxLabel] = useState("");

  // Item dialogs
  const [itemDialog, setItemDialog] = useState<{ mode: "new" | "edit"; item?: EquipmentItem; boxId?: number } | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemStock, setItemStock] = useState("0");
  const [itemThreshold, setItemThreshold] = useState("5");
  const [itemUnit, setItemUnit] = useState("");
  const [itemBoxId, setItemBoxId] = useState<string>("");

  const load = useCallback(async () => {
    const all = await db.equipmentItems.toArray();
    setItems(all.sort((a, b) => {
      const pa = a.priority ?? 9999;
      const pb = b.priority ?? 9999;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    }));
    const bx = await db.equipmentBoxes.toArray();
    setBoxes(bx.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label)));
    const pats = await decryptPatients(await db.patients.toArray());
    setPatients(pats.map(p => ({ id: p.id!, name: `${p.firstName} ${p.lastName}` })));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Box CRUD ──
  const openNewBox = () => { setBoxDialog("new"); setBoxLabel(""); };
  const openEditBox = (b: EquipmentBox) => { setBoxDialog(b); setBoxLabel(b.label); };
  const saveBox = async () => {
    const label = boxLabel.trim();
    if (!label) { toast.error(fr ? "Nom requis" : "Name required"); return; }
    const now = new Date().toISOString();
    if (boxDialog === "new") {
      await db.equipmentBoxes.add({ label, order: boxes.length, clinicId: getClinicId(), createdAt: now, updatedAt: now });
      toast.success(fr ? "Boîte créée" : "Box created");
    } else if (boxDialog) {
      await db.equipmentBoxes.update(boxDialog.id!, { label, updatedAt: now });
      toast.success(fr ? "Boîte renommée" : "Box renamed");
    }
    setBoxDialog(null);
    load();
  };
  const deleteBox = async (b: EquipmentBox) => {
    const count = items.filter(i => i.boxId === b.id).length;
    const msg = fr
      ? `Supprimer la boîte "${b.label}" ?${count ? `\n\n${count} article(s) seront déplacés vers "Sans catégorie".` : ""}`
      : `Delete box "${b.label}"?${count ? `\n\n${count} item(s) will move to "Uncategorised".` : ""}`;
    if (!confirm(msg)) return;
    await db.equipmentItems.where("boxId").equals(b.id!).modify({ boxId: undefined });
    await db.equipmentBoxes.delete(b.id!);
    toast.success(fr ? "Boîte supprimée" : "Box deleted");
    load();
  };

  // ── Item CRUD ──
  const openNewItem = (boxId?: number) => {
    setItemDialog({ mode: "new", boxId });
    setItemName(""); setItemStock("0"); setItemThreshold("5"); setItemUnit(""); setItemBoxId(boxId ? String(boxId) : "");
  };
  const openEditItem = (item: EquipmentItem) => {
    setItemDialog({ mode: "edit", item });
    setItemName(item.name);
    setItemStock(String(item.stock));
    setItemThreshold(String(item.lowStockThreshold));
    setItemUnit(item.unit || "");
    setItemBoxId(item.boxId ? String(item.boxId) : "");
  };
  const saveItem = async () => {
    const name = itemName.trim();
    if (!name) { toast.error(fr ? "Nom requis" : "Name required"); return; }
    const now = new Date().toISOString();
    const data = {
      name,
      stock: parseInt(itemStock) || 0,
      lowStockThreshold: parseInt(itemThreshold) || 0,
      unit: itemUnit.trim() || undefined,
      boxId: itemBoxId ? parseInt(itemBoxId) : undefined,
      updatedAt: now,
    };
    if (itemDialog?.mode === "new") {
      await db.equipmentItems.add({ ...data, clinicId: getClinicId(), createdAt: now });
      toast.success(fr ? "Article créé" : "Item created");
    } else if (itemDialog?.item) {
      await db.equipmentItems.update(itemDialog.item.id!, data);
      toast.success(fr ? "Article modifié" : "Item updated");
    }
    setItemDialog(null);
    load();
  };

  const deleteItem = async (item: EquipmentItem) => {
    if (!confirm(fr ? `Supprimer "${item.name}" ?` : `Delete "${item.name}"?`)) return;
    await db.equipmentMovements.where("itemId").equals(item.id!).delete();
    await db.equipmentItems.delete(item.id!);
    toast.success(fr ? "Article supprimé" : "Item deleted");
    load();
  };

  // ── Movements ──
  const openMovement = (item: EquipmentItem, mode: "add" | "remove") => {
    setMovementDialog({ item, mode });
    setQuantity("1"); setReason(""); setPatientRef("");
  };
  const saveMovement = async () => {
    if (!movementDialog) return;
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) { toast.error(fr ? "Quantité invalide" : "Invalid quantity"); return; }
    if (!reason.trim()) { toast.error(fr ? "Raison requise" : "Reason required"); return; }
    const { item, mode } = movementDialog;
    const delta = mode === "add" ? qty : -qty;
    const newStock = item.stock + delta;
    if (newStock < 0) { toast.error(fr ? "Stock insuffisant" : "Insufficient stock"); return; }
    const now = new Date().toISOString();
    const patientId = patientRef ? parseInt(patientRef) : undefined;
    await db.equipmentItems.update(item.id!, { stock: newStock, updatedAt: now });
    await db.equipmentMovements.add({
      itemId: item.id!, itemName: item.name, quantityChange: delta, newStock,
      reason: reason.trim(), patientId, userName: user?.name || "—", createdAt: now,
    });
    toast.success(fr ? `Stock: ${newStock}` : `Stock: ${newStock}`);
    setMovementDialog(null);
    load();
  };
  const openHistory = async (item: EquipmentItem) => {
    const movements = await db.equipmentMovements.where("itemId").equals(item.id!).reverse().toArray();
    setHistoryDialog({ item, movements });
  };

  // ── Grouping ──
  const filtered = useMemo(() => search.trim()
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items, [items, search]);

  const grouped = useMemo(() => {
    const map = new Map<number | "none", EquipmentItem[]>();
    for (const i of filtered) {
      const k = i.boxId ?? "none";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    }
    return map;
  }, [filtered]);

  const lowStockCount = items.filter(i => i.stock <= i.lowStockThreshold).length;

  const renderItemCard = (item: EquipmentItem) => {
    const isLow = item.stock <= item.lowStockThreshold;
    return (
      <Card key={item.id} className={isLow ? "border-orange-400" : ""}>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium flex items-start justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{item.name}</span>
            </span>
            {isLow && <Badge variant="outline" className="text-orange-600 border-orange-400 shrink-0">{fr ? "Faible" : "Low"}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">{item.stock}<span className="text-xs text-muted-foreground ml-1">{item.unit || ""}</span></span>
            <span className="text-[10px] text-muted-foreground">{fr ? "seuil" : "min"}: {item.lowStockThreshold}</span>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="flex-1 gap-1 text-green-700 border-green-300 hover:bg-green-50 h-8"
              onClick={() => openMovement(item, "add")}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1 text-red-700 border-red-300 hover:bg-red-50 h-8"
              onClick={() => openMovement(item, "remove")} disabled={item.stock === 0}>
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="px-2 h-8" onClick={() => openHistory(item)} title={fr ? "Historique" : "History"}>
              <History className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="px-2 h-8" onClick={() => openEditItem(item)} title={fr ? "Modifier" : "Edit"}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="px-2 h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => deleteItem(item)} title={fr ? "Supprimer" : "Delete"}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderGroup = (key: number | "none", title: string, list: EquipmentItem[], box?: EquipmentBox) => {
    const isOpen = !collapsed[String(key)];
    const lowInGroup = list.filter(i => i.stock <= i.lowStockThreshold).length;
    return (
      <div key={String(key)} className="border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
          <button onClick={() => setCollapsed(c => ({ ...c, [String(key)]: !c[String(key)] }))} className="flex items-center gap-1.5 flex-1 text-left">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <FolderOpen className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{title}</span>
            <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>
            {lowInGroup > 0 && <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-400">{lowInGroup} {fr ? "faible" : "low"}</Badge>}
          </button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => openNewItem(typeof key === "number" ? key : undefined)}>
            <Plus className="w-3.5 h-3.5" /> {fr ? "Article" : "Item"}
          </Button>
          {box && (
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEditBox(box)} title={fr ? "Renommer" : "Rename"}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" onClick={() => deleteBox(box)} title={fr ? "Supprimer" : "Delete"}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
        {isOpen && (
          <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {list.length === 0
              ? <p className="text-sm text-muted-foreground text-center col-span-full py-4">{fr ? "Aucun article" : "No items"}</p>
              : list.map(renderItemCard)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{fr ? "Stock d'équipement" : "Equipment stock"}</h1>
          {lowStockCount > 0 && (
            <p className="text-sm text-orange-600 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
              {lowStockCount} {fr ? "article(s) en stock faible" : "item(s) low on stock"}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input className="max-w-xs" placeholder={fr ? "Rechercher..." : "Search..."} value={search} onChange={e => setSearch(e.target.value)} />
          <Button onClick={() => openNewItem()} variant="outline" className="gap-1"><Plus className="w-4 h-4" />{fr ? "Article" : "Item"}</Button>
          <Button onClick={openNewBox} className="gap-1"><FolderPlus className="w-4 h-4" />{fr ? "Boîte" : "Box"}</Button>
        </div>
      </div>

      <div className="space-y-3">
        {boxes.map(b => renderGroup(b.id!, b.label, grouped.get(b.id!) || [], b))}
        {(grouped.get("none") || items.filter(i => !i.boxId).length > 0) &&
          renderGroup("none", fr ? "Sans catégorie" : "Uncategorised", grouped.get("none") || [])}
      </div>

      {/* ── Box dialog ── */}
      <Dialog open={!!boxDialog} onOpenChange={v => { if (!v) setBoxDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{boxDialog === "new" ? (fr ? "Nouvelle boîte" : "New box") : (fr ? "Renommer la boîte" : "Rename box")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>{fr ? "Nom de la boîte" : "Box label"}</Label>
            <Input value={boxLabel} onChange={e => setBoxLabel(e.target.value)} placeholder={fr ? "Ex: Prothèse, Stérilisation..." : "e.g. Prosthesis, Sterilisation..."} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxDialog(null)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button onClick={saveBox}>{fr ? "Enregistrer" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Item dialog ── */}
      <Dialog open={!!itemDialog} onOpenChange={v => { if (!v) setItemDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{itemDialog?.mode === "new" ? (fr ? "Nouvel article" : "New item") : (fr ? "Modifier l'article" : "Edit item")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{fr ? "Nom *" : "Name *"}</Label>
              <Input value={itemName} onChange={e => setItemName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>{fr ? "Stock" : "Stock"}</Label>
                <Input type="number" value={itemStock} onChange={e => setItemStock(e.target.value)} />
              </div>
              <div>
                <Label>{fr ? "Seuil" : "Min"}</Label>
                <Input type="number" value={itemThreshold} onChange={e => setItemThreshold(e.target.value)} />
              </div>
              <div>
                <Label>{fr ? "Unité" : "Unit"}</Label>
                <Input value={itemUnit} onChange={e => setItemUnit(e.target.value)} placeholder="boîte" />
              </div>
            </div>
            <div>
              <Label>{fr ? "Boîte" : "Box"}</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={itemBoxId} onChange={e => setItemBoxId(e.target.value)}>
                <option value="">{fr ? "— Sans catégorie —" : "— Uncategorised —"}</option>
                {boxes.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(null)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button onClick={saveItem}>{fr ? "Enregistrer" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Movement dialog ── */}
      <Dialog open={!!movementDialog} onOpenChange={v => { if (!v) setMovementDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{movementDialog?.mode === "add" ? (fr ? "Ajouter au stock" : "Add to stock") : (fr ? "Retirer du stock" : "Remove from stock")}</DialogTitle>
          </DialogHeader>
          {movementDialog && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{movementDialog.item.name}</p>
              <p className="text-xs text-muted-foreground">{fr ? "Stock actuel" : "Current"}: {movementDialog.item.stock}</p>
              <div>
                <Label>{fr ? "Quantité *" : "Quantity *"}</Label>
                <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
              <div>
                <Label>{fr ? "Raison *" : "Reason *"}</Label>
                <Textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <div>
                <Label>{fr ? "Patient lié (optionnel)" : "Linked patient (optional)"}</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={patientRef} onChange={e => setPatientRef(e.target.value)}>
                  <option value="">—</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialog(null)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button onClick={saveMovement} className={movementDialog?.mode === "add" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>{fr ? "Confirmer" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── History dialog ── */}
      <Dialog open={!!historyDialog} onOpenChange={v => { if (!v) setHistoryDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{fr ? "Historique" : "History"} — {historyDialog?.item.name}</DialogTitle>
          </DialogHeader>
          {historyDialog && (
            <div className="space-y-2">
              {historyDialog.movements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{fr ? "Aucun mouvement" : "No movements"}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-2">Date</th>
                      <th className="text-right py-2">{fr ? "Qté" : "Qty"}</th>
                      <th className="text-right py-2">Stock</th>
                      <th className="text-left py-2 pl-3">{fr ? "Raison" : "Reason"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyDialog.movements.map(m => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2 text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</td>
                        <td className={`py-2 text-right font-medium ${m.quantityChange > 0 ? "text-green-600" : "text-red-600"}`}>
                          {m.quantityChange > 0 ? "+" : ""}{m.quantityChange}
                        </td>
                        <td className="py-2 text-right">{m.newStock}</td>
                        <td className="py-2 pl-3 text-xs">{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
