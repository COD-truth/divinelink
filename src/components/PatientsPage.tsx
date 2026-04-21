import React, { useEffect, useState } from "react";
import { db, generatePatientId, type Patient } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Edit, AlertTriangle, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/imageUtils";

export function PatientsPage() {
  const { t } = useLang();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", dob: "", address: "", medicalAlerts: "", photo: "" as string | undefined });

  const load = async () => {
    const all = await db.patients.reverse().toArray();
    setPatients(all);
  };

  useEffect(() => { load(); }, []);

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    return p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) ||
      p.phone.includes(q) || p.patientId.toLowerCase().includes(q);
  });

  const openNew = () => {
    setEditing(null);
    setForm({ firstName: "", lastName: "", phone: "", dob: "", address: "", medicalAlerts: "", photo: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: Patient) => {
    setEditing(p);
    setForm({ firstName: p.firstName, lastName: p.lastName, phone: p.phone, dob: p.dob, address: p.address, medicalAlerts: p.medicalAlerts, photo: p.photo || "" });
    setDialogOpen(true);
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
    if (editing?.id) {
      await db.patients.update(editing.id, { ...form, updatedAt: now });
      toast.success(t("common.save"));
    } else {
      const patientId = await generatePatientId();
      await db.patients.add({ ...form, patientId, createdAt: now, updatedAt: now });
      toast.success(t("patient.register"));
    }
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("patient.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
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
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm cursor-pointer" onClick={() => openEdit(p)}>
                  {p.firstName[0]}{p.lastName[0]}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(p)}>
                  <p className="font-medium truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-sm text-muted-foreground">{p.patientId} • {p.phone || "—"}</p>
                </div>
                {p.medicalAlerts && (
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                )}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("patient.firstName")} *</Label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <Label>{t("patient.lastName")} *</Label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("patient.phone")}</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>{t("patient.dob")}</Label>
              <Input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
            </div>
            <div>
              <Label>{t("patient.address")}</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label>{t("patient.alerts")}</Label>
              <Textarea value={form.medicalAlerts} onChange={e => setForm(f => ({ ...f, medicalAlerts: e.target.value }))} placeholder="Allergies, conditions..." />
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
    </div>
  );
}
