import React, { useEffect, useRef, useState } from "react";
import { db, type StaffMember, type Patient } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { QRCodeCanvas } from "qrcode.react";
import { Plus, Pencil, Trash2, Printer, ScanLine, Camera, UserCog } from "lucide-react";
import { toast } from "sonner";
import { getClinicSettings, getClinicId } from "@/lib/clinicSettings";
import { compressImage } from "@/lib/imageUtils";
import { decryptPatients } from "@/lib/patientCrypto";

function genStaffCode(): string {
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const digits = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `STAFF-${letters}-${digits}`;
}

export function StaffPage() {
  const { lang } = useLang();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<Partial<StaffMember>>({});
  const [cardFor, setCardFor] = useState<StaffMember | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const tr = (fr: string, en: string) => (lang === "en" ? en : fr);

  const load = async () => setStaff(await db.staff.orderBy("createdAt").reverse().toArray());
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ fullName: "", role: tr("Médecin", "Doctor"), staffCode: genStaffCode(), active: true });
    setDialogOpen(true);
  };
  const openEdit = (s: StaffMember) => { setEditing(s); setForm({ ...s }); setDialogOpen(true); };

  const save = async () => {
    if (!form.fullName?.trim()) { toast.error(tr("Nom requis", "Name required")); return; }
    if (!form.role?.trim()) { toast.error(tr("Rôle requis", "Role required")); return; }
    const now = new Date().toISOString();
    const payload: StaffMember = {
      fullName: form.fullName!.trim(),
      role: form.role!.trim(),
      staffCode: form.staffCode || genStaffCode(),
      linkedUserId: form.linkedUserId,
      photo: form.photo,
      dob: form.dob,
      phone: form.phone,
      specialty: form.specialty,
      license: form.license,
      active: form.active !== false,
      clinicId: getClinicId(),
      createdAt: editing?.createdAt || now,
      updatedAt: now,
    };
    if (editing?.id) await db.staff.update(editing.id, payload);
    else await db.staff.add(payload);
    toast.success(tr("Enregistré", "Saved"));
    setDialogOpen(false);
    load();
  };

  const remove = async (s: StaffMember) => {
    if (!confirm(tr("Supprimer ce membre ?", "Delete this member?"))) return;
    await db.staff.delete(s.id!);
    load();
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = await compressImage(file);
      setForm(f => ({ ...f, photo: data }));
    } catch { toast.error(tr("Image invalide", "Invalid image")); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">{tr("Personnel", "Staff")}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScanOpen(true)} className="gap-2">
            <ScanLine className="w-4 h-4" />{tr("Scanner QR", "Scan QR")}
          </Button>
          {isAdmin && (
            <Button onClick={openNew} className="gap-2">
              <Plus className="w-4 h-4" />{tr("Ajouter", "Add")}
            </Button>
          )}
        </div>
      </div>

      {staff.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{tr("Aucun membre enregistré", "No staff yet")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {staff.map(s => (
            <Card key={s.id}>
              <CardContent className="p-3 flex gap-3">
                <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {s.photo ? <img src={s.photo} alt={s.fullName} className="w-full h-full object-cover" /> : <UserCog className="w-6 h-6 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{s.fullName}</p>
                  <Badge variant="secondary" className="text-[10px] mt-0.5">{s.role}</Badge>
                  {s.specialty && <p className="text-xs text-muted-foreground truncate mt-1">{s.specialty}</p>}
                  <p className="text-[10px] text-muted-foreground font-mono mt-1">{s.staffCode}</p>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setCardFor(s)}>
                      <Printer className="w-3 h-3 mr-1" />{tr("Badge", "ID")}
                    </Button>
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(s)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(s)}><Trash2 className="w-3 h-3" /></Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? tr("Modifier", "Edit") : tr("Nouveau membre", "New member")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                {form.photo ? <img src={form.photo} className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-muted-foreground" />}
              </div>
              <Input type="file" accept="image/*" onChange={onPhoto} />
            </div>
            <div><Label>{tr("Nom complet", "Full name")}*</Label>
              <Input value={form.fullName || ""} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} /></div>
            <div><Label>{tr("Rôle", "Role")}*</Label>
              <Input value={form.role || ""} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="Médecin, Infirmière..." /></div>
            <div><Label>{tr("Spécialité", "Specialty")}</Label>
              <Input value={form.specialty || ""} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>{tr("Téléphone", "Phone")}</Label>
                <Input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>{tr("Naissance", "DOB")}</Label>
                <Input type="date" value={form.dob || ""} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} /></div>
            </div>
            <div><Label>{tr("N° licence / Ordre", "License #")}</Label>
              <Input value={form.license || ""} onChange={e => setForm(f => ({ ...f, license: e.target.value }))} /></div>
            <div><Label>{tr("Code badge", "Staff code")}</Label>
              <Input value={form.staffCode || ""} onChange={e => setForm(f => ({ ...f, staffCode: e.target.value }))} className="font-mono text-sm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tr("Annuler", "Cancel")}</Button>
            <Button onClick={save}>{tr("Enregistrer", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ID Card view */}
      <Dialog open={!!cardFor} onOpenChange={o => !o && setCardFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{tr("Badge d'identification", "ID Card")}</DialogTitle></DialogHeader>
          {cardFor && <IDCardView staff={cardFor} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCardFor(null)}>{tr("Fermer", "Close")}</Button>
            <Button onClick={() => window.print()} className="gap-2"><Printer className="w-4 h-4" />{tr("Imprimer", "Print")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scanner */}
      <QRScannerDialog open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  );
}

function IDCardView({ staff }: { staff: StaffMember }) {
  const clinic = getClinicSettings();
  const qrPayload = JSON.stringify({ kind: "staff", code: staff.staffCode, name: staff.fullName, role: staff.role });
  return (
    <div className="print-area mx-auto" style={{ width: 340 }}>
      <div className="rounded-xl overflow-hidden border-2 border-primary shadow-lg bg-card">
        <div className="bg-primary text-primary-foreground p-3 flex items-center gap-2">
          {clinic?.logo && <img src={clinic.logo} alt="logo" className="w-10 h-10 rounded bg-white p-1 object-contain" />}
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{clinic?.name || "DivineLink"}</p>
            {clinic?.city && <p className="text-[10px] opacity-90 truncate">{clinic.city}</p>}
          </div>
        </div>
        <div className="p-4 flex gap-3 items-center">
          <div className="w-24 h-24 rounded-lg bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center border">
            {staff.photo ? <img src={staff.photo} className="w-full h-full object-cover" /> : <UserCog className="w-8 h-8 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight">{staff.fullName}</p>
            <Badge className="mt-1">{staff.role}</Badge>
            {staff.specialty && <p className="text-xs text-muted-foreground mt-1">{staff.specialty}</p>}
            {staff.license && <p className="text-[10px] text-muted-foreground mt-0.5">N° {staff.license}</p>}
          </div>
        </div>
        <div className="px-4 pb-4 flex items-center justify-between gap-3">
          <div className="text-[10px] text-muted-foreground">
            <p className="font-mono font-semibold">{staff.staffCode}</p>
            <p className="mt-1">ID: {staff.id}</p>
          </div>
          <QRCodeCanvas value={qrPayload} size={88} includeMargin={false} />
        </div>
      </div>
      <style>{`@media print {
        body * { visibility: hidden; }
        .print-area, .print-area * { visibility: visible; }
        .print-area { position: absolute; left: 0; top: 0; }
      }`}</style>
    </div>
  );
}

function QRScannerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useLang();
  const tr = (fr: string, en: string) => (lang === "en" ? en : fr);
  const containerId = "qr-reader-container";
  const scannerRef = useRef<any>(null);
  const [result, setResult] = useState<{ kind: "patient" | "staff" | "unknown"; data: any } | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        await new Promise(r => setTimeout(r, 100));
        const html5 = new Html5Qrcode(containerId);
        scannerRef.current = html5;
        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 240 },
          async (decoded) => {
            if (stopped) return;
            stopped = true;
            try {
              const parsed = JSON.parse(decoded);
              if (parsed.kind === "patient") {
                const p = await db.patients.where("anonCode").equals(parsed.code).first()
                  || await db.patients.where("patientId").equals(parsed.code).first();
                if (p) {
                  const [dec] = await decryptPatients([p]);
                  setPatient(dec);
                  setResult({ kind: "patient", data: parsed });
                } else setResult({ kind: "unknown", data: decoded });
              } else if (parsed.kind === "staff") {
                setResult({ kind: "staff", data: parsed });
              } else setResult({ kind: "unknown", data: decoded });
            } catch {
              // Try as plain patient code
              const code = decoded.trim();
              const p = await db.patients.where("anonCode").equals(code).first()
                || await db.patients.where("patientId").equals(code).first();
              if (p) {
                const [dec] = await decryptPatients([p]);
                setPatient(dec);
                setResult({ kind: "patient", data: { code } });
              } else setResult({ kind: "unknown", data: decoded });
            }
            try { await html5.stop(); } catch {}
          },
          () => {}
        );
      } catch (e) {
        toast.error(tr("Caméra non disponible", "Camera unavailable"));
        onClose();
      }
    })();
    return () => {
      stopped = true;
      try { scannerRef.current?.stop().catch(() => {}); } catch {}
    };
  }, [open]);

  const close = () => { setResult(null); setPatient(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{tr("Scanner un QR", "Scan QR Code")}</DialogTitle></DialogHeader>
        {!result ? (
          <div>
            <div id={containerId} className="rounded overflow-hidden bg-black aspect-square" />
            <p className="text-xs text-muted-foreground mt-2 text-center">{tr("Pointez vers un QR patient ou personnel", "Point at a patient or staff QR")}</p>
          </div>
        ) : result.kind === "patient" && patient ? (
          <div className="space-y-2">
            <Badge>{tr("Patient", "Patient")}</Badge>
            <p className="text-lg font-semibold">{patient.firstName} {patient.lastName}</p>
            <p className="text-sm text-muted-foreground">{patient.phone}</p>
            <p className="text-xs font-mono">{patient.patientId}</p>
          </div>
        ) : result.kind === "staff" ? (
          <div className="space-y-2">
            <Badge>{tr("Personnel", "Staff")}</Badge>
            <p className="text-lg font-semibold">{result.data.name}</p>
            <p className="text-sm">{result.data.role}</p>
            <p className="text-xs font-mono">{result.data.code}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("QR inconnu :", "Unknown QR:")} <code className="text-xs">{String(result.data).slice(0, 80)}</code></p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>{tr("Fermer", "Close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
