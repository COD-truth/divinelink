import { useEffect, useMemo, useState } from "react";
import { db, type Expense, type ExpenseMethod, type CaisseDay, type Payment, type PaymentStatus } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicSettings } from "@/lib/clinicSettings";
import { logAudit } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Printer, ChevronLeft, ChevronRight, Lock, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";

const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const todayYmd = () => new Date().toISOString().slice(0, 10);
const fcfa = (n: number) => `${Math.round(n || 0).toLocaleString("fr-FR").replace(/ /g, " ")} FCFA`;
const frDate = (ymd: string) => new Date(ymd + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shiftDay = (ymd: string, d: number) => { const x = new Date(ymd + "T00:00:00"); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

const EXP_CATS = ["Réappro pharmacie", "Réactifs labo", "Salaires", "Loyer", "Électricité", "Eau", "Transport", "Maintenance", "Fournitures", "Impôts/Taxes", "Divers"];
const METHODS: { v: ExpenseMethod; l: string }[] = [
  { v: "cash", l: "Espèces" }, { v: "orange_money", l: "Orange Money" }, { v: "mtn_momo", l: "MTN MoMo" }, { v: "bank", l: "Banque" }, { v: "other", l: "Autre" },
];
const methodLabel = (m: string) => METHODS.find(x => x.v === m)?.l || m;

export function CaisseJournaliere() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };

  const [day, setDay] = useState(todayYmd());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<Payment[]>([]);
  const [recettes, setRecettes] = useState<{ cash: number; total: number; byMethod: Record<string, number> }>({ cash: 0, total: 0, byMethod: {} });
  const [opening, setOpening] = useState("0");
  const [reel, setReel] = useState("");
  const [savedDay, setSavedDay] = useState<CaisseDay | null>(null);

  // add-expense form
  const [exp, setExp] = useState({ category: EXP_CATS[0], label: "", amount: "", method: "cash" as ExpenseMethod });
  // vente libre (counter sale, no patient) form + drug names for the datalist/stock match
  const [drugNames, setDrugNames] = useState<{ id: number; name: string; sell: number; stock: number }[]>([]);
  const [vl, setVl] = useState({ label: "", qty: "1", amount: "", encaisse: "", method: "cash" as ExpenseMethod });

  const dayBounds = (ymd: string) => {
    const s = new Date(ymd + "T00:00:00").toISOString();
    const e = new Date(ymd + "T23:59:59.999").toISOString();
    return { s, e };
  };

  const computeRecettes = async () => {
    const { s, e } = dayBounds(day);
    const pays = (await db.payments.toArray()).filter(p => !(p as any).deleted && inClinic(p.clinicId));
    const byMethod: Record<string, number> = { cash: 0, orange_money: 0, mtn_momo: 0, other: 0 };
    for (const p of pays) {
      const insts = (p.installments && p.installments.length)
        ? p.installments
        : (p.amountPaid > 0 ? [{ amount: p.amountPaid, method: p.method, paidAt: p.paidAt || p.createdAt }] : []);
      for (const it of insts) {
        const when = (it as any).paidAt || p.createdAt;
        if (when >= s && when <= e) {
          const m = (it as any).method || "cash";
          byMethod[m] = (byMethod[m] || 0) + ((it as any).amount || 0);
        }
      }
    }
    const total = Object.values(byMethod).reduce((a, b) => a + b, 0);
    setRecettes({ cash: byMethod.cash || 0, total, byMethod });
  };

  const load = async () => {
    // expenses of the day
    const ex = (await db.expenses.where("date").equals(day).toArray()).filter(x => !x.deleted && inClinic(x.clinicId));
    setExpenses(ex.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    await computeRecettes();
    // sales / entrées billed that day (for the recette list)
    const { s, e } = dayBounds(day);
    const pays = (await db.payments.toArray()).filter(p => !(p as any).deleted && inClinic(p.clinicId) && p.createdAt >= s && p.createdAt <= e);
    setSales(pays.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    // drug names (for vente libre: autocomplete + optional stock deduction)
    const dl = (await db.drugs.toArray()).filter(d => inClinic(d.clinicId));
    setDrugNames(dl.map(d => ({ id: d.id!, name: d.name, sell: d.sellPrice || 0, stock: d.stock || 0 })));
    // opening = this day's saved closing, else yesterday's closing
    const allDays = (await db.caisseDays.toArray()).filter(d => inClinic(d.clinicId));
    const mine = allDays.find(d => d.date === day) || null;
    setSavedDay(mine);
    if (mine) { setOpening(String(mine.opening)); setReel(mine.reel != null ? String(mine.reel) : ""); }
    else {
      const prev = allDays.filter(d => d.date < day).sort((a, b) => b.date.localeCompare(a.date))[0];
      setOpening(prev ? String(prev.closing) : "0");
      setReel("");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [day]);

  const sortiesCash = useMemo(() => expenses.filter(e => e.method === "cash").reduce((s, e) => s + (e.amount || 0), 0), [expenses]);
  const sortiesTotal = useMemo(() => expenses.reduce((s, e) => s + (e.amount || 0), 0), [expenses]);
  const dayFacture = useMemo(() => sales.reduce((s, p) => s + (p.amountDue || 0), 0), [sales]);
  const dayEncaisse = useMemo(() => sales.reduce((s, p) => s + (p.amountPaid || 0), 0), [sales]);
  const dayReste = useMemo(() => sales.reduce((s, p) => s + (p.balance || 0), 0), [sales]);
  const openingN = parseFloat(opening) || 0;
  const theorique = openingN + recettes.cash - sortiesCash;
  const reelN = reel === "" ? null : (parseFloat(reel) || 0);
  const ecart = reelN == null ? null : reelN - theorique;
  // Gain net du jour = tout ce qui est entré − tout ce qui est sorti (hors report de la veille).
  const gainNet = recettes.total - sortiesTotal;

  const addExpense = async () => {
    const amt = parseFloat(exp.amount);
    if (!exp.label.trim()) { toast.error("Motif de la sortie requis"); return; }
    if (!amt || amt <= 0) { toast.error("Montant invalide"); return; }
    const now = new Date().toISOString();
    const id = await db.expenses.add({
      uid: uuid(), date: day, category: exp.category, label: exp.label.trim(), amount: amt,
      method: exp.method, recordedBy: user?.name || "—", clinicId: cid(), createdAt: now, updatedAt: now,
    });
    await logAudit("expense_create", user?.name || "—", { resource: "expense", resourceId: id, message: `${exp.label} · ${fcfa(amt)}` });
    setExp({ category: EXP_CATS[0], label: "", amount: "", method: "cash" });
    toast.success("Sortie enregistrée");
    await load();
  };

  const delExpense = async (e: Expense) => {
    await db.expenses.update(e.id!, { deleted: true, updatedAt: new Date().toISOString() });
    await logAudit("expense_delete", user?.name || "—", { resource: "expense", resourceId: e.id, message: `${e.label} · ${fcfa(e.amount)}` });
    await load();
  };

  // Import d'un journal (cahier numérisé) : crée paiements + sorties + jours de caisse.
  // Idempotent : ré-importer le même fichier remplace l'import précédent (via importRef).
  const [importing, setImporting] = useState(false);
  const importJournal = async (file: File) => {
    setImporting(true);
    try {
      const data = JSON.parse(await file.text());
      const ref: string = data.importRef || data.source || `import-${Date.now()}`;
      const c = cid();
      // purge d'un éventuel import précédent du même lot (local)
      for (const p of (await db.payments.toArray()).filter(x => (x as any).importRef === ref)) await db.payments.delete(p.id!);
      for (const e of (await db.expenses.toArray()).filter(x => (x as any).importRef === ref)) await db.expenses.delete(e.id!);
      for (const d of (await db.caisseDays.toArray()).filter(x => (x as any).importRef === ref)) await db.caisseDays.delete(d.id!);

      let nPay = 0, nExp = 0, nDay = 0;
      let seq = await db.payments.count();
      for (const dy of (data.days || [])) {
        const date: string = dy.date;
        let mins = 8 * 60;
        let recettesCash = 0;
        for (const en of (dy.entries || [])) {
          const items = (en.items || []).map((it: any) => ({ name: it.label, quantity: 1, unitPrice: Number(it.amount) || 0, category: en.venteLibre ? "Vente libre" : (it.category || "Acte") }));
          const due = items.reduce((s: number, it: any) => s + it.unitPrice, 0);
          const reste = Number(en.reste) || 0;
          const paid = Math.max(0, due - reste);
          recettesCash += paid;
          const status: PaymentStatus = reste <= 0 ? "paid" : (paid > 0 ? "partial" : "unpaid");
          const hh = String(Math.floor(mins / 60)).padStart(2, "0"), mm = String(mins % 60).padStart(2, "0"); mins += 2;
          const iso = new Date(`${date}T${hh}:${mm}:00`).toISOString();
          seq += 1;
          await db.payments.add({
            patientId: 0, patientName: en.venteLibre ? "Vente libre" : (en.name || "—"), invoiceNumber: String(seq).padStart(7, "0"),
            items, label: en.name || "", amountDue: due, amountPaid: paid, balance: reste, status,
            method: "cash", paidAt: iso, installments: paid > 0 ? [{ id: uuid(), amount: paid, method: "cash", paidAt: iso }] : [],
            clinicId: c, createdAt: iso, updatedAt: iso, importRef: ref,
          } as any);
          nPay++;
        }
        let sortiesCash = 0;
        for (const s of (dy.sorties || [])) {
          const amt = Number(s.amount) || 0; sortiesCash += amt;
          await db.expenses.add({ date, category: s.category || "Sortie", label: s.label || "Sortie", amount: amt, method: "cash", clinicId: c, createdAt: new Date(`${date}T20:00:00`).toISOString(), updatedAt: new Date().toISOString(), importRef: ref } as any);
          nExp++;
        }
        const opening = Number(dy.opening) || 0;
        const theorique = opening + recettesCash - sortiesCash;
        const closing = dy.paperFdc != null ? Number(dy.paperFdc) : theorique;
        await db.caisseDays.add({
          date, opening, recettesCash, recettesTotal: recettesCash, sortiesCash, sortiesTotal: sortiesCash,
          theorique, reel: closing, ecart: closing - theorique, closing, closedBy: "Import cahier", closedAt: new Date().toISOString(),
          clinicId: c, createdAt: new Date(`${date}T20:05:00`).toISOString(), updatedAt: new Date().toISOString(), importRef: ref,
        } as any);
        nDay++;
      }
      await logAudit("payment_create", user?.name || "—", { resource: "caisse", message: `Import journal « ${data.source || ref} » : ${nPay} entrées, ${nExp} sorties, ${nDay} jours` });
      toast.success(`Import réussi : ${nPay} entrées, ${nExp} sorties, ${nDay} jours`);
      if (data.days?.[0]?.date) setDay(data.days[0].date);
      await load();
    } catch (err: any) {
      toast.error("Import échoué : " + (err?.message || "fichier invalide"));
    } finally {
      setImporting(false);
    }
  };

  // Vente libre : vente au comptoir sans dossier patient. Crée un encaissement
  // (payment patientId 0) qui tombe directement dans la recette + le gain du jour.
  // Si la désignation correspond à un produit en stock, le stock est décrémenté.
  const addVenteLibre = async () => {
    const amt = parseFloat(vl.amount);
    if (!vl.label.trim()) { toast.error("Désignation requise"); return; }
    if (!amt || amt <= 0) { toast.error("Montant invalide"); return; }
    const qtyN = Math.max(1, parseInt(vl.qty) || 1);
    const enc = vl.encaisse.trim() === "" ? amt : (parseFloat(vl.encaisse) || 0);
    const reste = Math.max(0, amt - enc);
    const status: PaymentStatus = reste <= 0 ? "paid" : (enc > 0 ? "partial" : "unpaid");
    // Horodatage dans la journée affichée (pour tomber dans la recette de ce jour).
    const t = new Date();
    const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    const d = new Date(`${day}T${hhmm}:00`);
    const now = (isNaN(d.getTime()) ? new Date() : d).toISOString();
    const c = cid();
    // Décrément de stock si la désignation correspond exactement à un produit.
    const match = drugNames.find(x => x.name.toLowerCase() === vl.label.trim().toLowerCase());
    if (match) {
      const before = match.stock || 0; const after = Math.max(0, before - qtyN);
      await db.drugs.update(match.id, { stock: after, updatedAt: now });
      await db.drugTransactions.add({
        drugId: match.id, type: "out", quantity: qtyN, price: amt / qtyN,
        paymentStatus: status, exitReason: "dispensed", performedBy: user?.name,
        stockBefore: before, stockAfter: after, notes: "Vente libre (comptoir)", clinicId: c, createdAt: now,
      } as any);
    }
    const invoiceNumber = String((await db.payments.count()) + 1).padStart(7, "0");
    await db.payments.add({
      patientId: 0, patientName: "Vente libre", invoiceNumber,
      items: [{ name: qtyN > 1 ? `${vl.label.trim()} (x${qtyN})` : vl.label.trim(), quantity: 1, unitPrice: amt, category: "Vente libre", ...(match ? { drugId: match.id } : {}) }],
      label: vl.label.trim(),
      amountDue: amt, amountPaid: enc, balance: reste, status,
      method: vl.method as any, paidAt: now,
      installments: enc > 0 ? [{ id: uuid(), amount: enc, method: vl.method, paidAt: now, receivedBy: user?.name }] : [],
      clinicId: c, createdAt: now, updatedAt: now,
    } as any);
    await logAudit("payment_create", user?.name || "—", { resource: "payment", message: `Vente libre · ${vl.label.trim()} · ${fcfa(amt)}${reste > 0 ? ` · reste ${fcfa(reste)}` : ""}` });
    setVl({ label: "", qty: "1", amount: "", encaisse: "", method: "cash" });
    toast.success("Vente libre enregistrée");
    await load();
  };

  const cloturer = async () => {
    const now = new Date().toISOString();
    const rec: CaisseDay = {
      uid: savedDay?.uid || uuid(), date: day, opening: openingN,
      recettesCash: recettes.cash, recettesTotal: recettes.total,
      sortiesCash, sortiesTotal, theorique,
      reel: reelN == null ? undefined : reelN, ecart: ecart == null ? undefined : ecart,
      closing: reelN == null ? theorique : reelN,
      closedBy: user?.name || "—", closedAt: now,
      clinicId: cid(), createdAt: savedDay?.createdAt || now, updatedAt: now,
    };
    if (savedDay?.id) await db.caisseDays.update(savedDay.id, rec);
    else await db.caisseDays.add(rec);
    await logAudit("caisse_close", user?.name || "—", { resource: "caisseDay", message: `${day} · fond ${fcfa(rec.closing)}` });
    toast.success("Journée clôturée — report transmis au lendemain");
    await load();
  };

  const print = () => {
    import("jspdf").then(({ jsPDF }) => {
      const c = getClinicSettings();
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      const W = 148, mg = 12; let y = 15;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text((c?.name || "Caisse").toUpperCase(), W / 2, y, { align: "center" }); y += 6;
      doc.setFontSize(12); doc.text("FOND DE CAISSE", W / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
      doc.text(frDate(day), W / 2, y, { align: "center" }); y += 8; doc.setTextColor(20);
      const row = (l: string, v: string, bold = false, big = false) => {
        doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(big ? 12 : 10);
        doc.text(l, mg, y); doc.text(v, W - mg, y, { align: "right" }); y += big ? 9 : 7;
      };
      row("Report de la veille", fcfa(openingN));
      row("Recettes espèces du jour", "+ " + fcfa(recettes.cash));
      row("Sorties espèces du jour", "- " + fcfa(sortiesCash));
      y += 1; doc.setDrawColor(30); doc.line(mg, y, W - mg, y); y += 7;
      row("FOND DE CAISSE (théorique)", fcfa(theorique), true, true);
      if (reelN != null) { row("Montant réel compté", fcfa(reelN), true); row("Écart", (ecart! >= 0 ? "+" : "") + fcfa(ecart!), true); }
      y += 1; doc.setTextColor(0, 120, 70); row("GAIN NET DU JOUR", fcfa(gainNet), true); doc.setTextColor(20);
      y += 2; doc.setFontSize(8); doc.setTextColor(90);
      doc.text(`Autres encaissements (OM/MoMo/autre) : ${fcfa(recettes.total - recettes.cash)}`, mg, y); y += 5;
      if (expenses.length) {
        y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(20); doc.text("Détail des sorties", mg, y); y += 5;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        expenses.forEach(e => { if (y > 190) { doc.addPage(); y = 15; } doc.text(`${e.category || ""} — ${e.label}`, mg, y); doc.text(fcfa(e.amount), W - mg, y, { align: "right" }); y += 4.5; });
      }
      if (sales.length) {
        y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(20); doc.text("Recette du jour (ventes)", mg, y); y += 5;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
        sales.forEach(p => {
          if (y > 190) { doc.addPage(); y = 15; }
          const nm = ((p as any).patientName || `Facture ${p.invoiceNumber || p.id}`).slice(0, 26);
          doc.text(nm, mg, y); doc.text(fcfa(p.amountPaid || 0), W - mg, y, { align: "right" }); y += 4.2;
          if ((p.balance || 0) > 0) { doc.setTextColor(200, 0, 0); doc.text("   reste " + fcfa(p.balance || 0), mg, y); doc.setTextColor(40); y += 4; }
        });
        y += 1; doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Total encaissé", mg, y); doc.text(fcfa(dayEncaisse), W - mg, y, { align: "right" }); y += 5;
      }
      doc.setFontSize(6.5); doc.setTextColor(130);
      doc.text("DivineLink · " + (user?.name || "") + " · " + new Date().toLocaleString("fr-FR"), W / 2, 205, { align: "center" });
      doc.save(`fond_de_caisse_${day}.pdf`);
    });
  };

  return (
    <div className="space-y-3">
      {/* date nav */}
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setDay(d => shiftDay(d, -1))}><ChevronLeft className="w-4 h-4" /></Button>
        <Input type="date" className="h-9 w-44" max={todayYmd()} value={day} onChange={e => setDay(e.target.value)} />
        <Button size="icon" variant="outline" className="h-9 w-9" disabled={day >= todayYmd()} onClick={() => setDay(d => shiftDay(d, 1))}><ChevronRight className="w-4 h-4" /></Button>
        {savedDay && <span className="text-[11px] text-green-600 inline-flex items-center gap-1 ml-1"><CheckCircle2 className="w-3.5 h-3.5" /> Clôturée</span>}
        {isAdmin && (
          <label className="ml-auto">
            <input type="file" accept="application/json,.json" className="hidden" disabled={importing}
              onChange={e => { const f = e.target.files?.[0]; if (f) importJournal(f); e.currentTarget.value = ""; }} />
            <span className={`inline-flex items-center gap-1 h-9 px-3 rounded-md border text-sm cursor-pointer hover:bg-accent ${importing ? "opacity-50 pointer-events-none" : ""}`}>
              <Upload className="w-4 h-4" /> {importing ? "Import…" : "Importer"}
            </span>
          </label>
        )}
        <Button size="sm" variant="outline" className={`gap-1 ${isAdmin ? "" : "ml-auto"}`} onClick={print}><Printer className="w-4 h-4" /> Imprimer</Button>
      </div>
      <p className="text-xs text-muted-foreground capitalize -mt-1">{frDate(day)}</p>

      {/* reconciliation */}
      <Card><CardContent className="p-3 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm">Report de la veille</label>
            <Input type="number" className="h-8 w-32 text-right" value={opening} onChange={e => setOpening(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Recettes espèces du jour</span>
            <span className="text-sm font-medium text-green-600">+ {fcfa(recettes.cash)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Sorties espèces du jour</span>
            <span className="text-sm font-medium text-destructive">− {fcfa(sortiesCash)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Autres encaissements (OM/MoMo…)</span>
            <span className="text-xs text-muted-foreground">{fcfa(recettes.total - recettes.cash)}</span>
          </div>
        </div>
        <div className="rounded-md bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Fond de caisse (théorique)</span>
          <span className="text-xl font-bold text-primary">{fcfa(theorique)}</span>
        </div>
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Gain net du jour</span>
            <span className="text-[11px] text-muted-foreground block">Toutes recettes − toutes sorties (hors report de la veille)</span>
          </div>
          <span className={`text-xl font-bold ${gainNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{fcfa(gainNet)}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm">Montant réel compté</label>
            <Input type="number" className="h-8 w-32 text-right" placeholder="espèces en caisse" value={reel} onChange={e => setReel(e.target.value)} />
          </div>
          {reelN != null && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Écart</span>
              <span className={`text-sm font-bold ${ecart === 0 ? "text-muted-foreground" : (ecart! > 0 ? "text-green-600" : "text-destructive")}`}>{ecart! > 0 ? "+" : ""}{fcfa(ecart!)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button size="sm" className="gap-1" onClick={cloturer}><Lock className="w-4 h-4" /> {savedDay ? "Mettre à jour la clôture" : "Clôturer la journée"}</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Le fond de caisse clôturé devient automatiquement le report de la veille du lendemain.</p>
      </CardContent></Card>

      {/* vente libre (vente au comptoir, sans dossier patient) */}
      <Card><CardContent className="p-3 space-y-2">
        <p className="text-sm font-semibold">Vente libre <span className="text-muted-foreground font-normal">— au comptoir, sans dossier patient</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
          <div className="col-span-2 sm:col-span-5">
            <label className="text-[11px] text-muted-foreground block mb-0.5">Désignation</label>
            <Input className="h-9" list="vl-drugs" placeholder="ex. Paracétamol, carnet, pansement…" value={vl.label}
              onChange={e => {
                const v = e.target.value;
                const m = drugNames.find(x => x.name.toLowerCase() === v.trim().toLowerCase());
                setVl(s => ({ ...s, label: v, amount: (m && m.sell > 0 && (s.amount === "" )) ? String(m.sell * (Math.max(1, parseInt(s.qty) || 1))) : s.amount }));
              }} />
            <datalist id="vl-drugs">{drugNames.map(d => <option key={d.id} value={d.name} />)}</datalist>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] text-muted-foreground block mb-0.5">Qté</label>
            <Input className="h-9" type="number" min={1} value={vl.qty} onChange={e => setVl(s => ({ ...s, qty: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] text-muted-foreground block mb-0.5">Montant (FCFA)</label>
            <Input className="h-9" type="number" value={vl.amount} onChange={e => setVl(s => ({ ...s, amount: e.target.value }))} />
          </div>
          <div className="sm:col-span-3">
            <label className="text-[11px] text-muted-foreground block mb-0.5">Moyen</label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={vl.method} onChange={e => setVl(s => ({ ...s, method: e.target.value as ExpenseMethod }))}>
              {METHODS.filter(m => m.v !== "bank").map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 max-w-[220px]">
            <label className="text-[11px] text-muted-foreground block mb-0.5">Encaissé <span className="opacity-70">(vide = tout payé)</span></label>
            <Input className="h-9" type="number" placeholder="= montant" value={vl.encaisse} onChange={e => setVl(s => ({ ...s, encaisse: e.target.value }))} />
          </div>
          <Button className="h-9 gap-1" onClick={addVenteLibre}><Plus className="w-4 h-4" /> Ajouter la vente</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">La vente tombe dans la recette et le gain du jour. Si la désignation correspond à un produit du stock, le stock est décrémenté.</p>
      </CardContent></Card>

      {/* ventes / entrées du jour (rapport de recette) */}
      <Card><CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <p className="text-sm font-semibold">Ventes / entrées du jour · {sales.length}</p>
          <div className="text-xs text-muted-foreground">Facturé <b className="text-foreground">{fcfa(dayFacture)}</b> · Encaissé <b className="text-green-600">{fcfa(dayEncaisse)}</b>{dayReste > 0 ? <> · Dettes <b className="text-destructive">{fcfa(dayReste)}</b></> : null}</div>
        </div>
        {sales.length === 0 && <p className="text-xs text-muted-foreground">Aucune entrée enregistrée ce jour.</p>}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {sales.map(p => (
            <div key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{(p as any).patientName || `Facture ${p.invoiceNumber || p.id}`}</span>
                <span className="text-xs text-muted-foreground block truncate">{p.label || (p.items || []).map(i => i.name).slice(0, 3).join(", ")}</span>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="font-medium text-green-600">{fcfa(p.amountPaid || 0)}</div>
                {(p.balance || 0) > 0 && <div className="text-[11px] text-destructive">reste {fcfa(p.balance || 0)}</div>}
              </div>
            </div>
          ))}
        </div>
      </CardContent></Card>

      {/* sorties */}
      <Card><CardContent className="p-3 space-y-3">
        <p className="text-sm font-semibold">Sorties / dépenses du jour · <span className="text-destructive">{fcfa(sortiesTotal)}</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-0.5">Catégorie</label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={exp.category} onChange={e => setExp(s => ({ ...s, category: e.target.value }))}>
              {EXP_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-0.5">Moyen</label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={exp.method} onChange={e => setExp(s => ({ ...s, method: e.target.value as ExpenseMethod }))}>
              {METHODS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className="text-[11px] text-muted-foreground block mb-0.5">Motif</label>
            <Input className="h-9" placeholder="ex. achat paracétamol" value={exp.label} onChange={e => setExp(s => ({ ...s, label: e.target.value }))} />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground block mb-0.5">Montant (FCFA)</label>
              <Input type="number" className="h-9" value={exp.amount} onChange={e => setExp(s => ({ ...s, amount: e.target.value }))} />
            </div>
            <Button className="h-9 gap-1" onClick={addExpense}><Plus className="w-4 h-4" /> Ajouter</Button>
          </div>
        </div>

        <div className="space-y-1.5">
          {expenses.length === 0 && <p className="text-xs text-muted-foreground">Aucune sortie enregistrée ce jour.</p>}
          {expenses.map(e => (
            <div key={e.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{e.label}</span>
                <span className="text-xs text-muted-foreground"> · {e.category} · {methodLabel(e.method)}{e.recordedBy ? ` · ${e.recordedBy}` : ""}</span>
              </div>
              <span className="font-medium text-destructive whitespace-nowrap">{fcfa(e.amount)}</span>
              {isAdmin && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => delExpense(e)}><Trash2 className="w-4 h-4" /></Button>}
            </div>
          ))}
        </div>
        {!isAdmin && <p className="text-[11px] text-muted-foreground">La suppression des sorties est réservée à l'administrateur.</p>}
      </CardContent></Card>
    </div>
  );
}
