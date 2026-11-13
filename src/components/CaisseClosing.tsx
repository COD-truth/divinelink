import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { decryptPatients } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { generateCaisseReport } from "./ReceiptGenerator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const METHOD_LABEL: Record<string, string> = { cash: "Espèces", orange_money: "Orange Money", mtn_momo: "MTN MoMo", other: "Autre" };
const METHOD_LABEL_EN: Record<string, string> = { cash: "Cash", orange_money: "Orange Money", mtn_momo: "MTN MoMo", other: "Other" };

const DICT = {
  fr: {
    title: "🧮 Fermeture de caisse", from: "Du", to: "Au",
    totalBilled: "Total facturé", totalCollected: "Recette totale (encaissée)",
    unpaid: "Impayées (reste dû)", float: "Fond de caisse", counted: "Montant réel compté",
    countedPh: "espèces en caisse", theoretical: "Théorique en caisse (espèces)", gap: "Écart",
    topSold: "Les plus vendus", topProfit: "Les plus rentables",
    sold: "Désignation vendue (du jour)", recovery: "Recouvrements",
    close: "Fermer", printClose: "Imprimer le rapport",
  },
  en: {
    title: "🧮 Cash closing", from: "From", to: "To",
    totalBilled: "Total billed", totalCollected: "Total collected",
    unpaid: "Unpaid (balance due)", float: "Cash float", counted: "Actual amount counted",
    countedPh: "cash in drawer", theoretical: "Theoretical cash in drawer", gap: "Difference",
    topSold: "Best sellers", topProfit: "Most profitable",
    sold: "Items sold (today)", recovery: "Recoveries",
    close: "Close", printClose: "Print report",
  },
};

export interface CaisseData {
  from: string; to: string; cashier?: string;
  totalFacture: number; totalRecette: number; impayees: number;
  byMethod: Record<string, number>;
  topSold: { name: string; qty: number; revenue: number }[];
  topProfit: { name: string; qty: number; profit: number }[];
  soldByCategory: { category: string; items: { name: string; qty: number; pu: number; total: number }[] }[];
  soldTotal: number;
  recouvrements: { client: string; invoice: string; method: string; amount: number }[];
  recouvrementTotal: number;
  fond: number; reel: number; theorique: number; ecart: number;
}

