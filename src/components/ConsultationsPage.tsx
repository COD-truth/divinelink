import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, type Consultation, type ConsultationImage, type ConsultationImageType, type Patient, type VitalSigns, type ConsultationType } from "@/lib/db";
import { computeBMI, hasFatalAllergy, joinFullName, ageFromDob } from "@/lib/patientHelpers";
import { TriangleAlert as AlertTri, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Printer, Pencil as Edit, Trash2, History, TriangleAlert as AlertTriangle, Upload, X, Pencil, GitCompareArrows, Download, Smile, Stethoscope, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { compressImage } from "@/lib/imageUtils";
import { decryptPatients } from "@/lib/patientCrypto";
import { AnnotateImageModal } from "@/components/AnnotateImageModal";
import { BeforeAfterCompare } from "@/components/BeforeAfterCompare";
import { saveFile, withDateStamp } from "@/lib/download";
import { formatDateTime } from "@/lib/dateFormat";

// ─── Types ─────────────────────────────────────────────────────────────────

interface DifferentialEntry { name: string; status: "retained" | "eliminated" }
interface SyndromeEntry { name: string; category: string; severite?: string; evolution?: string }
interface ParaclinicalEntry { name: string; result?: string; normal?: boolean | null }
interface ProblemEntry { text: string }
interface ObsForm {
  // Section 1 — Identification
  specialty: string;
  // Section 2 — Symptoms
  motif: string;
  onsetType: string;
  durationText: string;
  histoire: string;
  eva: number;
  aggravating: string;
  relieving: string;
  associated: string;
  // Section 4 — Physical exam
  etatGeneral: string;
  consciousness: string;
  systemeFindings: string;
  // Section 5 — Syndromes
  syndromes: SyndromeEntry[];
  // Section 6 — Diagnosis
  primaryDx: string;
  certainty: string;
  differentials: DifferentialEntry[];
  urgentToEliminate: string;
  // Section 7 — Paraclinical
  paraclinical: ParaclinicalEntry[];
  therapeuticAwaiting: string;
  // Section 8 — Working diagnosis
  workingDx: string;
  // Section 9 — Problematique
  problems: ProblemEntry[];
  complicatingFactors: string;
  objectives: string;
  watchPoints: string;
  // Section 10 — Treatment
  orientation: string;
  nonDrugTreatment: string;
  // Section 11 — Follow-up
  nextRdv: string;
  reconsultCriteria: string;
  patientEducation: string;
  // Existing fields preserved
  patientId: string;
  symptoms: string;
  diagnosis: string;
  treatmentPlan: string;
  prescription: string;
  notes: string;
  images: ConsultationImage[];
  vitals: VitalSigns;
  consultType: ConsultationType;
  template: string;
}

type ConsultationWithMeta = Consultation & { patientName: string };

// ─── Constants ──────────────────────────────────────────────────────────────

const SPECIALTIES = [
  "Médecine générale", "Pédiatrie", "Chirurgie", "Gynécologie", "Cardiologie",
  "Neurologie", "Pneumologie", "Gastroentérologie", "Ophtalmologie", "ORL",
  "Dermatologie", "Urologie", "Rhumatologie", "Endocrinologie", "Psychiatrie",
  "Oncologie", "Infectiologie", "Traumatologie", "Dentisterie", "Autre",
];

const ONSET_OPTIONS = [
  { value: "brutal", label: "Brutal" },
  { value: "progressif", label: "Progressif" },
  { value: "progressif_rapide", label: "Progressif rapide" },
  { value: "insidieux", label: "Insidieux" },
];

const ETAT_GENERAL_OPTIONS = ["Bon", "Altéré", "Mauvais", "Critique"];
const CONSCIOUSNESS_OPTIONS = ["Conscient", "Somnolent", "Confus", "Stupeur", "Coma"];

const SYNDROME_CATEGORIES = [
  { category: "infectieux", syndromes: ["Syndrome infectieux", "Syndrome septicémique", "Syndrome méningé", "Syndrome palustre"] },
  { category: "neurologique", syndromes: ["Syndrome d'hypertension intracrânienne", "Syndrome pyramidal", "Syndrome cérébelleux", "Syndrome extrapyramidal", "Syndrome confusionnel"] },
  { category: "respiratoire", syndromes: ["Syndrome d'épanchement pleural", "Syndrome de condensation", "Syndrome broncho-obstructif", "Syndrome de détresse respiratoire"] },
  { category: "cardiovasculaire", syndromes: ["Syndrome coronarien", "Syndrome d'insuffisance cardiaque", "Syndrome hémorragique", "Syndrome thromboembolique"] },
  { category: "digestif", syndromes: ["Syndrome douloureux abdominal", "Syndrome occlusif", "Syndrome hémorragique digestif", "Syndrome ictérique", "Syndrome de malabsorption"] },
  { category: "hématologique", syndromes: ["Syndrome anémique", "Syndrome hémorragique", "Syndrome ganglionnaire", "Pancytopénie"] },
  { category: "autre", syndromes: ["Syndrome douloureux chronique", "Syndrome métabolique", "Syndrome inflammatoire"] },
];

const CERTAINTY_LEVELS = [
  { value: "certain", label: "Certain", color: "bg-green-100 text-green-800" },
  { value: "probable", label: "Probable", color: "bg-yellow-100 text-yellow-800" },
  { value: "possible", label: "Possible", color: "bg-orange-100 text-orange-800" },
  { value: "incertain", label: "Incertain", color: "bg-red-100 text-red-800" },
];

const ORIENTATION_OPTIONS = [
  { value: "domicile", label: "Retour à domicile" },
  { value: "hospitalisation", label: "Hospitalisation" },
  { value: "reference", label: "Référence spécialiste" },
  { value: "urgences", label: "Transfert urgences" },
];

const QUICK_PARACLINICAL = [
  "NFS", "CRP", "VS", "Glycémie", "Créatinine", "Uricémie", "Bilirubine",
  "Transaminases", "Radiographie thorax", "ECG", "Échographie abdominale",
  "TDM cérébral", "Bandelette urinaire", "Test paludisme (TDR)", "Hémoculture",
  "Ionogramme", "TP/TCA", "Groupe sanguin",
];

const EVA_FACES = ["😊", "🙂", "😐", "😕", "😟", "😣", "😖", "😫", "😩", "🤯", "💀"];

const EMPTY_FORM: ObsForm = {
  specialty: "Médecine générale",
  motif: "",
  onsetType: "",
  durationText: "",
  histoire: "",
  eva: 0,
  aggravating: "",
  relieving: "",
  associated: "",
  etatGeneral: "",
  consciousness: "",
  systemeFindings: "",
  syndromes: [],
  primaryDx: "",
  certainty: "",
  differentials: [],
  urgentToEliminate: "",
  paraclinical: [],
  therapeuticAwaiting: "",
  workingDx: "",
  problems: [],
  complicatingFactors: "",
  objectives: "",
  watchPoints: "",
  orientation: "",
  nonDrugTreatment: "",
  nextRdv: "",
  reconsultCriteria: "",
  patientEducation: "",
  patientId: "",
  symptoms: "",
  diagnosis: "",
  treatmentPlan: "",
  prescription: "",
  notes: "",
  images: [],
  vitals: {},
  consultType: "general",
  template: "",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateConsultNumber(seq: number): string {
  return `CONS-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
}

function generateSynthesis(form: ObsForm, patient: Patient | undefined): string {
  const age = patient ? (ageFromDob(patient.dob) ?? patient.ageYears ?? "?") : "?";
  const sex = ""; // Patient sex field not in db, leave blank
  const onset = form.onsetType ? `, à début ${form.onsetType}` : "";
  const duration = form.durationText ? `, évoluant depuis ${form.durationText}` : "";
  const motif = form.motif || "motif non précisé";
  const syndromeNames = form.syndromes.map(s => s.name).join(", ");
  const syndromesPart = syndromeNames ? `, avec ${syndromeNames}` : "";
  const dx = form.primaryDx || form.diagnosis || "diagnostic en cours";
  const certain = form.certainty ? ` (${form.certainty})` : "";
  return `Patient de ${age} ans${sex}${onset}${duration}, consulte pour ${motif}${syndromesPart}. Diagnostic retenu : ${dx}${certain}.`;
}

function sectionCompletion(section: number, form: ObsForm): boolean {
  switch (section) {
    case 1: return !!form.specialty && !!form.patientId;
    case 2: return !!form.motif;
    case 3: return true;
    case 4: return !!form.etatGeneral || !!form.vitals.bp;
    case 5: return form.syndromes.length > 0;
    case 6: return !!form.primaryDx || !!form.diagnosis;
    case 7: return form.paraclinical.length > 0;
    case 8: return !!form.workingDx;
    case 9: return form.problems.length > 0;
    case 10: return !!form.orientation || !!form.treatmentPlan;
    case 11: return !!form.nextRdv;
    default: return false;
  }
}

function formToConsultFields(form: ObsForm): Partial<Consultation> {
  const obs = {
    specialty: form.specialty,
    motif: form.motif,
    onsetType: form.onsetType,
    durationText: form.durationText,
    histoire: form.histoire,
    eva: form.eva,
    aggravating: form.aggravating,
    relieving: form.relieving,
    associated: form.associated,
    etatGeneral: form.etatGeneral,
    consciousness: form.consciousness,
    systemeFindings: form.systemeFindings,
    syndromes: form.syndromes,
    primaryDx: form.primaryDx,
    certainty: form.certainty,
    differentials: form.differentials,
    urgentToEliminate: form.urgentToEliminate,
    paraclinical: form.paraclinical,
    therapeuticAwaiting: form.therapeuticAwaiting,
    workingDx: form.workingDx,
    problems: form.problems,
    complicatingFactors: form.complicatingFactors,
    objectives: form.objectives,
    watchPoints: form.watchPoints,
    orientation: form.orientation,
    nonDrugTreatment: form.nonDrugTreatment,
    nextRdv: form.nextRdv,
    reconsultCriteria: form.reconsultCriteria,
    patientEducation: form.patientEducation,
  };
  return {
    symptoms: form.symptoms || form.motif,
    diagnosis: form.diagnosis || form.primaryDx,
    treatmentPlan: form.treatmentPlan,
    prescription: form.prescription,
    notes: JSON.stringify(obs),
    vitals: form.vitals,
    images: form.images,
    consultType: form.consultType,
    template: form.template || undefined,
  };
}

function consultToForm(c: Consultation): ObsForm {
  let obs: Partial<ObsForm> = {};
  try {
    if (c.notes && c.notes.startsWith("{")) obs = JSON.parse(c.notes);
  } catch { /* legacy plain text notes */ }
  return {
    ...EMPTY_FORM,
    ...obs,
    patientId: c.patientId.toString(),
    symptoms: c.symptoms,
    diagnosis: c.diagnosis,
    treatmentPlan: c.treatmentPlan,
    prescription: c.prescription,
    notes: obs.notes ?? (c.notes && !c.notes.startsWith("{") ? c.notes : ""),
    images: (c.images || []).map(i => ({ ...i, imgType: i.imgType ?? "other" })),
    vitals: c.vitals || {},
    consultType: c.consultType || "general",
    template: c.template || "",
    motif: obs.motif ?? c.symptoms,
    primaryDx: obs.primaryDx ?? c.diagnosis,
    workingDx: obs.workingDx ?? "",
  };
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

interface SectionProps {
  num: number;
  title: string;
  complete: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ num, title, complete, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${complete ? "bg-green-500 text-white" : "bg-orange-400 text-white"}`}>
          {num}
        </span>
        <span className="flex-1 font-semibold text-sm">{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${complete ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
          {complete ? "✓" : "—"}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 space-y-4 border-t">{children}</div>}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function ConsultationsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [consultations, setConsultations] = useState<ConsultationWithMeta[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [printDialog, setPrintDialog] = useState<Consultation | null>(null);
  const [historyDialog, setHistoryDialog] = useState<ConsultationWithMeta[] | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [form, setForm] = useState<ObsForm>(EMPTY_FORM);
  const [consultNumber, setConsultNumber] = useState("");
  const [previewImg, setPreviewImg] = useState<ConsultationImage | null>(null);
  const [selectedImgIds, setSelectedImgIds] = useState<string[]>([]);
  const [annotateImg, setAnnotateImg] = useState<ConsultationImage | null>(null);
  const [compareDialog, setCompareDialog] = useState<{ before: ConsultationImage; after: ConsultationImage } | null>(null);
  const [dxOpen, setDxOpen] = useState(false);
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const DRAFT_KEY = "divinelink.consultDraft";

  const load = useCallback(async () => {
    const allPatients = await decryptPatients(await db.patients.toArray());
    setPatients(allPatients);
    const all = await db.consultations.where("isLatest").equals(1).reverse().toArray();
    const fallback = all.length === 0 ? await db.consultations.reverse().toArray() : all;
    setConsultations(fallback.filter(c => c.isLatest !== false).map(c => {
      const p = allPatients.find(p => p.id === c.patientId);
      return { ...c, patientName: p ? `${p.firstName} ${p.lastName}` : "—" };
    }));
  }, []);

  useEffect(() => { load(); }, [load]);

  const startAutosave = useCallback((getForm: () => ObsForm) => {
    if (autosaveRef.current) clearInterval(autosaveRef.current);
    autosaveRef.current = setInterval(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(getForm()));
        toast.info(t("obs.autosaved"), { duration: 1500 });
      } catch { /* ignore */ }
    }, 30000);
  }, [t]);

  useEffect(() => () => { if (autosaveRef.current) clearInterval(autosaveRef.current); }, []);

  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  const openNew = async () => {
    setEditingId(null);
    const draft = (() => { try { const d = localStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) : null; } catch { return null; } })();
    const seq = (await db.consultations.count()) + 1;
    setConsultNumber(generateConsultNumber(seq));
    setForm(draft ?? { ...EMPTY_FORM });
    setSelectedImgIds([]);
    setDialogOpen(true);
    startAutosave(() => formRef.current);
  };

  const openEdit = (c: Consultation) => {
    setEditingId(c.id!);
    setForm(consultToForm(c));
    setConsultNumber(`CONS-${new Date(c.createdAt || c.date).getFullYear()}-????`);
    setSelectedImgIds([]);
    setDialogOpen(true);
    startAutosave(() => formRef.current);
  };

  const closeDialog = () => {
    if (autosaveRef.current) clearInterval(autosaveRef.current);
    setDialogOpen(false);
  };

  const setFormField = <K extends keyof ObsForm>(key: K, value: ObsForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  // ── Image helpers ──
  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      const newImages: ConsultationImage[] = [];
      for (const file of files) {
        const data = await compressImage(file);
        newImages.push({ id: crypto.randomUUID(), filename: file.name, data, uploadedAt: new Date().toISOString(), caption: "", imgType: "other" });
      }
      setForm(f => ({ ...f, images: [...f.images, ...newImages] }));
    } catch { toast.error("Image error"); }
    e.target.value = "";
  };

  const removeImage = (id: string) => {
    setForm(f => ({ ...f, images: f.images.filter(i => i.id !== id).map(i => i.pairedWith === id ? { ...i, pairedWith: undefined } : i) }));
    setSelectedImgIds(s => s.filter(x => x !== id));
  };

  const updateCaption = (id: string, caption: string) => setForm(f => ({ ...f, images: f.images.map(i => i.id === id ? { ...i, caption } : i) }));
  const updateImgType = (id: string, imgType: ConsultationImageType) => setForm(f => ({ ...f, images: f.images.map(i => i.id === id ? { ...i, imgType } : i) }));
  const toggleSelect = (id: string) => setSelectedImgIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const canPair = useMemo(() => {
    if (selectedImgIds.length !== 2) return false;
    const sel = form.images.filter(i => selectedImgIds.includes(i.id));
    const types = sel.map(i => i.imgType).sort();
    return types[0] === "after" && types[1] === "before";
  }, [selectedImgIds, form.images]);

  const pairSelected = () => {
    if (!canPair) return;
    const [a, b] = form.images.filter(i => selectedImgIds.includes(i.id));
    setForm(f => ({ ...f, images: f.images.map(i => i.id === a.id ? { ...i, pairedWith: b.id } : i.id === b.id ? { ...i, pairedWith: a.id } : i) }));
    setSelectedImgIds([]);
    toast.success(t("img.paired"));
  };

  const unpair = (id: string) => {
    const target = form.images.find(i => i.id === id);
    if (!target?.pairedWith) return;
    const otherId = target.pairedWith;
    setForm(f => ({ ...f, images: f.images.map(i => (i.id === id || i.id === otherId) ? { ...i, pairedWith: undefined } : i) }));
  };

  const openCompare = (img: ConsultationImage) => {
    if (!img.pairedWith) return;
    const other = form.images.find(i => i.id === img.pairedWith);
    if (!other) return;
    const before = img.imgType === "before" ? img : other;
    const after = img.imgType === "after" ? img : other;
    setCompareDialog({ before, after });
  };

  const saveAnnotation = (dataUrl: string) => {
    if (!annotateImg) return;
    const newImg: ConsultationImage = {
      id: crypto.randomUUID(),
      filename: `annotation-${annotateImg.filename}`,
      data: dataUrl,
      uploadedAt: new Date().toISOString(),
      caption: `Annotation of ${annotateImg.filename}`,
      imgType: "annotation",
      annotationOf: annotateImg.id,
    };
    setForm(f => ({ ...f, images: [...f.images, newImg] }));
    setAnnotateImg(null);
    toast.success(t("annotate.save"));
  };

  const exportConsultJson = async (c: ConsultationWithMeta) => {
    const json = JSON.stringify(c, null, 2);
    const ok = await saveFile(withDateStamp(`consultation_${c.patientName.replace(/\s+/g, "_")}.json`), json, "json");
    if (ok) toast.success(t("download.done"));
  };

  const save = async () => {
    if (!form.patientId) return;
    const now = new Date().toISOString();
    const fields = formToConsultFields(form);

    if (editingId) {
      const old = await db.consultations.get(editingId);
      if (old) {
        await db.consultations.update(editingId, { isLatest: false });
        const originalId = old.originalId || old.id!;
        await db.consultations.add({
          ...fields,
          patientId: parseInt(form.patientId),
          doctorId: user!.id!,
          date: now,
          createdAt: now,
          originalId,
          isLatest: true,
          versionNumber: (old.versionNumber || 1) + 1,
          editedAt: now,
          editedBy: user!.name,
        } as Consultation);
      }
      toast.success(t("consult.updated"));
    } else {
      const id = await db.consultations.add({
        ...fields,
        patientId: parseInt(form.patientId),
        doctorId: user!.id!,
        date: now,
        createdAt: now,
        versionNumber: 1,
      } as Consultation);
      await db.consultations.update(id as number, { originalId: id as number });
      toast.success(t("consult.new"));
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    closeDialog();
    load();
  };

  const handleDelete = async (id: number) => {
    const c = await db.consultations.get(id);
    if (c) {
      const origId = c.originalId || c.id!;
      await db.consultations.where("originalId").equals(origId).delete();
      await db.consultations.delete(origId);
    }
    setDeleteConfirm(null);
    toast.success(t("common.delete"));
    load();
  };

  const showHistory = async (c: Consultation) => {
    const origId = c.originalId || c.id!;
    const allPatients = await decryptPatients(await db.patients.toArray());
    const versions = await db.consultations.where("originalId").equals(origId).reverse().toArray();
    const orig = await db.consultations.get(origId);
    const allVersions = orig && !versions.find(v => v.id === orig.id) ? [...versions, orig] : versions;
    setHistoryDialog(allVersions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(v => {
      const p = allPatients.find(p => p.id === v.patientId);
      return { ...v, patientName: p ? `${p.firstName} ${p.lastName}` : "—" };
    }));
  };

  const handlePrint = (c: Consultation) => {
    setPrintDialog(c);
    setTimeout(() => window.print(), 300);
  };

  const selPat = patients.find(p => p.id?.toString() === form.patientId);
  const hasFatal = hasFatalAllergy(selPat);

  // Progress
  const sections = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const completedSections = sections.filter(n => sectionCompletion(n, form)).length;
  const progressPct = Math.round((completedSections / sections.length) * 100);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{t("consult.new")}</Button>
      </div>

      {consultations.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t("common.noData")}</p>
      ) : (
        <div className="grid gap-3">
          {consultations.map(c => {
            let obs: Partial<ObsForm> = {};
            try { if (c.notes?.startsWith("{")) obs = JSON.parse(c.notes); } catch { /* */ }
            return (
              <Card key={c.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{c.patientName}</p>
                      <p className="text-xs text-muted-foreground">{t("ts.created")}: {formatDateTime(c.createdAt || c.date)}</p>
                      {c.editedAt && (
                        <p className="text-xs text-muted-foreground">{t("ts.lastEdited")}: {formatDateTime(c.editedAt)}{c.editedBy ? ` ${t("ts.by")} ${c.editedBy}` : ""}</p>
                      )}
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {obs.specialty && (
                          <Badge variant="outline" className="text-xs">{obs.specialty}</Badge>
                        )}
                        {obs.motif && (
                          <span className="text-xs text-muted-foreground">Motif: {obs.motif}</span>
                        )}
                        {c.versionNumber && c.versionNumber > 1 && (
                          <Badge variant="secondary" className="text-xs">v{c.versionNumber}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 no-print flex-shrink-0">
                      {(c.originalId || c.parentId) && (
                        <Button variant="ghost" size="sm" onClick={() => showHistory(c)} title={t("consult.viewVersions")}><History className="w-4 h-4" /></Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title={t("common.edit")}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => exportConsultJson(c)} title={t("download.consultJson")}><Download className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handlePrint(c)} title={t("consult.print")}><Printer className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(c.id!)} className="text-destructive" title={t("common.delete")}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  {(obs.primaryDx || c.diagnosis) && (
                    <p className="text-sm"><span className="font-medium">{t("consult.diagnosis")}:</span> {obs.primaryDx || c.diagnosis}</p>
                  )}
                  {(obs.orientation || c.treatmentPlan) && (
                    <p className="text-sm"><span className="font-medium">{t("obs.orientation")}:</span> {obs.orientation || c.treatmentPlan}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Observation dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Stethoscope className="w-5 h-5" />
              {editingId ? t("consult.edit") : t("consult.new")}
              {consultNumber && <span className="ml-auto text-xs font-mono text-muted-foreground">{consultNumber}</span>}
            </DialogTitle>
          </DialogHeader>

          {/* Mobile progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completedSections}/{sections.length} sections</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {hasFatal && (
            <div className="bg-destructive text-destructive-foreground rounded-md px-3 py-2 flex items-center gap-2 font-bold text-sm">
              <AlertTri className="w-4 h-4" /> {t("ant.fatalWarning")}
              {selPat?.antecedents?.allergies?.filter(a => a.severity === "fatal").map(a => a.name).join(", ") &&
                <span className="font-normal">— {selPat!.antecedents!.allergies!.filter(a => a.severity === "fatal").map(a => a.name).join(", ")}</span>}
            </div>
          )}

          <div className="space-y-3">

            {/* ─ Section 1: Identification ─ */}
            <Section num={1} title={t("obs.section1")} complete={sectionCompletion(1, form)} defaultOpen={true}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("apt.patient")} *</Label>
                  <Select value={form.patientId} onValueChange={v => setFormField("patientId", v)} disabled={!!editingId}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>
                      {patients.map(p => (
                        <SelectItem key={p.id} value={p.id!.toString()}>{joinFullName(p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("obs.specialty")}</Label>
                  <Select value={form.specialty} onValueChange={v => setFormField("specialty", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SPECIALTIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selPat && (
                <div className="grid grid-cols-3 gap-2 text-xs bg-muted/30 rounded-md p-3">
                  <div><span className="text-muted-foreground">Code: </span>{selPat.anonCode || "—"}</div>
                  <div><span className="text-muted-foreground">Âge: </span>{ageFromDob(selPat.dob) ?? selPat.ageYears ?? "?"} ans</div>
                  <div><span className="text-muted-foreground">Médecin: </span>{user?.name}</div>
                </div>
              )}
              <div>
                <Label>{t("consult.type")}</Label>
                <Select value={form.consultType} onValueChange={v => setFormField("consultType", v as ConsultationType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">{t("consult.type.general")}</SelectItem>
                    <SelectItem value="dental">{t("consult.type.dental")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Section>

            {/* ─ Section 2: Symptômes ─ */}
            <Section num={2} title={t("obs.section2")} complete={sectionCompletion(2, form)}>
              <div>
                <Label>{t("obs.motif")} *</Label>
                <Input value={form.motif} onChange={e => setFormField("motif", e.target.value)} placeholder="Ex: fièvre, céphalées, douleur abdominale..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("obs.onset")}</Label>
                  <Select value={form.onsetType} onValueChange={v => setFormField("onsetType", v)}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                      {ONSET_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("obs.duration")}</Label>
                  <Input value={form.durationText} onChange={e => setFormField("durationText", e.target.value)} placeholder="Ex: 3 jours, 2 semaines..." />
                </div>
              </div>
              <div>
                <Label>{t("obs.histoire")}</Label>
                <Textarea rows={3} value={form.histoire} onChange={e => setFormField("histoire", e.target.value)} placeholder="Description chronologique de la maladie actuelle..." />
              </div>
              <div>
                <Label>{t("obs.eva")} — {EVA_FACES[form.eva]} {form.eva}/10</Label>
                <Slider min={0} max={10} step={1} value={[form.eva]}
                  onValueChange={([v]) => setFormField("eva", v)}
                  className="mt-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>0 Aucune</span><span>5 Modérée</span><span>10 Max</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("obs.aggravating")}</Label>
                  <Input value={form.aggravating} onChange={e => setFormField("aggravating", e.target.value)} />
                </div>
                <div>
                  <Label>{t("obs.relieving")}</Label>
                  <Input value={form.relieving} onChange={e => setFormField("relieving", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>{t("obs.associated")}</Label>
                <Input value={form.associated} onChange={e => setFormField("associated", e.target.value)} placeholder="Ex: nausées, vomissements, frissons..." />
              </div>
            </Section>

            {/* ─ Section 3: Antécédents (auto-filled) ─ */}
            <Section num={3} title={t("obs.section3")} complete={sectionCompletion(3, form)}>
              {selPat?.antecedents ? (
                <div className="space-y-3">
                  {selPat.antecedents.allergies && selPat.antecedents.allergies.length > 0 && (
                    <div>
                      <Label className="text-sm">{t("ant.allergies")}</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selPat.antecedents.allergies.map((a, i) => (
                          <Badge key={i} variant={a.severity === "fatal" ? "destructive" : "secondary"} className="gap-1">
                            {a.severity === "fatal" && "🚨 "}
                            {a.name} — {a.severity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selPat.antecedents.chronicDiseases && selPat.antecedents.chronicDiseases.length > 0 && (
                    <div>
                      <Label className="text-sm">{t("ant.chronic")}</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selPat.antecedents.chronicDiseases.map((d, i) => <Badge key={i} variant="outline">{d}</Badge>)}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {selPat.antecedents.diabetic && <Badge variant="secondary">Diabétique</Badge>}
                    {selPat.antecedents.hypertensive && <Badge variant="secondary">Hypertendu</Badge>}
                    {selPat.antecedents.smoker && <Badge variant="secondary">Fumeur</Badge>}
                    {selPat.antecedents.bloodType && <Badge variant="outline">Gr. {selPat.antecedents.bloodType}</Badge>}
                  </div>
                  {selPat.antecedents.familyHistory && (
                    <p className="text-xs text-muted-foreground"><strong>ATCD familiaux:</strong> {selPat.antecedents.familyHistory}</p>
                  )}
                  {selPat.antecedents.surgeries && (
                    <p className="text-xs text-muted-foreground"><strong>Chirurgies:</strong> {selPat.antecedents.surgeries}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {selPat ? "Antécédents non renseignés dans la fiche patient." : "Sélectionnez un patient pour afficher les antécédents."}
                </p>
              )}
            </Section>

            {/* ─ Section 4: Examen physique ─ */}
            <Section num={4} title={t("obs.section4")} complete={sectionCompletion(4, form)}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("obs.etatGeneral")}</Label>
                  <Select value={form.etatGeneral} onValueChange={v => setFormField("etatGeneral", v)}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                      {ETAT_GENERAL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("obs.consciousness")}</Label>
                  <Select value={form.consciousness} onValueChange={v => setFormField("consciousness", v)}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                      {CONSCIOUSNESS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Vitals */}
              <div className="border rounded-md p-3 space-y-2">
                <Label className="text-sm font-semibold">{t("vit.title")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "bp", label: t("vit.bp"), placeholder: "120/80", type: "text" },
                    { key: "temperature", label: t("vit.temp"), placeholder: "37.0", type: "number" },
                    { key: "pulse", label: t("vit.pulse"), placeholder: "72", type: "number" },
                    { key: "weight", label: t("vit.weight"), placeholder: "70", type: "number" },
                    { key: "height", label: t("vit.height"), placeholder: "170", type: "number" },
                    { key: "spo2", label: t("vit.spo2"), placeholder: "98", type: "number" },
                    { key: "respRate", label: t("vit.rr"), placeholder: "16", type: "number" },
                  ].map(({ key, label, placeholder, type }) => {
                    const alertClass = (() => {
                      const v = (form.vitals as any)[key];
                      if (!v) return "";
                      if (key === "temperature" && v > 38.5) return "border-red-400";
                      if (key === "pulse" && (v < 50 || v > 120)) return "border-orange-400";
                      if (key === "spo2" && v < 94) return "border-red-400";
                      if (key === "respRate" && (v < 12 || v > 25)) return "border-orange-400";
                      return "";
                    })();
                    return (
                      <div key={key}>
                        <Label className="text-[10px]">{label}</Label>
                        <Input
                          type={type}
                          className={alertClass}
                          placeholder={placeholder}
                          value={(form.vitals as any)[key] ?? ""}
                          onChange={e => {
                            const val = type === "text" ? e.target.value : (e.target.value ? parseFloat(e.target.value) : undefined);
                            const newVitals = { ...form.vitals, [key]: val };
                            if (key === "weight" || key === "height") {
                              const bmi = computeBMI(
                                key === "weight" ? (val as number) : form.vitals.weight,
                                key === "height" ? (val as number) : form.vitals.height
                              );
                              newVitals.bmi = bmi;
                            }
                            setFormField("vitals", newVitals);
                          }}
                        />
                      </div>
                    );
                  })}
                  <div>
                    <Label className="text-[10px]">{t("vit.bmi")}</Label>
                    <Input value={form.vitals.bmi ?? ""} readOnly className="bg-muted" />
                  </div>
                </div>
              </div>

              <div>
                <Label>Examen par appareils</Label>
                <Textarea rows={4} value={form.systemeFindings} onChange={e => setFormField("systemeFindings", e.target.value)}
                  placeholder="Cardio-vasculaire:&#10;Respiratoire:&#10;Digestif:&#10;Neurologique:&#10;ORL:&#10;Cutané:" />
              </div>
            </Section>

            {/* ─ Section 5: Syndromes ─ */}
            <Section num={5} title={t("obs.section5")} complete={sectionCompletion(5, form)}>
              <div className="space-y-3">
                {SYNDROME_CATEGORIES.map(cat => (
                  <div key={cat.category}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{cat.category}</p>
                    <div className="flex flex-wrap gap-2">
                      {cat.syndromes.map(s => {
                        const active = form.syndromes.some(x => x.name === s);
                        return (
                          <button
                            type="button"
                            key={s}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-muted"}`}
                            onClick={() => {
                              if (active) {
                                setFormField("syndromes", form.syndromes.filter(x => x.name !== s));
                              } else {
                                setFormField("syndromes", [...form.syndromes, { name: s, category: cat.category }]);
                              }
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {form.syndromes.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    {form.syndromes.map((syn, i) => (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        <Badge>{syn.name}</Badge>
                        <Input className="h-7 text-xs w-28" placeholder="Sévérité" value={syn.severite || ""}
                          onChange={e => setFormField("syndromes", form.syndromes.map((x, j) => j === i ? { ...x, severite: e.target.value } : x))} />
                        <Input className="h-7 text-xs w-28" placeholder="Évolution" value={syn.evolution || ""}
                          onChange={e => setFormField("syndromes", form.syndromes.map((x, j) => j === i ? { ...x, evolution: e.target.value } : x))} />
                        <button type="button" className="text-destructive text-xs" onClick={() => setFormField("syndromes", form.syndromes.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* ─ Section 6: Diagnostic ─ */}
            <Section num={6} title={t("obs.section6")} complete={sectionCompletion(6, form)}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("obs.primaryDx")}</Label>
                  <Input value={form.primaryDx} onChange={e => { setFormField("primaryDx", e.target.value); setFormField("diagnosis", e.target.value); }} />
                </div>
                <div>
                  <Label>{t("obs.certainty")}</Label>
                  <Select value={form.certainty} onValueChange={v => setFormField("certainty", v)}>
                    <SelectTrigger><SelectValue placeholder="Niveau..." /></SelectTrigger>
                    <SelectContent>
                      {CERTAINTY_LEVELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t("obs.differentials")}</Label>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => setDxOpen(true)}><Stethoscope className="w-3 h-3" />AI</Button>
                </div>
                <div className="space-y-2">
                  {form.differentials.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="h-8 text-sm flex-1" value={d.name}
                        onChange={e => setFormField("differentials", form.differentials.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <button type="button"
                        className={`text-xs px-2 py-1 rounded-full border transition-colors ${d.status === "retained" ? "bg-green-100 text-green-800 border-green-400" : "bg-red-50 text-red-700 border-red-200"}`}
                        onClick={() => setFormField("differentials", form.differentials.map((x, j) => j === i ? { ...x, status: x.status === "retained" ? "eliminated" : "retained" } : x))}>
                        {d.status === "retained" ? t("obs.retained") : t("obs.eliminated")}
                      </button>
                      <button type="button" className="text-destructive text-xs" onClick={() => setFormField("differentials", form.differentials.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => setFormField("differentials", [...form.differentials, { name: "", status: "retained" }])}>
                    + Ajouter
                  </Button>
                </div>
              </div>

              <div>
                <Label>À éliminer en urgence</Label>
                <Input value={form.urgentToEliminate} onChange={e => setFormField("urgentToEliminate", e.target.value)}
                  placeholder="Ex: méningite, infarctus..." className="border-orange-300" />
              </div>
            </Section>

            {/* ─ Section 7: Paraclinique ─ */}
            <Section num={7} title={t("obs.section7")} complete={sectionCompletion(7, form)}>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Examens rapides :</Label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PARACLINICAL.map(name => {
                    const exists = form.paraclinical.some(x => x.name === name);
                    return (
                      <button
                        type="button"
                        key={name}
                        className={`text-xs px-2 py-1 rounded-full border transition-colors ${exists ? "bg-blue-100 text-blue-800 border-blue-400" : "border-border hover:bg-muted"}`}
                        onClick={() => {
                          if (!exists) setFormField("paraclinical", [...form.paraclinical, { name, result: "", normal: null }]);
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
              {form.paraclinical.length > 0 && (
                <div className="space-y-2 mt-2">
                  {form.paraclinical.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs w-36 shrink-0">{p.name}</span>
                      <Input className="h-8 text-xs flex-1" placeholder="Résultat..." value={p.result || ""}
                        onChange={e => setFormField("paraclinical", form.paraclinical.map((x, j) => j === i ? { ...x, result: e.target.value } : x))} />
                      <button type="button"
                        className={`text-xs px-2 py-1 rounded-full border ${p.normal === true ? "bg-green-100 text-green-800 border-green-400" : p.normal === false ? "bg-red-100 text-red-700 border-red-300" : "border-border text-muted-foreground"}`}
                        onClick={() => {
                          const next = p.normal === null ? true : p.normal === true ? false : null;
                          setFormField("paraclinical", form.paraclinical.map((x, j) => j === i ? { ...x, normal: next } : x));
                        }}>
                        {p.normal === true ? "Normal" : p.normal === false ? "Anormal" : "—"}
                      </button>
                      <button type="button" className="text-destructive text-xs" onClick={() => setFormField("paraclinical", form.paraclinical.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Label>Traitement en attente de résultats</Label>
                <Input value={form.therapeuticAwaiting} onChange={e => setFormField("therapeuticAwaiting", e.target.value)}
                  placeholder="Ex: anti-paludéen empirique en attente TDR..." />
              </div>
              {hasFatal && (
                <div className="bg-orange-50 border border-orange-300 rounded-md p-2 text-xs text-orange-800">
                  ⚠ Vérifier les interactions avec les allergies connues du patient avant prescription
                </div>
              )}
            </Section>

            {/* ─ Section 8: Dg de travail ─ */}
            <Section num={8} title={t("obs.section8")} complete={sectionCompletion(8, form)}>
              <div className="flex items-center justify-between mb-2">
                <Label>{t("obs.synthesis")}</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => setFormField("workingDx", generateSynthesis(form, selPat))}>
                  <RefreshCw className="w-3 h-3" />{t("obs.regenerate")}
                </Button>
              </div>
              <Textarea rows={4} value={form.workingDx} onChange={e => setFormField("workingDx", e.target.value)}
                placeholder="Cliquez sur Régénérer pour auto-générer la synthèse, ou saisissez manuellement..." />
            </Section>

            {/* ─ Section 9: Problématique ─ */}
            <Section num={9} title={t("obs.section9")} complete={sectionCompletion(9, form)}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t("obs.problems")}</Label>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => setFormField("problems", [...form.problems, { text: "" }])}>+ Ajouter</Button>
                </div>
                <div className="space-y-2">
                  {form.problems.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <Input className="h-8 text-sm flex-1" value={p.text}
                        onChange={e => setFormField("problems", form.problems.map((x, j) => j === i ? { text: e.target.value } : x))} />
                      <button type="button" className="text-destructive text-xs" onClick={() => setFormField("problems", form.problems.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t("obs.complications")}</Label>
                <Textarea rows={2} value={form.complicatingFactors} onChange={e => setFormField("complicatingFactors", e.target.value)} />
              </div>
              <div>
                <Label>{t("obs.objectives")}</Label>
                <Textarea rows={2} value={form.objectives} onChange={e => setFormField("objectives", e.target.value)}
                  placeholder="Ex: réduire la fièvre, stabiliser glycémie..." />
              </div>
              <div>
                <Label>{t("obs.watchPoints")}</Label>
                <Input value={form.watchPoints} onChange={e => setFormField("watchPoints", e.target.value)}
                  placeholder="Ex: signes de gravité, critères d'hospitalisation..." />
              </div>
            </Section>

            {/* ─ Section 10: Traitement ─ */}
            <Section num={10} title={t("obs.section10")} complete={sectionCompletion(10, form)}>
              <div>
                <Label>{t("consult.prescription")}</Label>
                <Textarea rows={4} value={form.prescription} onChange={e => setFormField("prescription", e.target.value)}
                  placeholder="Médicament — dose — fréquence — durée" />
              </div>
              <div>
                <Label>{t("obs.nonDrug")}</Label>
                <Input value={form.nonDrugTreatment} onChange={e => setFormField("nonDrugTreatment", e.target.value)}
                  placeholder="Ex: repos, régime sans sel, kinésithérapie..." />
              </div>
              <div>
                <Label>{t("obs.orientation")}</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ORIENTATION_OPTIONS.map(o => (
                    <button
                      type="button"
                      key={o.value}
                      className={`text-sm px-4 py-2 rounded-lg border transition-colors ${form.orientation === o.value ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-muted"}`}
                      onClick={() => setFormField("orientation", form.orientation === o.value ? "" : o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t("consult.treatment")}</Label>
                <Textarea rows={2} value={form.treatmentPlan} onChange={e => setFormField("treatmentPlan", e.target.value)} />
              </div>
            </Section>

            {/* ─ Section 11: Suivi ─ */}
            <Section num={11} title={t("obs.section11")} complete={sectionCompletion(11, form)}>
              <div>
                <Label>{t("obs.nextRdv")}</Label>
                <Input type="date" value={form.nextRdv} onChange={e => setFormField("nextRdv", e.target.value)} />
              </div>
              <div>
                <Label>{t("obs.reconsult")}</Label>
                <Textarea rows={2} value={form.reconsultCriteria} onChange={e => setFormField("reconsultCriteria", e.target.value)}
                  placeholder="Ex: fièvre > 3 jours, aggravation des symptômes..." />
              </div>
              <div>
                <Label>{t("obs.education")}</Label>
                <Textarea rows={2} value={form.patientEducation} onChange={e => setFormField("patientEducation", e.target.value)}
                  placeholder="Conseils hygiéno-diététiques, observance, signaux d'alarme..." />
              </div>
            </Section>

            {/* ─ Images ─ */}
            <Section num={0} title={`${t("doc.images")} (${form.images.length})`} complete={form.images.length > 0}>
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" size="sm" variant="outline" disabled={!canPair} onClick={pairSelected} title={t("img.pairHint")}>
                  <GitCompareArrows className="w-4 h-4 mr-1" />{t("img.pair")}
                </Button>
                <Button asChild size="sm" variant="outline" type="button">
                  <label className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />{t("doc.addImages")}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddImages} />
                  </label>
                </Button>
                <Button asChild type="button" variant="default" size="sm" className="gap-2">
                  <label className="cursor-pointer">
                    <GitCompareArrows className="w-4 h-4" />{t("ba.add")}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      const imgs: ConsultationImage[] = [];
                      for (let i = 0; i < files.length; i++) {
                        const data = await compressImage(files[i]);
                        imgs.push({ id: crypto.randomUUID(), filename: files[i].name, data, uploadedAt: new Date().toISOString(), caption: "", imgType: i % 2 === 0 ? "before" : "after" });
                      }
                      setForm(f => ({ ...f, images: [...f.images, ...imgs] }));
                      e.target.value = "";
                    }} />
                  </label>
                </Button>
              </div>
              {form.images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                  {form.images.map(img => {
                    const selected = selectedImgIds.includes(img.id);
                    return (
                      <div key={img.id} className={`relative rounded border p-2 space-y-2 ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}>
                        <button type="button" className="block w-full aspect-square rounded overflow-hidden bg-muted" onClick={() => toggleSelect(img.id)}>
                          <img src={img.data} alt={img.filename} className="w-full h-full object-cover" />
                        </button>
                        <div className="flex flex-wrap items-center gap-1">
                          {img.pairedWith && <Badge variant="secondary">{t("img.paired")}</Badge>}
                        </div>
                        <Select value={img.imgType ?? "other"} onValueChange={v => updateImgType(img.id, v as ConsultationImageType)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="before">{t("img.type.before")}</SelectItem>
                            <SelectItem value="after">{t("img.type.after")}</SelectItem>
                            <SelectItem value="other">{t("img.type.other")}</SelectItem>
                            <SelectItem value="annotation">{t("img.type.annotation")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input className="h-7 text-xs" placeholder={t("doc.caption")} value={img.caption || ""} onChange={e => updateCaption(img.id, e.target.value)} />
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAnnotateImg(img)}>
                            <Pencil className="w-3 h-3 mr-1" />{t("img.annotate")}
                          </Button>
                          {img.pairedWith && (
                            <>
                              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openCompare(img)}>
                                <GitCompareArrows className="w-3 h-3 mr-1" />{t("img.compare")}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => unpair(img.id)}>
                                {t("img.unpair")}
                              </Button>
                            </>
                          )}
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs ml-auto text-destructive" onClick={() => removeImage(img.id)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ─ Notes libres ─ */}
            <div>
              <Label>{t("consult.notes")}</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setFormField("notes", e.target.value)} placeholder="Notes complémentaires..." />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); toast.success(t("obs.autosaved")); } catch { /* */ }
            }} className="gap-1"><Save className="w-4 h-4" />Brouillon</Button>
            <Button variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={!form.patientId}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Annotation modal ── */}
      <AnnotateImageModal open={!!annotateImg} src={annotateImg?.data ?? null} onClose={() => setAnnotateImg(null)} onSave={saveAnnotation} />

      {/* ── Compare dialog ── */}
      <Dialog open={!!compareDialog} onOpenChange={() => setCompareDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{t("img.compare")}</DialogTitle></DialogHeader>
          {compareDialog && (
            <BeforeAfterCompare before={compareDialog.before.data} after={compareDialog.after.data} beforeLabel={t("img.type.before")} afterLabel={t("img.type.after")} />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("consult.confirmDelete")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />{t("consult.deleteWarning")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>{t("common.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Version history ── */}
      <Dialog open={historyDialog !== null} onOpenChange={() => setHistoryDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("consult.history")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {historyDialog?.map(v => (
              <Card key={v.id} className={v.isLatest ? "border-primary" : "opacity-70"}>
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={v.isLatest ? "default" : "secondary"}>
                      {v.versionNumber ? `${t("consult.version")} ${v.versionNumber}` : (v.isLatest ? t("consult.currentVersion") : t("consult.olderVersion"))}
                    </Badge>
                    <Badge variant="outline">{!v.parentId ? t("consult.original") : t("consult.revision")}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(v.date).toLocaleString()}</span>
                    {v.editedBy && <span className="text-xs text-muted-foreground">• {t("consult.editedBy")}: {v.editedBy}</span>}
                  </div>
                  {v.diagnosis && <p className="text-sm"><strong>{t("consult.diagnosis")}:</strong> {v.diagnosis}</p>}
                  {v.treatmentPlan && <p className="text-sm"><strong>{t("consult.treatment")}:</strong> {v.treatmentPlan}</p>}
                  {v.prescription && <p className="text-sm"><strong>{t("consult.prescription")}:</strong> {v.prescription}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Print ── */}
      {printDialog && (
        <div className="hidden print:block p-8">
          <h1 className="text-xl font-bold mb-1">DivineLink — {t("consult.prescription")}</h1>
          <p className="text-sm mb-4">{new Date(printDialog.date).toLocaleDateString()}</p>
          <p><strong>{t("consult.diagnosis")}:</strong> {printDialog.diagnosis}</p>
          <p><strong>{t("consult.treatment")}:</strong> {printDialog.treatmentPlan}</p>
          <div className="mt-4 border-t pt-4">
            <h2 className="font-bold mb-2">{t("consult.prescription")}</h2>
            <p className="whitespace-pre-wrap">{printDialog.prescription}</p>
          </div>
          <div className="mt-12 text-right"><p>____________________________</p><p className="text-sm">{t("apt.doctor")}</p></div>
        </div>
      )}

      {/* ── Image preview ── */}
      <Dialog open={!!previewImg} onOpenChange={() => setPreviewImg(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{previewImg?.filename}</DialogTitle></DialogHeader>
          {previewImg && (<><img src={previewImg.data} alt={previewImg.filename} className="w-full rounded" />{previewImg.caption && <p className="text-sm text-muted-foreground mt-2">{previewImg.caption}</p>}</>)}
        </DialogContent>
      </Dialog>

      {/* ── Inline differential diagnosis ── */}
      <Dialog open={dxOpen} onOpenChange={setDxOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("consult.differentials")}</DialogTitle></DialogHeader>
          <DifferentialPicker onSelect={dx => {
            setForm(f => ({
              ...f,
              primaryDx: f.primaryDx || dx,
              diagnosis: f.diagnosis || dx,
              differentials: f.differentials.some(d => d.name === dx)
                ? f.differentials
                : [...f.differentials, { name: dx, status: "retained" }],
            }));
            setDxOpen(false);
            toast.success(t("dx.savedToConsult"));
          }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Inline differential picker ─────────────────────────────────────────────

function DifferentialPicker({ onSelect }: { onSelect: (dx: string) => void }) {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const diseaseDb = useMemo(() => {
    try { const raw = localStorage.getItem("divinelink.diseaseDb"); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }, []);

  const allDiseases = useMemo(() => {
    const out: { name: string; system: string; symptoms: string[] }[] = [];
    Object.entries(diseaseDb).forEach(([system, diseases]: [string, unknown]) => {
      if (Array.isArray(diseases)) diseases.forEach((d: { name?: string; symptoms?: string[] } | string) => {
        const name = typeof d === "string" ? d : d.name || "";
        const symptoms = typeof d === "object" && d.symptoms ? d.symptoms : [];
        out.push({ name, system, symptoms });
      });
    });
    return out;
  }, [diseaseDb]);

  const filtered = search.trim()
    ? allDiseases.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || d.symptoms?.some(s => s.toLowerCase().includes(search.toLowerCase())))
    : allDiseases;

  return (
    <div className="space-y-3">
      <Input placeholder={t("common.search")} value={search} onChange={e => setSearch(e.target.value)} autoFocus />
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{t("dx.noMatches")}</p>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {filtered.slice(0, 20).map(d => (
            <button key={d.name} onClick={() => onSelect(d.name)} className="w-full text-left p-2 rounded-md hover:bg-accent text-sm transition-colors">
              <span className="font-medium">{d.name}</span>
              {d.system && <span className="text-xs text-muted-foreground ml-2">({d.system})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
