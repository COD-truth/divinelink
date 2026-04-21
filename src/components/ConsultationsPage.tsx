import React, { useEffect, useState } from "react";
import { db, type Consultation, type ConsultationImage, type Patient } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Printer, Edit, Trash2, History, AlertTriangle, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { compressImage } from "@/lib/imageUtils";

type ConsultationWithMeta = Consultation & { patientName: string };

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
  const [form, setForm] = useState({
    patientId: "",
    symptoms: "",
    diagnosis: "",
    treatmentPlan: "",
    prescription: "",
    notes: "",
    images: [] as ConsultationImage[],
  });
  const [previewImg, setPreviewImg] = useState<ConsultationImage | null>(null);

  const load = async () => {
    const allPatients = await db.patients.toArray();
    setPatients(allPatients);
    const all = await db.consultations.where("isLatest").equals(1).reverse().toArray();
    const fallback = all.length === 0 ? await db.consultations.reverse().toArray() : all;
    setConsultations(fallback.filter(c => c.isLatest !== false).map(c => {
      const p = allPatients.find(p => p.id === c.patientId);
      return { ...c, patientName: p ? `${p.firstName} ${p.lastName}` : "—" };
    }));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ patientId: "", symptoms: "", diagnosis: "", treatmentPlan: "", prescription: "", notes: "", images: [] });
    setDialogOpen(true);
  };

  const openEdit = (c: Consultation) => {
    setEditingId(c.id!);
    setForm({
      patientId: c.patientId.toString(),
      symptoms: c.symptoms,
      diagnosis: c.diagnosis,
      treatmentPlan: c.treatmentPlan,
      prescription: c.prescription,
      notes: c.notes,
      images: c.images || [],
    });
    setDialogOpen(true);
  };

  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      const newImages: ConsultationImage[] = [];
      for (const file of files) {
        const data = await compressImage(file);
        newImages.push({
          id: crypto.randomUUID(),
          filename: file.name,
          data,
          uploadedAt: new Date().toISOString(),
          caption: "",
        });
      }
      setForm(f => ({ ...f, images: [...f.images, ...newImages] }));
    } catch {
      toast.error("Image error");
    }
    e.target.value = "";
  };

  const removeImage = (id: string) => {
    setForm(f => ({ ...f, images: f.images.filter(i => i.id !== id) }));
  };

  const updateCaption = (id: string, caption: string) => {
    setForm(f => ({ ...f, images: f.images.map(i => i.id === id ? { ...i, caption } : i) }));
  };

  const save = async () => {
    if (!form.patientId) return;
    const now = new Date().toISOString();

    if (editingId) {
      const old = await db.consultations.get(editingId);
      if (old) {
        await db.consultations.update(editingId, { isLatest: false });
        const originalId = old.originalId || old.id!;
        const currentVersion = old.versionNumber || 1;
        await db.consultations.add({
          patientId: parseInt(form.patientId),
          doctorId: user!.id!,
          date: now,
          symptoms: form.symptoms,
          diagnosis: form.diagnosis,
          treatmentPlan: form.treatmentPlan,
          prescription: form.prescription,
          notes: form.notes,
          images: form.images,
          createdAt: now,
          originalId,
          isLatest: true,
          versionNumber: currentVersion + 1,
          editedAt: now,
          editedBy: user!.name,
        });
      }
      toast.success(t("consult.updated"));
    } else {
      const id = await db.consultations.add({
        patientId: parseInt(form.patientId),
        doctorId: user!.id!,
        date: now,
        symptoms: form.symptoms,
        diagnosis: form.diagnosis,
        treatmentPlan: form.treatmentPlan,
        prescription: form.prescription,
        notes: form.notes,
        images: form.images,
        createdAt: now,
        versionNumber: 1,
      });
      await db.consultations.update(id as number, { originalId: id as number });
      toast.success(t("consult.new"));
    }
    setDialogOpen(false);
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
    const allPatients = await db.patients.toArray();
    const versions = await db.consultations
      .where("originalId").equals(origId)
      .reverse()
      .toArray();
    const orig = await db.consultations.get(origId);
    const allVersions = orig && !versions.find(v => v.id === orig.id)
      ? [...versions, orig]
      : versions;
    
    setHistoryDialog(allVersions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(v => {
      const p = allPatients.find(p => p.id === v.patientId);
      return { ...v, patientName: p ? `${p.firstName} ${p.lastName}` : "—" };
    }));
  };

  const handlePrint = (c: Consultation) => {
    setPrintDialog(c);
    setTimeout(() => window.print(), 300);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{t("consult.new")}</Button>
      </div>

      {consultations.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t("common.noData")}</p>
      ) : (
        <div className="grid gap-3">
          {consultations.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.patientName}</p>
                    <p className="text-sm text-muted-foreground">{new Date(c.date).toLocaleDateString()}</p>
                    <div className="flex gap-2 mt-1">
                      {c.parentId && (
                        <span className="inline-flex items-center gap-1 text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                          {t("consult.modified")}
                        </span>
                      )}
                      {c.versionNumber && c.versionNumber > 1 && (
                        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          v{c.versionNumber} • {t("consult.editedBy")}: {c.editedBy}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 no-print flex-shrink-0">
                    {(c.originalId || c.parentId) && (
                      <Button variant="ghost" size="sm" onClick={() => showHistory(c)} title={t("consult.viewVersions")}>
                        <History className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title={t("common.edit")}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handlePrint(c)} title={t("consult.print")}>
                      <Printer className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(c.id!)} className="text-destructive" title={t("common.delete")}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {c.diagnosis && <p className="text-sm"><span className="font-medium">{t("consult.diagnosis")}:</span> {c.diagnosis}</p>}
                {c.treatmentPlan && <p className="text-sm"><span className="font-medium">{t("consult.treatment")}:</span> {c.treatmentPlan}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t("consult.edit") : t("consult.new")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("apt.patient")} *</Label>
              <Select value={form.patientId} onValueChange={v => setForm(f => ({ ...f, patientId: v }))} disabled={!!editingId}>
                <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent>
                  {patients.map(p => (
                    <SelectItem key={p.id} value={p.id!.toString()}>{p.firstName} {p.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("consult.symptoms")}</Label>
              <Textarea value={form.symptoms} onChange={e => setForm(f => ({ ...f, symptoms: e.target.value }))} />
            </div>
            <div>
              <Label>{t("consult.diagnosis")}</Label>
              <Textarea value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))} />
            </div>
            <div>
              <Label>{t("consult.treatment")}</Label>
              <Textarea value={form.treatmentPlan} onChange={e => setForm(f => ({ ...f, treatmentPlan: e.target.value }))} />
            </div>
            <div>
              <Label>{t("consult.prescription")}</Label>
              <Textarea value={form.prescription} onChange={e => setForm(f => ({ ...f, prescription: e.target.value }))} />
            </div>
            <div>
              <Label>{t("consult.notes")}</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {/* Images attached to consultation */}
            <div>
              <div className="flex items-center justify-between">
                <Label>{t("doc.images")}</Label>
                <Button asChild size="sm" variant="outline" type="button">
                  <label className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    {t("doc.addImages")}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddImages} />
                  </label>
                </Button>
              </div>
              {form.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {form.images.map(img => (
                    <div key={img.id} className="relative group">
                      <button
                        type="button"
                        className="block w-full aspect-square rounded overflow-hidden bg-muted"
                        onClick={() => setPreviewImg(img)}
                      >
                        <img src={img.data} alt={img.filename} className="w-full h-full object-cover" />
                      </button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(img.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                      <Input
                        className="mt-1 h-7 text-xs"
                        placeholder={t("doc.caption")}
                        value={img.caption || ""}
                        onChange={e => updateCaption(img.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
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
          <DialogHeader><DialogTitle>{t("consult.confirmDelete")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            {t("consult.deleteWarning")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>{t("common.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version history dialog */}
      <Dialog open={historyDialog !== null} onOpenChange={() => setHistoryDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("consult.history")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {historyDialog?.map((v, idx) => (
              <Card key={v.id} className={v.isLatest ? "border-primary" : "opacity-70"}>
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={v.isLatest ? "default" : "secondary"}>
                      {v.versionNumber ? `${t("consult.version")} ${v.versionNumber}` : (v.isLatest ? t("consult.currentVersion") : t("consult.olderVersion"))}
                    </Badge>
                    <Badge variant="outline">
                      {!v.parentId ? t("consult.original") : t("consult.revision")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(v.date).toLocaleString()}</span>
                    {v.editedBy && (
                      <span className="text-xs text-muted-foreground">• {t("consult.editedBy")}: {v.editedBy}</span>
                    )}
                  </div>
                  {v.diagnosis && <p className="text-sm"><strong>{t("consult.diagnosis")}:</strong> {v.diagnosis}</p>}
                  {v.treatmentPlan && <p className="text-sm"><strong>{t("consult.treatment")}:</strong> {v.treatmentPlan}</p>}
                  {v.prescription && <p className="text-sm"><strong>{t("consult.prescription")}:</strong> {v.prescription}</p>}
                  {v.notes && <p className="text-sm"><strong>{t("consult.notes")}:</strong> {v.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Print-only prescription */}
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
          <div className="mt-12 text-right">
            <p>____________________________</p>
            <p className="text-sm">{t("apt.doctor")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
