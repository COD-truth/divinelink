import { useEffect, useMemo, useState } from "react";
import { db, type Patient, type PublicHealthProgram, type ConsultationType } from "@/lib/db";
import { decryptPatients } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { logAudit } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Stethoscope, Check, User } from "lucide-react";
import { toast } from "sonner";

interface Acte {
  value: string; fr: string; en: string; consultType: ConsultationType;
  program?: PublicHealthProgram; screening?: boolean; cpn?: boolean;
}
const ACTES: Acte[] = [
  { value: "general", fr: "Consultation générale", en: "General consultation", consultType: "general" },
  { value: "echography", fr: "Échographie", en: "Ultrasound", consultType: "echography" },
  { value: "dental", fr: "Consultation dentaire", en: "Dental consultation", consultType: "dental" },
  { value: "vih", fr: "Dépistage VIH", en: "HIV screening", consultType: "general", program: "vih", screening: true },
  { value: "hepatite_b", fr: "Hépatite B (AgHBs)", en: "Hepatitis B (HBsAg)", consultType: "general", program: "hepatite_b", screening: true },
  { value: "hepatite_c", fr: "Hépatite C", en: "Hepatitis C", consultType: "general", program: "hepatite_c", screening: true },
  { value: "paludisme", fr: "TDR Paludisme", en: "Malaria RDT", consultType: "general", program: "paludisme", screening: true },
  { value: "tb", fr: "Tuberculose (dépistage)", en: "TB screening", consultType: "general", program: "tb", screening: true },
  { value: "cpn", fr: "CPN (prénatale)", en: "Antenatal (ANC)", consultType: "general", program: "cpn", cpn: true },
  { value: "pf", fr: "Planning familial", en: "Family planning", consultType: "general", program: "pf" },
  { value: "vaccination", fr: "Vaccination", en: "Vaccination", consultType: "general", program: "vaccination" },
  { value: "wound", fr: "Soins / Pansement", en: "Wound care / Dressing", consultType: "other" },
  { value: "other", fr: "Autre", en: "Autre", consultType: "other" },
];

const DICT = {
  fr: {
    title: "Visite du jour", todayCount: "visites aujourd'hui", searchPh: "Rechercher un patient…",
    noPatient: "Choisissez un patient ci-dessus.", acte: "Motif / Acte / Programme", result: "Résultat",
    positif: "Positif", negatif: "Négatif", indetermine: "Indéterminé", cpnNum: "N° CPN",
    diagnosis: "Diagnostic / notes (optionnel)", save: "Enregistrer la visite", saved: "Visite enregistrée ✓",
    pickActe: "Choisissez un motif", pickResult: "Indiquez le résultat du dépistage",
    change: "Changer", years: "ans",
    returning: "Ancien patient", newPatient: "Nouveau patient", visits: "visites", lastDx: "Dernier diagnostic", none: "aucun",
    visitTypeLabel: "Type de visite", vtNouveau: "Nouveau cas", vtSuivi: "Suivi / Contrôle", vtRdv: "Rendez-vous", vtAutre: "Autre",
  },
  en: {
    title: "Today's visit", todayCount: "visits today", searchPh: "Search a patient…",
    noPatient: "Pick a patient above.", acte: "Reason / Act / Programme", result: "Result",
    positif: "Positive", negatif: "Negative", indetermine: "Indeterminate", cpnNum: "ANC visit #",
    diagnosis: "Diagnosis / notes (optional)", save: "Save visit", saved: "Visit saved ✓",
    pickActe: "Choose a reason", pickResult: "Enter the screening result",
    change: "Change", years: "y",
    returning: "Returning patient", newPatient: "New patient", visits: "visits", lastDx: "Last diagnosis", none: "none",
    visitTypeLabel: "Visit type", vtNouveau: "New case", vtSuivi: "Follow-up", vtRdv: "Appointment", vtAutre: "Other",
  },
};

