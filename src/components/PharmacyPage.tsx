import React, { useEffect, useState, useMemo } from "react";
import {
  db,
  type Drug,
  type DrugTransaction,
  type DrugStatus,
  type PaymentStatus,
  type PaymentMethod,
  type DispenseReason,
} from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Search, Download, TriangleAlert as AlertTriangle, Bell,
  ArrowDown, ArrowUp, Pencil, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { saveFile, toCsv, withDateStamp } from "@/lib/download";
import { decryptPatients, type Patient } from "@/lib/patientCrypto";

const STATUS_ICONS: Record<DrugStatus, string> = {
  in_stock: "🟢", low: "🟡", out: "🔴", expiring_soon: "⚠️",
};

const CATEGORIES = [
  "Antibiotique", "Antalgique", "Antipaludéen", "Antiparasitaire",
  "Antihypertenseur", "Antidiabétique", "Vitamines", "Anti-inflammatoire",
  "Antiseptique", "Anesthésique", "Antifongique", "Autre",
];

const DISPENSE_REASONS: { value: DispenseReason; label: string }[] = [
  { value: "dispensed", label: "Dispensé" },
  { value: "expired", label: "Périmé" },
  { value: "damaged", label: "Endommagé" },
  { value: "transferred", label: "Transféré" },
  { value: "other", label: "Autre" },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "💵 Espèces" },
  { value: "mtn_momo", label: "📱 MTN MoMo" },
  { value: "orange_money", label: "🟠 Orange Money" },
  { value: "other", label: "Autre" },
];

