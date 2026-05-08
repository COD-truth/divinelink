import React, { useEffect, useState, useMemo } from "react";
import { db, type Drug, type DrugTransaction, type DrugStatus, type TransactionType, type PaymentStatus } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Download, TriangleAlert as AlertTriangle, Package, ArrowDown, ArrowUp, ChartBar as BarChart3, Bell } from "lucide-react";
import { toast } from "sonner";
import { saveFile, toCsv, withDateStamp } from "@/lib/download";
import { decryptPatients, type Patient } from "@/lib/patientCrypto";

const STATUS_ICONS: Record<DrugStatus, string> = {
  in_stock: "🟢", low: "🟡", out: "🔴", expiring_soon: "⚠️",
};

function computeStatus(drug: Drug): DrugStatus {
  if (drug.stock <= 0) return "out";
  if (drug.expiration) {
    const daysToExp = (new Date(drug.expiration).getTime() - Date.now()) / 86400_000;
    if (daysToExp < 30) return "expiring_soon";
  }
  if (drug.stock <= drug.minStock) return "low";
  return "in_stock";
}

export function PharmacyPage() {
  const { t } = useLang();
  const [tab, setTab] = useState("inventory");
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [transactions, setTransactions] = useState<DrugTransaction[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    const allDrugs = await db.drugs.toArray();
    // Recompute status
    for (const d of allDrugs) {
      const s = computeStatus(d);
      if (d.status !== s) { d.status = s; await db.drugs.update(d.id!, { status: s }); }
    }
    setDrugs(allDrugs);
    setTransactions(await db.drugTransactions.reverse().sortBy("createdAt"));
    setPatients(await decryptPatients(await db.patients.toArray()));
  };

  useEffect(() => { load(); }, []);

  const filtered = drugs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || d.category.toLowerCase().includes(search.toLowerCase()));

  /* Alerts */
  const alerts = useMemo(() => {
    const a: { type: string; message: string; drugId: number }[] = [];
    drugs.forEach(d => {
      if (d.status === "low") a.push({ type: "low", message: `${d.name}: ${d.stock} ${d.unit} (min: ${d.minStock})`, drugId: d.id! });
      if (d.status === "out") a.push({ type: "out", message: `${d.name}: épuisé`, drugId: d.id! });
      if (d.status === "expiring_soon" && d.expiration) a.push({ type: "expiring", message: `${d.name}: expire le ${new Date(d.expiration).toLocaleDateString()}`, drugId: d.id! });
    });
    return a;
  }, [drugs]);

  /* Stats */
  const stats = useMemo(() => {
    const totalValue = drugs.reduce((s, d) => s + d.stock * d.buyPrice, 0);
    const today = new Date().toISOString().split("T")[0];
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); const ws = weekStart.toISOString().split("T")[0];
    const monthStart = new Date(); monthStart.setDate(1); const ms = monthStart.toISOString().split("T")[0];

    const revenueToday = transactions.filter(t => t.type === "out" && t.createdAt >= today).reduce((s, t) => s + t.price * t.quantity, 0);
    const revenueWeek = transactions.filter(t => t.type === "out" && t.createdAt >= ws).reduce((s, t) => s + t.price * t.quantity, 0);
    const revenueMonth = transactions.filter(t => t.type === "out" && t.createdAt >= ms).reduce((s, t) => s + t.price * t.quantity, 0);

    const dispensed: Record<string, number> = {};
    transactions.filter(t => t.type === "out").forEach(t => {
      const d = drugs.find(dr => dr.id === t.drugId);
      if (d) dispensed[d.name] = (dispensed[d.name] || 0) + t.quantity;
    });
    const mostDispensed = Object.entries(dispensed).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const expiringThisMonth = drugs.filter(d => {
      if (!d.expiration) return false;
      const exp = new Date(d.expiration);
      const now = new Date();
      return exp.getMonth() === now.getMonth() && exp.getFullYear() === now.getFullYear();
    });

    return { totalValue, revenueToday, revenueWeek, revenueMonth, mostDispensed, expiringThisMonth };
  }, [drugs, transactions]);

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2"><Bell className="w-4 h-4 text-warning" /><span className="text-sm font-semibold">{t("pharm.alerts")} ({alerts.length})</span></div>
            <ul className="space-y-1">
              {alerts.slice(0, 5).map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className={`w-3 h-3 ${a.type === "out" ? "text-destructive" : "text-warning"}`} />
                  {a.message}
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
          <InventoryTab drugs={filtered} search={search} setSearch={setSearch} onRefresh={load} patients={patients} />
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
          <PharmacyStatsTab stats={stats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============ Inventory Tab ============ */
function InventoryTab({ drugs, search, setSearch, onRefresh, patients }: { drugs: Drug[]; search: string; setSearch: (s: string) => void; onRefresh: () => void; patients: Patient[] }) {
  const { t } = useLang();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", stock: "", unit: "comprimé", buyPrice: "", sellPrice: "", expiration: "", minStock: "5", supplier: "" });

  const save = async () => {
    if (!form.name.trim()) return;
    const now = new Date().toISOString();
    const cid = localStorage.getItem("divinelink.clinicId") || undefined;
    const drug: Omit<Drug, "id"> = {
      name: form.name.trim(),
      category: form.category.trim(),
      stock: parseInt(form.stock) || 0,
      unit: form.unit,
      buyPrice: parseFloat(form.buyPrice) || 0,
      sellPrice: parseFloat(form.sellPrice) || 0,
      expiration: form.expiration || undefined,
      minStock: parseInt(form.minStock) || 5,
      supplier: form.supplier || undefined,
      status: "in_stock",
      clinicId: cid,
      createdAt: now,
      updatedAt: now,
    };
    drug.status = computeStatus(drug as Drug);
    await db.drugs.add(drug as Drug);
    toast.success(t("common.save"));
    setAddOpen(false);
    setForm({ name: "", category: "", stock: "", unit: "comprimé", buyPrice: "", sellPrice: "", expiration: "", minStock: "5", supplier: "" });
    onRefresh();
  };

  return (
    <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("pharm.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2"><Plus className="w-4 h-4" />{t("pharm.addDrug")}</Button>
      </div>

      {drugs.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">{t("common.noData")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pharm.name")}</TableHead>
                <TableHead>{t("pharm.category")}</TableHead>
                <TableHead className="text-right">{t("pharm.stock")}</TableHead>
                <TableHead>{t("pharm.unit")}</TableHead>
                <TableHead className="text-right">{t("pharm.buyPrice")}</TableHead>
                <TableHead className="text-right">{t("pharm.sellPrice")}</TableHead>
                <TableHead>{t("pharm.expiration")}</TableHead>
                <TableHead>{t("pharm.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drugs.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.category}</TableCell>
                  <TableCell className="text-right">{d.stock}</TableCell>
                  <TableCell className="text-xs">{d.unit}</TableCell>
                  <TableCell className="text-right">{d.buyPrice}</TableCell>
                  <TableCell className="text-right">{d.sellPrice}</TableCell>
                  <TableCell className="text-xs">{d.expiration ? new Date(d.expiration).toLocaleDateString() : "—"}</TableCell>
                  <TableCell><Badge variant="outline">{STATUS_ICONS[d.status]} {t(`pharm.${d.status}`)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("pharm.addDrug")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("pharm.name")} *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>{t("pharm.category")}</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("pharm.stock")}</Label><Input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} /></div>
              <div><Label>{t("pharm.unit")}</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("pharm.buyPrice")}</Label><Input type="number" value={form.buyPrice} onChange={e => setForm(f => ({ ...f, buyPrice: e.target.value }))} /></div>
              <div><Label>{t("pharm.sellPrice")}</Label><Input type="number" value={form.sellPrice} onChange={e => setForm(f => ({ ...f, sellPrice: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("pharm.expiration")}</Label><Input type="date" value={form.expiration} onChange={e => setForm(f => ({ ...f, expiration: e.target.value }))} /></div>
              <div><Label>{t("pharm.minStock")}</Label><Input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} /></div>
            </div>
            <div><Label>{t("pharm.supplier")}</Label><Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============ Receive Tab ============ */
function ReceiveTab({ drugs, onRefresh }: { drugs: Drug[]; onRefresh: () => void }) {
  const { t } = useLang();
  const [drugId, setDrugId] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [expiry, setExpiry] = useState("");

  const save = async () => {
    if (!drugId || !qty) return;
    const now = new Date().toISOString();
    const cid = localStorage.getItem("divinelink.clinicId") || undefined;
    const q = parseInt(qty);
    const p = parseFloat(price) || 0;
    const drug = drugs.find(d => d.id === parseInt(drugId));
    if (!drug) return;

    await db.drugTransactions.add({ drugId: drug.id!, type: "in", quantity: q, price: p, clinicId: cid, createdAt: now });
    await db.drugs.update(drug.id!, { stock: drug.stock + q, updatedAt: now, expiration: expiry || drug.expiration });
    toast.success(t("common.save"));
    setDrugId(""); setQty(""); setPrice(""); setExpiry("");
    onRefresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ArrowDown className="w-5 h-5 text-success" />{t("pharm.receive")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>{t("pharm.drug")} *</Label>
          <Select value={drugId} onValueChange={setDrugId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{drugs.map(d => <SelectItem key={d.id} value={d.id!.toString()}>{d.name} ({d.stock} {d.unit})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>{t("pharm.qty")} *</Label><Input type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div><Label>{t("pharm.price")}</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
          <div><Label>{t("pharm.expiration")}</Label><Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
        </div>
        <Button onClick={save} disabled={!drugId || !qty} className="w-full">{t("common.save")}</Button>
      </CardContent>
    </Card>
  );
}

/* ============ Dispense Tab ============ */
function DispenseTab({ drugs, patients, onRefresh }: { drugs: Drug[]; patients: Patient[]; onRefresh: () => void }) {
  const { t } = useLang();
  const [drugId, setDrugId] = useState("");
  const [qty, setQty] = useState("");
  const [patientId, setPatientId] = useState("");
  const [payStatus, setPayStatus] = useState<PaymentStatus>("unpaid");

  const selectedDrug = drugs.find(d => d.id === parseInt(drugId));

  const save = async () => {
    if (!drugId || !qty) return;
    const q = parseInt(qty);
    if (selectedDrug && q > selectedDrug.stock) { toast.error("Stock insuffisant"); return; }
    const now = new Date().toISOString();
    const cid = localStorage.getItem("divinelink.clinicId") || undefined;

    await db.drugTransactions.add({
      drugId: parseInt(drugId), type: "out", quantity: q,
      price: selectedDrug?.sellPrice || 0,
      patientId: patientId ? parseInt(patientId) : undefined,
      paymentStatus: payStatus,
      clinicId: cid, createdAt: now,
    });
    if (selectedDrug) {
      await db.drugs.update(selectedDrug.id!, { stock: selectedDrug.stock - q, updatedAt: now });
    }
    toast.success(t("common.save"));
    setDrugId(""); setQty(""); setPatientId(""); setPayStatus("unpaid");
    onRefresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ArrowUp className="w-5 h-5 text-warning" />{t("pharm.dispense")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>{t("pharm.drug")} *</Label>
          <Select value={drugId} onValueChange={setDrugId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{drugs.filter(d => d.stock > 0).map(d => <SelectItem key={d.id} value={d.id!.toString()}>{d.name} ({d.stock} {d.unit})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("pharm.qty")} *</Label><Input type="number" value={qty} onChange={e => setQty(e.target.value)} max={selectedDrug?.stock} /></div>
          <div><Label>{t("pharm.patient")}</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                {patients.map(p => <SelectItem key={p.id} value={p.id!.toString()}>{p.firstName} {p.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>{t("pharm.paymentStatus")}</Label>
          <Select value={payStatus} onValueChange={v => setPayStatus(v as PaymentStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">{t("pay.status.paid")}</SelectItem>
              <SelectItem value="partial">{t("pay.status.partial")}</SelectItem>
              <SelectItem value="unpaid">{t("pay.status.unpaid")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedDrug && <p className="text-sm text-muted-foreground">{t("pharm.amount")}: {((selectedDrug.sellPrice || 0) * (parseInt(qty) || 0)).toFixed(0)} FCFA</p>}
        <Button onClick={save} disabled={!drugId || !qty} className="w-full">{t("common.save")}</Button>
      </CardContent>
    </Card>
  );
}

/* ============ Transactions Tab ============ */
function TransactionsTab({ transactions, drugs, patients }: { transactions: DrugTransaction[]; drugs: Drug[]; patients: Patient[] }) {
  const { t } = useLang();
  const [filterDrug, setFilterDrug] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const filtered = transactions.filter(tx => {
    if (filterDrug && tx.drugId !== parseInt(filterDrug)) return false;
    if (filterType !== "all" && tx.type !== filterType) return false;
    return true;
  });

  const drugName = (id: number) => drugs.find(d => d.id === id)?.name || "—";
  const patientName = (id?: number) => id ? patients.find(p => p.id === id) ? `${patients.find(p => p.id === id)!.firstName} ${patients.find(p => p.id === id)!.lastName}` : "—" : "—";

  let runningBalance = 0;
  const withBalance = filtered.map(tx => {
    if (tx.type === "in") runningBalance += tx.quantity;
    else runningBalance -= tx.quantity;
    return { ...tx, balance: runningBalance };
  });

  const exportCsv = async () => {
    const rows = withBalance.map(tx => ({
      date: tx.createdAt.slice(0, 10),
      drug: drugName(tx.drugId),
      type: tx.type,
      quantity: tx.quantity,
      patient: patientName(tx.patientId),
      amount: tx.price * tx.quantity,
      balance: tx.balance,
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const ok = await saveFile(withDateStamp("pharmacy_transactions.csv"), csv, "csv");
    if (ok) toast.success(t("download.done"));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Select value={filterDrug} onValueChange={setFilterDrug}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("pharm.filterDrug")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pharm.filterDrug")}</SelectItem>
            {drugs.map(d => <SelectItem key={d.id} value={d.id!.toString()}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pharm.filterType")}</SelectItem>
            <SelectItem value="in">{t("pharm.in")}</SelectItem>
            <SelectItem value="out">{t("pharm.txOut")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} className="gap-2 ml-auto"><Download className="w-4 h-4" />{t("pharm.exportCsv")}</Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("pharm.date")}</TableHead>
              <TableHead>{t("pharm.drug")}</TableHead>
              <TableHead>{t("pharm.type")}</TableHead>
              <TableHead className="text-right">{t("pharm.qty")}</TableHead>
              <TableHead>{t("pharm.patient")}</TableHead>
              <TableHead className="text-right">{t("pharm.amount")}</TableHead>
              <TableHead className="text-right">{t("pharm.balance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withBalance.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{t("common.noData")}</TableCell></TableRow>
            ) : withBalance.slice(0, 50).map(tx => (
              <TableRow key={tx.id}>
                <TableCell className="text-xs">{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>{drugName(tx.drugId)}</TableCell>
                <TableCell><Badge variant={tx.type === "in" ? "default" : "secondary"}>{tx.type === "in" ? t("pharm.in") : t("pharm.out")}</Badge></TableCell>
                <TableCell className="text-right">{tx.quantity}</TableCell>
                <TableCell className="text-xs">{patientName(tx.patientId)}</TableCell>
                <TableCell className="text-right">{(tx.price * tx.quantity).toFixed(0)} FCFA</TableCell>
                <TableCell className="text-right font-mono">{tx.balance}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ============ Stats Tab ============ */
function PharmacyStatsTab({ stats }: { stats: { totalValue: number; revenueToday: number; revenueWeek: number; revenueMonth: number; mostDispensed: [string, number][]; expiringThisMonth: Drug[] } }) {
  const { t } = useLang();

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pharm.totalValue")}</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{stats.totalValue.toFixed(0)} FCFA</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pharm.revenue")}</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <p className="text-sm">{t("pharm.today")}: <span className="font-bold">{stats.revenueToday.toFixed(0)} FCFA</span></p>
          <p className="text-sm">{t("pharm.thisWeek")}: <span className="font-bold">{stats.revenueWeek.toFixed(0)} FCFA</span></p>
          <p className="text-sm">{t("pharm.thisMonth")}: <span className="font-bold">{stats.revenueMonth.toFixed(0)} FCFA</span></p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pharm.mostDispensed")}</CardTitle></CardHeader>
        <CardContent>
          {stats.mostDispensed.length === 0 ? <p className="text-sm text-muted-foreground">{t("common.noData")}</p> : (
            <ul className="space-y-1">{stats.mostDispensed.map(([name, count]) => (
              <li key={name} className="flex justify-between text-sm"><span>{name}</span><Badge variant="secondary">{count}</Badge></li>
            ))}</ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pharm.expiringThisMonth")}</CardTitle></CardHeader>
        <CardContent>
          {stats.expiringThisMonth.length === 0 ? <p className="text-sm text-muted-foreground">{t("common.noData")}</p> : (
            <ul className="space-y-1">{stats.expiringThisMonth.map(d => (
              <li key={d.id} className="flex justify-between text-sm"><span>{d.name}</span><span className="text-warning">{d.expiration ? new Date(d.expiration).toLocaleDateString() : ""}</span></li>
            ))}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
