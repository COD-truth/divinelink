import React, { useCallback, useEffect, useState } from "react";
import { db, type EquipmentItem, type EquipmentMovement, type Patient } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, History, AlertTriangle, Package, Pencil } from "lucide-react";
import { toast } from "sonner";
import { decryptPatients } from "@/lib/patientCrypto";
import { formatDateTime } from "@/lib/dateFormat";
import { getClinicId } from "@/lib/clinicSettings";

type MovementDialog = { item: EquipmentItem; mode: "add" | "remove" };

export function EquipmentPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [movDialog, setMovDialog] = useState<MovementDialog | null>(null);
  const [histDialog, setHistDialog] = useState<{ item: EquipmentItem; movements: EquipmentMovement[] } | null>(null);
  const [editDialog, setEditDialog] = useState<EquipmentItem | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [linkedPatient, setLinkedPatient] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editThreshold, setEditThreshold] = useState("");

  const load = useCallback(async () => {
    const [all, allPatients] = await Promise.all([
      db.equipmentItems.toArray(),
      decryptPatients(await db.patients.toArray()),
    ]);
    setItems(all.sort((a, b) => a.name.localeCompare(b.name)));
    setPatients(allPatients);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openMove = (item: EquipmentItem, mode: "add" | "remove") => {
    setMovDialog({ item, mode });
    setQty("1");
    setReason("");
    setLinkedPatient("");
  };

  const openHistory = async (item: EquipmentItem) => {
    const movements = await db.equipmentMovements
      .where("itemId").equals(item.id!)
      .reverse()
      .toArray();
    setHistDialog({ item, movements });
  };

  const openEdit = (item: EquipmentItem) => {
    setEditDialog(item);
    setEditStock(String(item.stock));
    setEditThreshold(String(item.lowStockThreshold));
  };

  const saveMove = async () => {
    if (!movDialog || !reason.trim()) return;
    const qtyNum = parseInt(qty, 10);
    if (!qtyNum || qtyNum <= 0) return;

    const { item, mode } = movDialog;
    const change = mode === "add" ? qtyNum : -qtyNum;
    const newStock = Math.max(0, item.stock + change);
    const now = new Date().toISOString();
    const clinicId = getClinicId();

    await db.equipmentItems.update(item.id!, { stock: newStock, updatedAt: now });
    await db.equipmentMovements.add({
      itemId: item.id!,
      quantityChange: change,
      newStock,
      reason: reason.trim(),
      performedBy: user?.name || "?",
      patientId: linkedPatient ? parseInt(linkedPatient, 10) : undefined,
      clinicId,
      createdAt: now,
    });

    toast.success(
      mode === "add"
        ? t("equip.stockAdded")
        : t("equip.stockRemoved")
    );
    setMovDialog(null);
    load();
  };

  const saveEdit = async () => {
    if (!editDialog) return;
    const stockNum = parseInt(editStock, 10);
    const threshNum = parseInt(editThreshold, 10);
    if (isNaN(stockNum) || isNaN(threshNum) || stockNum < 0 || threshNum < 0) return;
    const now = new Date().toISOString();
    await db.equipmentItems.update(editDialog.id!, {
      stock: stockNum,
      lowStockThreshold: threshNum,
      updatedAt: now,
    });
    toast.success(t("equip.updated"));
    setEditDialog(null);
    load();
  };

  const lowItems = items.filter(i => i.stock <= i.lowStockThreshold);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t("equip.title")}</h2>
        </div>
        {lowItems.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            {lowItems.length} {t("equip.lowStockAlert")}
          </Badge>
        )}
      </div>

      {lowItems.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3">
            <p className="text-sm font-medium text-destructive flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4" />{t("equip.lowStockItems")}
            </p>
            <div className="flex flex-wrap gap-2">
              {lowItems.map(i => (
                <Badge key={i.id} variant="outline" className="border-destructive text-destructive">
                  {i.name} — {i.stock}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => {
          const isLow = item.stock <= item.lowStockThreshold;
          return (
            <Card key={item.id} className={isLow ? "border-destructive/60" : ""}>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm font-medium flex items-start justify-between gap-2">
                  <span className="leading-snug">{item.name}</span>
                  {isLow && (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      {t("equip.low")}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${isLow ? "text-destructive" : "text-foreground"}`}>
                    {item.stock}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("equip.units")} &bull; seuil {item.lowStockThreshold}
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openMove(item, "add")}>
                    <Plus className="w-3 h-3" />{t("equip.addStock")}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openMove(item, "remove")} disabled={item.stock === 0}>
                    <Minus className="w-3 h-3" />{t("equip.removeStock")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => openHistory(item)}>
                    <History className="w-3 h-3" />
                  </Button>
                  {user?.role === "admin" && (
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => openEdit(item)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add / Remove stock dialog */}
      <Dialog open={!!movDialog} onOpenChange={v => { if (!v) setMovDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {movDialog?.mode === "add" ? t("equip.addStock") : t("equip.removeStock")}
              {movDialog && <span className="block text-sm font-normal text-muted-foreground mt-0.5">{movDialog.item.name}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("equip.quantity")}</Label>
              <Input
                type="number"
                min="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("equip.reason")} *</Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={movDialog?.mode === "add" ? t("equip.reasonAddPlaceholder") : t("equip.reasonRemovePlaceholder")}
              />
            </div>
            {movDialog?.mode === "remove" && (
              <div>
                <Label>{t("equip.linkPatient")} ({t("common.optional")})</Label>
                <Select value={linkedPatient} onValueChange={setLinkedPatient}>
                  <SelectTrigger><SelectValue placeholder={t("equip.noPatient")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("equip.noPatient")}</SelectItem>
                    {patients.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.firstName} {p.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {movDialog && (
              <p className="text-sm text-muted-foreground">
                {t("equip.currentStock")}: <strong>{movDialog.item.stock}</strong>
                {" → "}
                <strong className={movDialog.mode === "remove" && movDialog.item.stock - parseInt(qty || "0") <= movDialog.item.lowStockThreshold ? "text-destructive" : ""}>
                  {movDialog.mode === "add"
                    ? movDialog.item.stock + parseInt(qty || "0", 10)
                    : Math.max(0, movDialog.item.stock - parseInt(qty || "0", 10))}
                </strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={saveMove} disabled={!reason.trim() || !qty || parseInt(qty, 10) <= 0}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit stock dialog (admin only) */}
      <Dialog open={!!editDialog} onOpenChange={v => { if (!v) setEditDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("equip.editItem")}
              {editDialog && <span className="block text-sm font-normal text-muted-foreground mt-0.5">{editDialog.name}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("equip.currentStock")}</Label>
              <Input type="number" min="0" value={editStock} onChange={e => setEditStock(e.target.value)} />
            </div>
            <div>
              <Label>{t("equip.threshold")}</Label>
              <Input type="number" min="0" value={editThreshold} onChange={e => setEditThreshold(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={saveEdit}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement history dialog */}
      <Dialog open={!!histDialog} onOpenChange={v => { if (!v) setHistDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("equip.history")}
              {histDialog && <span className="block text-sm font-normal text-muted-foreground mt-0.5">{histDialog.item.name}</span>}
            </DialogTitle>
          </DialogHeader>
          {histDialog?.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("equip.noMovements")}</p>
          ) : (
            <div className="space-y-2">
              {histDialog?.movements.map(m => {
                const pat = m.patientId ? patients.find(p => p.id === m.patientId) : null;
                return (
                  <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${m.quantityChange > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{m.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("equip.newStock")}: {m.newStock} &bull; {m.performedBy} &bull; {formatDateTime(m.createdAt)}
                      </p>
                      {pat && (
                        <p className="text-xs text-muted-foreground">{t("apt.patient")}: {pat.firstName} {pat.lastName}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
