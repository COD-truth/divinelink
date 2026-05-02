import React, { useEffect, useMemo, useState } from "react";
import { db, type Consultation, type Patient } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, BarChart3, RotateCcw } from "lucide-react";
import { decryptPatients } from "@/lib/patientCrypto";
import { saveFile, toCsv, withDateStamp } from "@/lib/download";
import { toast } from "sonner";

interface ResultRow {
  patientName: string;
  patientId: string;
  age: number | "";
  date: string;
  diagnosis: string;
  prescription: string;
  doctor: string;
}

function ageFromDob(dob: string): number | "" {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export function ResearchPage() {
  const { t } = useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [doctors, setDoctors] = useState<Map<number, string>>(new Map());

  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [diagnosisPick, setDiagnosisPick] = useState<string>("__any__");
  const [medication, setMedication] = useState("");

  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, c, u] = await Promise.all([
        db.patients.toArray().then(decryptPatients),
        db.consultations.toArray(),
        db.users.toArray(),
      ]);
      setPatients(p);
      setConsultations(c);
      const m = new Map<number, string>();
      u.forEach(usr => usr.id && m.set(usr.id, usr.name));
      setDoctors(m);
    })();
  }, []);

  const distinctDiagnoses = useMemo(() => {
    const s = new Set<string>();
    consultations.forEach(c => c.diagnosis?.trim() && s.add(c.diagnosis.trim()));
    return Array.from(s).sort();
  }, [consultations]);

  const reset = () => {
    setAgeMin(""); setAgeMax(""); setDateFrom(""); setDateTo("");
    setDiagnosis(""); setDiagnosisPick("__any__"); setMedication("");
    setResults(null);
  };

  const run = () => {
    setBusy(true);
    try {
      const minA = ageMin ? Number(ageMin) : -Infinity;
      const maxA = ageMax ? Number(ageMax) : Infinity;
      const dx = (diagnosisPick !== "__any__" ? diagnosisPick : diagnosis).trim().toLowerCase();
      const med = medication.trim().toLowerCase();
      const pmap = new Map(patients.map(p => [p.id!, p]));

      const rows: ResultRow[] = [];
      for (const c of consultations) {
        if (c.isLatest === false) continue;
        const p = pmap.get(c.patientId);
        if (!p) continue;
        const age = ageFromDob(p.dob);
        if (typeof age === "number") {
          if (age < minA || age > maxA) continue;
        } else if (ageMin || ageMax) {
          continue;
        }
        if (dateFrom && c.date.slice(0, 10) < dateFrom) continue;
        if (dateTo && c.date.slice(0, 10) > dateTo) continue;
        if (dx && !(c.diagnosis || "").toLowerCase().includes(dx)) continue;
        if (med && !(c.prescription || "").toLowerCase().includes(med)) continue;
        rows.push({
          patientName: `${p.firstName} ${p.lastName}`,
          patientId: p.patientId,
          age,
          date: c.date.slice(0, 10),
          diagnosis: c.diagnosis || "",
          prescription: c.prescription || "",
          doctor: doctors.get(c.doctorId) || "",
        });
      }
      rows.sort((a, b) => b.date.localeCompare(a.date));
      setResults(rows);
    } finally {
      setBusy(false);
    }
  };

  const totalConsults = consultations.filter(c => c.isLatest !== false).length;
  const matchedPatients = results ? new Set(results.map(r => r.patientId)).size : 0;
  const pctConsults = results && totalConsults ? (results.length / totalConsults) * 100 : 0;

  const exportCsv = async () => {
    if (!results?.length) return;
    const csv = toCsv(results, ["patientId", "patientName", "age", "date", "diagnosis", "prescription", "doctor"]);
    const ok = await saveFile(withDateStamp("research_results.csv"), csv, "csv");
    if (ok) toast.success(t("research.exported"));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />{t("research.title")}</CardTitle>
          <CardDescription>{t("research.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label>{t("research.ageMin")}</Label>
              <Input type="number" min={0} value={ageMin} onChange={e => setAgeMin(e.target.value)} />
            </div>
            <div>
              <Label>{t("research.ageMax")}</Label>
              <Input type="number" min={0} value={ageMax} onChange={e => setAgeMax(e.target.value)} />
            </div>
            <div>
              <Label>{t("research.dateFrom")}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>{t("research.dateTo")}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <Label>{t("research.diagnosis")}</Label>
              <div className="flex gap-2">
                <Input placeholder={t("research.diagnosisFree")} value={diagnosis}
                  onChange={e => { setDiagnosis(e.target.value); setDiagnosisPick("__any__"); }} />
                <Select value={diagnosisPick} onValueChange={v => { setDiagnosisPick(v); if (v !== "__any__") setDiagnosis(""); }}>
                  <SelectTrigger className="w-44"><SelectValue placeholder={t("research.pickDiagnosis")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">{t("research.anyDiagnosis")}</SelectItem>
                    {distinctDiagnoses.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="lg:col-span-2">
              <Label>{t("research.medication")}</Label>
              <Input placeholder={t("research.medicationHint")} value={medication} onChange={e => setMedication(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={run} disabled={busy}><Search className="w-4 h-4 mr-2" />{t("research.run")}</Button>
            <Button variant="outline" onClick={reset}><RotateCcw className="w-4 h-4 mr-2" />{t("research.reset")}</Button>
            <Button variant="outline" onClick={exportCsv} disabled={!results?.length} className="ml-auto">
              <Download className="w-4 h-4 mr-2" />{t("research.exportCsv")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <>
          <Card>
            <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label={t("research.matchedConsults")} value={results.length} />
              <Stat label={t("research.matchedPatients")} value={matchedPatients} />
              <Stat label={t("research.totalConsults")} value={totalConsults} />
              <Stat label={t("research.pctOfTotal")} value={`${pctConsults.toFixed(1)}%`} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("research.col.patient")}</TableHead>
                    <TableHead>{t("research.col.age")}</TableHead>
                    <TableHead>{t("research.col.date")}</TableHead>
                    <TableHead>{t("research.col.diagnosis")}</TableHead>
                    <TableHead>{t("research.col.prescription")}</TableHead>
                    <TableHead>{t("research.col.doctor")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t("research.noResults")}</TableCell></TableRow>
                  ) : results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="font-medium">{r.patientName}</div>
                        <div className="text-xs text-muted-foreground">{r.patientId}</div>
                      </TableCell>
                      <TableCell>{r.age === "" ? "—" : r.age}</TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="max-w-[16rem] truncate" title={r.diagnosis}>{r.diagnosis || "—"}</TableCell>
                      <TableCell className="max-w-[16rem] truncate" title={r.prescription}>{r.prescription || "—"}</TableCell>
                      <TableCell>{r.doctor || <Badge variant="outline">—</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
