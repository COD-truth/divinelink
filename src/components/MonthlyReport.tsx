import { useEffect, useMemo, useState } from "react";
import { db, type Patient, type Consultation, type Payment, type LabResult } from "@/lib/db";
import { decryptPatients } from "@/lib/patientCrypto";
import { useLang } from "@/contexts/LangContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { Download, Printer, CalendarRange } from "lucide-react";
import { saveFile, toCsv } from "@/lib/download";
import { toast } from "sonner";

const DICT = {
  fr: {
    title: "Rapport mensuel", month: "Mois", export: "Exporter CSV", print: "Imprimer",
    consults: "Consultations", newPatients: "Nouveaux patients", seen: "Patients vus",
    appointments: "Rendez-vous", labTests: "Analyses labo", revenue: "Recette encaissée",
    revByMethod: "Recette par mode de paiement", billed: "Total facturé", unpaid: "Impayés",
    cash: "Espèces", orange_money: "Orange Money", mtn_momo: "MTN MoMo", other: "Autre",
    topDx: "Top 10 diagnostics", diagnosis: "Diagnostic", count: "Nombre",
    ageDist: "Répartition par âge", ageGroup: "Tranche d'âge",
    lab: "Laboratoire", labOrdered: "Demandées", labDone: "Terminées", topExams: "Examens les plus demandés",
    pharmacy: "Pharmacie", unitsSold: "Unités vendues", pharmRevenue: "CA pharmacie",
    byDay: "Consultations par jour", noData: "Aucune donnée pour ce mois.",
    summaryFor: "Résumé pour", generatedOn: "Généré le",
    byType: "Activité par type", byVisit: "Type de visite", newVsReturn: "Nouveaux vs connus",
    returning: "Déjà connus",
    explorer: "Explorateur — le plus fréquent", breakdownBy: "Répartir par", filterType: "Filtrer par type",
    allTypes: "Tous les types", dimType: "Type de consultation", dimDiagnosis: "Pathologie / Diagnostic",
    dimAge: "Tranche d'âge", dimVisit: "Type de visite", dimSex: "Sexe", dimTreatment: "Traitement",
    dimMotif: "Motif / Type de soin", exportThis: "Exporter cette vue", cases: "cas", unspecified: "Non précisé",
  },
  en: {
    title: "Monthly Report", month: "Month", export: "Export CSV", print: "Print",
    consults: "Consultations", newPatients: "New patients", seen: "Patients seen",
    appointments: "Appointments", labTests: "Lab tests", revenue: "Revenue collected",
    revByMethod: "Revenue by payment method", billed: "Total billed", unpaid: "Unpaid",
    cash: "Cash", orange_money: "Orange Money", mtn_momo: "MTN MoMo", other: "Other",
    topDx: "Top 10 diagnoses", diagnosis: "Diagnosis", count: "Count",
    ageDist: "Age distribution", ageGroup: "Age group",
    lab: "Laboratory", labOrdered: "Ordered", labDone: "Completed", topExams: "Most requested exams",
    pharmacy: "Pharmacy", unitsSold: "Units sold", pharmRevenue: "Pharmacy revenue",
    byDay: "Consultations per day", noData: "No data for this month.",
    summaryFor: "Summary for", generatedOn: "Generated on",
    byType: "Activity by type", byVisit: "Visit type", newVsReturn: "New vs returning",
    returning: "Returning",
    explorer: "Explorer — most frequent", breakdownBy: "Break down by", filterType: "Filter by type",
    allTypes: "All types", dimType: "Consultation type", dimDiagnosis: "Pathology / Diagnosis",
    dimAge: "Age group", dimVisit: "Visit type", dimSex: "Sex", dimTreatment: "Treatment",
    dimMotif: "Reason / Care type", exportThis: "Export this view", cases: "cases", unspecified: "Unspecified",
  },
};

const TYPE_LABELS: Record<string, { fr: string; en: string }> = {
  general: { fr: "Médecine générale", en: "General medicine" },
  dental: { fr: "Dentaire", en: "Dental" },
  orthodontic: { fr: "Orthodontie", en: "Orthodontics" },
  prosthesis: { fr: "Prothèse", en: "Prosthesis" },
  echography: { fr: "Échographie", en: "Ultrasound" },
  other: { fr: "Autre", en: "Other" },
};
const VISIT_LABELS: Record<string, { fr: string; en: string }> = {
  new_consultation: { fr: "Nouvelle consultation", en: "New consultation" },
  old_consultation: { fr: "Ancienne consultation", en: "Old consultation" },
  rendezvous: { fr: "Rendez-vous", en: "Appointment" },
};

