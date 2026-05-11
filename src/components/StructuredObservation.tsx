/**
 * Structured Medical Observation — Francophone African EMR style.
 *
 * 11-section collapsible form. Stores a JSON blob into Consultation.observation
 * and also writes summary text into symptoms/diagnosis/treatmentPlan so the
 * existing PDF/print/list views continue to work.
 *
 * Mobile-first: each section is a collapsible card with completion indicator
 * (grey/orange/green). Auto-save draft to localStorage every 30s.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Sparkles, AlertTriangle } from "lucide-react";
import type { Patient, VitalSigns } from "@/lib/db";
import { ageFromDob, computeBMI } from "@/lib/patientHelpers";

/* ===================== Types ===================== */
export type Specialty = "general" | "pediatrics" | "gyneco" | "surgery" | "other";

export interface ObservationData {
  /* Sec 1 */
  specialty: Specialty;
  consultNumber?: string;
  /* Sec 2 */
  motif: string;
  onset?: "brutal" | "progressive" | "insidious";
  durationValue?: string;
  durationUnit?: "h" | "j" | "sem" | "mois";
  history?: string;
  pain?: number;
  aggravating?: string;
  relieving?: string;
  associatedSigns?: string;
  /* Sec 4 */
  generalState?: "good" | "altered" | "poor";
  consciousness?: "awake" | "drowsy" | "confused" | "obtunded" | "coma";
  generalDesc?: string;
  systems?: Record<string, { text?: string; presents?: string[]; absents?: string[] }>;
  /* Sec 5 */
  syndromes?: { key: string; severity?: "mild" | "moderate" | "severe"; evolution?: "acute" | "subacute" | "chronic"; arguments?: string }[];
  /* Sec 6 */
  primaryDx?: string;
  primaryDxArguments?: string;
  certainty?: "certain" | "probable" | "presumption";
  differentials?: { name: string; status?: "kept" | "ruled_out"; reason?: string }[];
  urgentToRuleOut?: string;
  /* Sec 7 */
  examsRequested?: { name: string; justification?: string }[];
  examsResults?: { name: string; value?: string; abnormal?: boolean; date?: string }[];
  awaitingTreatment?: string;
  examsKept?: string;
  /* Sec 8 */
  workingDx?: string;
  synthesis?: string;
  /* Sec 9 */
  mainProblem?: string;
  secondaryProblems?: string;
  aggravatingFactors?: string;
  therapeuticGoals?: string;
  vigilancePoints?: string;
  /* Sec 10 */
  nonDrugTreatment?: string;
  orientation?: "home" | "hospitalization" | "referral" | "emergency";
  /* Sec 11 */
  nextRdv?: string;
  reconsultCriteria?: string;
  patientEducation?: string;
}

export const SYSTEMS = [
  { key: "cardio", label: "Cardiovasculaire", chips: ["Bruits réguliers", "Souffle", "Œdèmes MI", "Pouls périphériques +"] },
  { key: "resp", label: "Respiratoire", chips: ["MV bilatéral", "Râles crépitants", "Sibilants", "Tirage", "Cyanose"] },
  { key: "neuro", label: "Neurologique", chips: ["Conscient orienté", "ROT présents", "Pas de déficit", "Raideur nuque", "Babinski +"] },
  { key: "abdo", label: "Digestif / Abdominal", chips: ["Souple dépressible", "Sensible", "Défense", "HSM", "Bruits +"] },
  { key: "orl", label: "ORL / Tête-cou", chips: ["Pharynx érythémateux", "Adénopathies", "Otoscopie normale"] },
  { key: "skin", label: "Peau et muqueuses", chips: ["Coloration normale", "Pâleur", "Ictère", "Éruption", "Déshydratation"] },
];

export const SYNDROMES = [
  { group: "Infectieux", items: ["Infectieux", "Septique", "Palustre", "Typhoïdique", "Fébrile isolé"] },
  { group: "Neurologique", items: ["Méningé", "HTIC", "Confusionnel", "Pyramidal", "Comitial"] },
  { group: "Respiratoire", items: ["Condensation", "Épanchement", "Obstructif", "Détresse respiratoire"] },
  { group: "Cardiovasculaire", items: ["IC gauche", "IC droite", "Coronarien aigu", "Choc", "HTA"] },
  { group: "Digestif", items: ["Abdominal aigu", "Occlusif", "Ictérique", "Hémorragie digestive"] },
  { group: "Hématologique", items: ["Anémique", "Hémorragique", "Tumoral"] },
  { group: "Autre", items: ["Déshydratation", "AEG", "Inflammatoire"] },
];