function computeStatus(drug: Drug): DrugStatus {
  if (drug.stock <= 0) return "out";
  if (drug.expiration) {
    const daysToExp = (new Date(drug.expiration).getTime() - Date.now()) / 86_400_000;
    if (daysToExp < 30) return "expiring_soon";
  }
  if (drug.stock <= drug.minStock) return "low";
  return "in_stock";
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PharmacyPage() {
  const { t } = useLang();
  const [tab, setTab] = useState("inventory");
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [transactions, setTransactions] = useState<DrugTransaction[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  const load = async () => {
    const allDrugs = await db.drugs.toArray();
    for (const d of allDrugs) {
      const s = computeStatus(d);
      if (d.status !== s) { d.status = s; await db.drugs.update(d.id!, { status: s }); }
    }
    setDrugs(allDrugs);
    setTransactions(await db.drugTransactions.reverse().sortBy("createdAt"));
    setPatients(await decryptPatients(await db.patients.toArray()));
  };

  useEffect(() => { load(); }, []);

  /* Alerts */
  const alerts = useMemo(() => {
    const a: { type: string; message: string; urgency: "high" | "med" }[] = [];
    drugs.forEach(d => {
      if (d.status === "out") a.push({ type: "out", urgency: "high", message: `🔴 ${d.name} — épuisé` });
      else if (d.status === "low") a.push({ type: "low", urgency: "med", message: `🟡 ${d.name}: ${d.stock} ${d.unit} (min ${d.minStock})` });
      if (d.status === "expiring_soon" && d.expiration) {
        const days = daysUntil(d.expiration) ?? 0;
        a.push({ type: "exp", urgency: days < 7 ? "high" : "med", message: `⚠️ ${d.name}: expire dans ${days}j` });
      }
    });
    return a;
  }, [drugs]);

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-warning" />
              <span className="text-sm font-semibold">{t("pharm.alerts")} ({alerts.length})</span>
            </div>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {alerts.map((a, i) => (
                <li key={i} className={`flex items-center gap-2 text-sm ${a.urgency === "high" ? "text-destructive font-medium" : ""}`}>
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="inventory">{t("pharm.inventory")}</TabsTrigger>
          <TabsTrigger value="receive">{t("pharm.receive")}</TabsTrigger>
          <TabsTrigger value="dispense">{t("pharm.dispense")}</TabsTrigger>
          <TabsTrigger value="transactions">{t("pharm.transactions")}</TabsTrigger>
          <TabsTrigger value="stats">{t("pharm.stats")}</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-3 mt-3">
          <InventoryTab drugs={drugs} transactions={transactions} onRefresh={load} />
        </TabsContent>
        <TabsContent value="receive" className="space-y-3 mt-3">
          <ReceiveTab drugs={drugs} onRefresh={load} />
        </TabsContent>
        <TabsContent value="dispense" className="space-y-3 mt-3">
          <DispenseTab drugs={drugs} patients={patients} onRefresh={load} />
        </TabsContent>
        <TabsContent value="transactions" className="space-y-3 mt-3">
          <TransactionsTab transactions={transactions} drugs={drugs} patients={patients} />
        </TabsContent>
        <TabsContent value="stats" className="space-y-3 mt-3">
          <StatsTab drugs={drugs} transactions={transactions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== INVENTORY ============================== */
function InventoryTab({
  drugs, transactions, onRefresh,
}: { drugs: Drug[]; transactions: DrugTransaction[]; onRefresh: () => void }) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "stock" | "expiry" | "category">("name");
  const [editing, setEditing] = useState<Drug | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const dispensedTotals = useMemo(() => {
    const m: Record<number, number> = {};
    transactions.filter(t => t.type === "out").forEach(t => {
      m[t.drugId] = (m[t.drugId] || 0) + t.quantity;
    });
    return m;
  }, [transactions]);

  const filtered = useMemo(() => {
    let list = drugs.filter(d => {
      if (search && !`${d.name} ${d.category} ${d.batchNumber || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (catFilter !== "all" && d.category !== catFilter) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "stock": return a.stock - b.stock;
        case "expiry": return (a.expiration || "9999").localeCompare(b.expiration || "9999");
        case "category": return a.category.localeCompare(b.category);
        default: return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [drugs, search, catFilter, statusFilter, sortBy]);

  const exportCsv = async () => {
    const rows = filtered.map(d => ({
      name: d.name, category: d.category,
      stock: d.stock, unit: d.unit, minStock: d.minStock,
      buyPrice: d.buyPrice, sellPrice: d.sellPrice,
      expiration: d.expiration || "", supplier: d.supplier || "",
      batch: d.batchNumber || "", location: d.location || "",
      status: d.status, addedAt: d.createdAt,
      dispensed: dispensedTotals[d.id!] || 0,
    }));
    const ok = await saveFile(withDateStamp("pharmacy_inventory.csv"), toCsv(rows as any), "csv");
    if (ok) toast.success("Export OK");
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    await db.drugs.delete(deleteId);
    setDeleteId(null);
    toast.success("Supprimé");
    onRefresh();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher médicament, lot…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus className="w-4 h-4" />Ajouter</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger><SelectValue placeholder="Catégorie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="in_stock">🟢 En stock</SelectItem>
            <SelectItem value="low">🟡 Faible</SelectItem>
            <SelectItem value="out">🔴 Épuisé</SelectItem>
            <SelectItem value="expiring_soon">⚠️ Expire bientôt</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Trier: Nom A-Z</SelectItem>
            <SelectItem value="stock">Trier: Stock</SelectItem>
            <SelectItem value="expiry">Trier: Expiration</SelectItem>
            <SelectItem value="category">Trier: Catégorie</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="w-4 h-4" />CSV</Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Aucun médicament</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map(d => {
            const dispensed = dispensedTotals[d.id!] || 0;
            const expDays = daysUntil(d.expiration);
            const lowStock = d.stock <= d.minStock;
            return (
              <Card key={d.id} className={d.status === "out" ? "border-destructive/50" : ""}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{d.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {d.category && <Badge variant="secondary" className="text-[10px]">{d.category}</Badge>}
                        <Badge variant="outline" className="text-[10px]">{STATUS_ICONS[d.status]} {d.status}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(d)}><Pencil className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(d.id!)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Restant</p>
                      <p className={`font-bold text-lg ${lowStock ? "text-destructive" : ""}`}>{d.stock}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Initial</p>
                      <p>{d.initialStock ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Dispensé</p>
                      <p>{dispensed}</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Achat: <span className="text-foreground">{d.buyPrice} FCFA</span> · Vente: <span className="text-foreground">{d.sellPrice} FCFA</span></p>
                    {d.expiration && (
                      <p className={expDays !== null && expDays < 30 ? "text-destructive font-medium" : ""}>
                        Exp: {new Date(d.expiration).toLocaleDateString()} {expDays !== null && `(${expDays}j)`}
                      </p>
                    )}
                    {(d.supplier || d.batchNumber || d.location) && (
                      <p className="truncate">
                        {d.supplier && `${d.supplier}`}
                        {d.batchNumber && ` · Lot ${d.batchNumber}`}
                        {d.location && ` · ${d.location}`}
                      </p>
                    )}
                    <p>Ajouté: {fmtDateTime(d.createdAt)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DrugFormDialog
        open={addOpen || !!editing}
        drug={editing}
        onClose={() => { setAddOpen(false); setEditing(null); }}
        onSaved={() => { setAddOpen(false); setEditing(null); onRefresh(); }}
      />

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer ce médicament ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">L'historique des transactions sera conservé.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* Add / Edit dialog */
function DrugFormDialog({
  open, drug, onClose, onSaved,
}: { open: boolean; drug: Drug | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: "", category: "Autre", stock: "", unit: "comprimé",
    buyPrice: "", sellPrice: "", expiration: "", minStock: "5",
    supplier: "", batchNumber: "", location: "",
  });

  useEffect(() => {
    if (drug) {
      setF({
        name: drug.name, category: drug.category || "Autre",
        stock: String(drug.stock), unit: drug.unit,
        buyPrice: String(drug.buyPrice), sellPrice: String(drug.sellPrice),
        expiration: drug.expiration || "", minStock: String(drug.minStock),
        supplier: drug.supplier || "", batchNumber: drug.batchNumber || "",
        location: drug.location || "",
      });
    } else {
      setF({ name: "", category: "Autre", stock: "", unit: "comprimé", buyPrice: "", sellPrice: "", expiration: "", minStock: "5", supplier: "", batchNumber: "", location: "" });
    }
  }, [drug, open]);

  const save = async () => {
    if (!f.name.trim()) return;
    const now = new Date().toISOString();
    const cid = localStorage.getItem("divinelink.clinicId") || undefined;
    const stock = parseInt(f.stock) || 0;
    const base = {
      name: f.name.trim(), category: f.category,
      stock, unit: f.unit,
      buyPrice: parseFloat(f.buyPrice) || 0,
      sellPrice: parseFloat(f.sellPrice) || 0,
      expiration: f.expiration || undefined,
      minStock: parseInt(f.minStock) || 5,
      supplier: f.supplier || undefined,
      batchNumber: f.batchNumber || undefined,
      location: f.location || undefined,
      clinicId: cid, updatedAt: now,
    };
    if (drug) {
      await db.drugs.update(drug.id!, { ...base, status: computeStatus({ ...drug, ...base } as Drug) });
    } else {
      const newDrug = { ...base, initialStock: stock, status: "in_stock" as DrugStatus, createdAt: now };
      newDrug.status = computeStatus(newDrug as Drug);
      await db.drugs.add(newDrug as Drug);
    }
    toast.success("Enregistré");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{drug ? "Modifier" : "Ajouter"} médicament</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nom *</Label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <div>
            <Label>Catégorie</Label>
            <Select value={f.category} onValueChange={v => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Stock</Label><Input type="number" value={f.stock} onChange={e => setF({ ...f, stock: e.target.value })} /></div>
            <div><Label>Unité</Label><Input value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Prix achat</Label><Input type="number" value={f.buyPrice} onChange={e => setF({ ...f, buyPrice: e.target.value })} /></div>
            <div><Label>Prix vente</Label><Input type="number" value={f.sellPrice} onChange={e => setF({ ...f, sellPrice: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Expiration</Label><Input type="date" value={f.expiration} onChange={e => setF({ ...f, expiration: e.target.value })} /></div>
            <div><Label>Stock min</Label><Input type="number" value={f.minStock} onChange={e => setF({ ...f, minStock: e.target.value })} /></div>
          </div>
          <div><Label>Fournisseur</Label><Input value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>N° lot</Label><Input value={f.batchNumber} onChange={e => setF({ ...f, batchNumber: e.target.value })} /></div>
            <div><Label>Emplacement</Label><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== RECEIVE ============================== */
function ReceiveTab({ drugs, onRefresh }: { drugs: Drug[]; onRefresh: () => void }) {
  const { user } = useAuth();
  const [drugId, setDrugId] = useState("__new__");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [expiry, setExpiry] = useState("");
  const [supplier, setSupplier] = useState("");
  const [batch, setBatch] = useState("");
  const [notes, setNotes] = useState("");
  const [newDrugOpen, setNewDrugOpen] = useState(false);

  const save = async () => {
    if (drugId === "__new__") { setNewDrugOpen(true); return; }
    if (!drugId || !qty) return;
    const drug = drugs.find(d => d.id === parseInt(drugId));
    if (!drug) return;
    const q = parseInt(qty);
    if (q <= 0) { toast.error("Quantité invalide"); return; }
    const now = new Date().toISOString();
    const cid = localStorage.getItem("divinelink.clinicId") || undefined;
    const stockBefore = drug.stock;
    const stockAfter = stockBefore + q;
    await db.drugTransactions.add({
      drugId: drug.id!, type: "in", quantity: q,
      price: parseFloat(price) || drug.buyPrice,
      batchNumber: batch || drug.batchNumber,
      stockBefore, stockAfter,
      performedBy: user?.name, notes: notes || undefined,
      clinicId: cid, createdAt: now,
    });
    await db.drugs.update(drug.id!, {
      stock: stockAfter, updatedAt: now,
      expiration: expiry || drug.expiration,
      buyPrice: parseFloat(price) || drug.buyPrice,
      supplier: supplier || drug.supplier,
      batchNumber: batch || drug.batchNumber,
    });
    toast.success("Stock mis à jour");
    setQty(""); setPrice(""); setExpiry(""); setSupplier(""); setBatch(""); setNotes("");
    onRefresh();
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowDown className="w-5 h-5 text-success" />Réception stock</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Médicament *</Label>
            <Select value={drugId} onValueChange={setDrugId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">+ Nouveau médicament…</SelectItem>
                {drugs.map(d => <SelectItem key={d.id} value={d.id!.toString()}>{d.name} ({d.stock} {d.unit})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {drugId !== "__new__" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Quantité reçue *</Label><Input type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
                <div><Label>Prix d'achat</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Expiration</Label><Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
                <div><Label>N° lot</Label><Input value={batch} onChange={e => setBatch(e.target.value)} /></div>
              </div>
              <div><Label>Fournisseur</Label><Input value={supplier} onChange={e => setSupplier(e.target.value)} /></div>
              <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
              <Button onClick={save} disabled={!qty} className="w-full">Enregistrer entrée</Button>
            </>
          )}
          {drugId === "__new__" && (
            <Button onClick={() => setNewDrugOpen(true)} className="w-full"><Plus className="w-4 h-4 mr-1" />Créer un nouveau médicament</Button>
          )}
        </CardContent>
      </Card>
      <DrugFormDialog
        open={newDrugOpen}
        drug={null}
        onClose={() => setNewDrugOpen(false)}
        onSaved={() => { setNewDrugOpen(false); setDrugId("__new__"); onRefresh(); }}
      />
    </>
  );
}

/* ============================== DISPENSE ============================== */
function DispenseTab({ drugs, patients, onRefresh }: { drugs: Drug[]; patients: Patient[]; onRefresh: () => void }) {
  const { user } = useAuth();
  const [drugId, setDrugId] = useState("");
  const [qty, setQty] = useState("");
  const [patientId, setPatientId] = useState("__none__");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState<DispenseReason>("dispensed");
  const [paid, setPaid] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");

  const selectedDrug = drugs.find(d => d.id === parseInt(drugId));
  const totalAmount = selectedDrug ? (parseFloat(price) || selectedDrug.sellPrice) * (parseInt(qty) || 0) : 0;

  useEffect(() => {
    if (selectedDrug && !price) setPrice(String(selectedDrug.sellPrice));
  }, [drugId]); // eslint-disable-line

  const save = async () => {
    if (!drugId || !qty || !selectedDrug) return;
    const q = parseInt(qty);
    if (q <= 0) { toast.error("Quantité invalide"); return; }
    if (q > selectedDrug.stock) { toast.error(`Stock insuffisant (${selectedDrug.stock} disponibles)`); return; }
    const now = new Date().toISOString();
    const cid = localStorage.getItem("divinelink.clinicId") || undefined;
    const stockBefore = selectedDrug.stock;
    const stockAfter = stockBefore - q;
    const payStatus: PaymentStatus = paid ? "paid" : "unpaid";

    await db.drugTransactions.add({
      drugId: selectedDrug.id!, type: "out", quantity: q,
      price: parseFloat(price) || selectedDrug.sellPrice,
      patientId: patientId !== "__none__" ? parseInt(patientId) : undefined,
      paymentStatus: payStatus,
      paymentMethod: paid ? method : undefined,
      reason,
      batchNumber: selectedDrug.batchNumber,
      stockBefore, stockAfter,
      performedBy: user?.name,
      notes: notes || undefined,
      clinicId: cid, createdAt: now,
    });
    await db.drugs.update(selectedDrug.id!, { stock: stockAfter, updatedAt: now });
    toast.success("Sortie enregistrée");
    setDrugId(""); setQty(""); setPatientId("__none__"); setPrice(""); setNotes(""); setReason("dispensed"); setPaid(true);
    onRefresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowUp className="w-5 h-5 text-warning" />Sortie / Dispensation</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Médicament *</Label>
          <Select value={drugId} onValueChange={setDrugId}>
            <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
            <SelectContent>
              {drugs.filter(d => d.stock > 0).map(d => (
                <SelectItem key={d.id} value={d.id!.toString()}>
                  {d.name} — {d.stock} {d.unit} disponibles
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Quantité *</Label>
            <Input type="number" value={qty} onChange={e => setQty(e.target.value)} max={selectedDrug?.stock} />
            {selectedDrug && parseInt(qty) > selectedDrug.stock && (
              <p className="text-xs text-destructive mt-1">⚠️ Stock insuffisant</p>
            )}
          </div>
          <div>
            <Label>Prix unitaire</Label>
            <Input type="number" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Patient</Label>
          <Select value={patientId} onValueChange={setPatientId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Aucun (vente libre)</SelectItem>
              {patients.map(p => <SelectItem key={p.id} value={p.id!.toString()}>{p.firstName} {p.lastName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Motif</Label>
          <Select value={reason} onValueChange={v => setReason(v as DispenseReason)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISPENSE_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} className="w-4 h-4" />
            Payé
          </label>
          {paid && (
            <Select value={method} onValueChange={v => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
        {selectedDrug && qty && (
          <div className="p-2 bg-muted rounded text-sm">
            Total: <span className="font-bold">{totalAmount.toFixed(0)} FCFA</span>
          </div>
        )}
        <Button onClick={save} disabled={!drugId || !qty} className="w-full">Enregistrer sortie</Button>
      </CardContent>
    </Card>
  );
}

/* ============================== TRANSACTIONS ============================== */
function TransactionsTab({
  transactions, drugs, patients,
}: { transactions: DrugTransaction[]; drugs: Drug[]; patients: Patient[] }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const drugName = (id: number) => drugs.find(d => d.id === id)?.name || "—";
  const patientName = (id?: number) => {
    if (!id) return "—";
    const p = patients.find(p => p.id === id);
    return p ? `${p.firstName} ${p.lastName}` : "—";
  };

  const filtered = transactions.filter(tx => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (search) {
      const hay = `${drugName(tx.drugId)} ${patientName(tx.patientId)} ${tx.batchNumber || ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const exportCsv = async () => {
    const rows = filtered.map(tx => ({
      datetime: fmtDateTime(tx.createdAt),
      drug: drugName(tx.drugId),
      type: tx.type === "in" ? "Entrée" : "Sortie",
      qty: tx.quantity,
      stockBefore: tx.stockBefore ?? "",
      stockAfter: tx.stockAfter ?? "",
      patient: patientName(tx.patientId),
      amount: tx.price * tx.quantity,
      payment: tx.paymentStatus || "",
      method: tx.paymentMethod || "",
      reason: tx.reason || "",
      batch: tx.batchNumber || "",
      performedBy: tx.performedBy || "",
      notes: tx.notes || "",
    }));
    const ok = await saveFile(withDateStamp("pharmacy_transactions.csv"), toCsv(rows as any), "csv");
    if (ok) toast.success("Export OK");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher médic., patient, lot…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="in">Entrées</SelectItem>
            <SelectItem value="out">Sorties</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="w-4 h-4" />CSV</Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">Aucune transaction</p>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 200).map(tx => (
            <Card key={tx.id}>
              <CardContent className="p-3 text-sm">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={tx.type === "in" ? "default" : "secondary"}>
                        {tx.type === "in" ? "Entrée" : "Sortie"}
                      </Badge>
                      <span className="font-medium truncate">{drugName(tx.drugId)}</span>
                      <span className="text-muted-foreground">×{tx.quantity}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {fmtDateTime(tx.createdAt)}
                      {tx.performedBy && ` · ${tx.performedBy}`}
                    </p>
                    {(tx.stockBefore !== undefined && tx.stockAfter !== undefined) && (
                      <p className="text-xs">Stock: {tx.stockBefore} → <span className="font-medium">{tx.stockAfter}</span></p>
                    )}
                    {tx.patientId && <p className="text-xs">👤 {patientName(tx.patientId)}</p>}
                    {tx.batchNumber && <p className="text-xs">Lot: {tx.batchNumber}</p>}
                    {tx.reason && tx.type === "out" && (
                      <p className="text-xs">Motif: {DISPENSE_REASONS.find(r => r.value === tx.reason)?.label}</p>
                    )}
                    {tx.notes && <p className="text-xs italic mt-1">{tx.notes}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold">{(tx.price * tx.quantity).toFixed(0)} FCFA</p>
                    {tx.paymentStatus && (
                      <Badge variant="outline" className="text-[10px] mt-1">{tx.paymentStatus}</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== STATS ============================== */
function StatsTab({ drugs, transactions }: { drugs: Drug[]; transactions: DrugTransaction[] }) {
  const stats = useMemo(() => {
    const totalValue = drugs.reduce((s, d) => s + d.stock * d.buyPrice, 0);
    const today = new Date().toISOString().split("T")[0];
    const monthStart = new Date(); monthStart.setDate(1);
    const ms = monthStart.toISOString().split("T")[0];

    const outs = transactions.filter(t => t.type === "out");
    const ins = transactions.filter(t => t.type === "in");

    const revenueToday = outs.filter(t => t.createdAt >= today).reduce((s, t) => s + t.price * t.quantity, 0);
    const revenueMonth = outs.filter(t => t.createdAt >= ms).reduce((s, t) => s + t.price * t.quantity, 0);

    const totalReceived = ins.reduce((s, t) => s + t.quantity, 0);
    const totalDispensed = outs.reduce((s, t) => s + t.quantity, 0);

    const dispensedByDrug: Record<string, number> = {};
    outs.forEach(t => {
      const d = drugs.find(dr => dr.id === t.drugId);
      if (d) dispensedByDrug[d.name] = (dispensedByDrug[d.name] || 0) + t.quantity;
    });
    const top5 = Object.entries(dispensedByDrug).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const valueByCategory: Record<string, number> = {};
    drugs.forEach(d => {
      const cat = d.category || "Autre";
      valueByCategory[cat] = (valueByCategory[cat] || 0) + d.stock * d.buyPrice;
    });

    const expiring60 = drugs
      .map(d => ({ d, days: daysUntil(d.expiration) }))
      .filter(x => x.days !== null && x.days >= 0 && x.days <= 60)
      .sort((a, b) => (a.days! - b.days!));

    return { totalValue, revenueToday, revenueMonth, totalReceived, totalDispensed, top5, valueByCategory, expiring60 };
  }, [drugs, transactions]);

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Valeur stock totale</CardTitle></CardHeader>
        <CardContent><p className="text-2xl font-bold">{stats.totalValue.toFixed(0)} FCFA</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Revenus</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Aujourd'hui: <span className="font-bold">{stats.revenueToday.toFixed(0)} FCFA</span></p>
          <p>Ce mois: <span className="font-bold">{stats.revenueMonth.toFixed(0)} FCFA</span></p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Mouvements totaux</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Reçu: <span className="font-bold text-success">{stats.totalReceived}</span></p>
          <p>Dispensé: <span className="font-bold text-warning">{stats.totalDispensed}</span></p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Top 5 dispensés</CardTitle></CardHeader>
        <CardContent>
          {stats.top5.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : (
            <ul className="space-y-1 text-sm">{stats.top5.map(([n, q]) => (
              <li key={n} className="flex justify-between"><span className="truncate">{n}</span><Badge variant="secondary">{q}</Badge></li>
            ))}</ul>
          )}
        </CardContent>
      </Card>
      <Card className="sm:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Valeur par catégorie</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {Object.entries(stats.valueByCategory).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <li key={c} className="flex justify-between"><span>{c}</span><span className="font-medium">{v.toFixed(0)} FCFA</span></li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="sm:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Expirant ≤ 60 jours</CardTitle></CardHeader>
        <CardContent>
          {stats.expiring60.length === 0 ? <p className="text-xs text-muted-foreground">Aucun</p> : (
            <ul className="space-y-1 text-sm">{stats.expiring60.map(({ d, days }) => (
              <li key={d.id} className="flex justify-between">
                <span className="truncate">{d.name}</span>
                <span className={days! < 30 ? "text-destructive font-medium" : "text-warning"}>{days}j</span>
              </li>
            ))}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
