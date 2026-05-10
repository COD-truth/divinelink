import React, { useEffect, useState, useMemo, useRef } from "react";
import { db, type Drug, type DrugTransaction, type DrugCategory } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pill, Plus, ArrowDownCircle, ArrowUpCircle, AlertTriangle, Search, BarChart3, History, Trash2, Edit, TrendingUp, Package, Filter } from "lucide-react";
import { saveFile, toCsv, withDateStamp } from "@/lib/download";
import { decryptPatients } from "@/lib/patientCrypto";

const CATEGORIES: DrugCategory[] = [
  "Antibiotique","Antalgique","Antipaludéen","Antiparasitaire",
  "Antihypertenseur","Antidiabétique","Vitamines","Anti-inflammatoire",
  "Antiseptique","Anesthésique","Antifongique","Antiémétique",
  "Corticoïde","Antiacide","Autre"
];
const UNITS = ["comprimés","flacons","ampoules","sachets","gélules","ml","mg","seringues","patches","autre"];

function fmtDT(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}
function daysToExpiry(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
function computeStatus(drug: Drug) {
  if (drug.stock <= 0) return { label:"Épuisé 🔴", cls:"bg-red-100 text-red-700 border-red-300", key:"out" };
  if (drug.expiration && daysToExpiry(drug.expiration) <= 30)
    return { label:"Expire bientôt ⚠️", cls:"bg-orange-100 text-orange-700 border-orange-300", key:"expiring" };
  if (drug.stock <= drug.minStock)
    return { label:"Stock faible 🟡", cls:"bg-yellow-100 text-yellow-700 border-yellow-300", key:"low" };
  return { label:"En stock 🟢", cls:"bg-green-100 text-green-700 border-green-300", key:"ok" };
}

const emptyDrug = (): Partial<Drug> => ({
  name:"", category:"Antibiotique", stock:0, initialStock:0, unit:"comprimés",
  buyPrice:0, sellPrice:0, expiration:"", minStock:5,
  supplier:"", batchNumber:"", location:"", notes:"",
  status:"in_stock"
});

export function PharmacyPage() {
  const { user } = useAuth();
  const clinicId = localStorage.getItem("divinelink.clinicId") || "";
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [transactions, setTransactions] = useState<DrugTransaction[]>([]);
  const [patients, setPatients] = useState<{id:number;name:string;anonCode:string}[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [txSearch, setTxSearch] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState("all");
  const [tab, setTab] = useState("inventory");
  const [addOpen, setAddOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [dispenseOpen, setDispenseOpen] = useState(false);
  const [editDrug, setEditDrug] = useState<Drug|null>(null);
  const [deleteDrug, setDeleteDrug] = useState<Drug|null>(null);
  const [drugForm, setDrugForm] = useState<Partial<Drug>>(emptyDrug());
  const [receiveForm, setReceiveForm] = useState({ drugId:"", qty:0, buyPrice:0, expiration:"", supplier:"", batchNumber:"", notes:"" });
  const [dispenseForm, setDispenseForm] = useState({ drugId:"", qty:0, patientId:"", price:0, paid:false, paymentMode:"espèces", reason:"dispensed", notes:"" });

  const load = async () => {
    const allDrugs = await db.drugs.toArray();
    // Auto-update status
    for (const d of allDrugs) {
      const s = computeStatus(d).key as any;
      const mapped = s === "ok" ? "in_stock" : s === "expiring" ? "expiring_soon" : s;
      if (d.status !== mapped) await db.drugs.update(d.id!, { status: mapped });
    }
    setDrugs(allDrugs);
    const txs = await db.drugTransactions.toArray();
    setTransactions(txs.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    const pats = await decryptPatients(await db.patients.toArray());
    setPatients(pats.map(p => ({ id:p.id!, name:`${p.firstName} ${p.lastName}`, anonCode:p.anonCode||"" })));
  };

  useEffect(() => { load(); }, []);

  // Filtered + sorted drugs
  const filtered = useMemo(() => {
    let list = [...drugs];
    if (search) list = list.filter(d =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.category.toLowerCase().includes(search.toLowerCase()) ||
      (d.supplier||"").toLowerCase().includes(search.toLowerCase())
    );
    if (categoryFilter !== "all") list = list.filter(d => d.category === categoryFilter);
    if (statusFilter !== "all") list = list.filter(d => computeStatus(d).key === statusFilter ||
      (statusFilter === "expiring" && computeStatus(d).key === "expiring"));
    list.sort((a,b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "stock") return a.stock - b.stock;
      if (sortBy === "expiration") return (a.expiration||"9999").localeCompare(b.expiration||"9999");
      if (sortBy === "category") return a.category.localeCompare(b.category);
      return 0;
    });
    return list;
  }, [drugs, search, categoryFilter, statusFilter, sortBy]);

  const filteredTx = useMemo(() => {
    let list = [...transactions];
    if (txSearch) list = list.filter(tx =>
      (tx.drugName||"").toLowerCase().includes(txSearch.toLowerCase()) ||
      (tx.patientCode||"").toLowerCase().includes(txSearch.toLowerCase()) ||
      (tx.supplier||"").toLowerCase().includes(txSearch.toLowerCase())
    );
    if (txTypeFilter !== "all") list = list.filter(tx => tx.type === txTypeFilter);
    return list;
  }, [transactions, txSearch, txTypeFilter]);

  const alerts = drugs.filter(d => computeStatus(d).key !== "ok");

  // Stats
  const stats = useMemo(() => {
    const totalValue = drugs.reduce((s,d) => s + d.stock * d.buyPrice, 0);
    const today = new Date().toISOString().split("T")[0];
    const monthStart = new Date(); monthStart.setDate(1);
    const ms = monthStart.toISOString().split("T")[0];
    const revenueToday = transactions.filter(t => t.type==="out" && t.createdAt.startsWith(today))
      .reduce((s,t) => s + (t.totalAmount||0), 0);
    const revenueMonth = transactions.filter(t => t.type==="out" && t.createdAt >= ms)
      .reduce((s,t) => s + (t.totalAmount||0), 0);
    const totalOut = transactions.filter(t => t.type==="out").reduce((s,t) => s + t.quantity, 0);
    const totalIn = transactions.filter(t => t.type==="in").reduce((s,t) => s + t.quantity, 0);
    const topDrugs: Record<string,number> = {};
    transactions.filter(t => t.type==="out").forEach(t => {
      topDrugs[t.drugName] = (topDrugs[t.drugName]||0) + t.quantity;
    });
    const topList = Object.entries(topDrugs).sort((a,b) => b[1]-a[1]).slice(0,5);
    const byCategory: Record<string,number> = {};
    drugs.forEach(d => { byCategory[d.category] = (byCategory[d.category]||0) + d.stock * d.buyPrice; });
    return { totalValue, revenueToday, revenueMonth, totalOut, totalIn, topList, byCategory };
  }, [drugs, transactions]);

  const saveDrug = async () => {
    if (!drugForm.name) { toast.error("Nom requis"); return; }
    const now = new Date().toISOString();
    if (editDrug?.id) {
      await db.drugs.update(editDrug.id, { ...drugForm, updatedAt:now });
      toast.success("Médicament mis à jour ✅");
    } else {
      const stock = drugForm.stock || 0;
      await db.drugs.add({ ...drugForm, initialStock:stock, stock, status:"in_stock", clinicId, createdAt:now, updatedAt:now } as Drug);
      toast.success("Médicament ajouté ✅");
    }
    setAddOpen(false); setEditDrug(null); setDrugForm(emptyDrug()); load();
  };

  const receiveStock = async () => {
    const drug = drugs.find(d => d.id === Number(receiveForm.drugId));
    if (!drug || receiveForm.qty <= 0) { toast.error("Sélectionnez un médicament et une quantité"); return; }
    const now = new Date().toISOString();
    const stockBefore = drug.stock;
    const stockAfter = drug.stock + receiveForm.qty;
    await db.drugs.update(drug.id!, {
      stock: stockAfter,
      buyPrice: receiveForm.buyPrice || drug.buyPrice,
      expiration: receiveForm.expiration || drug.expiration,
      supplier: receiveForm.supplier || drug.supplier,
      updatedAt: now
    });
    await db.drugTransactions.add({
      drugId: drug.id!, drugName: drug.name, drugCategory: drug.category, drugUnit: drug.unit,
      type: "in", quantity: receiveForm.qty, stockBefore, stockAfter,
      price: receiveForm.buyPrice || drug.buyPrice,
      totalAmount: receiveForm.qty * (receiveForm.buyPrice || drug.buyPrice),
      supplier: receiveForm.supplier, batchNumber: receiveForm.batchNumber,
      notes: receiveForm.notes, performedBy: user?.name || "Admin",
      clinicId, createdAt: now
    } as DrugTransaction);
    toast.success(`✅ +${receiveForm.qty} ${drug.unit} — Stock: ${stockAfter}`);
    setReceiveOpen(false);
    setReceiveForm({ drugId:"", qty:0, buyPrice:0, expiration:"", supplier:"", batchNumber:"", notes:"" });
    load();
  };

  const dispenseDrug = async () => {
    const drug = drugs.find(d => d.id === Number(dispenseForm.drugId));
    if (!drug || dispenseForm.qty <= 0) { toast.error("Sélectionnez un médicament et une quantité"); return; }
    if (dispenseForm.qty > drug.stock) { toast.error(`Stock insuffisant — ${drug.stock} ${drug.unit} disponibles`); return; }
    const now = new Date().toISOString();
    const stockBefore = drug.stock;
    const stockAfter = drug.stock - dispenseForm.qty;
    const patient = patients.find(p => p.id === Number(dispenseForm.patientId));
    const price = dispenseForm.price || drug.sellPrice;
    await db.drugs.update(drug.id!, { stock: stockAfter, updatedAt: now });
    await db.drugTransactions.add({
      drugId: drug.id!, drugName: drug.name, drugCategory: drug.category, drugUnit: drug.unit,
      type: "out", quantity: dispenseForm.qty, stockBefore, stockAfter,
      price, totalAmount: dispenseForm.qty * price,
      patientId: patient?.id, patientCode: patient?.anonCode,
      paymentStatus: dispenseForm.paid ? "paid" : "unpaid",
      paymentMode: dispenseForm.paymentMode,
      reason: dispenseForm.reason, notes: dispenseForm.notes,
      performedBy: user?.name || "Admin",
      clinicId, createdAt: now
    } as DrugTransaction);
    toast.success(`✅ -${dispenseForm.qty} ${drug.unit} dispensés — Stock restant: ${stockAfter}`);
    if (stockAfter <= drug.minStock) toast.warning(`⚠️ ${drug.name}: stock faible!`);
    setDispenseOpen(false);
    setDispenseForm({ drugId:"", qty:0, patientId:"", price:0, paid:false, paymentMode:"espèces", reason:"dispensed", notes:"" });
    load();
  };

  const exportStock = () => {
    const rows = filtered.map(d => ({
      Nom: d.name, Catégorie: d.category, "Stock actuel": d.stock,
      "Stock initial": d.initialStock, "Sorti (calculé)": (d.initialStock||0) - d.stock,
      Unité: d.unit, "Prix achat": d.buyPrice, "Prix vente": d.sellPrice,
      Expiration: fmtDate(d.expiration||""), Statut: computeStatus(d).label,
      Fournisseur: d.supplier||"", Localisation: d.location||"",
      Lot: d.batchNumber||"", "Ajouté le": fmtDT(d.createdAt)
    }));
    saveFile(toCsv(rows), withDateStamp("stock-pharmacie")+".csv", "text/csv");
  };

  const exportTx = () => {
    const rows = filteredTx.map(tx => ({
      "Date/Heure": fmtDT(tx.createdAt), Médicament: tx.drugName,
      Catégorie: tx.drugCategory||"", Type: tx.type==="in"?"Entrée":"Sortie",
      Quantité: tx.quantity, Unité: tx.drugUnit||"",
      "Stock avant": tx.stockBefore||"", "Stock après": tx.stockAfter||"",
      "Prix unitaire": tx.price, "Total FCFA": tx.totalAmount||"",
      Patient: tx.patientCode||"—", Fournisseur: tx.supplier||"—",
      Lot: tx.batchNumber||"—", Paiement: tx.paymentStatus||"—",
      "Effectué par": tx.performedBy||"—", Notes: tx.notes||""
    }));
    saveFile(toCsv(rows), withDateStamp("transactions-pharmacie")+".csv", "text/csv");
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Pill className="w-6 h-6 text-primary"/>
          <h1 className="text-2xl font-bold">Pharmacie</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setReceiveOpen(true)}>
            <ArrowDownCircle className="w-4 h-4 mr-1 text-green-600"/>Réception
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDispenseOpen(true)}>
            <ArrowUpCircle className="w-4 h-4 mr-1 text-blue-600"/>Dispenser
          </Button>
          <Button size="sm" onClick={() => { setEditDrug(null); setDrugForm(emptyDrug()); setAddOpen(true); }}>
            <Plus className="w-4 h-4 mr-1"/>Nouveau
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/30">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-600"/>
              <span className="font-bold text-orange-700 dark:text-orange-400">{alerts.length} alerte(s)</span>
            </div>
            <div className="space-y-1">
              {alerts.map(d => {
                const st = computeStatus(d);
                const days = d.expiration ? daysToExpiry(d.expiration) : null;
                return (
                  <div key={d.id} className="text-sm flex justify-between items-center">
                    <span className="font-medium">{d.name}</span>
                    <div className="flex gap-2 items-center">
                      <span className="text-muted-foreground">{d.stock} {d.unit}</span>
                      {days !== null && days <= 30 && <span className="text-orange-600 text-xs">expire dans {days}j</span>}
                      <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="inventory"><Package className="w-3 h-3 mr-1"/>Stock ({drugs.length})</TabsTrigger>
          <TabsTrigger value="transactions"><History className="w-3 h-3 mr-1"/>Mouvements</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="w-3 h-3 mr-1"/>Stats</TabsTrigger>
        </TabsList>

        {/* INVENTORY */}
        <TabsContent value="inventory" className="space-y-3 mt-3">
          {/* Search + Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
              <Input className="pl-9" placeholder="Rechercher par nom, catégorie, fournisseur..." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-auto min-w-[140px] text-xs h-8">
                  <SelectValue placeholder="Toutes catégories"/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-auto min-w-[120px] text-xs h-8">
                  <SelectValue placeholder="Tous statuts"/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="ok">En stock 🟢</SelectItem>
                  <SelectItem value="low">Stock faible 🟡</SelectItem>
                  <SelectItem value="out">Épuisé 🔴</SelectItem>
                  <SelectItem value="expiring">Expire bientôt ⚠️</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-auto min-w-[120px] text-xs h-8">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Trier: A-Z</SelectItem>
                  <SelectItem value="stock">Trier: Stock ↑</SelectItem>
                  <SelectItem value="expiration">Trier: Expiration</SelectItem>
                  <SelectItem value="category">Trier: Catégorie</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportStock}>
                Export CSV
              </Button>
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Pill className="w-12 h-12 mx-auto mb-3 opacity-20"/>
              <p className="text-lg font-medium">Aucun médicament</p>
              <p className="text-sm">Cliquez sur "Nouveau" pour commencer</p>
            </div>
          )}

          <div className="space-y-2">
            {filtered.map(drug => {
              const st = computeStatus(drug);
              const totalOut = transactions.filter(t => t.drugId === drug.id && t.type === "out").reduce((s,t) => s + t.quantity, 0);
              return (
                <Card key={drug.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-base">{drug.name}</span>
                          <Badge variant="secondary" className="text-xs">{drug.category}</Badge>
                          <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
                        </div>
                        {/* Stock tracker: initial → out → remaining */}
                        <div className="flex gap-3 text-sm flex-wrap mb-1">
                          <span className="text-muted-foreground">Initial: <span className="font-semibold text-foreground">{drug.initialStock||0}</span></span>
                          <span className="text-red-500">Sorti: <span className="font-semibold">{totalOut}</span></span>
                          <span className={drug.stock <= drug.minStock ? "text-orange-600 font-bold text-base" : "text-green-600 font-bold text-base"}>
                            Restant: {drug.stock} {drug.unit}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                          <span>Achat: {drug.buyPrice.toLocaleString()} FCFA</span>
                          <span>Vente: {drug.sellPrice.toLocaleString()} FCFA</span>
                          {drug.expiration && <span className={daysToExpiry(drug.expiration) <= 30 ? "text-orange-500 font-medium" : ""}>
                            Exp: {fmtDate(drug.expiration)}
                            {daysToExpiry(drug.expiration) <= 30 && ` (${daysToExpiry(drug.expiration)}j)`}
                          </span>}
                          {drug.supplier && <span>Fourn: {drug.supplier}</span>}
                          {drug.location && <span>📍 {drug.location}</span>}
                          {drug.batchNumber && <span>Lot: {drug.batchNumber}</span>}
                          <span className="text-muted-foreground">Ajouté: {fmtDT(drug.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                          setEditDrug(drug); setDrugForm({...drug}); setAddOpen(true);
                        }}><Edit className="w-3 h-3"/></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteDrug(drug)}>
                          <Trash2 className="w-3 h-3"/>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TRANSACTIONS */}
        <TabsContent value="transactions" className="space-y-3 mt-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
              <Input className="pl-9 h-8 text-sm" placeholder="Rechercher..." value={txSearch} onChange={e => setTxSearch(e.target.value)}/>
            </div>
            <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
              <SelectTrigger className="w-auto min-w-[110px] text-xs h-8"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="in">Entrées</SelectItem>
                <SelectItem value="out">Sorties</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportTx}>Export CSV</Button>
          </div>

          <div className="space-y-2">
            {filteredTx.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">Aucune transaction</div>
            )}
            {filteredTx.slice(0, 100).map(tx => (
              <Card key={tx.id} className="border-l-4" style={{ borderLeftColor: tx.type==="in" ? "#22c55e" : "#3b82f6" }}>
                <CardContent className="pt-2 pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tx.type==="in"
                          ? <ArrowDownCircle className="w-4 h-4 text-green-600 shrink-0"/>
                          : <ArrowUpCircle className="w-4 h-4 text-blue-600 shrink-0"/>}
                        <span className="font-semibold text-sm">{tx.drugName}</span>
                        <Badge variant="outline" className={`text-xs ${tx.type==="in"?"text-green-700 border-green-300":"text-blue-700 border-blue-300"}`}>
                          {tx.type==="in" ? "Entrée" : "Sortie"}
                        </Badge>
                        {tx.drugCategory && <Badge variant="secondary" className="text-xs">{tx.drugCategory}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                        <span>Qté: <span className="font-bold text-foreground">{tx.quantity} {tx.drugUnit}</span></span>
                        <span>Avant: {tx.stockBefore} → Après: <span className="font-medium">{tx.stockAfter}</span></span>
                        {tx.totalAmount > 0 && <span className="text-green-600 font-medium">{tx.totalAmount.toLocaleString()} FCFA</span>}
                        {tx.patientCode && <span>Patient: {tx.patientCode}</span>}
                        {tx.supplier && <span>Fourn: {tx.supplier}</span>}
                        {tx.batchNumber && <span>Lot: {tx.batchNumber}</span>}
                        {tx.performedBy && <span>Par: {tx.performedBy}</span>}
                        {tx.notes && <span className="italic">{tx.notes}</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      {fmtDT(tx.createdAt)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* STATS */}
        <TabsContent value="stats" className="space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <Card><CardContent className="pt-4 pb-4 text-center">
              <div className="text-3xl font-bold text-primary">{stats.totalValue.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">FCFA valeur stock</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center">
              <div className="text-3xl font-bold text-green-600">{stats.revenueToday.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">FCFA aujourd'hui</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.revenueMonth.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">FCFA ce mois</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center">
              <div className="text-3xl font-bold text-orange-600">{alerts.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Alertes actives</div>
            </CardContent></Card>
          </div>

          {/* In vs Out summary */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Mouvements globaux</CardTitle></CardHeader>
            <CardContent>
              <div className="flex justify-around">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.totalIn}</div>
                  <div className="text-xs text-muted-foreground">Unités reçues</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.totalOut}</div>
                  <div className="text-xs text-muted-foreground">Unités dispensées</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{drugs.reduce((s,d) => s+d.stock, 0)}</div>
                  <div className="text-xs text-muted-foreground">Stock actuel total</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top drugs */}
          {stats.topList.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4"/>Top médicaments dispensés</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.topList.map(([name, count], i) => (
                    <div key={name} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs w-4">{i+1}.</span>
                        <span className="text-sm">{name}</span>
                      </div>
                      <Badge>{count} unités</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* By category */}
          {Object.keys(stats.byCategory).length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Valeur par catégorie</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(stats.byCategory).sort((a,b) => b[1]-a[1]).map(([cat, val]) => (
                    <div key={cat} className="flex justify-between text-sm">
                      <span>{cat}</span>
                      <span className="font-medium">{val.toLocaleString()} FCFA</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expiring soon */}
          {drugs.filter(d => d.expiration && daysToExpiry(d.expiration) <= 60 && daysToExpiry(d.expiration) > 0).length > 0 && (
            <Card className="border-orange-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-orange-600">⚠️ Expirent dans 60 jours</CardTitle></CardHeader>
              <CardContent>
                {drugs.filter(d => d.expiration && daysToExpiry(d.expiration) <= 60 && daysToExpiry(d.expiration) > 0)
                  .sort((a,b) => (a.expiration||"").localeCompare(b.expiration||""))
                  .map(d => (
                  <div key={d.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                    <span>{d.name}</span>
                    <span className="text-orange-600">{fmtDate(d.expiration||"")} — {d.stock} {d.unit} — <span className="font-bold">{daysToExpiry(d.expiration||"")}j</span></span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ADD/EDIT DRUG */}
      <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); if(!o) setEditDrug(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editDrug ? "Modifier médicament" : "Nouveau médicament"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom du médicament *</Label><Input value={drugForm.name||""} onChange={e => setDrugForm(f=>({...f,name:e.target.value}))} placeholder="ex: Amoxicilline 500mg"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Catégorie</Label>
                <Select value={drugForm.category as string} onValueChange={v => setDrugForm(f=>({...f,category:v as DrugCategory}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Unité</Label>
                <Select value={drugForm.unit} onValueChange={v => setDrugForm(f=>({...f,unit:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Quantité initiale</Label><Input type="number" min={0} value={drugForm.stock||0} onChange={e => setDrugForm(f=>({...f,stock:+e.target.value}))}/></div>
              <div><Label>Stock minimum alerte</Label><Input type="number" min={0} value={drugForm.minStock||5} onChange={e => setDrugForm(f=>({...f,minStock:+e.target.value}))}/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Prix achat (FCFA)</Label><Input type="number" min={0} value={drugForm.buyPrice||0} onChange={e => setDrugForm(f=>({...f,buyPrice:+e.target.value}))}/></div>
              <div><Label>Prix vente (FCFA)</Label><Input type="number" min={0} value={drugForm.sellPrice||0} onChange={e => setDrugForm(f=>({...f,sellPrice:+e.target.value}))}/></div>
            </div>
            <div><Label>Date expiration</Label><Input type="date" value={drugForm.expiration||""} onChange={e => setDrugForm(f=>({...f,expiration:e.target.value}))}/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Fournisseur</Label><Input value={drugForm.supplier||""} onChange={e => setDrugForm(f=>({...f,supplier:e.target.value}))}/></div>
              <div><Label>N° de lot</Label><Input value={drugForm.batchNumber||""} onChange={e => setDrugForm(f=>({...f,batchNumber:e.target.value}))}/></div>
            </div>
            <div><Label>Localisation (rayon/étagère)</Label><Input value={drugForm.location||""} onChange={e => setDrugForm(f=>({...f,location:e.target.value}))} placeholder="ex: Rayon A, Étagère 2"/></div>
            <div><Label>Notes</Label><Textarea value={drugForm.notes||""} onChange={e => setDrugForm(f=>({...f,notes:e.target.value}))} rows={2}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button onClick={saveDrug}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECEIVE */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle><ArrowDownCircle className="inline w-4 h-4 mr-1 text-green-600"/>Réception de stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Médicament *</Label>
              <Select value={receiveForm.drugId} onValueChange={v => setReceiveForm(f=>({...f,drugId:v}))}>
                <SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger>
                <SelectContent>{drugs.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name} (stock: {d.stock} {d.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantité reçue *</Label><Input type="number" min={1} value={receiveForm.qty||""} onChange={e => setReceiveForm(f=>({...f,qty:+e.target.value}))}/></div>
            <div><Label>Prix achat unitaire (FCFA)</Label><Input type="number" min={0} value={receiveForm.buyPrice||""} onChange={e => setReceiveForm(f=>({...f,buyPrice:+e.target.value}))}/></div>
            <div><Label>Nouvelle date expiration</Label><Input type="date" value={receiveForm.expiration} onChange={e => setReceiveForm(f=>({...f,expiration:e.target.value}))}/></div>
            <div><Label>Fournisseur</Label><Input value={receiveForm.supplier} onChange={e => setReceiveForm(f=>({...f,supplier:e.target.value}))}/></div>
            <div><Label>Numéro de lot</Label><Input value={receiveForm.batchNumber} onChange={e => setReceiveForm(f=>({...f,batchNumber:e.target.value}))}/></div>
            <div><Label>Notes</Label><Input value={receiveForm.notes} onChange={e => setReceiveForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>Annuler</Button>
            <Button onClick={receiveStock} className="bg-green-600 hover:bg-green-700">Confirmer réception</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DISPENSE */}
      <Dialog open={dispenseOpen} onOpenChange={setDispenseOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle><ArrowUpCircle className="inline w-4 h-4 mr-1 text-blue-600"/>Dispensation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Médicament *</Label>
              <Select value={dispenseForm.drugId} onValueChange={v => {
                const d = drugs.find(x => x.id === Number(v));
                setDispenseForm(f=>({...f,drugId:v,price:d?.sellPrice||0}));
              }}>
                <SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger>
                <SelectContent>
                  {drugs.filter(d => d.stock > 0).map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name} ({d.stock} {d.unit} disponibles)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantité *</Label><Input type="number" min={1} value={dispenseForm.qty||""} onChange={e => setDispenseForm(f=>({...f,qty:+e.target.value}))}/></div>
            <div><Label>Patient (optionnel)</Label>
              <Select value={dispenseForm.patientId} onValueChange={v => setDispenseForm(f=>({...f,patientId:v}))}>
                <SelectTrigger><SelectValue placeholder="Aucun patient lié"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun</SelectItem>
                  {patients.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Prix unitaire (FCFA)</Label><Input type="number" min={0} value={dispenseForm.price||""} onChange={e => setDispenseForm(f=>({...f,price:+e.target.value}))}/></div>
            {dispenseForm.qty > 0 && dispenseForm.price > 0 && (
              <div className="bg-muted rounded p-2 text-sm font-bold">
                Total: {(dispenseForm.qty * dispenseForm.price).toLocaleString()} FCFA
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="paid" checked={dispenseForm.paid} onChange={e => setDispenseForm(f=>({...f,paid:e.target.checked}))} className="w-4 h-4"/>
              <Label htmlFor="paid">Payé</Label>
            </div>
            {dispenseForm.paid && (
              <div><Label>Mode de paiement</Label>
                <Select value={dispenseForm.paymentMode} onValueChange={v => setDispenseForm(f=>({...f,paymentMode:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="espèces">Espèces</SelectItem>
                    <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                    <SelectItem value="orange">Orange Money</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Raison</Label>
              <Select value={dispenseForm.reason} onValueChange={v => setDispenseForm(f=>({...f,reason:v}))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dispensed">Dispensé patient</SelectItem>
                  <SelectItem value="expired">Périmé — retiré</SelectItem>
                  <SelectItem value="damaged">Endommagé</SelectItem>
                  <SelectItem value="transferred">Transféré</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={dispenseForm.notes} onChange={e => setDispenseForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispenseOpen(false)}>Annuler</Button>
            <Button onClick={dispenseDrug} className="bg-blue-600 hover:bg-blue-700">Confirmer sortie</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE */}
      <Dialog open={!!deleteDrug} onOpenChange={() => setDeleteDrug(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer {deleteDrug?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">L'historique des transactions sera conservé.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDrug(null)}>Annuler</Button>
            <Button variant="destructive" onClick={async () => {
              if (deleteDrug?.id) { await db.drugs.delete(deleteDrug.id); toast.success("Supprimé"); setDeleteDrug(null); load(); }
            }}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