export const QUICK_EXAMS = ["NFS", "CRP", "Glycémie", "TDR Paludisme", "GE", "ECBU", "Rx thorax", "ECG", "Écho abdominale", "PL"];

const PAIN_FACES = ["😀", "🙂", "😐", "😕", "😣", "😖", "😢", "😭", "😱", "🥵", "💀"];

/* ===================== Helpers ===================== */
function bmiCategory(bmi?: number): string | null {
  if (!bmi) return null;
  if (bmi < 18.5) return "Maigreur";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Surpoids";
  return "Obésité";
}

function sectionStatus(filled: number, required: number): "empty" | "partial" | "complete" {
  if (filled === 0) return "empty";
  if (required > 0 && filled >= required) return "complete";
  return "partial";
}

function STATUS_DOT(s: "empty" | "partial" | "complete") {
  const cls = s === "complete" ? "bg-success" : s === "partial" ? "bg-warning" : "bg-muted-foreground/30";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} aria-hidden />;
}

/* ===================== Component ===================== */
interface Props {
  patient?: Patient | null;
  doctorName?: string;
  consultNumber?: string;
  vitals?: VitalSigns;
  value: ObservationData;
  onChange: (next: ObservationData) => void;
  /** Called when a section's free-text mirror should sync to legacy fields */
  onLegacySync?: (legacy: { symptoms?: string; diagnosis?: string; treatmentPlan?: string }) => void;
  draftKey?: string;
}