function ageFromDob(dob: string, ageYears?: number): number | null {
  if (typeof ageYears === "number" && ageYears > 0) return ageYears;
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}
function ageBucket(a: number | null): string {
  if (a === null) return "?";
  if (a <= 12) return "0-12";
  if (a <= 17) return "13-17";
  if (a <= 35) return "18-35";
  if (a <= 60) return "36-60";
  return "60+";
}

export function MonthlyReport() {
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dim, setDim] = useState<"motif" | "type" | "diagnosis" | "age" | "visit" | "sex" | "treatment">("motif");
  const [filterType, setFilterType] = useState<string>("all");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [p, c, pay, lab, apt] = await Promise.all([
        db.patients.toArray().then(decryptPatients),
        db.consultations.toArray(),
        db.payments.toArray(),
        db.labResults.toArray(),
        db.appointments.toArray(),
      ]);
      setPatients(p.filter(x => !x.deleted && inClinic(x.clinicId)));
      setConsultations(c.filter(x => inClinic((x as any).clinicId)));
      setPayments(pay.filter(x => !(x as any).deleted && inClinic(x.clinicId)));
      setLabs(lab.filter(x => !x.deleted && inClinic(x.clinicId)));
      setAppointments(apt.filter(x => inClinic((x as any).clinicId)));
    })();
  }, []);

  const inMonth = (ts?: string) => !!ts && ts.slice(0, 7) === month;

  const stats = useMemo(() => {
    const monthConsults = consultations.filter(c => c.isLatest !== false && inMonth(c.createdAt || c.date));
    const newPatients = patients.filter(p => inMonth(p.createdAt)).length;
    const seenIds = new Set(monthConsults.map(c => c.patientId));
    const monthApts = appointments.filter(a => inMonth(a.date || a.createdAt)).length;
    // Patients "active" this month = registered this month OR seen in a consultation this month.
    // Demographics (age/sex/visit) key off this so registrations without an in-month
    // consultation still appear in the charts.
    const monthPatients = patients.filter(p => inMonth(p.createdAt) || seenIds.has(p.id!));

    // Lab
    const monthLabs = labs.filter(l => inMonth(l.orderedAt || l.createdAt));
    const labDone = monthLabs.filter(l => l.status === "completed").length;
    const examCounts = new Map<string, number>();
    monthLabs.forEach(l => examCounts.set(l.examName, (examCounts.get(l.examName) || 0) + 1));
    const topExams = Array.from(examCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Revenue (same model as caisse closing: installments or synthesized)
    const byMethod: Record<string, number> = { cash: 0, orange_money: 0, mtn_momo: 0, other: 0 };
    let revenue = 0;
    payments.forEach(p => {
      const insts = (p.installments && p.installments.length)
        ? p.installments
        : (p.amountPaid > 0 ? [{ amount: p.amountPaid, method: p.method, paidAt: p.paidAt || p.createdAt }] : []);
      insts.forEach(it => {
        if (inMonth(it.paidAt as string)) { byMethod[it.method] = (byMethod[it.method] || 0) + it.amount; revenue += it.amount; }
      });
    });
    const monthInvoices = payments.filter(p => inMonth(p.createdAt));
    const billed = monthInvoices.reduce((s, p) => s + (p.amountDue || 0), 0);
    const unpaid = monthInvoices.reduce((s, p) => s + Math.max(0, (p.amountDue || 0) - (p.amountPaid || 0)), 0);

    // Pharmacy units + revenue from invoice line items
    let pharmUnits = 0, pharmRevenue = 0;
    monthInvoices.forEach(p => (p.items || []).forEach(it => {
      if (it.drugId || (it.category || "").toLowerCase().includes("pharm")) {
        pharmUnits += it.quantity || 0;
        pharmRevenue += (it.quantity || 0) * (it.unitPrice || 0);
      }
    }));

    // Consultations by type (consultType) — only when the clinic writes consultations.
    const byType = new Map<string, number>();
    monthConsults.forEach(c => { const k = (c.consultType || "general"); byType.set(k, (byType.get(k) || 0) + 1); });

    // Type de soin / motif straight from the patient registration (reasonForVisit).
    // This is where registration-only clinics capture what the patient came for.
    const byMotif = new Map<string, number>();
    monthPatients.forEach(p => { const k = (p.reasonForVisit || "").trim() || L.unspecified; byMotif.set(k, (byMotif.get(k) || 0) + 1); });

    // Visit type of patients active this month (new / old consultation / appointment)
    const byVisit = new Map<string, number>();
    monthPatients.forEach(p => { const k = (p.visitType || "new_consultation"); byVisit.set(k, (byVisit.get(k) || 0) + 1); });
    const returning = Math.max(0, monthPatients.length - newPatients);

    // Top diagnoses
    const dxCounts = new Map<string, number>();
    monthConsults.forEach(c => { const k = (c.diagnosis || "").trim(); if (k) dxCounts.set(k, (dxCounts.get(k) || 0) + 1); });
    const topDx = Array.from(dxCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Age + sex distribution of patients active this month (registered or seen)
    const ageBuckets: Record<string, number> = { "0-12": 0, "13-17": 0, "18-35": 0, "36-60": 0, "60+": 0, "?": 0 };
    let sexM = 0, sexF = 0;
    monthPatients.forEach(p => {
      ageBuckets[ageBucket(ageFromDob(p.dob, p.ageYears))]++;
      if ((p as any).sex === "M") sexM++; else if ((p as any).sex === "F") sexF++;
    });

    // Per-day activity — count patient encounters (registrations) so it reflects
    // the real daily flow even when no separate consultation row is written.
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const perDay = Array.from({ length: daysInMonth }, (_, i) => ({ day: String(i + 1), value: 0 }));
    monthPatients.forEach(p => {
      const d = (p.createdAt || "").slice(8, 10);
      const idx = Number(d) - 1;
      if (idx >= 0 && idx < perDay.length) perDay[idx].value++;
    });

    return {
      consults: monthConsults.length, newPatients, seen: monthPatients.length, apts: monthApts,
      labOrdered: monthLabs.length, labDone, topExams,
      byMethod, revenue, billed, unpaid, pharmUnits, pharmRevenue,
      topDx, ageBuckets, perDay, sexM, sexF,
      byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
      byMotif: Array.from(byMotif.entries()).sort((a, b) => b[1] - a[1]),
      byVisit: Array.from(byVisit.entries()).sort((a, b) => b[1] - a[1]),
      returning,
    };
  }, [consultations, patients, payments, labs, appointments, month]);
  const typeLabel = (k: string) => (TYPE_LABELS[k]?.[lang]) || k;
  const visitLabel = (k: string) => (VISIT_LABELS[k]?.[lang]) || k;

  // Interactive explorer. Registration-based dimensions (motif, age, sex, visit) read the
  // PATIENTS active this month; clinical dimensions (diagnosis, treatment, type) read
  // consultations. This way the explorer works whether or not the clinic writes consultations.
  const explorerRows = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (k: string) => counts.set(k, (counts.get(k) || 0) + 1);
    const seenIds = new Set(consultations.filter(c => c.isLatest !== false && inMonth(c.createdAt || c.date)).map(c => c.patientId));
    const monthPatients = patients.filter(p => inMonth(p.createdAt) || seenIds.has(p.id!));

    if (dim === "motif" || dim === "age" || dim === "sex" || dim === "visit") {
      monthPatients.forEach(p => {
        if (dim === "motif") bump((p.reasonForVisit || "").trim() || L.unspecified);
        else if (dim === "age") bump(ageBucket(ageFromDob(p.dob, p.ageYears)));
        else if (dim === "visit") bump(visitLabel(p.visitType || "new_consultation"));
        else { const s = (p as any).sex; bump(s === "M" ? (lang === "en" ? "Male" : "Hommes") : s === "F" ? (lang === "en" ? "Female" : "Femmes") : L.unspecified); }
      });
    } else {
      const src = consultations.filter(c =>
        c.isLatest !== false && inMonth(c.createdAt || c.date) &&
        (filterType === "all" || (c.consultType || "general") === filterType));
      src.forEach(c => {
        if (dim === "type") bump(typeLabel(c.consultType || "general"));
        else if (dim === "diagnosis") { const d = (c.diagnosis || "").trim(); bump(d || L.unspecified); }
        else if (dim === "treatment") { const tt = ((c as any).treatmentPlan || "").trim(); bump(tt || L.unspecified); }
      });
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [consultations, patients, month, dim, filterType, lang]);
  const explorerTotal = explorerRows.reduce((s, [, v]) => s + v, 0);

  const exportExplorer = async () => {
    const dimName = { motif: L.dimMotif, type: L.dimType, diagnosis: L.dimDiagnosis, age: L.dimAge, visit: L.dimVisit, sex: L.dimSex, treatment: L.dimTreatment }[dim];
    const rows = explorerRows.map(([k, v]) => ({ [dimName]: k, [L.cases]: v, "%": explorerTotal ? Math.round((v / explorerTotal) * 100) : 0 }));
    const csv = toCsv(rows as any, [dimName, L.cases, "%"]);
    const ok = await saveFile(`repartition-${dim}-${month}.csv`, csv, "csv");
    if (ok) toast.success(L.exportThis + " ✓");
  };

  const f = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const monthLabel = new Date(month + "-01").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" });

  const exportCsv = async () => {
    const rows: Record<string, unknown>[] = [
      { indicateur: L.consults, valeur: stats.consults },
      { indicateur: L.newPatients, valeur: stats.newPatients },
      { indicateur: L.seen, valeur: stats.seen },
      { indicateur: L.appointments, valeur: stats.apts },
      { indicateur: L.labTests + " (" + L.labOrdered + ")", valeur: stats.labOrdered },
      { indicateur: L.labTests + " (" + L.labDone + ")", valeur: stats.labDone },
      { indicateur: L.revenue + " (FCFA)", valeur: Math.round(stats.revenue) },
      { indicateur: L.billed + " (FCFA)", valeur: Math.round(stats.billed) },
      { indicateur: L.unpaid + " (FCFA)", valeur: Math.round(stats.unpaid) },
      { indicateur: L.cash, valeur: Math.round(stats.byMethod.cash) },
      { indicateur: L.orange_money, valeur: Math.round(stats.byMethod.orange_money) },
      { indicateur: L.mtn_momo, valeur: Math.round(stats.byMethod.mtn_momo) },
      { indicateur: L.other, valeur: Math.round(stats.byMethod.other) },
      { indicateur: L.unitsSold, valeur: stats.pharmUnits },
      { indicateur: L.pharmRevenue + " (FCFA)", valeur: Math.round(stats.pharmRevenue) },
      {},
      { indicateur: "=== " + L.topDx + " ===", valeur: "" },
      ...stats.topDx.map(([name, c]) => ({ indicateur: name, valeur: c })),
      {},
      { indicateur: "=== " + L.dimMotif + " ===", valeur: "" },
      ...stats.byMotif.map(([k, v]) => ({ indicateur: k, valeur: v })),
      {},
      { indicateur: "=== " + L.byType + " ===", valeur: "" },
      ...stats.byType.map(([k, v]) => ({ indicateur: typeLabel(k), valeur: v })),
      ...(stats.labOrdered > 0 ? [{ indicateur: L.lab, valeur: stats.labOrdered }] : []),
      {},
      { indicateur: "=== " + L.byVisit + " ===", valeur: "" },
      { indicateur: L.newPatients, valeur: stats.newPatients },
      { indicateur: L.returning, valeur: stats.returning },
      ...stats.byVisit.map(([k, v]) => ({ indicateur: visitLabel(k), valeur: v })),
      {},
      { indicateur: "=== " + L.ageDist + " ===", valeur: "" },
      { indicateur: lang === "en" ? "Male" : "Hommes", valeur: stats.sexM },
      { indicateur: lang === "en" ? "Female" : "Femmes", valeur: stats.sexF },
      ...Object.entries(stats.ageBuckets).map(([k, v]) => ({ indicateur: k, valeur: v })),
    ];
    const csv = toCsv(rows as any, ["indicateur", "valeur"]);
    const ok = await saveFile(`rapport-${month}.csv`, csv, "csv");
    if (ok) toast.success(L.export + " ✓");
  };

  const methodRows = [
    ["cash", stats.byMethod.cash], ["orange_money", stats.byMethod.orange_money],
    ["mtn_momo", stats.byMethod.mtn_momo], ["other", stats.byMethod.other],
  ] as [keyof typeof L, number][];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2 flex-wrap print:hidden">
        <div>
          <label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarRange className="w-3.5 h-3.5" /> {L.month}</label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1"><Download className="w-4 h-4" /> {L.export}</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1"><Printer className="w-4 h-4" /> {L.print}</Button>
        </div>
      </div>

      <div className="hidden print:block mb-2">
        <h2 className="text-lg font-bold">{L.summaryFor} {monthLabel}</h2>
        <p className="text-xs text-muted-foreground">{L.generatedOn} {new Date().toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label={L.consults} value={stats.consults} />
        <KPI label={L.newPatients} value={stats.newPatients} />
        <KPI label={L.seen} value={stats.seen} />
        <KPI label={L.appointments} value={stats.apts} />
        <KPI label={L.labTests} value={stats.labOrdered} />
        <KPI label={L.revenue} value={`${f(stats.revenue)}`} suffix="F" accent />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* Revenue by method */}
        <Card>
          <CardHeader><CardTitle className="text-base">{L.revByMethod}</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {methodRows.filter(([, v]) => v > 0).length === 0 && <p className="text-sm text-muted-foreground">{L.noData}</p>}
            {methodRows.filter(([, v]) => v > 0).map(([m, v]) => (
              <div key={m} className="flex justify-between text-sm"><span>{L[m]}</span><b>{f(v)} F</b></div>
            ))}
            <div className="border-t pt-1.5 mt-1.5 flex justify-between text-sm font-bold"><span>{L.revenue}</span><span className="text-success">{f(stats.revenue)} F</span></div>
            <div className="flex justify-between text-sm text-muted-foreground"><span>{L.billed}</span><span>{f(stats.billed)} F</span></div>
            <div className="flex justify-between text-sm text-destructive"><span>{L.unpaid}</span><span>{f(stats.unpaid)} F</span></div>
          </CardContent>
        </Card>

        {/* Age distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">{L.ageDist}</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex justify-between text-sm pb-1 mb-1 border-b">
              <span className="text-muted-foreground">{lang === "en" ? "Male / Female" : "Hommes / Femmes"}</span>
              <span><b>{stats.sexM}</b> / <b>{stats.sexF}</b></span>
            </div>
            {Object.entries(stats.ageBuckets).map(([k, v]) => {
              const max = Math.max(1, ...Object.values(stats.ageBuckets));
              return (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-14 text-muted-foreground">{k}</span>
                  <div className="flex-1 h-3 bg-muted rounded"><div className="h-3 bg-primary rounded" style={{ width: `${(v / max) * 100}%` }} /></div>
                  <span className="w-8 text-right font-medium">{v}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Lab + Pharmacy */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">{L.lab}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-4">
              <div><p className="text-xs text-muted-foreground">{L.labOrdered}</p><p className="text-2xl font-bold">{stats.labOrdered}</p></div>
              <div><p className="text-xs text-muted-foreground">{L.labDone}</p><p className="text-2xl font-bold text-green-600">{stats.labDone}</p></div>
            </div>
            {stats.topExams.length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-semibold text-muted-foreground mb-1">{L.topExams}</p>
                <ul className="space-y-0.5">{stats.topExams.map(([name, c]) => (
                  <li key={name} className="flex justify-between text-sm"><span className="truncate">{name}</span><Badge variant="secondary">{c}</Badge></li>
                ))}</ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{L.pharmacy}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div><p className="text-xs text-muted-foreground">{L.unitsSold}</p><p className="text-2xl font-bold">{stats.pharmUnits}</p></div>
              <div><p className="text-xs text-muted-foreground">{L.pharmRevenue}</p><p className="text-2xl font-bold text-success">{f(stats.pharmRevenue)} F</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown by consultation type + visit type */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">{L.byType}</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {(() => {
              // Prefer consultation types when the clinic writes consultations; otherwise
              // fall back to the motif captured at registration. Plus Laboratory.
              const base: [string, number][] = stats.byType.length > 0
                ? stats.byType.map(([k, v]) => [typeLabel(k), v] as [string, number])
                : stats.byMotif.map(([k, v]) => [k, v] as [string, number]);
              const rows: [string, number][] = [
                ...base,
                ...(stats.labOrdered > 0 ? [[L.lab, stats.labOrdered] as [string, number]] : []),
              ].sort((a, b) => b[1] - a[1]);
              if (rows.length === 0) return <p className="text-sm text-muted-foreground">{L.noData}</p>;
              const max = Math.max(1, ...rows.map(x => x[1]));
              return rows.map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-36 truncate">{k}</span>
                  <div className="flex-1 h-3 bg-muted rounded"><div className="h-3 bg-primary rounded" style={{ width: `${(v / max) * 100}%` }} /></div>
                  <span className="w-8 text-right font-medium">{v}</span>
                </div>
              ));
            })()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{L.byVisit}</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex justify-between text-sm pb-1 mb-1 border-b">
              <span className="text-muted-foreground">{L.newVsReturn}</span>
              <span><b className="text-primary">{stats.newPatients}</b> / {stats.returning}</span>
            </div>
            {stats.byVisit.length === 0 ? <p className="text-sm text-muted-foreground">{L.noData}</p> : stats.byVisit.map(([k, v]) => {
              const max = Math.max(1, ...stats.byVisit.map(x => x[1]));
              return (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-36 truncate">{visitLabel(k)}</span>
                  <div className="flex-1 h-3 bg-muted rounded"><div className="h-3 bg-accent rounded" style={{ width: `${(v / max) * 100}%` }} /></div>
                  <span className="w-8 text-right font-medium">{v}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Interactive explorer — most frequent X, optionally filtered by type */}
      <Card>
        <CardHeader><CardTitle className="text-base">{L.explorer}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <div>
              <label className="text-xs text-muted-foreground">{L.breakdownBy}</label>
              <Select value={dim} onValueChange={v => setDim(v as any)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="motif">{L.dimMotif}</SelectItem>
                  <SelectItem value="age">{L.dimAge}</SelectItem>
                  <SelectItem value="sex">{L.dimSex}</SelectItem>
                  <SelectItem value="visit">{L.dimVisit}</SelectItem>
                  <SelectItem value="diagnosis">{L.dimDiagnosis}</SelectItem>
                  <SelectItem value="type">{L.dimType}</SelectItem>
                  <SelectItem value="treatment">{L.dimTreatment}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{L.filterType}</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L.allTypes}</SelectItem>
                  {["general", "dental", "orthodontic", "prosthesis", "other"].map(t => (
                    <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={exportExplorer} disabled={!explorerRows.length} className="gap-1">
              <Download className="w-4 h-4" /> {L.exportThis}
            </Button>
          </div>
          {explorerRows.length === 0 ? <p className="text-sm text-muted-foreground">{L.noData}</p> : (
            <div className="space-y-1.5">
              {explorerRows.slice(0, 15).map(([k, v]) => {
                const max = explorerRows[0][1] || 1;
                const pct = explorerTotal ? Math.round((v / explorerTotal) * 100) : 0;
                return (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-44 truncate" title={k}>{k}</span>
                    <div className="flex-1 h-4 bg-muted rounded relative">
                      <div className="h-4 bg-primary rounded" style={{ width: `${(v / max) * 100}%` }} />
                    </div>
                    <span className="w-20 text-right font-medium">{v} · {pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top diagnoses */}
      <Card>
        <CardHeader><CardTitle className="text-base">{L.topDx}</CardTitle></CardHeader>
        <CardContent>
          {stats.topDx.length === 0 ? <p className="text-sm text-muted-foreground">{L.noData}</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>{L.diagnosis}</TableHead><TableHead className="text-right">{L.count}</TableHead></TableRow></TableHeader>
              <TableBody>{stats.topDx.map(([name, c]) => (
                <TableRow key={name}><TableCell className="font-medium">{name}</TableCell><TableCell className="text-right">{c}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Per-day chart */}
      <Card className="print:break-inside-avoid">
        <CardHeader><CardTitle className="text-base">{L.byDay}</CardTitle></CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer>
            <BarChart data={stats.perDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={2} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <RTooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value, suffix, accent }: { label: string; value: React.ReactNode; suffix?: string; accent?: boolean }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${accent ? "text-success" : ""}`}>{value}{suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}</p>
    </CardContent></Card>
  );
}
