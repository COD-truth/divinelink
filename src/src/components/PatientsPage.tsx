import React, { useEffect, useState } from "react";
import { db, generatePatientId, generateAnonCode, type Patient } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Edit, AlertTriangle, Trash2, Upload, X, Paperclip, Download, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { compressImage, fileToDataUrl } from "@/lib/imageUtils";
import { decryptPatients, encryptPatientForSave } from "@/lib/patientCrypto";
import { saveFile, toCsv, withDateStamp } from "@/lib/download";

export function PatientsPage() {
  const { t } = useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [referral, setReferral] = useState<Patient | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", dob: "", address: "", medicalAlerts: "", photo: "" as string | undefined });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const load = async () => {
    const all = await db.patients.reverse().toArray();
    setPatients(await decryptPatients(all));
  };

  useEffect(() => { load(); }, []);

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    return p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) ||
      p.phone.includes(q) || p.patientId.toLowerCase().includes(q) ||
      (p.anonCode || "").toLowerCase().includes(q);
  });

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t("patient.copied")); }
    catch { toast.error("Copy failed"); }
  };

  const buildReferral = (p: Patient) =>
    `DivineLink Referral\n--------------------\nAnonymous ID: ${p.anonCode || p.patientId}\nMedical alerts: ${p.medicalAlerts || "—"}\nDate: ${new Date().toLocaleDateString()}\n\n(No identifying personal data is shared.)`;

  const openNew = () => {
    setEditing(null);
    setForm({ firstName: "", lastName: "", phone: "", dob: "", address: "", medicalAlerts: "", photo: "" });
    setPendingFiles([]);
    setDialogOpen(true);
  };

  const openEdit = (p: Patient) => {
    setEditing(p);
    setForm({ firstName: p.firstName, lastName: p.lastName, phone: p.phone, dob: p.dob, address: p.address, medicalAlerts: p.medicalAlerts, photo: p.photo || "" });
    setPendingFiles([]);
    setDialogOpen(true);
  };

  const handleAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files]);
    e.target.value = "";
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await compressImage(file);
      setForm(f => ({ ...f, photo: data }));
    } catch {
      toast.error("Image error");
    }
    e.target.value = "";
  };

  const save = async () => {
    if (!form.firstName || !form.lastName) return;
    const now = new Date().toISOString();
    const encrypted = await encryptPatientForSave({ ...form, photo: form.photo || undefined });
    const payload = encrypted as typeof form & { photo: string | undefined };
    let savedId: number | undefined;
    if (editing?.id) {
      await db.patients.update(editing.id, { ...payload, updatedAt: now });
      savedId = editing.id;
      toast.success(t("common.save"));
    } else {
      const patientId = await generatePatientId();
      const anonCode = generateAnonCode();
      savedId = await db.patients.add({ ...payload, patientId, anonCode, createdAt: now, updatedAt: now });
      toast.success(t("patient.register"));
    }
    // Save attachments to documents linked to this patient
    if (savedId && pendingFiles.length) {
      for (const file of pendingFiles) {
        try {
          const data = file.type.startsWith("image/") ? await compressImage(file) : await fileToDataUrl(file);
          await db.documents.add({
            patientId: savedId,
            name: file.name,
            type: file.type || "application/octet-stream",
            data,
            size: file.size,
            tag: "other",
            createdAt: now,
          });
        } catch {
          toast.error(`Upload failed: ${file.name}`);
        }
      }
    }
    setPendingFiles([]);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: number) => {
    // Delete patient and related data
    await db.transaction("rw", [db.patients, db.consultations, db.appointments, db.documents], async () => {
      await db.consultations.where("patientId").equals(id).delete();
      await db.appointments.where("patientId").equals(id).delete();
      await db.documents.where("patientId").equals(id).delete();
      await db.patients.delete(id);
    });
    setDeleteConfirm(null);
    toast.success(t("common.delete"));
    load();
  };

  const exportAll = async () => {
    if (!patients.length) { toast.info(t("download.empty")); return; }
    const rows = patients.map(p => ({
      patientId: p.patientId,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone || "",
      dob: p.dob || "",
      address: p.address || "",
      medicalAlerts: p.medicalAlerts || "",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const ok = await saveFile(withDateStamp("patients.csv"), csv, "csv");
    if (ok) toast.success(t("download.done"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("patient.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" onClick={exportAll} className="gap-2">
          <Download className="w-4 h-4" /> {t("download.patients")}
        </Button>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> {t("patient.register")}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t("patient.noResults")}</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map(p => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm cursor-pointer overflow-hidden" onClick={() => openEdit(p)}>
                  {p.photo ? (
                    <img src={p.photo} alt={`${p.firstName} ${p.lastName}`} className="w-full h-full object-cover" />
                  ) : (
                    <>{p.firstName[0]}{p.lastName[0]}</>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="cursor-pointer" onClick={() => openEdit(p)}>
                    <p className="font-medium truncate">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">{p.patientId} • {p.phone || "—"}</p>
                  </div>
                  {p.anonCode && (
                    <div className="flex items-center gap-1 mt-1">
                      <code className="text-[10px] bg-accent px-1.5 py-0.5 rounded font-mono">{p.anonCode}</code>
                      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => copyText(p.anonCode!)} title={t("patient.copyCode")}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {t("patient.created")}: {fmtDate(p.createdAt)}
                  </p>
                </div>
                {p.medicalAlerts && (
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                )}
                <Button variant="ghost" size="sm" onClick={() => setReferral(p)} title={t("patient.referral")}>
                  <Share2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(p.id!)} className="text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t("patient.edit") : t("patient.register")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Profile photo */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center text-muted-foreground text-xs">
                {form.photo ? (
                  <img src={form.photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{t("doc.profilePhoto")}</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild size="sm" variant="outline" type="button">
                  <label className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    {form.photo ? t("doc.changePhoto") : t("doc.profilePhoto")}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                </Button>
                {form.photo && (
                  <Button size="sm" variant="ghost" type="button" onClick={() => setForm(f => ({ ...f, photo: "" }))}>
                    <X className="w-4 h-4 mr-1" /> {t("doc.removePhoto")}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>Nom complet *</Label>
              <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="ex: Jean-Pierre Mbarga" className="text-base" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nom de famille (optionnel - pour recherche)</Label>
              <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="ex: Mbarga" />
            </div>
            <div>
              <Label>{t("patient.phone")}</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label className="text-base font-semibold">Âge ou Date de naissance</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <Label className="text-xs text-muted-foreground">Âge (ans) — saisie rapide</Label>
                  <Input
                    type="number" min={0} max={150}
                    placeholder="ex: 35"
                    className="text-lg font-bold"
                    value={form.dob && !isNaN(new Date(form.dob).getTime()) ? String(new Date().getFullYear() - new Date(form.dob).getFullYear()) : ""}
                    onChange={e => {
                      const age = parseInt(e.target.value);
                      if (!isNaN(age) && age > 0) {
                        const year = new Date().getFullYear() - age;
                        setForm(f => ({ ...f, dob: `${year}-01-01` }));
                      } else {
                        setForm(f => ({ ...f, dob: "" }));
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Date de naissance (optionnel)</Label>
                  <Input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
                </div>
              </div>
            </div>
            <div>
              <Label>{t("patient.address")}</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label>{t("patient.alerts")}</Label>
              <Textarea value={form.medicalAlerts} onChange={e => setForm(f => ({ ...f, medicalAlerts: e.target.value }))} placeholder="Allergies, conditions..." />
            </div>
            <div>
              <Label className="flex items-center gap-2"><Paperclip className="w-4 h-4" />{t("patient.attachments")}</Label>
              <Button asChild size="sm" variant="outline" type="button" className="mt-1">
                <label className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  {t("patient.attachFiles")}
                  <input type="file" multiple className="hidden" onChange={handleAttachFiles} />
                </label>
              </Button>
              {pendingFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {pendingFiles.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="text-destructive">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