export function StructuredObservation({
  patient, doctorName, consultNumber, vitals, value, onChange, onLegacySync, draftKey,
}: Props) {
  const v = value;
  const set = (patch: Partial<ObservationData>) => onChange({ ...v, ...patch });

  /* Auto-save draft */
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(v)); } catch {}
    }, 30_000);
    return () => clearTimeout(t);
  }, [v, draftKey]);

  /* Sync mirror fields back to legacy */
  useEffect(() => {
    if (!onLegacySync) return;
    onLegacySync({
      symptoms: [v.motif, v.history].filter(Boolean).join("\n").trim() || undefined,
      diagnosis: v.workingDx || v.primaryDx || undefined,
      treatmentPlan: v.nonDrugTreatment || undefined,
    });
  }, [v.motif, v.history, v.workingDx, v.primaryDx, v.nonDrugTreatment]); // eslint-disable-line

  const age = patient?.ageYears ?? ageFromDob(patient?.dob);
  const bmi = computeBMI(vitals?.weight, vitals?.height);
  const bmiCat = bmiCategory(bmi);

  /* Section completion tracking */
  const sectionStates = useMemo(() => ({
    s2: sectionStatus(+!!v.motif + +!!v.onset + +!!v.history, 2),
    s4: sectionStatus(+!!v.generalState + Object.keys(v.systems || {}).length, 2),
    s5: sectionStatus(v.syndromes?.length || 0, 1),
    s6: sectionStatus(+!!v.primaryDx, 1),
    s7: sectionStatus((v.examsRequested?.length || 0) + (v.examsResults?.length || 0), 1),
    s8: sectionStatus(+!!v.workingDx, 1),
    s9: sectionStatus(+!!v.mainProblem, 1),
    s10: sectionStatus(+!!v.nonDrugTreatment + +!!v.orientation, 1),
    s11: sectionStatus(+!!v.nextRdv + +!!v.reconsultCriteria, 1),
  }), [v]);

  const requiredKeys: (keyof typeof sectionStates)[] = ["s2", "s4", "s8", "s10"];
  const completion = useMemo(() => {
    const total = Object.keys(sectionStates).length;
    const done = Object.values(sectionStates).filter(s => s === "complete").length;
    return Math.round((done / total) * 100);
  }, [sectionStates]);

  /* Auto synthesis */
  const buildSynthesis = (): string => {
    const sex = (patient as any)?.sex || "patient";
    const code = patient?.anonCode || patient?.patientId || "—";
    const ageStr = age ? `${age} ans` : "—";
    const terrain: string[] = [];
    if (patient?.antecedents?.diabetic) terrain.push("diabétique");
    if (patient?.antecedents?.hypertensive) terrain.push("hypertendu");
    if (patient?.antecedents?.smoker) terrain.push("tabagique");
    const terrainStr = terrain.length ? `, ${terrain.join(", ")}, ` : ", ";
    const motif = v.motif || "—";
    const dur = v.durationValue ? `${v.durationValue} ${v.durationUnit || ""}` : "—";
    const synd = (v.syndromes || []).map(s => s.key).join(", ") || "—";
    const exams = (v.examsKept || (v.examsResults || []).map(e => e.name).join(", ")) || "—";
    const dx = v.primaryDx || "—";
    const tx = v.nonDrugTreatment || "Traitement instauré.";
    return `Il s'agit de ${code}, ${sex} de ${ageStr}${terrainStr}admis(e) pour ${motif} depuis ${dur}, présentant ${synd}, chez qui ${exams} confirment ${dx}. ${tx}`;
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Observation médicale</span>
          <span className="font-medium">{completion}%</span>
        </div>
        <Progress value={completion} className="h-2" />
      </div>

      {/* SECTION 1 — IDENTIFICATION */}
      <Section title="1. Identification" status="complete" defaultOpen>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><Label className="text-[10px]">Code anonyme</Label><Input value={patient?.anonCode || patient?.patientId || ""} readOnly className="bg-muted h-8" /></div>
          <div><Label className="text-[10px]">Âge</Label><Input value={age ? `${age} ans` : ""} readOnly className="bg-muted h-8" /></div>
          <div><Label className="text-[10px]">Sexe</Label><Input value={(patient as any)?.sex || "—"} readOnly className="bg-muted h-8" /></div>
          <div><Label className="text-[10px]">Date / heure</Label><Input value={new Date().toLocaleString()} readOnly className="bg-muted h-8" /></div>
          <div><Label className="text-[10px]">Médecin</Label><Input value={doctorName || ""} readOnly className="bg-muted h-8" /></div>
          <div><Label className="text-[10px]">N° consultation</Label><Input value={consultNumber || v.consultNumber || ""} readOnly className="bg-muted h-8" /></div>
        </div>
        <div>
          <Label className="text-[10px]">Spécialité</Label>
          <Select value={v.specialty || "general"} onValueChange={(x) => set({ specialty: x as Specialty })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">Médecine générale</SelectItem>
              <SelectItem value="pediatrics">Pédiatrie</SelectItem>
              <SelectItem value="gyneco">Gynécologie</SelectItem>
              <SelectItem value="surgery">Chirurgie</SelectItem>
              <SelectItem value="other">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {/* SECTION 2 — SYMPTÔMES */}
      <Section title="2. Symptômes" status={sectionStates.s2} required defaultOpen>
        <div>
          <Label className="text-xs">Motif de consultation *</Label>
          <Textarea value={v.motif || ""} onChange={e => set({ motif: e.target.value })} rows={2} placeholder="Raison principale" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Début</Label>
            <Select value={v.onset || ""} onValueChange={(x) => set({ onset: x as any })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brutal">Brutal</SelectItem>
                <SelectItem value="progressive">Progressif</SelectItem>
                <SelectItem value="insidious">Insidieux</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Durée</Label>
            <div className="flex gap-1">
              <Input value={v.durationValue || ""} onChange={e => set({ durationValue: e.target.value })} className="h-9" />
              <Select value={v.durationUnit || "j"} onValueChange={(x) => set({ durationUnit: x as any })}>
                <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="h">heures</SelectItem>
                  <SelectItem value="j">jours</SelectItem>
                  <SelectItem value="sem">sem.</SelectItem>
                  <SelectItem value="mois">mois</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div>
          <Label className="text-xs">Histoire de la maladie</Label>
          <Textarea value={v.history || ""} onChange={e => set({ history: e.target.value })} rows={3} />
        </div>
        <div>
          <Label className="text-xs">EVA douleur: {v.pain ?? 0}/10 {PAIN_FACES[v.pain ?? 0]}</Label>
          <Slider min={0} max={10} step={1} value={[v.pain ?? 0]} onValueChange={([x]) => set({ pain: x })} />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <div><Label className="text-xs">Facteurs aggravants</Label><Input value={v.aggravating || ""} onChange={e => set({ aggravating: e.target.value })} /></div>
          <div><Label className="text-xs">Facteurs soulageants</Label><Input value={v.relieving || ""} onChange={e => set({ relieving: e.target.value })} /></div>
          <div><Label className="text-xs">Signes associés</Label><Input value={v.associatedSigns || ""} onChange={e => set({ associatedSigns: e.target.value })} /></div>
        </div>
      </Section>

      {/* SECTION 3 — ANTÉCÉDENTS */}
      <Section title="3. Antécédents contributifs" status="complete">
        {patient ? <AntecedentsView patient={patient} /> : <p className="text-xs text-muted-foreground">Sélectionnez un patient.</p>}
      </Section>

      {/* SECTION 4 — EXAMEN PHYSIQUE */}
      <Section title="4. Examen physique" status={sectionStates.s4} required>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">État général</Label>
            <Select value={v.generalState || ""} onValueChange={x => set({ generalState: x as any })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Bon</SelectItem>
                <SelectItem value="altered">Altéré</SelectItem>
                <SelectItem value="poor">Mauvais</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Conscience</Label>
            <Select value={v.consciousness || ""} onValueChange={x => set({ consciousness: x as any })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="awake">Éveillé</SelectItem>
                <SelectItem value="drowsy">Somnolent</SelectItem>
                <SelectItem value="confused">Confus</SelectItem>
                <SelectItem value="obtunded">Obnubilé</SelectItem>
                <SelectItem value="coma">Coma</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Textarea value={v.generalDesc || ""} onChange={e => set({ generalDesc: e.target.value })} placeholder="Description état général" rows={2} />

        {/* anthropometry */}
        {bmi && (
          <div className="p-2 bg-muted rounded text-xs flex items-center gap-2">
            <span>IMC: <strong>{bmi}</strong></span>
            {bmiCat && <Badge variant={bmiCat === "Normal" ? "secondary" : "destructive"}>{bmiCat}</Badge>}
          </div>
        )}

        {/* systems */}
        <div className="space-y-2">
          {SYSTEMS.map(sys => {
            const cur = v.systems?.[sys.key] || {};
            const upd = (patch: any) => set({ systems: { ...(v.systems || {}), [sys.key]: { ...cur, ...patch } } });
            const togglePresent = (chip: string) => {
              const arr = cur.presents || [];
              upd({ presents: arr.includes(chip) ? arr.filter((x: string) => x !== chip) : [...arr, chip] });
            };
            const toggleAbsent = (chip: string) => {
              const arr = cur.absents || [];
              upd({ absents: arr.includes(chip) ? arr.filter((x: string) => x !== chip) : [...arr, chip] });
            };
            return (
              <Collapsible key={sys.key}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-8">
                    <span className="text-xs">{sys.label}</span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-2">
                  <Textarea value={cur.text || ""} onChange={e => upd({ text: e.target.value })} placeholder="Description" rows={2} className="text-xs" />
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <div>
                      <p className="text-success font-medium mb-1">Présents ✚</p>
                      {sys.chips.map(c => (
                        <button key={c} type="button" onClick={() => togglePresent(c)} className={`block text-left w-full px-2 py-0.5 rounded mb-1 ${cur.presents?.includes(c) ? "bg-success/20 text-success" : "bg-muted"}`}>{c}</button>
                      ))}
                    </div>
                    <div>
                      <p className="text-destructive font-medium mb-1">Absents ✗</p>
                      {sys.chips.map(c => (
                        <button key={c} type="button" onClick={() => toggleAbsent(c)} className={`block text-left w-full px-2 py-0.5 rounded mb-1 ${cur.absents?.includes(c) ? "bg-destructive/20 text-destructive" : "bg-muted"}`}>{c}</button>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </Section>

      {/* SECTION 5 — SYNDROMES */}
      <Section title="5. Syndromes" status={sectionStates.s5}>
        <div className="space-y-2">
          {SYNDROMES.map(g => (
            <div key={g.group}>
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">{g.group}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map(item => {
                  const sel = v.syndromes?.find(s => s.key === item);
                  const toggle = () => {
                    if (sel) set({ syndromes: v.syndromes!.filter(s => s.key !== item) });
                    else set({ syndromes: [...(v.syndromes || []), { key: item }] });
                  };
                  return (
                    <button key={item} type="button" onClick={toggle} className={`text-xs p-1.5 rounded border ${sel ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}>{item}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {v.syndromes && v.syndromes.length > 0 && (
          <div className="space-y-2 mt-3 pt-3 border-t">
            {v.syndromes.map((s, i) => (
              <div key={s.key} className="border rounded p-2 space-y-1">
                <p className="text-xs font-medium">{s.key}</p>
                <div className="grid grid-cols-2 gap-1">
                  <Select value={s.severity || ""} onValueChange={x => {
                    const copy = [...v.syndromes!]; copy[i] = { ...s, severity: x as any }; set({ syndromes: copy });
                  }}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Sévérité" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mild">Léger</SelectItem>
                      <SelectItem value="moderate">Modéré</SelectItem>
                      <SelectItem value="severe">Sévère</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={s.evolution || ""} onValueChange={x => {
                    const copy = [...v.syndromes!]; copy[i] = { ...s, evolution: x as any }; set({ syndromes: copy });
                  }}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Évolution" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acute">Aigu</SelectItem>
                      <SelectItem value="subacute">Subaigu</SelectItem>
                      <SelectItem value="chronic">Chronique</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input value={s.arguments || ""} onChange={e => {
                  const copy = [...v.syndromes!]; copy[i] = { ...s, arguments: e.target.value }; set({ syndromes: copy });
                }} placeholder="Arguments" className="h-7 text-xs" />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 6 — Dx + différentiels */}
      <Section title="6. Diagnostic possible + Différentiels" status={sectionStates.s6}>
        <div><Label className="text-xs">Diagnostic principal</Label><Input value={v.primaryDx || ""} onChange={e => set({ primaryDx: e.target.value })} /></div>
        <div><Label className="text-xs">Arguments pour</Label><Textarea value={v.primaryDxArguments || ""} onChange={e => set({ primaryDxArguments: e.target.value })} rows={2} /></div>
        <div>
          <Label className="text-xs">Certitude</Label>
          <Select value={v.certainty || ""} onValueChange={x => set({ certainty: x as any })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="certain">Certain</SelectItem>
              <SelectItem value="probable">Probable</SelectItem>
              <SelectItem value="presumption">Présomption</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Diagnostics différentiels</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => set({ differentials: [...(v.differentials || []), { name: "" }] })}>+ Ajouter</Button>
          </div>
          {(v.differentials || []).map((d, i) => (
            <div key={i} className="grid grid-cols-3 gap-1">
              <Input value={d.name} onChange={e => { const copy = [...v.differentials!]; copy[i] = { ...d, name: e.target.value }; set({ differentials: copy }); }} className="h-8 text-xs" placeholder="Nom" />
              <Select value={d.status || ""} onValueChange={x => { const copy = [...v.differentials!]; copy[i] = { ...d, status: x as any }; set({ differentials: copy }); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kept">Retenu</SelectItem>
                  <SelectItem value="ruled_out">Écarté</SelectItem>
                </SelectContent>
              </Select>
              <Input value={d.reason || ""} onChange={e => { const copy = [...v.differentials!]; copy[i] = { ...d, reason: e.target.value }; set({ differentials: copy }); }} className="h-8 text-xs" placeholder="Raison" />
            </div>
          ))}
        </div>
        <div><Label className="text-xs">Diagnostics urgents à éliminer</Label><Textarea value={v.urgentToRuleOut || ""} onChange={e => set({ urgentToRuleOut: e.target.value })} rows={2} /></div>
      </Section>

      {/* SECTION 7 — Examens paracliniques */}
      <Section title="7. Examens paracliniques" status={sectionStates.s7}>
        <div>
          <Label className="text-xs">Examens demandés</Label>
          <div className="flex flex-wrap gap-1 mb-2">
            {QUICK_EXAMS.map(ex => (
              <button key={ex} type="button" onClick={() => set({ examsRequested: [...(v.examsRequested || []), { name: ex }] })} className="text-[11px] px-2 py-0.5 rounded border bg-card hover:bg-accent">+ {ex}</button>
            ))}
          </div>
          {(v.examsRequested || []).map((ex, i) => (
            <div key={i} className="grid grid-cols-2 gap-1 mb-1">
              <Input value={ex.name} onChange={e => { const copy = [...v.examsRequested!]; copy[i] = { ...ex, name: e.target.value }; set({ examsRequested: copy }); }} className="h-7 text-xs" />
              <Input value={ex.justification || ""} onChange={e => { const copy = [...v.examsRequested!]; copy[i] = { ...ex, justification: e.target.value }; set({ examsRequested: copy }); }} placeholder="Justification" className="h-7 text-xs" />
            </div>
          ))}
        </div>
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Résultats disponibles</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => set({ examsResults: [...(v.examsResults || []), { name: "" }] })}>+ Résultat</Button>
          </div>
          {(v.examsResults || []).map((r, i) => (
            <div key={i} className="grid grid-cols-4 gap-1 mb-1 mt-1">
              <Input value={r.name} onChange={e => { const copy = [...v.examsResults!]; copy[i] = { ...r, name: e.target.value }; set({ examsResults: copy }); }} placeholder="Examen" className="h-7 text-xs" />
              <Input value={r.value || ""} onChange={e => { const copy = [...v.examsResults!]; copy[i] = { ...r, value: e.target.value }; set({ examsResults: copy }); }} placeholder="Valeur" className="h-7 text-xs" />
              <button type="button" onClick={() => { const copy = [...v.examsResults!]; copy[i] = { ...r, abnormal: !r.abnormal }; set({ examsResults: copy }); }} className={`text-[10px] rounded border ${r.abnormal ? "bg-destructive/20 text-destructive" : "bg-success/20 text-success"}`}>
                {r.abnormal ? "Anormal" : "Normal"}
              </button>
              <Input type="date" value={r.date || ""} onChange={e => { const copy = [...v.examsResults!]; copy[i] = { ...r, date: e.target.value }; set({ examsResults: copy }); }} className="h-7 text-xs" />
            </div>
          ))}
        </div>
        <div><Label className="text-xs">En attendant les résultats…</Label><Textarea value={v.awaitingTreatment || ""} onChange={e => set({ awaitingTreatment: e.target.value })} rows={2} /></div>
        <div><Label className="text-xs">Examens retenus</Label><Textarea value={v.examsKept || ""} onChange={e => set({ examsKept: e.target.value })} rows={2} /></div>

        {patient && (
          <div className="p-2 bg-warning/10 border border-warning/30 rounded text-xs space-y-1">
            <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Terrain</p>
            {patient.antecedents?.diabetic && <p>⚠️ Diabétique: surveiller glycémie</p>}
            {patient.antecedents?.hypertensive && <p>⚠️ Hypertendu: surveiller TA</p>}
            {patient.antecedents?.allergies?.filter(a => a.severity === "fatal" || a.severity === "severe").map(a => (
              <p key={a.name}>🚨 Allergie {a.name}: éviter</p>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 8 — Diagnostic de travail */}
      <Section title="8. Diagnostic de travail ✓" status={sectionStates.s8} required defaultOpen highlight>
        <div>
          <Label className="text-sm font-bold">Diagnostic de travail *</Label>
          <Input value={v.workingDx || ""} onChange={e => set({ workingDx: e.target.value })} className="text-base font-medium" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs">Synthèse auto-générée</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => set({ synthesis: buildSynthesis() })} className="gap-1 h-7">
              <Sparkles className="w-3 h-3" />Régénérer
            </Button>
          </div>
          <Textarea value={v.synthesis || ""} onChange={e => set({ synthesis: e.target.value })} rows={4} placeholder="Cliquez Régénérer pour synthétiser" />
        </div>
      </Section>

      {/* SECTION 9 — Problématique */}
      <Section title="9. Problématique du patient" status={sectionStates.s9}>
        <div><Label className="text-xs">Problème principal</Label><Input value={v.mainProblem || ""} onChange={e => set({ mainProblem: e.target.value })} /></div>
        <div><Label className="text-xs">Problèmes secondaires</Label><Textarea value={v.secondaryProblems || ""} onChange={e => set({ secondaryProblems: e.target.value })} rows={2} /></div>
        <div><Label className="text-xs">Facteurs aggravants / complicants</Label><Textarea value={v.aggravatingFactors || ""} onChange={e => set({ aggravatingFactors: e.target.value })} rows={2} /></div>
        <div><Label className="text-xs">Objectifs thérapeutiques</Label><Textarea value={v.therapeuticGoals || ""} onChange={e => set({ therapeuticGoals: e.target.value })} rows={2} /></div>
        <div><Label className="text-xs">Points de vigilance</Label><Textarea value={v.vigilancePoints || ""} onChange={e => set({ vigilancePoints: e.target.value })} rows={2} /></div>
      </Section>

      {/* SECTION 10 — Traitement */}
      <Section title="10. Traitement (T3)" status={sectionStates.s10} required>
        {patient?.antecedents?.allergies?.some(a => a.severity === "fatal" || a.severity === "severe") && (
          <div className="bg-destructive text-destructive-foreground rounded p-2 text-xs flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" />⚠️ Vérifier allergies avant prescription
          </div>
        )}
        <div><Label className="text-xs">Traitement non médicamenteux</Label><Textarea value={v.nonDrugTreatment || ""} onChange={e => set({ nonDrugTreatment: e.target.value })} rows={2} /></div>
        <div>
          <Label className="text-xs">Orientation</Label>
          <Select value={v.orientation || ""} onValueChange={x => set({ orientation: x as any })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="home">Domicile</SelectItem>
              <SelectItem value="hospitalization">Hospitalisation</SelectItem>
              <SelectItem value="referral">Référence</SelectItem>
              <SelectItem value="emergency">Urgences</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">L'ordonnance médicamenteuse reste dans le champ <em>Prescription</em> ci-dessous.</p>
      </Section>

      {/* SECTION 11 — Suivi */}
      <Section title="11. Suivi" status={sectionStates.s11}>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">Prochain RDV</Label><Input type="date" value={v.nextRdv || ""} onChange={e => set({ nextRdv: e.target.value })} /></div>
        </div>
        <div><Label className="text-xs">Critères de reconsultation</Label><Textarea value={v.reconsultCriteria || ""} onChange={e => set({ reconsultCriteria: e.target.value })} rows={2} /></div>
        <div><Label className="text-xs">Éducation du patient</Label><Textarea value={v.patientEducation || ""} onChange={e => set({ patientEducation: e.target.value })} rows={2} /></div>
      </Section>
    </div>
  );
}

/* ===================== Sub-components ===================== */
function Section({
  title, children, status, required, defaultOpen, highlight,
}: {
  title: string;
  children: React.ReactNode;
  status: "empty" | "partial" | "complete";
  required?: boolean;
  defaultOpen?: boolean;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-accent/50">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {STATUS_DOT(status)}
                {title}
                {required && <span className="text-destructive">*</span>}
              </span>
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-3 pt-0 space-y-3">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function AntecedentsView({ patient }: { patient: Patient }) {
  const a = patient.antecedents || {};
  return (
    <div className="space-y-2 text-xs">
      {a.chronicDiseases && a.chronicDiseases.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.chronicDiseases.map(d => <Badge key={d} variant="secondary">{d}</Badge>)}
        </div>
      )}
      {a.allergies && a.allergies.length > 0 && (
        <div>
          <p className="font-medium mb-1">Allergies:</p>
          <div className="flex flex-wrap gap-1">
            {a.allergies.map(al => (
              <Badge key={al.name} variant={al.severity === "fatal" || al.severity === "severe" ? "destructive" : "outline"}>
                {(al.severity === "fatal" || al.severity === "severe") && "🚨 "}{al.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {a.diabetic && <Badge>Diabétique</Badge>}
        {a.hypertensive && <Badge>Hypertendu</Badge>}
        {a.smoker && <Badge>Tabagique</Badge>}
        {a.bloodType && <Badge variant="outline">Groupe {a.bloodType}</Badge>}
      </div>
      {(!a.chronicDiseases?.length && !a.allergies?.length && !a.diabetic && !a.hypertensive && !a.smoker) && (
        <p className="text-muted-foreground">Aucun antécédent renseigné. Voir dossier complet.</p>
      )}
    </div>
  );
}
