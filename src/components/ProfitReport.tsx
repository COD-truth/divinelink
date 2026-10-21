import { useEffect, useMemo, useState } from "react";
import { db, type Payment, type Drug } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { getClinicSettings } from "@/lib/clinicSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Printer, TrendingUp, Save } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

const MODULES = ["Pharmacie", "Laboratoire", "Consultation", "Autre"] as const;

const DICT = {
  fr: {
    title: "Bénéfices & Saisie", entry: "Saisie historique", report: "Rapport",
    date: "Date", module: "Module", label: "Libellé (optionnel)", revenue: "Recette", cost: "Coût (optionnel)",
    addLine: "Ajouter une ligne", save: "Enregistrer la journée", saved: (n: number) => `${n} entrée(s) enregistrée(s)`,
    nothing: "Ajoutez au moins une recette.", noStockNote: "La saisie historique n'affecte PAS le stock actuel — elle enregistre seulement l'argent pour les rapports.",
    day: "Jour", month: "Mois", print: "Imprimer le reçu", reportTitle: "RAPPORT DES BÉNÉFICES",
    totalRevenue: "Recette totale", totalProfit: "Bénéfice total", profit: "Bénéfice", noData: "Aucune donnée pour cette période.",
    period: "Période",
    item: "Désignation (médicament / test — optionnel)", qtyL: "Qté", puL: "Prix U.", lineTotal: "Total",
    fastHint: "Rapide : laissez la désignation vide et mettez le total du jour dans « Prix U. ». Détaillé : indiquez chaque médicament/test, la quantité et le prix.",
  },
  en: {
    title: "Profit & Back-fill", entry: "Historical entry", report: "Report",
    date: "Date", module: "Module", label: "Label (optional)", revenue: "Revenue", cost: "Cost (optional)",
    addLine: "Add a line", save: "Save the day", saved: (n: number) => `${n} entr(y/ies) saved`,
    nothing: "Add at least one revenue.", noStockNote: "Historical entry does NOT affect current stock — it only records money for the reports.",
    day: "Day", month: "Month", print: "Print receipt", reportTitle: "PROFIT REPORT",
    totalRevenue: "Total revenue", totalProfit: "Total profit", profit: "Profit", noData: "No data for this period.",
    period: "Period",
    item: "Item (drug / test — optional)", qtyL: "Qty", puL: "Unit price", lineTotal: "Total",
    fastHint: "Fast: leave the item blank and put the day's total in 'Unit price'. Detailed: list each drug/test, quantity and price.",
  },
};

type Row = { module: string; item: string; qty: string; price: string; cost: string };
const rowAmount = (r: Row) => (parseInt(r.qty) || 1) * (parseFloat(r.price) || 0);

