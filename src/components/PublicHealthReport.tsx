import { useEffect, useMemo, useState } from "react";
import { db, type Consultation, type PublicHealthProgram } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Printer, CalendarRange, TriangleAlert } from "lucide-react";
import { saveFile, toCsv } from "@/lib/download";
import { toast } from "sonner";

const PROGRAMS: { key: PublicHealthProgram; fr: string; en: string; screening?: boolean; cpn?: boolean }[] = [
  { key: "vih", fr: "Dépistage VIH", en: "HIV screening", screening: true },
  { key: "hepatite_b", fr: "Hépatite B (AgHBs)", en: "Hepatitis B (HBsAg)", screening: true },
  { key: "hepatite_c", fr: "Hépatite C", en: "Hepatitis C", screening: true },
  { key: "paludisme", fr: "Paludisme (TDR)", en: "Malaria (RDT)", screening: true },
  { key: "tb", fr: "Tuberculose", en: "Tuberculosis", screening: true },
  { key: "cpn", fr: "CPN (prénatale)", en: "Antenatal (ANC)", cpn: true },
  { key: "pf", fr: "Planning familial", en: "Family planning" },
  { key: "vaccination", fr: "Vaccination", en: "Vaccination" },
];

const DICT = {
  fr: { title: "Santé publique", month: "Mois", export: "Exporter CSV", print: "Imprimer",
    tested: "Testés", positif: "Positifs", rate: "Positivité", served: "Servis",
    screenings: "Dépistages", programs: "Programmes", cpnDist: "Répartition CPN", total: "Total",
    none: "Aucune donnée ce mois. Les visites enregistrées (Visite du jour) apparaîtront ici.",
    summaryFor: "Résumé pour", generatedOn: "Généré le", positivesAlert: "positif(s) ce mois — à référer/suivre.",
    cpn1: "CPN1", cpn2: "CPN2", cpn3: "CPN3", cpn4: "CPN4+" },
  en: { title: "Public health", month: "Month", export: "Export CSV", print: "Print",
    tested: "Tested", positif: "Positive", rate: "Positivity", served: "Served",
    screenings: "Screenings", programs: "Programmes", cpnDist: "ANC distribution", total: "Total",
    none: "No data this month. Visits logged via Today's visit appear here.",
    summaryFor: "Summary for", generatedOn: "Generated on", positivesAlert: "positive(s) this month — refer/follow up.",
    cpn1: "ANC1", cpn2: "ANC2", cpn3: "ANC3", cpn4: "ANC4+" },
};

export function PublicHealthReport() {
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [cons, setCons] = useState<Consultation[]>([]);

  useEffect(() => { (async () => {
    setCons((await db.consultations.toArray()).filter(c => !c.deleted && c.isLatest !== false && inClinic(c.clinicId) && (c as any).program));
  })(); }, []);

  const inMonth = (ts?: string) => !!ts && ts.slice(0, 7) === month;

  const data = useMemo(() => {
    const monthCons = cons.filter(c => inMonth(c.createdAt || c.date));
    const rows = PROGRAMS.map(p => {
      const items = monthCons.filter(c => (c as any).program === p.key);
      const tested = items.length;
      const positif = items.filter(c => (c as any).programResult === "positif").length;
      const negatif = items.filter(c => (c as any).programResult === "negatif").length;
      const rate = tested ? Math.round((positif / tested) * 100) : 0;
      return { ...p, tested, positif, negatif, rate };
    }).filter(r => r.tested > 0);
    const cpn = [1, 2, 3, 4].map(n => ({ n, count: monthCons.filter(c => (c as any).program === "cpn" && (n < 4 ? (c as any).cpnNumber === n : ((c as any).cpnNumber || 0) >= 4)).length }));
    const totalPositives = rows.reduce((s, r) => s + (r.screening ? r.positif : 0), 0);
    return { rows, cpn, totalPositives };
  }, [cons, month]);

  const monthLabel = new Date(month + "-01").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" });
  const label = (p: { fr: string; en: string }) => lang === "en" ? p.en : p.fr;

  const exportCsv = async () => {
    const out: Record<string, unknown>[] = [];
    data.rows.forEach(r => {
      out.push({ programme: label(r), [L.tested]: r.tested, [L.positif]: r.screening ? r.positif : "", [L.rate]: r.screening ? r.rate + "%" : "" });
    });
    const csv = toCsv(out as any, ["programme", L.tested, L.positif, L.rate]);
    const ok = await saveFile(`sante-publique-${month}.csv`, csv, "csv");
    if (ok) toast.success(L.export + " ✓");
  };

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
      <div className="hidden print:block"><h2 className="text-lg font-bold">{L.title} — {monthLabel}</h2></div>

      {data.rows.length === 0 ? <p className="text-sm text-muted-foreground">{L.none}</p> : (<>
        {data.totalPositives > 0 && (
          <Card className="border-destructive/40 bg-destructive/5"><CardContent className="p-3 flex items-center gap-2 text-sm">
            <TriangleAlert className="w-4 h-4 text-destructive" /> <b>{data.totalPositives}</b> {L.positivesAlert}
          </CardContent></Card>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {data.rows.map(r => (
            <Card key={r.key}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{label(r)}</p>
                  {r.screening && r.positif > 0 && <Badge variant="destructive">{r.positif} +</Badge>}
                </div>
                <div className="flex items-end gap-4 mt-1">
                  <div><p className="text-[10px] text-muted-foreground">{r.screening ? L.tested : L.served}</p><p className="text-2xl font-bold">{r.tested}</p></div>
                  {r.screening && <div><p className="text-[10px] text-muted-foreground">{L.rate}</p><p className={`text-2xl font-bold ${r.rate > 0 ? "text-destructive" : ""}`}>{r.rate}%</p></div>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {data.cpn.some(c => c.count > 0) && (
          <Card>
            <CardHeader><CardTitle className="text-base">{L.cpnDist}</CardTitle></CardHeader>
            <CardContent className="flex gap-3">
              {data.cpn.map((c, i) => (
                <div key={c.n} className="flex-1 text-center">
                  <p className="text-xs text-muted-foreground">{[L.cpn1, L.cpn2, L.cpn3, L.cpn4][i]}</p>
                  <p className="text-2xl font-bold text-primary">{c.count}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </>)}
    </div>
  );
}
