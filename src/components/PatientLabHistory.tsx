import { useEffect, useState } from "react";
import { db, type LabResult } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { LAB_CATALOGUE } from "./LabResultsPage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, ChevronDown } from "lucide-react";

const ALL_EXAMS = (LAB_CATALOGUE as any[]).flatMap((c: any) => c.exams.map((e: any) => ({ ...e, category: c.category })));
const examById = (id: string) => ALL_EXAMS.find((e: any) => e.id === id);

/** Flag a completed result as abnormal: numeric value outside the catalogue
 *  range, or the text result mentions positif / anormal / réactif. */
function isAbnormal(r: LabResult): boolean {
  const ex = examById(r.examId);
  if (ex && r.values) {
    for (const f of (ex.fields || [])) {
      const v = r.values[f.key];
      if (!v || f.isSelect || f.isText || (f.min === 0 && f.max === 0)) continue;
      const n = parseFloat(v); if (!isNaN(n) && (n < f.min || n > f.max)) return true;
    }
  }
  const txt = ((r.freeResult || "") + " " + Object.values(r.values || {}).join(" ")).toLowerCase();
  return /positif|anormal|r[ée]actif/.test(txt);
}

export function PatientLabHistory({ patientId }: { patientId: number }) {
  const { lang } = useLang();
  const tr = (fr: string, en: string) => (lang === "en" ? en : fr);
  const [rows, setRows] = useState<LabResult[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const all = (await db.labResults.toArray()).filter(r => !r.deleted && r.patientId === patientId);
      all.sort((a, b) => (b.orderedAt || b.createdAt || "").localeCompare(a.orderedAt || a.createdAt || ""));
      setRows(all);
    })();
  }, [patientId]);

  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR") : "—";
  const fmtTime = (s?: string) => s ? new Date(s).toLocaleTimeString(lang === "en" ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";

  const done = rows.filter(r => r.status === "completed").length;

  if (rows.length === 0) return <p className="text-sm text-muted-foreground p-2">{tr("Aucune analyse pour ce patient.", "No analysis for this patient.")}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">{rows.length} {tr("analyse(s)", "analysis(es)")} · {done} {tr("terminée(s)", "completed")}</p>
      {rows.map(r => {
        const abn = r.status === "completed" && isAbnormal(r);
        const resultText = r.freeResult?.trim() || Object.entries(r.values || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
        const open = openId === r.id;
        return (
          <Card key={r.id}>
            <CardContent className="p-2.5">
              <button type="button" className="w-full flex items-start gap-2 text-left" onClick={() => setOpenId(open ? null : r.id!)}>
                <FlaskConical className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.examName}</span>
                    {r.status === "completed"
                      ? (abn ? <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">{tr("Anomalie", "Abnormal")}</Badge> : <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">{tr("Terminé", "Done")}</Badge>)
                      : <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 text-[10px]">{tr("En attente", "Pending")}</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(r.orderedAt || r.createdAt)} · {fmtTime(r.orderedAt || r.createdAt)}{r.price ? ` · ${r.price.toLocaleString()} F` : ""}</p>
                  {!open && r.status === "completed" && resultText && <p className="text-xs text-muted-foreground truncate">{resultText}</p>}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="mt-2 pl-6 text-sm space-y-1.5">
                  {r.values && Object.keys(r.values).length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {Object.entries(r.values).map(([k, v]) => <div key={k} className="flex justify-between gap-2 border-b border-dashed border-muted py-0.5"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>)}
                    </div>
                  )}
                  {r.freeResult && <p className="whitespace-pre-wrap">{r.freeResult}</p>}
                  {r.notes && <p className="text-xs text-muted-foreground"><b>{tr("Interprétation / note", "Interpretation / note")}:</b> {r.notes}</p>}
                  {r.resultAt && <p className="text-[11px] text-muted-foreground">{tr("Résultat le", "Result on")} {fmtDate(r.resultAt)} {fmtTime(r.resultAt)}{r.resultBy ? ` · ${r.resultBy}` : ""}</p>}
                  {r.status !== "completed" && <p className="text-xs text-muted-foreground">{tr("Résultat non encore saisi.", "Result not entered yet.")}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
