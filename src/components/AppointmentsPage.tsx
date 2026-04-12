import React, { useEffect, useState } from "react";
import { db, type Appointment, type Patient, type User, type AppointmentStatus } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<AppointmentStatus, string> = {
  scheduled: "bg-info text-info-foreground",
  completed: "bg-success text-success-foreground",
  cancelled: "bg-muted text-muted-foreground",
  noshow: "bg-destructive text-destructive-foreground",
};

export function AppointmentsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [appointments, setAppointments] = useState<(Appointment & { patientName: string; doctorName: string })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ patientId: "", doctorId: "", date: "", time: "", reason: "", status: "scheduled" as AppointmentStatus });

  const load = async () => {
    const allPatients = await db.patients.toArray();
    const allDoctors = await db.users.where("role").anyOf(["doctor", "admin"]).toArray();
    setPatients(allPatients);
    setDoctors(allDoctors);

    let appts = await db.appointments.where("date").equals(selectedDate).toArray();
    if (user?.role === "doctor") {
      appts = appts.filter(a => a.doctorId === user.id);
    }

    const enriched = appts.map(a => ({
      ...a,
      patientName: allPatients.find(p => p.id === a.patientId)?.firstName + " " + (allPatients.find(p => p.id === a.patientId)?.lastName || ""),
      doctorName: allDoctors.find(d => d.id === a.doctorId)?.name || "—",
    })).sort((a, b) => a.time.localeCompare(b.time));

    setAppointments(enriched);
  };

  useEffect(() => { load(); }, [selectedDate]);

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const openNew = () => {
    setForm({ patientId: "", doctorId: user?.id?.toString() || "", date: selectedDate, time: "09:00", reason: "", status: "scheduled" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.patientId || !form.doctorId || !form.date) return;
    const now = new Date().toISOString();
    await db.appointments.add({
      patientId: parseInt(form.patientId),
      doctorId: parseInt(form.doctorId),
      date: form.date,
      time: form.time,
      reason: form.reason,
      status: form.status,
      createdAt: now,
      updatedAt: now,
    });
    toast.success(t("apt.create"));
    setDialogOpen(false);
    load();
  };

  const updateStatus = async (id: number, status: AppointmentStatus) => {
    await db.appointments.update(id, { status, updatedAt: new Date().toISOString() });
    load();
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shiftDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto" />
          <Button variant="outline" size="icon" onClick={() => shiftDate(1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}>
            {t("apt.today")}
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{t("apt.create")}</Button>
      </div>

      {appointments.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t("common.noData")}</p>
      ) : (
        <div className="grid gap-3">
          {appointments.map(a => (
            <Card key={a.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="text-center min-w-[48px]">
                  <p className="text-lg font-bold text-primary">{a.time}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.patientName}</p>
                  <p className="text-sm text-muted-foreground truncate">{a.reason || "—"} • Dr. {a.doctorName}</p>
                </div>
                <Select value={a.status} onValueChange={(v) => updateStatus(a.id!, v as AppointmentStatus)}>
                  <SelectTrigger className="w-auto">
                    <Badge className={statusColors[a.status]}>{t(`apt.${a.status}`)}</Badge>
                  </SelectTrigger>
                  <SelectContent>
                    {(["scheduled", "completed", "cancelled", "noshow"] as const).map(s => (
                      <SelectItem key={s} value={s}>{t(`apt.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("apt.create")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("apt.patient")} *</Label>
              <Select value={form.patientId} onValueChange={v => setForm(f => ({ ...f, patientId: v }))}>
                <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent>
                  {patients.map(p => (
                    <SelectItem key={p.id} value={p.id!.toString()}>{p.firstName} {p.lastName} ({p.patientId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("apt.doctor")} *</Label>
              <Select value={form.doctorId} onValueChange={v => setForm(f => ({ ...f, doctorId: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {doctors.map(d => (
                    <SelectItem key={d.id} value={d.id!.toString()}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("apt.date")} *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>{t("apt.time")}</Label>
                <Input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("apt.reason")}</Label>
              <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
