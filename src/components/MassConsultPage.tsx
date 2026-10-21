import { useEffect, useRef, useState } from "react";
import { db, generatePatientId, generateAnonCode, type ConsultationType } from "@/lib/db";
import { encryptPatientForSave } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { logAudit } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Zap, User, Check } from "lucide-react";
import { toast } from "sonner";

// Each motif carries its consultation TYPE, so one tap records both.
interface Motif { value: string; type: ConsultationType; fr: string; en: string; }
const MOTIFS: Motif[] = [
  { value: "general",    type: "general",    fr: "Consultation générale", en: "General consultation" },
  { value: "echography", type: "echography", fr: "Échographie",           en: "Ultrasound" },
  { value: "dental",     type: "dental",     fr: "Consultation dentaire", en: "Dental consultation" },
  { value: "prenatal",   type: "general",    fr: "CPN (prénatale)",       en: "Antenatal (ANC)" },
  { value: "vaccination",type: "general",    fr: "Vaccination",           en: "Vaccination" },
  { value: "familyplan", type: "general",    fr: "Planning familial",     en: "Family planning" },
  { value: "wound",      type: "other",      fr: "Soins / Pansement",     en: "Wound care / Dressing" },
  { value: "other",      type: "other",      fr: "Autre",                 en: "Other" },
];

const DICT = {
  fr: {
    title: "Consultation de masse", todayCount: "enregistrés aujourd'hui",
    name: "Nom complet", age: "Âge", sex: "Sexe", phone: "Téléphone (optionnel)",
    motif: "Motif / Acte (un seul appui)", diagnosis: "Diagnostic (optionnel)",
    save: "Enregistrer & suivant", nameReq: "Nom requis", motifReq: "Choisissez un motif",
    saved: "Enregistré ✓", male: "M", female: "F",
    hint: "Saisie rapide : nom, âge, sexe, un motif — Entrée pour enregistrer.",
  },
  en: {
    title: "Mass consultation", todayCount: "registered today",
    name: "Full name", age: "Age", sex: "Sex", phone: "Phone (optional)",
    motif: "Reason / Act (one tap)", diagnosis: "Diagnosis (optional)",
    save: "Save & next", nameReq: "Name required", motifReq: "Choose a reason",
    saved: "Saved ✓", male: "M", female: "F",
    hint: "Fast entry: name, age, sex, one reason — Enter to save.",
  },
};

function dobFromAge(age: number): string {
  const d = new Date(); d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

export function MassConsultPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const L = DICT[lang] || DICT.fr;
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [phone, setPhone] = useState("");
  const [motif, setMotif] = useState<string>("");
  const [diagnosis, setDiagnosis] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const all = await db.patients.toArray();
      setCount(all.filter(p => !p.deleted && (!cid() || !p.clinicId || String(p.clinicId) === String(cid())) && (p.createdAt || "").slice(0, 10) === today).length);
    })();
    nameRef.current?.focus();
  }, []);

  const reset = () => { setName(""); setAge(""); setSex(""); setPhone(""); setMotif(""); setDiagnosis(""); nameRef.current?.focus(); };

  const motifLabel = (m: Motif) => lang === "en" ? m.en : m.fr;

  const save = async () => {
    if (!name.trim()) { toast.error(L.nameReq); nameRef.current?.focus(); return; }
    if (!motif) { toast.error(L.motifReq); return; }
    setBusy(true);
    try {
      const m = MOTIFS.find(x => x.value === motif)!;
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || "";
      const ageNum = age ? parseInt(age) : undefined;
      const now = new Date().toISOString();
      const label = motifLabel(m);

      const payload = await encryptPatientForSave({
        firstName, lastName, phone: phone.trim(), dob: ageNum !== undefined ? dobFromAge(ageNum) : "",
        address: "", medicalAlerts: "", ageYears: ageNum,
      });
      const patientId = await generatePatientId();
      const uid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const c = cid();
      const newId = await db.patients.add({
        ...(payload as any), uid, deleted: false, patientId, anonCode: generateAnonCode(), clinicId: c,
        sex: sex || undefined,
        registeredBy: user?.name || "—", registeredById: user?.id, registeredAt: now,
        visitType: "new_consultation", reasonForVisit: label,
        createdAt: now, updatedAt: now,
      }) as number;

      await db.consultations.add({
        patientId: newId, doctorId: user?.id || 0, date: now,
        symptoms: label, diagnosis: diagnosis.trim(), treatmentPlan: "", prescription: "", notes: "",
        consultType: m.type, chiefComplaint: label,
        clinicId: c, createdAt: now, editedBy: user?.name || "—", isLatest: true,
      } as any);

      await logAudit("patient_create", user?.name || "—", { resource: "patient", resourceId: patientId, message: `${firstName} ${lastName} · ${label}${sex ? " · " + sex : ""} (masse)` });

      toast.success(L.saved);
      setCount(n => n + 1);
      reset();
    } catch (e: any) {
      toast.error("Erreur: " + (e?.message || "échec"));
    } finally { setBusy(false); }
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } };

  return (
    <div className="space-y-4 max-w-xl mx-auto" onKeyDown={onKey}>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /> {L.title}</h1>
        <div className="text-right">
          <p className="text-3xl font-bold leading-none text-primary">{count}</p>
          <p className="text-[10px] text-muted-foreground">{L.todayCount}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{L.hint}</p>

      <Card><CardContent className="p-4 space-y-3">
        <div>
          <label className="text-sm font-medium flex items-center gap-1"><User className="w-3.5 h-3.5" /> {L.name}</label>
          <Input ref={nameRef} value={name} onChange={e => setName(e.target.value)} className="h-11 text-base" autoFocus />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="text-sm">{L.age}</label><Input type="number" inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} className="h-11 text-base" /></div>
          <div className="col-span-2">
            <label className="text-sm">{L.sex}</label>
            <div className="flex gap-2">
              <Button type="button" variant={sex === "M" ? "default" : "outline"} className="flex-1 h-11" onClick={() => setSex("M")}>{L.male}</Button>
              <Button type="button" variant={sex === "F" ? "default" : "outline"} className="flex-1 h-11" onClick={() => setSex("F")}>{L.female}</Button>
            </div>
          </div>
        </div>
        <div><label className="text-sm">{L.phone}</label><Input value={phone} onChange={e => setPhone(e.target.value)} className="h-11" /></div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-2">
        <label className="text-sm font-medium">{L.motif}</label>
        <div className="grid grid-cols-2 gap-2">
          {MOTIFS.map(m => (
            <Button key={m.value} type="button" variant={motif === m.value ? "default" : "outline"}
              className="h-12 justify-start gap-2 text-sm" onClick={() => setMotif(m.value)}>
              {motif === m.value && <Check className="w-4 h-4" />}{motifLabel(m)}
            </Button>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <label className="text-sm">{L.diagnosis}</label>
        <Input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} className="h-11" />
      </CardContent></Card>

      <Button className="w-full h-14 text-base gap-2" onClick={save} disabled={busy}>
        <Check className="w-5 h-5" /> {L.save}
      </Button>
    </div>
  );
}
