import React, { useEffect, useState, useRef } from "react";
import { db, type Consultation, type Patient, type ToothCondition } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToothChart } from "@/components/ToothChart";
import { Plus, Printer, Stethoscope } from "lucide-react";
import { toast } from "sonner";

export function ConsultationsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [consultations, setConsultations] = useState<(Consultation & { patientName: string })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [printDialog, setPrintDialog] = useState<Consultation | null>(null);
  const [form, setForm] = useState({
    patientId: "",
    symptoms: "",
    diagnosis: "",
    treatmentPlan: "",
    prescription: "",
    notes: "",
    toothChart: {} as Record<string, ToothCondition>,
  });
  const printRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const allPatients = await db.patients.toArray();
    setPatients(allPatients);
    const all = await db.consultations.reverse().toArray();
    setConsultations(all.map(c => ({
      ...c,
      patientName: allPatients.find(p => p.id === c.patientId)?.firstName + " " + (allPatients.find(p => p.id === c.patientId)?.lastName || ""),
    })));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm({ patientId: "", symptoms: "", diagnosis: "", treatmentPlan: "", prescription: "", notes: "", toothChart: {} });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.patientId) return;
    await db.consultations.add({
      patientId: parseInt(form.patientId),
      dentistId: user!.id!,
      date: new Date().toISOString(),
      symptoms: form.symptoms,
      diagnosis: form.diagnosis,
      treatmentPlan: form.treatmentPlan,
      prescription: form.prescription,
      notes: form.notes,
      toothChart: form.toothChart,
      createdAt: new Date().toISOString(),
    });
    toast.success(t("consult.new"));
    setDialogOpen(false);
    load();
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
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{c.patientName}</p>
                    <p className="text-sm text-muted-foreground">{new Date(c.date).toLocaleDateString()}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handlePrint(c)} className="gap-1 no-print">
                    <Printer className="w-3 h-3" /> {t("consult.print")}
                  </Button>
                </div>
                {c.diagnosis && <p className="text-sm"><span className="font-medium">{t("consult.diagnosis")}:</span> {c.diagnosis}</p>}
                {c.treatmentPlan && <p className="text-sm"><span className="font-medium">{t("consult.treatment")}:</span> {c.treatmentPlan}</p>}
                {Object.keys(c.toothChart).length > 0 && (
                  <ToothChart chart={c.toothChart} onChange={() => {}} readOnly />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("consult.new")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("apt.patient")} *</Label>
              <Select value={form.patientId} onValueChange={v => setForm(f => ({ ...f, patientId: v }))}>
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
            <div>
              <Label>{t("consult.toothChart")}</Label>
              <ToothChart chart={form.toothChart} onChange={chart => setForm(f => ({ ...f, toothChart: chart }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print-only prescription */}
      {printDialog && (
        <div className="hidden print:block p-8" ref={printRef}>
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
            <p className="text-sm">{t("apt.dentist")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