export function VisitQuickPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };

  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [acte, setActe] = useState("");
  const [result, setResult] = useState<"positif" | "negatif" | "indetermine" | "">("");
  const [cpnNum, setCpnNum] = useState("");
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState<"nouveau" | "suivi" | "rendezvous" | "autre" | "">("");
  const [sexSel, setSexSel] = useState<"M" | "F" | "">("");
  const [ctx, setCtx] = useState<{ returning: boolean; count: number; lastDx?: string; lastDate?: string } | null>(null);

  const selectPatient = async (p: Patient) => {
    setPatient(p); setSearch(""); setSexSel(p.sex || "");
    const today = new Date().toISOString().slice(0, 10);
    const cons = (await db.consultations.toArray())
      .filter(c => c.patientId === p.id && inClinic(c.clinicId) && c.isLatest !== false)
      .sort((a, b) => (b.createdAt || b.date || "").localeCompare(a.createdAt || a.date || ""));
    const prior = cons.filter(c => (c.createdAt || c.date || "").slice(0, 10) !== today);
    const registeredBefore = (p.registeredAt || p.createdAt || "").slice(0, 10) < today;
    const returning = prior.length > 0 || registeredBefore;
    const last = prior[0];
    setCtx({ returning, count: prior.length, lastDx: last?.diagnosis || undefined, lastDate: (last?.createdAt || last?.date || "").slice(0, 10) || undefined });
    setPurpose(returning ? "suivi" : "nouveau");
  };
  const clearPatient = () => { setPatient(null); setCtx(null); setPurpose(""); setSexSel(""); reset(); };

  const load = async () => {
    setPatients((await decryptPatients(await db.patients.toArray())).filter(p => !p.deleted && inClinic(p.clinicId)));
    const today = new Date().toISOString().slice(0, 10);
    setCount((await db.consultations.toArray()).filter(c => inClinic(c.clinicId) && c.isLatest !== false && (c.createdAt || c.date || "").slice(0, 10) === today).length);
  };
  useEffect(() => { load(); }, []);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return patients.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || (p.patientId || "").toLowerCase().includes(q)).slice(0, 8);
  }, [patients, search]);

  const chosen = ACTES.find(a => a.value === acte);
  const reset = () => { setActe(""); setResult(""); setCpnNum(""); setNotes(""); };

  const save = async () => {
    if (!patient) { toast.error(L.noPatient); return; }
    if (!acte || !chosen) { toast.error(L.pickActe); return; }
    if (chosen.screening && !result) { toast.error(L.pickResult); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const label = lang === "en" ? chosen.en : chosen.fr;
      await db.consultations.add({
        uid: (globalThis.crypto?.randomUUID?.() || String(Date.now())),
        patientId: patient.id!, doctorId: user?.id || 0, date: now,
        symptoms: label, diagnosis: notes.trim(), treatmentPlan: "", prescription: "", notes: "",
        consultType: chosen.consultType, chiefComplaint: label,
        program: chosen.program, programResult: chosen.screening ? (result || undefined) : undefined,
        cpnNumber: chosen.cpn && cpnNum ? parseInt(cpnNum) : undefined,
        visitPurpose: purpose || undefined, isReturning: ctx?.returning, lastDiagnosis: ctx?.lastDx,
        clinicId: cid(), createdAt: now, editedBy: user?.name || "—", isLatest: true,
      } as any);
      // Keep the patient's sex + visit intent in sync for statistics.
      const vt = purpose === "rendezvous" ? "rendezvous" : purpose === "nouveau" ? "new_consultation" : "old_consultation";
      const patch: any = { visitType: vt };
      if (sexSel && sexSel !== patient.sex) patch.sex = sexSel;
      try { await db.patients.update(patient.id!, patch); } catch { /* */ }
      await logAudit("consult_create", user?.name || "—", { resource: "visit", resourceId: patient.patientId, message: `${label}${result ? " · " + result : ""} · ${purpose || ""} · ${patient.firstName} ${patient.lastName}` });
      toast.success(L.saved);
      setCount(n => n + 1);
      reset();
    } catch (e: any) {
      toast.error("Erreur: " + (e?.message || "échec"));
    } finally { setBusy(false); }
  };

  const age = (p: Patient) => {
    if (p.ageYears) return p.ageYears;
    if (p.dob) { const d = new Date(p.dob); if (!isNaN(d.getTime())) return Math.floor((Date.now() - d.getTime()) / 31557600000); }
    return null;
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><Stethoscope className="w-5 h-5 text-primary" /> {L.title}</h1>
        <div className="text-right"><p className="text-3xl font-bold leading-none text-primary">{count}</p><p className="text-[10px] text-muted-foreground">{L.todayCount}</p></div>
      </div>

      {/* Patient */}
      {!patient ? (
        <>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 h-11" placeholder={L.searchPh} value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            {matches.map(p => (
              <Card key={p.id} className="cursor-pointer hover:bg-accent" onClick={() => selectPatient(p)}>
                <CardContent className="p-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0"><p className="font-medium truncate">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">{p.patientId}{age(p) !== null ? ` · ${age(p)} ${L.years}` : ""}</p></div>
                </CardContent>
              </Card>
            ))}
            {!matches.length && <p className="text-sm text-muted-foreground">{L.noPatient}</p>}
          </div>
        </>
      ) : (
        <Card className="border-primary/40 bg-primary/5"><CardContent className="p-3 flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          <div className="flex-1 min-w-0"><p className="font-medium truncate">{patient.firstName} {patient.lastName}</p>
            <p className="text-xs text-muted-foreground">{patient.patientId}{age(patient) !== null ? ` · ${age(patient)} ${L.years}` : ""}</p></div>
          <Button size="sm" variant="ghost" onClick={clearPatient}>{L.change}</Button>
        </CardContent></Card>
      )}

      {patient && ctx && (
        <Card className={ctx.returning ? "border-amber-400/50 bg-amber-50/40" : "border-green-400/50 bg-green-50/40"}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-semibold ${ctx.returning ? "text-amber-700" : "text-green-700"}`}>
                {ctx.returning ? `${L.returning}${ctx.count ? ` · ${ctx.count} ${L.visits}` : ""}` : L.newPatient}
              </span>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant={sexSel === "M" ? "default" : "outline"} className="h-8 w-9 p-0" onClick={() => setSexSel("M")}>M</Button>
                <Button type="button" size="sm" variant={sexSel === "F" ? "default" : "outline"} className="h-8 w-9 p-0" onClick={() => setSexSel("F")}>F</Button>
              </div>
            </div>
            {ctx.returning && (
              <p className="text-xs text-muted-foreground">
                {L.lastDx}: {ctx.lastDx ? <span className="text-foreground">{ctx.lastDx}</span> : <span className="italic">{L.none}</span>}
                {ctx.lastDate ? ` (${ctx.lastDate})` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {patient && (<>
        <Card><CardContent className="p-4 space-y-2">
          <label className="text-sm font-medium">{L.visitTypeLabel}</label>
          <div className="grid grid-cols-2 gap-2">
            {([["nouveau", L.vtNouveau], ["suivi", L.vtSuivi], ["rendezvous", L.vtRdv], ["autre", L.vtAutre]] as const).map(([v, lbl]) => (
              <Button key={v} type="button" variant={purpose === v ? "default" : "outline"} className="h-10 justify-start gap-1.5 text-xs" onClick={() => setPurpose(v)}>
                {purpose === v && <Check className="w-3.5 h-3.5" />}{lbl}
              </Button>
            ))}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4 space-y-2">
          <label className="text-sm font-medium">{L.acte}</label>
          <div className="grid grid-cols-2 gap-2">
            {ACTES.map(a => (
              <Button key={a.value} type="button" variant={acte === a.value ? "default" : "outline"} className="h-11 justify-start gap-1.5 text-xs" onClick={() => { setActe(a.value); setResult(""); setCpnNum(""); }}>
                {acte === a.value && <Check className="w-3.5 h-3.5" />}{lang === "en" ? a.en : a.fr}
              </Button>
            ))}
          </div>
        </CardContent></Card>

        {chosen?.screening && (
          <Card><CardContent className="p-4 space-y-2">
            <label className="text-sm font-medium">{L.result}</label>
            <div className="flex gap-2">
              <Button type="button" variant={result === "negatif" ? "default" : "outline"} className="flex-1 h-11" onClick={() => setResult("negatif")}>{L.negatif}</Button>
              <Button type="button" variant={result === "positif" ? "destructive" : "outline"} className="flex-1 h-11" onClick={() => setResult("positif")}>{L.positif}</Button>
              <Button type="button" variant={result === "indetermine" ? "default" : "outline"} className="flex-1 h-11" onClick={() => setResult("indetermine")}>{L.indetermine}</Button>
            </div>
          </CardContent></Card>
        )}

        {chosen?.cpn && (
          <Card><CardContent className="p-4">
            <label className="text-sm font-medium">{L.cpnNum}</label>
            <div className="flex gap-2 mt-1">
              {[1, 2, 3, 4].map(n => (
                <Button key={n} type="button" variant={cpnNum === String(n) ? "default" : "outline"} className="flex-1 h-11" onClick={() => setCpnNum(String(n))}>{n}</Button>
              ))}
            </div>
          </CardContent></Card>
        )}

        <Card><CardContent className="p-4">
          <label className="text-sm">{L.diagnosis}</label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-11" />
        </CardContent></Card>

        <Button className="w-full h-14 text-base gap-2" onClick={save} disabled={busy}><Check className="w-5 h-5" /> {L.save}</Button>
      </>)}
    </div>
  );
}