export function ProfitReport() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };
  const cur = getClinicSettings()?.currency || "FCFA";
  const nf = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");

  const [mode, setMode] = useState<"entry" | "report">("entry");

  // ── Historical entry ──
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([{ module: "Pharmacie", item: "", qty: "", price: "", cost: "" }]);
  const [saving, setSaving] = useState(false);
  const addRow = () => setRows(r => [...r, { module: "Pharmacie", item: "", qty: "", price: "", cost: "" }]);
  const updRow = (i: number, patch: Partial<Row>) => setRows(r => r.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const rmRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));

  const saveDay = async () => {
    const clean = rows.filter(r => rowAmount(r) > 0);
    if (!clean.length) { toast.error(L.nothing); return; }
    setSaving(true);
    try {
      const iso = new Date(date + "T12:00:00").toISOString();
      const c = cid();
      for (const r of clean) {
        const qtyN = parseInt(r.qty) || 1;
        const priceN = parseFloat(r.price) || 0;
        const amount = qtyN * priceN;
        const cost = parseFloat(r.cost) || 0;
        const name = r.item.trim() || r.module;
        await db.payments.add({
          patientId: 0, patientName: name,
          items: [{ name, quantity: qtyN, unitPrice: priceN, category: r.module }],
          label: name,
          amountDue: amount, amountPaid: amount, balance: 0, status: "paid", method: "cash",
          paidAt: iso, backfill: true, costTotal: cost,
          installments: [{ id: (globalThis.crypto?.randomUUID?.() || String(Date.now())), amount, method: "cash", paidAt: iso, receivedBy: user?.name }],
          clinicId: c, createdAt: iso, updatedAt: iso,
        } as any);
      }
      await logAudit("invoice_create", user?.name || "—", { resource: "invoice", message: `Saisie historique ${date}: ${clean.length} ligne(s)` });
      toast.success(L.saved(clean.length));
      setRows([{ module: "Pharmacie", item: "", qty: "", price: "", cost: "" }]);
    } catch (e: any) { toast.error("Erreur: " + (e?.message || "échec")); }
    finally { setSaving(false); }
  };

  // ── Report ──
  const [rMode, setRMode] = useState<"day" | "month">("month");
  const [rDay, setRDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [rMonth, setRMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [payments, setPayments] = useState<Payment[]>([]);
  const [drugBuy, setDrugBuy] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    (async () => {
      setPayments((await db.payments.toArray()).filter(p => inClinic(p.clinicId)));
      const ds = (await db.drugs.toArray()).filter(d => inClinic(d.clinicId));
      setDrugBuy(new Map(ds.map((d: Drug) => [d.id!, d.buyPrice || 0])));
    })();
  }, [mode]);

  const periodKey = rMode === "day" ? rDay : rMonth;
  const inPeriod = (p: Payment) => {
    const ts = (p.paidAt || p.createdAt || "").slice(0, rMode === "day" ? 10 : 7);
    return ts === periodKey;
  };
  const moduleOf = (p: Payment): string => {
    const exact = p.items?.[0]?.category;
    if (exact && (MODULES as readonly string[]).includes(exact)) return exact;
    const cat = (exact || p.label || "").toLowerCase();
    if (cat.includes("pharm")) return "Pharmacie";
    if (cat.includes("lab")) return "Laboratoire";
    if (cat.includes("consult")) return "Consultation";
    return "Autre";
  };
  const costOf = (p: Payment): number => {
    if (p.backfill) return p.costTotal || 0;
    let c = 0;
    for (const it of p.items || []) if (it.drugId && drugBuy.has(it.drugId)) c += (drugBuy.get(it.drugId) || 0) * (it.quantity || 1);
    return c;
  };

  const report = useMemo(() => {
    const per = new Map<string, { revenue: number; cost: number }>();
    for (const m of MODULES) per.set(m, { revenue: 0, cost: 0 });
    let tRev = 0, tCost = 0;
    for (const p of payments) {
      if (!inPeriod(p)) continue;
      const m = moduleOf(p);
      const rev = p.amountPaid || 0;
      const cost = costOf(p);
      const slot = per.get(m) || { revenue: 0, cost: 0 };
      slot.revenue += rev; slot.cost += cost; per.set(m, slot);
      tRev += rev; tCost += cost;
    }
    const lines = MODULES.map(m => ({ module: m, ...(per.get(m) || { revenue: 0, cost: 0 }) }))
      .map(x => ({ ...x, profit: x.revenue - x.cost }))
      .filter(x => x.revenue > 0 || x.cost > 0);
    return { lines, tRev, tCost, tProfit: tRev - tCost };
  }, [payments, drugBuy, rMode, rDay, rMonth]);

  const periodLabel = rMode === "day"
    ? new Date(rDay + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR")
    : rMonth;

  const printReport = () => {
    import("jspdf").then(({ jsPDF }) => {
      const clinic = getClinicSettings();
      const W = 80;
      const H = 72 + report.lines.length * 16;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [W, H] });
      const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      const money = (n: number) => fmt(n) + " " + cur;
      let y = 8;
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text((clinic?.name || "CENTRE MÉDICAL").toUpperCase(), W / 2, y, { align: "center" }); y += 5;
      doc.setFontSize(9); doc.text(L.reportTitle, W / 2, y, { align: "center" }); y += 4.5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(80);
      doc.text(L.period + ": " + periodLabel, W / 2, y, { align: "center" }); y += 4; doc.setTextColor(0);
      doc.setLineWidth(0.2); doc.line(4, y, W - 4, y); y += 5;
      report.lines.forEach(r => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text(r.module, 4, y); y += 4;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.text(L.revenue, 6, y); doc.text(money(r.revenue), W - 4, y, { align: "right" }); y += 3.6;
        if (r.cost > 0) { doc.text(L.cost.replace(" (optionnel)", "").replace(" (optional)", ""), 6, y); doc.text(money(r.cost), W - 4, y, { align: "right" }); y += 3.6; }
        doc.setFont("helvetica", "bold"); doc.text(L.profit, 6, y); doc.text(money(r.profit), W - 4, y, { align: "right" }); y += 5;
        doc.setFont("helvetica", "normal");
      });
      doc.setLineWidth(0.2); doc.line(4, y, W - 4, y); y += 5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(L.totalRevenue.toUpperCase(), 4, y); doc.text(money(report.tRev), W - 4, y, { align: "right" }); y += 5;
      doc.text(L.totalProfit.toUpperCase(), 4, y); doc.text(money(report.tProfit), W - 4, y, { align: "right" }); y += 5;
      doc.save(`rapport-benefices-${periodKey}.pdf`);
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5" /> {L.title}</h1>

      <Tabs value={mode} onValueChange={v => setMode(v as any)}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="entry">{L.entry}</TabsTrigger>
          <TabsTrigger value="report">{L.report}</TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "entry" && (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1"><label className="text-sm">{L.date}</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">{L.noStockNote}</p>
          <p className="text-[11px] text-muted-foreground">{L.fastHint}</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="rounded-md border p-2 space-y-2">
                <div className="flex gap-2">
                  <Select value={r.module} onValueChange={v => updRow(i, { module: v })}>
                    <SelectTrigger className="h-9 w-36 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>{MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="h-9 flex-1" placeholder={L.item} value={r.item} onChange={e => updRow(i, { item: e.target.value })} />
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0" onClick={() => rmRow(i)}><Trash2 className="w-4 h-4" /></Button>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                  <Input className="h-9" type="number" min={0} placeholder={L.qtyL} value={r.qty} onChange={e => updRow(i, { qty: e.target.value })} />
                  <Input className="h-9" type="number" min={0} placeholder={L.puL} value={r.price} onChange={e => updRow(i, { price: e.target.value })} />
                  <Input className="h-9" type="number" min={0} placeholder={L.cost} value={r.cost} onChange={e => updRow(i, { cost: e.target.value })} />
                  <div className="text-right text-sm font-semibold">{nf(rowAmount(r))}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={addRow} className="gap-1"><Plus className="w-4 h-4" /> {L.addLine}</Button>
            <span className="text-sm text-muted-foreground">{L.lineTotal}: <b>{nf(rows.reduce((s, r) => s + rowAmount(r), 0))} {cur}</b></span>
            <Button onClick={saveDay} disabled={saving} className="gap-1 ml-auto"><Save className="w-4 h-4" /> {L.save}</Button>
          </div>
        </div>
      )}

      {mode === "report" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1">
              <Button size="sm" variant={rMode === "day" ? "default" : "outline"} onClick={() => setRMode("day")}>{L.day}</Button>
              <Button size="sm" variant={rMode === "month" ? "default" : "outline"} onClick={() => setRMode("month")}>{L.month}</Button>
            </div>
            {rMode === "day"
              ? <Input type="date" className="w-44" value={rDay} onChange={e => setRDay(e.target.value)} />
              : <Input type="month" className="w-44" value={rMonth} onChange={e => setRMonth(e.target.value)} />}
            <Button size="sm" className="gap-1 ml-auto" onClick={printReport} disabled={report.lines.length === 0}><Printer className="w-4 h-4" /> {L.print}</Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-primary/5 border-primary/30"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{L.totalRevenue}</p><p className="text-2xl font-bold text-primary">{nf(report.tRev)} <span className="text-sm font-normal">{cur}</span></p></CardContent></Card>
            <Card className="bg-green-50 border-green-300"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{L.totalProfit}</p><p className="text-2xl font-bold text-green-700">{nf(report.tProfit)} <span className="text-sm font-normal">{cur}</span></p></CardContent></Card>
          </div>

          {report.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{L.noData}</p>
          ) : (
            <div className="space-y-2">
              {report.lines.map(r => (
                <Card key={r.module}><CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-1"><p className="font-medium">{r.module}</p></div>
                  <div className="text-right">
                    <p className="text-sm">{L.revenue}: <span className="font-semibold">{nf(r.revenue)}</span></p>
                    {r.cost > 0 && <p className="text-[11px] text-muted-foreground">{L.cost.replace(/ \(.*\)/, "")}: {nf(r.cost)}</p>}
                    <p className="text-sm">{L.profit}: <span className={`font-bold ${r.profit >= 0 ? "text-green-600" : "text-destructive"}`}>{nf(r.profit)}</span></p>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