function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function toLocalInput(d: Date) { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

export function CaisseClosing({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void; }) {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const methodLabel = (m: string) => (lang === "en" ? METHOD_LABEL_EN : METHOD_LABEL)[m] || m;
  const [fromStr, setFromStr] = useState(toLocalInput(todayStart()));
  const [toStr, setToStr] = useState(toLocalInput(new Date()));
  const [fondStr, setFondStr] = useState("0");
  const [reelStr, setReelStr] = useState("");
  const [data, setData] = useState<Omit<CaisseData, "fond" | "reel" | "theorique" | "ecart"> | null>(null);

  const compute = async () => {
    const active = localStorage.getItem("divinelink.clinicId");
    const inClinic = (c?: string) => !active || !c || String(c) === String(active);
    const fromISO = new Date(fromStr).toISOString();
    const toISO = new Date(toStr).toISOString();
    const inRange = (iso?: string) => !!iso && iso >= fromISO && iso <= toISO;

    const payments = (await db.payments.toArray()).filter(p => !(p as any).deleted && inClinic(p.clinicId));
    const periodInvoices = payments.filter(p => inRange(p.createdAt));
    const totalFacture = periodInvoices.reduce((s, p) => s + (p.amountDue || 0), 0);

    const byMethod: Record<string, number> = { cash: 0, orange_money: 0, mtn_momo: 0, other: 0 };
    let totalRecette = 0;
    for (const p of payments) {
      const insts = (p.installments && p.installments.length)
        ? p.installments
        : (p.amountPaid > 0 ? [{ amount: p.amountPaid, method: p.method, paidAt: p.paidAt || p.createdAt }] : []);
      for (const it of insts) {
        if (inRange(it.paidAt as string)) { byMethod[it.method] = (byMethod[it.method] || 0) + it.amount; totalRecette += it.amount; }
      }
    }
    const impayees = periodInvoices.reduce((s, p) => s + Math.max(0, (p.amountDue || 0) - (p.amountPaid || 0)), 0);

    const drugs = await db.drugs.toArray();
    const buyById = new Map(drugs.map(d => [d.id, d.buyPrice || 0]));
    const catById = new Map(drugs.map(d => [d.id, d.category]));
    const catByName = new Map(drugs.map(d => [d.name.toLowerCase(), d.category]));
    const soldMap = new Map<string, { qty: number; revenue: number; profit: number; category: string }>();
    for (const p of periodInvoices) for (const it of (p.items || [])) {
      const cat = (it.drugId != null ? catById.get(it.drugId) : undefined) || catByName.get(it.name.toLowerCase()) || (it as any).category || "Divers";
      const e = soldMap.get(it.name) || { qty: 0, revenue: 0, profit: 0, category: cat };
      e.qty += it.quantity; e.revenue += it.quantity * it.unitPrice; e.category = cat;
      if (it.drugId != null) e.profit += (it.unitPrice - (buyById.get(it.drugId) || 0)) * it.quantity;
      soldMap.set(it.name, e);
    }
    const arr = [...soldMap.entries()].map(([name, v]) => ({ name, ...v }));
    const topSold = [...arr].sort((a, b) => b.qty - a.qty).slice(0, 5).map(({ name, qty, revenue }) => ({ name, qty, revenue }));
    const topProfit = [...arr].sort((a, b) => b.profit - a.profit).slice(0, 5).map(({ name, qty, profit }) => ({ name, qty, profit }));

    // Full "désignation vendue" grouped by category
    const catMap = new Map<string, { name: string; qty: number; pu: number; total: number }[]>();
    for (const r of arr) {
      const list = catMap.get(r.category) || [];
      list.push({ name: r.name, qty: r.qty, pu: r.qty ? Math.round(r.revenue / r.qty) : 0, total: r.revenue });
      catMap.set(r.category, list);
    }
    const soldByCategory = [...catMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, items]) => ({ category, items: items.sort((a, b) => b.total - a.total) }));
    const soldTotal = arr.reduce((s, r) => s + r.revenue, 0);

    // Recouvrements = payments collected in range on invoices created BEFORE the range (old debts cleared)
    const patients = await decryptPatients(await db.patients.toArray());
    const pName = (id?: number) => { const p = patients.find(x => x.id === id); return p ? `${p.firstName} ${p.lastName}`.trim() : "—"; };
    const recouvrements: { client: string; invoice: string; method: string; amount: number }[] = [];
    for (const p of payments) {
      if (!p.createdAt || p.createdAt >= fromISO) continue; // only older invoices
      for (const it of (p.installments || [])) {
        if (inRange(it.paidAt as string)) recouvrements.push({ client: pName(p.patientId), invoice: p.invoiceNumber || "—", method: it.method, amount: it.amount });
      }
    }
    const recouvrementTotal = recouvrements.reduce((s, r) => s + r.amount, 0);

    setData({ from: fromStr, to: toStr, cashier: user?.name, totalFacture, totalRecette, impayees, byMethod, topSold, topProfit, soldByCategory, soldTotal, recouvrements, recouvrementTotal });
  };

  useEffect(() => { if (open) compute(); /* eslint-disable-next-line */ }, [open, fromStr, toStr]);

  const fond = parseFloat(fondStr) || 0;
  const reel = parseFloat(reelStr) || 0;
  const theorique = fond + (data?.byMethod.cash || 0);
  const ecart = reel - theorique;
  const f = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");

  const print = () => {
    if (!data) return;
    generateCaisseReport({ ...data, fond, reel, theorique, ecart });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{L.title}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">{L.from}</label><Input type="datetime-local" value={fromStr} onChange={e => setFromStr(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">{L.to}</label><Input type="datetime-local" value={toStr} onChange={e => setToStr(e.target.value)} /></div>
          </div>

          {data && (
            <>
              <div className="rounded-lg border divide-y text-sm">
                <Row label={L.totalBilled} value={f(data.totalFacture) + " FCFA"} />
                <Row label={L.totalCollected} value={f(data.totalRecette) + " FCFA"} bold />
                {Object.entries(data.byMethod).filter(([, v]) => v > 0).map(([m, v]) => (
                  <Row key={m} label={"— " + methodLabel(m)} value={f(v) + " FCFA"} sub />
                ))}
                <Row label={L.unpaid} value={f(data.impayees) + " FCFA"} danger />
              </div>

              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-36">{L.float}</span>
                  <Input type="number" value={fondStr} onChange={e => setFondStr(e.target.value)} className="h-8 w-32" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-36">{L.counted}</span>
                  <Input type="number" value={reelStr} onChange={e => setReelStr(e.target.value)} className="h-8 w-32" placeholder={L.countedPh} />
                </div>
                <Row label={L.theoretical} value={f(theorique) + " FCFA"} />
                {reelStr !== "" && <Row label={L.gap} value={(ecart >= 0 ? "+" : "") + f(ecart) + " FCFA"} danger={ecart !== 0} />}
              </div>

              <TopList title={L.topSold} rows={data.topSold.map(r => ({ name: r.name, right: `${r.qty} · ${f(r.revenue)} F` }))} />
              <TopList title={L.topProfit} rows={data.topProfit.filter(r => r.profit > 0).map(r => ({ name: r.name, right: `+${f(r.profit)} F` }))} />

              {data.soldByCategory.length > 0 && (
                <div className="rounded-lg border p-2">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-xs font-bold text-muted-foreground uppercase">{L.sold}</p>
                    <p className="text-xs font-bold">{f(data.soldTotal)} FCFA</p>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1.5">
                    {data.soldByCategory.map(cat => (
                      <div key={cat.category}>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">{cat.category}</p>
                        {cat.items.map((it, i) => (
                          <div key={i} className="flex justify-between text-xs py-0.5 pl-2">
                            <span className="truncate pr-2">{it.name}</span>
                            <span className="whitespace-nowrap text-muted-foreground">{it.qty} × {f(it.pu)} = <span className="text-foreground font-medium">{f(it.total)}</span></span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.recouvrements.length > 0 && (
                <TopList title={L.recovery + ` (${f(data.recouvrementTotal)} F)`} rows={data.recouvrements.map(r => ({ name: `${r.client} · ${r.invoice}`, right: `${f(r.amount)} F` }))} />
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L.close}</Button>
          <Button onClick={print} disabled={!data} className="gap-1"><Printer className="w-4 h-4" /> {L.printClose}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, sub, danger }: { label: string; value: string; bold?: boolean; sub?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-1.5 ${sub ? "pl-6 text-muted-foreground" : ""}`}>
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${danger ? "text-red-600 font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
function TopList({ title, rows }: { title: string; rows: { name: string; right: string }[] }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border p-2">
      <p className="text-xs font-bold text-muted-foreground uppercase mb-1">{title}</p>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between text-sm py-0.5"><span className="truncate pr-2">{r.name}</span><span className="whitespace-nowrap">{r.right}</span></div>
      ))}
    </div>
  );
}
