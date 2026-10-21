import { useEffect, useState } from "react";
import { db, type Drug } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

// Transfer stock from the central store (Magasin) to the dispensing counter
// (Pharmacie / Comptoir). Decrements Magasin, increments Comptoir, logs the move.
export function StockTransferDialog({ drug, onOpenChange, onDone }: {
  drug: Drug | null;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const { user } = useAuth();
  const [qtyStr, setQtyStr] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setQtyStr(""); }, [drug]);

  if (!drug) return null;
  const magasin = drug.stockMagasin || 0;
  const comptoir = drug.stock || 0;
  const qty = Math.max(0, parseInt(qtyStr) || 0);
  const over = qty > magasin;

  const transfer = async () => {
    if (qty <= 0) { toast.error("Quantité invalide"); return; }
    if (over) { toast.error("Pas assez de stock au magasin"); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await db.drugs.update(drug.id!, {
        stockMagasin: magasin - qty,
        stock: comptoir + qty,
        updatedAt: now,
      });
      await db.drugTransactions.add({
        drugId: drug.id!, type: "in", quantity: qty, price: 0,
        exitReason: "transferred", performedBy: user?.name,
        batchNumber: drug.batchNumber,
        clinicId: localStorage.getItem("divinelink.clinicId") || undefined,
        createdAt: now,
      } as any);
      toast.success(`${qty} ${drug.unit} transféré(s) au comptoir`);
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erreur: " + (e?.message || "échec"));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!drug} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>⇄ Transfert — {drug.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-around rounded-lg border p-3 text-center">
            <div><p className="text-xs text-muted-foreground">Magasin</p><p className="text-2xl font-bold">{magasin}</p></div>
            <ArrowRight className="w-6 h-6 text-primary" />
            <div><p className="text-xs text-muted-foreground">Comptoir</p><p className="text-2xl font-bold">{comptoir}</p></div>
          </div>
          <div>
            <label className="text-sm font-medium">Quantité à transférer ({drug.unit})</label>
            <Input type="number" min={1} max={magasin} value={qtyStr} onChange={e => setQtyStr(e.target.value)} autoFocus />
            {over && <p className="text-xs text-red-600 mt-1">Maximum disponible au magasin : {magasin}</p>}
          </div>
          {qty > 0 && !over && (
            <p className="text-sm text-muted-foreground">Après : Magasin <b>{magasin - qty}</b> · Comptoir <b>{comptoir + qty}</b></p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={transfer} disabled={saving || qty <= 0 || over}>Transférer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
