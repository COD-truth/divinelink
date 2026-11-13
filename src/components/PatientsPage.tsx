import React, { useEffect, useMemo, useState } from "react";
import { db, generatePatientId, generateAnonCode, seedVisitReasons, type Patient, type VisitReason, type PatientVisitType } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicId } from "@/lib/clinicSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, TriangleAlert as AlertTriangle, Trash2, Upload, X, Download, Copy, Share2, CalendarPlus, Camera, QrCode, Printer } from "lucide-react";
import { getClinicSettings } from "@/lib/clinicSettings";
import { toast } from "sonner";
import { compressImage } from "@/lib/imageUtils";
import { decryptPatients, encryptPatientForSave } from "@/lib/patientCrypto";
import { saveFile, toCsv, withDateStamp } from "@/lib/download";
import {
  splitFullName, joinFullName, ageFromDob, dobFromAge,
  patientPaymentSummary, paymentBadgeEmoji,
} from "@/lib/patientHelpers";
import { PatientProfile } from "@/components/PatientProfile";
import { AttachmentsField, readFileAsDataUrl } from "@/components/AttachmentsField";

export function PatientsPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const tr = (fr: string, en: string) => (lang === "en" ? en : fr);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visitReasons, setVisitReasons] = useState<VisitReason[]>([]);
  const [addingReason, setAddingReason] = useState(false);
  const [newReason, setNewReason] = useState("");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [profile, setProfile] = useState<Patient | null>(null);
  const [referral, setReferral] = useState<Patient | null>(null);
  const [codeCard, setCodeCard] = useState<Patient | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupName, setDupName] = useState("");
  const [dupMgrOpen, setDupMgrOpen] = useState(false);
  const [paySummary, setPaySummary] = useState<Record<number, { status: "paid"|"partial"|"unpaid"; balance: number }>>({});
  const [lastVisitMap, setLastVisitMap] = useState<Record<number, { days: number; lastDx: string }>>({});

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const nowTimeStr = () => new Date().toTimeString().slice(0, 5);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    dob: "",
    age: "",
    sex: "" as "M" | "F" | "",
    address: "",
    quarter: "",
    referredBy: "",
    treatmentControl: false,
    followUpNote: "",
    services: [] as string[],
    isMinor: false,
    guardianName: "",
    guardianPhone: "",
    guardianDetails: "",
    bloodPressure: "",
    weight: "",
    coverage: "",
    medicalAlerts: "",
    photo: "" as string | undefined,
    visitType: "new_consultation" as PatientVisitType,
    reason: "",            // resolved label of the treatment type / reason
    reasonValue: "",       // slug of the selected VisitReason (or "custom")
    visitDate: todayStr(),
    visitTime: nowTimeStr(),
  });
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);

  const load = async () => {
    // Clinic isolation: show only patients belonging to the active clinic
    // (untagged rows are still shown; rows tagged to ANOTHER clinic are hidden).
    const activeClinic = localStorage.getItem("divinelink.clinicId");
    const inClinic = (p: Patient) => !activeClinic || !p.clinicId || String(p.clinicId) === String(activeClinic);
    const all = (await db.patients.reverse().toArray()).filter(p => !p.deleted && inClinic(p));
    const dec = await decryptPatients(all);
    setPatients(dec);
    const summary: Record<number, { status: "paid"|"partial"|"unpaid"; balance: number }> = {};
    const visitMap: Record<number, { days: number; lastDx: string }> = {};
    const allCons = await db.consultations.toArray();
    await Promise.all(dec.map(async p => {
      if (p.id) summary[p.id] = await patientPaymentSummary(p.id);
      if (p.id) {
        const pCons = allCons.filter(c => c.isLatest !== false && c.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date));
        if (pCons.length) {
          const lastDate = new Date(pCons[0].date || pCons[0].createdAt);
          const days = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
          visitMap[p.id] = { days, lastDx: pCons[0].diagnosis || "" };
        } else {
          visitMap[p.id] = { days: 999, lastDx: "" };
        }
      }
    }));
    setPaySummary(summary);
    setLastVisitMap(visitMap);
  };

  const loadReasons = async () => {
    await seedVisitReasons();
    const list = await db.visitReasons.toArray();
    setVisitReasons(list);
  };

  useEffect(() => { load(); loadReasons(); }, []);

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    return p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) ||
      p.phone.includes(q) || p.patientId.toLowerCase().includes(q) ||
      (p.anonCode || "").toLowerCase().includes(q);
  });

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t("patient.copied")); }
    catch { toast.error("Copy failed"); }
  };

  const buildReferral = (p: Patient) =>
    `DivineLink Referral\n--------------------\nAnonymous ID: ${p.anonCode || p.patientId}\nMedical alerts: ${p.medicalAlerts || "—"}\nDate: ${new Date().toLocaleDateString()}\n\n(No identifying personal data is shared.)`;

  const openNew = () => {
    setForm({
      fullName: "", phone: "", dob: "", age: "", sex: "", address: "", quarter: "", referredBy: "", treatmentControl: false, followUpNote: "", services: [], isMinor: false, guardianName: "", guardianPhone: "", guardianDetails: "", bloodPressure: "", weight: "", coverage: "", insurer: "", policy: "", rate: "", medicalAlerts: "", photo: "",
      visitType: "new_consultation", reason: "", reasonValue: "",
      visitDate: todayStr(), visitTime: nowTimeStr(),
    });
    setAddingReason(false);
    setNewReason("");
    setPendingDocs([]);
    setDialogOpen(true);
  };

  const reasonLabel = (r: VisitReason) => (lang === "en" ? r.en : r.fr) || r.value;

  const addCustomReason = async () => {
    const label = newReason.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "").slice(0, 40) || `custom_${Date.now()}`;
    const cid = getClinicId();
    // Reuse an existing reason with the same label instead of duplicating.
    const existing = visitReasons.find(r => r.fr.toLowerCase() === label.toLowerCase() || r.en.toLowerCase() === label.toLowerCase());
    if (!existing) {
      await db.visitReasons.add({ value, fr: label, en: label, clinicId: cid, createdAt: new Date().toISOString() });
    }
    const chosen = existing?.value || value;
    await loadReasons();
    setForm(f => ({ ...f, reasonValue: chosen, reason: label }));
    setAddingReason(false);
    setNewReason("");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await compressImage(file);
      setForm(f => ({ ...f, photo: data }));
    } catch { toast.error("Image error"); }
    e.target.value = "";
  };

  const save = async (force = false) => {
    if (!form.fullName.trim()) { toast.error(t("patient.fullName")); return; }
    if (!form.sex) { toast.error(tr("Sexe obligatoire (M/F)", "Sex is required (M/F)")); return; }
    if (!force) {
      const fn = form.fullName.trim().toLowerCase();
      const existing = patients.find(p => !p.deleted && `${p.firstName} ${p.lastName}`.trim().toLowerCase() === fn);
      if (existing) { setDupName(form.fullName.trim()); setDupOpen(true); return; }
    }
    const { firstName, lastName } = splitFullName(form.fullName);
    const ageNum = form.age ? parseInt(form.age) : undefined;
    const dob = form.dob || (ageNum !== undefined ? dobFromAge(ageNum) : "");
    const now = new Date().toISOString();
    const payload = await encryptPatientForSave({
      firstName, lastName,
      phone: form.phone, dob, address: form.address,
      medicalAlerts: form.medicalAlerts,
      photo: form.photo || undefined,
      ageYears: ageNum,
    });
    const patientId = await generatePatientId();
    const anonCode = generateAnonCode();
    const cid = localStorage.getItem("divinelink.clinicId") || undefined;
    const uid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    // Resolve the treatment type / reason label from the picker.
    const chosen = visitReasons.find(r => r.value === form.reasonValue);
    const reasonLbl = form.reason.trim() || (chosen ? ((lang === "en" ? chosen.en : chosen.fr) || chosen.value) : "");
    const registeredBy = user?.name || "—";
    const newId = await db.patients.add({
      ...(payload as any), uid, deleted: false, patientId, anonCode, clinicId: cid,
      sex: form.sex || undefined, quarter: form.quarter.trim() || undefined, referredBy: form.referredBy.trim() || undefined,
      treatmentControl: form.treatmentControl || undefined, followUpNote: form.followUpNote.trim() || undefined, servicesRequested: form.services.length ? form.services : undefined,
      isMinor: form.isMinor || undefined,
      guardianName: form.isMinor ? (form.guardianName.trim() || undefined) : undefined,
      guardianPhone: form.isMinor ? (form.guardianPhone.trim() || undefined) : undefined,
      guardianDetails: form.isMinor ? (form.guardianDetails.trim() || undefined) : undefined,
      bloodPressure: form.bloodPressure.trim() || undefined,
      weight: form.weight ? (parseFloat(form.weight) || undefined) : undefined,
      coverageMode: form.coverage || undefined,
      insurerName: form.insurer.trim() || undefined,
      insurancePolicy: form.policy.trim() || undefined,
      coverageRate: form.rate ? (parseFloat(form.rate) || undefined) : undefined,
      registeredBy, registeredById: user?.id, registeredAt: now,
      visitType: form.visitType, reasonForVisit: reasonLbl || undefined,
      createdAt: now, updatedAt: now,
    }) as number;
    // Record the visit itself: an appointment for a rendez-vous, otherwise a
    // consultation entry (new or historical) so it shows in the patient's
    // visit history right away with who/when captured.
    try {
      const visitIso = form.visitDate
        ? new Date(`${form.visitDate}T${form.visitType === "rendezvous" ? (form.visitTime || "09:00") : "00:00"}:00`).toISOString()
        : now;
      if (form.visitType === "rendezvous") {
        await db.appointments.add({
          patientId: newId,
          doctorId: user?.id || 0,
          date: form.visitDate || todayStr(),
          time: form.visitTime || "09:00",
          reason: reasonLbl || tr("Rendez-vous", "Appointment"),
          status: "scheduled",
          clinicId: cid,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await db.consultations.add({
          patientId: newId,
          doctorId: user?.id || 0,
          date: visitIso,
          symptoms: reasonLbl,
          diagnosis: "",
          treatmentPlan: "",
          prescription: "",
          notes: form.visitType === "old_consultation" ? tr("Consultation antérieure (saisie à l'enregistrement)", "Prior consultation (entered at registration)") : "",
          consultType: form.reasonValue === "dental" ? "dental" : "general",
          chiefComplaint: reasonLbl,
          clinicId: cid,
          createdAt: now,
          editedBy: registeredBy,
          isLatest: true,
        });
      }
    } catch { /* linked visit record is best-effort */ }
    // Save initial documents attached during registration
    for (const f of pendingDocs) {
      try {
        const data = await readFileAsDataUrl(f);
        await db.documents.add({
          patientId: newId,
          name: f.name,
          type: f.type || "application/octet-stream",
          data,
          size: f.size,
          source: "registration_upload",
          clinicId: cid,
          createdAt: now,
          updatedAt: now,
        });
      } catch { /* skip bad file */ }
    }
    toast.success(t("patient.register"));
    setDialogOpen(false);
    setPendingDocs([]);
    load();
  };

  const handleDelete = async (id: number) => {
    // Soft delete (tombstone): mark deleted + bump updatedAt so the deletion
    // syncs to the server and to every other device. Local child records are
    // cleared for tidiness; the patient tombstone is what propagates.
    const now = new Date().toISOString();
    await db.transaction("rw", [db.patients, db.consultations, db.appointments, db.documents, db.payments], async () => {
      await db.consultations.where("patientId").equals(id).delete();
      await db.appointments.where("patientId").equals(id).delete();
      await db.documents.where("patientId").equals(id).delete();
      await db.payments.where("patientId").equals(id).delete();
      await db.patients.update(id, { deleted: true, updatedAt: now });
    });
    setDeleteConfirm(null);
    toast.success(t("common.delete"));
    load();
  };

  const exportAll = async () => {
    if (!patients.length) { toast.info(t("download.empty")); return; }
    const rows = patients.map(p => ({
      patientId: p.patientId,
      fullName: joinFullName(p),
      phone: p.phone || "",
      dob: p.dob || "",
      age: p.ageYears ?? ageFromDob(p.dob) ?? "",
      sex: p.sex || "",
      address: p.address || "",
      quarter: p.quarter || "",
      referredBy: p.referredBy || "",
      control: p.treatmentControl ? "Oui" : "",
      followUp: p.followUpNote || "",
      services: (p.servicesRequested || []).join("; "),
      minor: p.isMinor ? "Oui" : "",
      guardian: p.guardianName || "",
      guardianPhone: p.guardianPhone || "",
      bloodPressure: p.bloodPressure || "",
      weight: p.weight ?? "",
      coverage: p.coverageMode || "",
      insurer: p.insurerName || "",
      policy: p.insurancePolicy || "",
      rate: p.coverageRate != null ? String(p.coverageRate) : "",
      medicalAlerts: p.medicalAlerts || "",
      createdAt: p.createdAt,
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const ok = await saveFile(withDateStamp("patients.csv"), csv, "csv");
    if (ok) toast.success(t("download.done"));
  };

  const dupGroups = useMemo(() => {
    const map = new Map<string, Patient[]>();
    for (const p of patients) {
      if (p.deleted) continue;
      const key = `${p.firstName} ${p.lastName}`.trim().toLowerCase();
      if (!key) continue;
      const g = map.get(key); if (g) g.push(p); else map.set(key, [p]);
    }
    return Array.from(map.values()).filter(g => g.length > 1);
  }, [patients]);

  const mergeInto = async (keepId: number, dropId: number) => {
    const now = new Date().toISOString();
    const reassign = async (table: any) => {
      const rows = (await table.toArray()).filter((r: any) => r.patientId === dropId);
      for (const r of rows) await table.update(r.id, { patientId: keepId });
    };
    await reassign(db.consultations);
    await reassign(db.labResults);
    await reassign(db.payments);
    await reassign(db.prescriptions);
    await reassign(db.appointments);
    await reassign(db.documents);
    await db.patients.update(dropId, { deleted: true, updatedAt: now });
  };
  const mergeGroup = async (g: Patient[]) => {
    const sorted = [...g].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    const keep = sorted[0];
    for (const d of sorted.slice(1)) if (d.id && keep.id) await mergeInto(keep.id, d.id);
    await load();
    toast.success(tr("Doublons fusionnés", "Duplicates merged"));
  };

  return (
    <div className="space-y-4">
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{tr("Patient déjà existant ?", "Patient already exists?")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{tr(`Un patient nommé « ${dupName} » existe déjà. Vérifiez d'abord avec la recherche. Créer quand même un nouveau dossier ?`, `A patient named "${dupName}" already exists. Check with search first. Create a new record anyway?`)}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDupOpen(false)}>{tr("Annuler", "Cancel")}</Button>
            <Button onClick={() => { setDupOpen(false); save(true); }}>{tr("Créer quand même", "Create anyway")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dupMgrOpen} onOpenChange={setDupMgrOpen}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{tr("Doublons de patients", "Duplicate patients")}</DialogTitle></DialogHeader>
          {dupGroups.length === 0 ? <p className="text-sm text-muted-foreground">{tr("Aucun doublon.", "No duplicates.")}</p> : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{tr("Fusionner combine les dossiers d'un même patient en un seul (le plus ancien est gardé ; consultations, analyses et paiements rattachés).", "Merging combines a patient's records into one (the oldest is kept; consultations, labs and payments reattached).")}</p>
              {dupGroups.map((g, gi) => (
                <div key={gi} className="rounded-md border p-2 space-y-1">
                  <p className="font-medium text-sm">{g[0].firstName} {g[0].lastName} <span className="text-xs text-muted-foreground">({g.length})</span></p>
                  {g.map(p => <p key={p.id} className="text-[11px] text-muted-foreground">#{p.patientId} · {new Date(p.createdAt).toLocaleDateString()}</p>)}
                  <Button size="sm" className="h-7 text-xs w-full mt-1" onClick={() => mergeGroup(g)}>{tr("Fusionner", "Merge")}</Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDupMgrOpen(false)}>{tr("Fermer", "Close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("patient.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" onClick={exportAll} className="gap-2">
          <Download className="w-4 h-4" /> {t("download.patients")}
        </Button>
        {dupGroups.length > 0 && (
          <Button variant="outline" onClick={() => setDupMgrOpen(true)} className="gap-2 border-amber-400 text-amber-700">
            {tr("Doublons", "Duplicates")} ({dupGroups.length})
          </Button>
        )}
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> {t("patient.register")}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t("patient.noResults")}</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map(p => {
            const ps = p.id ? paySummary[p.id] : undefined;
            const age = p.ageYears ?? ageFromDob(p.dob);
            const lv = p.id ? lastVisitMap[p.id] : undefined;
            const loyaltyColor = !lv || lv.days > 90 ? "bg-destructive" : lv.days > 30 ? "bg-warning" : "bg-success";
            const loyaltyLabel = !lv || lv.days > 90 ? t("loyalty.lost") : lv.days > 30 ? t("loyalty.followUp") : t("loyalty.regular");
            return (
              <Card key={p.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm cursor-pointer overflow-hidden flex-shrink-0" onClick={() => setProfile(p)}>
                      {p.photo ? (
                        <img src={p.photo} alt={joinFullName(p)} className="w-full h-full object-cover" />
                      ) : (
                        <>{(p.firstName[0] || "").toUpperCase()}{(p.lastName[0] || "").toUpperCase()}</>
                      )}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${loyaltyColor} border-2 border-card`} title={`${loyaltyLabel} (${lv ? lv.days : "?"} ${t("loyalty.daysAgo")})`} />
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setProfile(p)}>
                    <p className="font-medium truncate flex items-center gap-2">
                      {joinFullName(p)}
                      {ps && ps.balance > 0 && <span title={t(`pay.status.${ps.status}`)}>{paymentBadgeEmoji(ps.status)}</span>}
                      {ps && ps.balance === 0 && <span title={t("pay.status.paid")}>{paymentBadgeEmoji("paid")}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.patientId} • {p.phone || "—"}{age !== undefined ? ` • ${age} ${t("patient.years")}` : ""}
                    </p>
                    {p.anonCode && (
                      <div className="flex items-center gap-1 mt-1">
                        <button type="button" className="text-[10px] bg-accent hover:bg-accent/70 px-1.5 py-0.5 rounded font-mono inline-flex items-center gap-1" onClick={(e) => { e.stopPropagation(); setCodeCard(p); }} title="Show code card">
                          <QrCode className="w-3 h-3" />{p.anonCode}
                        </button>
                        <Button variant="ghost" size="icon" className="w-5 h-5" onClick={(e) => { e.stopPropagation(); copyText(p.anonCode!); }}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {(p.medicalAlerts || p.antecedents?.allergies?.some(a => a.severity === "fatal")) && (
                    <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${p.antecedents?.allergies?.some(a => a.severity === "fatal") ? "text-destructive" : "text-warning"}`} />
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setReferral(p)} title={t("patient.referral")}>
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(p.id!)} className="text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New patient — minimal form */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("patient.register")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center text-muted-foreground text-xs">
                {form.photo ? (
                  <img src={form.photo} alt="" className="w-full h-full object-cover" />
                ) : <span>{t("doc.profilePhoto")}</span>}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline" type="button">
                    <label className="cursor-pointer">
                      <Camera className="w-4 h-4 mr-1" />
                      Photo
                      <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  </Button>
                  <Button asChild size="sm" variant="outline" type="button">
                    <label className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-1" />
                      {form.photo ? t("doc.changePhoto") : t("doc.profilePhoto")}
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  </Button>
                </div>
                {form.photo && (
                  <Button size="sm" variant="ghost" type="button" onClick={() => setForm(f => ({ ...f, photo: "" }))}>
                    <X className="w-4 h-4 mr-1" /> {t("doc.removePhoto")}
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label>{t("patient.fullName")} *</Label>
              <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("patient.dob")}</Label>
                <Input type="date" value={form.dob} onChange={e => {
                  const dob = e.target.value;
                  const a = ageFromDob(dob);
                  setForm(f => ({ ...f, dob, age: a !== undefined ? String(a) : f.age, isMinor: (a !== undefined && a < 18) ? true : f.isMinor }));
                }} />
              </div>
              <div>
                <Label>{t("patient.age")} ({t("patient.years")})</Label>
                <Input type="number" min={0} max={150} value={form.age} onChange={e => { const v = e.target.value; const a = parseInt(v); setForm(f => ({ ...f, age: v, isMinor: (!isNaN(a) && a > 0 && a < 18) ? true : f.isMinor })); }} />
              </div>
            </div>
            <div>
              <Label>{tr("Sexe", "Sex")} *</Label>
              <div className="flex gap-2 mt-1">
                <Button type="button" variant={form.sex === "M" ? "default" : "outline"} className="flex-1" onClick={() => setForm(f => ({ ...f, sex: "M" }))}>M</Button>
                <Button type="button" variant={form.sex === "F" ? "default" : "outline"} className="flex-1" onClick={() => setForm(f => ({ ...f, sex: "F" }))}>F</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{tr("Tension artérielle", "Blood pressure")}</Label>
                <Input value={form.bloodPressure} onChange={e => setForm(f => ({ ...f, bloodPressure: e.target.value }))} placeholder="120/80" />
              </div>
              <div>
                <Label>{tr("Poids (kg)", "Weight (kg)")}</Label>
                <Input type="number" min={0} value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="kg" />
              </div>
            </div>
            <div>
              <Label>{tr("Mode de prise en charge", "Coverage / payment mode")}</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {["Espèces", "Mutuelle", "Assurance", "Autre"].map(m => (
                  <Button key={m} type="button" size="sm" variant={form.coverage === m ? "default" : "outline"} className="h-7 text-xs" onClick={() => setForm(f => ({ ...f, coverage: f.coverage === m ? "" : m }))}>{m}</Button>
                ))}
              </div>
              {(form.coverage === "Mutuelle" || form.coverage === "Assurance") && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                  <div><Label className="text-xs">{tr("Assureur / Mutuelle", "Insurer / Mutual")}</Label><Input className="h-8" value={form.insurer} onChange={e => setForm(f => ({ ...f, insurer: e.target.value }))} placeholder="CNPS, Activa…" /></div>
                  <div><Label className="text-xs">{tr("N° assuré / bon", "Member / voucher no.")}</Label><Input className="h-8" value={form.policy} onChange={e => setForm(f => ({ ...f, policy: e.target.value }))} /></div>
                  <div><Label className="text-xs">{tr("Taux pris en charge (%)", "Coverage rate (%)")}</Label><Input type="number" min={0} max={100} className="h-8" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="80" /></div>
                </div>
              )}
            </div>
            <div>
              <Label>{t("patient.phone")}</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("patient.address")}</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <Label>{tr("Quartier", "Quarter")}</Label>
                <Input value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: e.target.value }))} placeholder={tr("Quartier / zone", "Neighbourhood")} />
              </div>
            </div>
            <div>
              <Label>{tr("Envoyé par (qui l'envoie)", "Referred by (who sent them)")}</Label>
              <Input value={form.referredBy} onChange={e => setForm(f => ({ ...f, referredBy: e.target.value }))} placeholder={tr("Personne, clinique, campagne…", "Person, clinic, campaign…")} />
            </div>
            <div className="rounded-md border p-2 space-y-2">
              <Label className="text-sm font-medium">{tr("Suivi & services", "Follow-up & services")}</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1">{tr("Contrôle de traitement ?", "Treatment control?")}</span>
                <Button type="button" size="sm" variant={form.treatmentControl ? "default" : "outline"} className="h-7" onClick={() => setForm(f => ({ ...f, treatmentControl: !f.treatmentControl }))}>{form.treatmentControl ? tr("Oui", "Yes") : tr("Non", "No")}</Button>
              </div>
              <Input placeholder={tr("Ce qui a été fait / à faire…", "What was done / to do…")} value={form.followUpNote} onChange={e => setForm(f => ({ ...f, followUpNote: e.target.value }))} />
              <div>
                <span className="text-xs text-muted-foreground">{tr("Service(s) demandé(s)", "Service(s) requested")}</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {["Consultation", "Echographie", "Laboratoire", "Pharmacie", "Dentaire", "Autre"].map(s => {
                    const on = form.services.includes(s);
                    return <Button key={s} type="button" size="sm" variant={on ? "default" : "outline"} className="h-7 text-xs" onClick={() => setForm(f => ({ ...f, services: on ? f.services.filter(x => x !== s) : [...f.services, s] }))}>{s === "Echographie" ? "Échographie" : s}</Button>;
                  })}
                </div>
              </div>
            </div>
            <div className="rounded-md border p-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1">{tr("Patient mineur ?", "Minor patient?")}</span>
                <Button type="button" size="sm" variant={form.isMinor ? "default" : "outline"} className="h-7" onClick={() => setForm(f => ({ ...f, isMinor: !f.isMinor }))}>{form.isMinor ? tr("Oui", "Yes") : tr("Non", "No")}</Button>
              </div>
              {form.isMinor && (
                <div className="space-y-2">
                  <Input placeholder={tr("Nom du tuteur / parent", "Guardian / parent name")} value={form.guardianName} onChange={e => setForm(f => ({ ...f, guardianName: e.target.value }))} />
                  <Input placeholder={tr("Téléphone du tuteur", "Guardian phone")} value={form.guardianPhone} onChange={e => setForm(f => ({ ...f, guardianPhone: e.target.value }))} />
                  <Input placeholder={tr("Détails (lien de parenté, pièce, adresse…)", "Details (relation, ID, address…)")} value={form.guardianDetails} onChange={e => setForm(f => ({ ...f, guardianDetails: e.target.value }))} />
                </div>
              )}
            </div>
            <div>
              <Label>{t("patient.alerts")}</Label>
              <Textarea value={form.medicalAlerts} onChange={e => setForm(f => ({ ...f, medicalAlerts: e.target.value }))} placeholder="Allergies, conditions..." />
            </div>

            {/* ── Visit / consultation ── */}
            <div className="pt-2 border-t space-y-3">
              <Label className="text-sm font-semibold">{tr("Motif de la visite", "Reason for visit")}</Label>

              {/* Visit type: new consultation / rendez-vous / old consultation */}
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { v: "new_consultation", label: tr("Nouvelle consultation", "New consultation") },
                  { v: "rendezvous", label: tr("Rendez-vous", "Appointment") },
                  { v: "old_consultation", label: tr("Ancienne consultation", "Past consultation") },
                ] as { v: PatientVisitType; label: string }[]).map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, visitType: opt.v }))}
                    className={`text-xs rounded-md border px-2 py-2 leading-tight transition-colors ${form.visitType === opt.v ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Treatment type / reason with custom add */}
              <div>
                <Label className="text-xs text-muted-foreground">{tr("Type de soin / motif", "Treatment type / reason")}</Label>
                {addingReason ? (
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={newReason}
                      onChange={e => setNewReason(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomReason(); } }}
                      placeholder={tr("Ex : Kinésithérapie, ORL…", "e.g. Physiotherapy, ENT…")}
                    />
                    <Button type="button" size="sm" onClick={addCustomReason}>{tr("Ajouter", "Add")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingReason(false); setNewReason(""); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select
                      value={form.reasonValue}
                      onValueChange={v => {
                        if (v === "__add__") { setAddingReason(true); return; }
                        const r = visitReasons.find(x => x.value === v);
                        setForm(f => ({ ...f, reasonValue: v, reason: r ? reasonLabel(r) : "" }));
                      }}
                    >
                      <SelectTrigger className="flex-1"><SelectValue placeholder={tr("Choisir…", "Choose…")} /></SelectTrigger>
                      <SelectContent>
                        {visitReasons.map(r => (
                          <SelectItem key={r.value} value={r.value}>{reasonLabel(r)}</SelectItem>
                        ))}
                        <SelectItem value="__add__">➕ {tr("Ajouter un type…", "Add a type…")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* When they came / appointment date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {form.visitType === "rendezvous" ? tr("Date du rendez-vous", "Appointment date") : tr("Date de la consultation", "Consultation date")}
                  </Label>
                  <Input type="date" value={form.visitDate} onChange={e => setForm(f => ({ ...f, visitDate: e.target.value }))} />
                </div>
                {form.visitType === "rendezvous" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{tr("Heure", "Time")}</Label>
                    <Input type="time" value={form.visitTime} onChange={e => setForm(f => ({ ...f, visitTime: e.target.value }))} />
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                {tr("Enregistré par", "Registered by")} <span className="font-medium">{user?.name || "—"}</span> · {new Date().toLocaleString()}
              </p>
            </div>

            <div className="pt-2 border-t">
              <AttachmentsField
                files={pendingDocs}
                onChange={setPendingDocs}
                label={t("attach.initialDocs")}
                helper={t("attach.initialDocsHint")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => save()}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile dialog */}
      {profile && (
        <PatientProfile patient={profile} open={!!profile} onClose={() => setProfile(null)} onChanged={load} />
      )}

      {/* Delete confirmation */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("patient.confirmDelete")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            {t("patient.deleteWarning")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>{t("common.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Referral card */}
      <Dialog open={!!referral} onOpenChange={() => setReferral(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("patient.referral")}</DialogTitle></DialogHeader>
          {referral && (
            <>
              <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap font-mono">{buildReferral(referral)}</pre>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReferral(null)}>{t("common.cancel")}</Button>
                <Button onClick={() => copyText(buildReferral(referral))} className="gap-2">
                  <Copy className="w-4 h-4" />{t("patient.referralCopy")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Patient code card */}
      <Dialog open={!!codeCard} onOpenChange={() => setCodeCard(null)}>
        <DialogContent className="max-w-sm print:shadow-none">
          <DialogHeader><DialogTitle>Patient Code Card</DialogTitle></DialogHeader>
          {codeCard && (
            <div id="code-card-print" className="border-2 border-primary rounded-xl p-6 bg-white text-center space-y-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{getClinicSettings()?.name || "DivineLink Clinic"}</p>
              <p className="font-mono font-bold text-3xl tracking-wider text-primary break-all">{codeCard.anonCode || codeCard.patientId}</p>
              <div className="flex justify-center items-end gap-[2px] h-12 px-2" aria-hidden>
                {(codeCard.anonCode || codeCard.patientId).split("").map((ch, i) => {
                  const v = (ch.charCodeAt(0) % 5) + 1;
                  return <span key={i} className="bg-black" style={{ width: 3 + (v % 3), height: 20 + v * 5 }} />;
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">Présentez cette carte lors de vos visites · No personal data shown</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeCard(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => window.print()} className="gap-2"><Printer className="w-4 h-4" />Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
