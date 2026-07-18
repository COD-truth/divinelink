import React, { useEffect, useMemo, useState, useCallback } from "react";
import { db, type Ward, type Bed, type Admission, type CareNote, type Patient } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicId } from "@/lib/clinicSettings";
import { logAudit } from "@/lib/audit";

/** Poll-based live query (works without dexie-react-hooks). */
function useLive<T>(fn: () => Promise<T>, deps: React.DependencyList, intervalMs = 3000): T | undefined {
  const [val, setVal] = useState<T | undefined>(undefined);
  const run = useCallback(async () => { try { setVal(await fn()); } catch {} }, deps); // eslint-disable-line
  useEffect(() => { run(); const id = setInterval(run, intervalMs); return () => clearInterval(id); }, [run, intervalMs]);
  return val;
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BedDouble, Plus, Trash2, LogOut, ClipboardList, Building2, Printer } from "lucide-react";
import { toast } from "sonner";

export function AdmissionsPage() {
  const { user } = useAuth();
  const wards = useLive(() => db.wards.toArray(), []) || [];
  const beds = useLive(() => db.beds.toArray(), []) || [];
  const admissions = useLive(() => db.admissions.toArray(), []) || [];
  const patients = useLive(() => db.patients.toArray(), []) || [];

  const activeAdmissions = admissions.filter(a => a.status === "active");
  const activeByBed = useMemo(() => {
    const m = new Map<number, Admission>();
    for (const a of activeAdmissions) m.set(a.bedId, a);
    return m;
  }, [activeAdmissions]);

  const patientById = useMemo(() => {
    const m = new Map<number, Patient>();
    for (const p of patients) if (p.id != null) m.set(p.id, p);
    return m;
  }, [patients]);

  const [wardDialog, setWardDialog] = useState(false);
  const [wardName, setWardName] = useState("");
  const [wardDesc, setWardDesc] = useState("");
  const [bedDialogWard, setBedDialogWard] = useState<Ward | null>(null);
  const [bedLabel, setBedLabel] = useState("");
  const [admitBed, setAdmitBed] = useState<Bed | null>(null);
  const [admitPatientId, setAdmitPatientId] = useState<number | null>(null);
  const [admitReason, setAdmitReason] = useState("");
  const [admitDiagnosis, setAdmitDiagnosis] = useState("");
  const [detail, setDetail] = useState<Admission | null>(null);

  const addWard = async () => {
    if (!wardName.trim()) return;
    await db.wards.add({
      name: wardName.trim(),
      description: wardDesc.trim() || undefined,
      clinicId: getClinicId(),
      createdAt: new Date().toISOString(),
    });
    setWardName(""); setWardDesc(""); setWardDialog(false);
    toast.success("Service ajouté");
  };

  const deleteWard = async (w: Ward) => {
    if (!w.id) return;
    const wardBeds = beds.filter(b => b.wardId === w.id);
    const occupied = wardBeds.some(b => activeByBed.has(b.id!));
    if (occupied) { toast.error("Impossible : lits occupés"); return; }
    if (!confirm(`Supprimer le service "${w.name}" et ses ${wardBeds.length} lits ?`)) return;
    await db.beds.bulkDelete(wardBeds.map(b => b.id!));
    await db.wards.delete(w.id);
    toast.success("Service supprimé");
  };

  const addBed = async () => {
    if (!bedDialogWard?.id || !bedLabel.trim()) return;
    await db.beds.add({
      wardId: bedDialogWard.id,
      label: bedLabel.trim(),
      status: "available",
      clinicId: getClinicId(),
      createdAt: new Date().toISOString(),
    });
    setBedLabel(""); setBedDialogWard(null);
  };

  const deleteBed = async (b: Bed) => {
    if (!b.id) return;
    if (activeByBed.has(b.id)) { toast.error("Lit occupé"); return; }
    await db.beds.delete(b.id);
  };

  const doAdmit = async () => {
    if (!admitBed?.id || !admitPatientId || !admitReason.trim()) {
      toast.error("Patient et motif requis"); return;
    }
    const id = await db.admissions.add({
      patientId: admitPatientId,
      wardId: admitBed.wardId,
      bedId: admitBed.id,
      admittedAt: new Date().toISOString(),
      admittedBy: user?.name,
      reason: admitReason.trim(),
      diagnosis: admitDiagnosis.trim() || undefined,
      status: "active",
      clinicId: getClinicId(),
    });
    await db.beds.update(admitBed.id, { status: "occupied" });
    await logAudit("appointment_create", user?.name || "?", { resource: "admission", resourceId: id as any, message: `Admission bed ${admitBed.label}` });
    setAdmitBed(null); setAdmitPatientId(null); setAdmitReason(""); setAdmitDiagnosis("");
    toast.success("Patient admis");
  };

  const doDischarge = async (a: Admission, summary: string) => {
    if (!a.id) return;
    await db.admissions.update(a.id, {
      status: "discharged",
      dischargedAt: new Date().toISOString(),
      dischargeSummary: summary,
    });
    await db.beds.update(a.bedId, { status: "available" });
    await logAudit("appointment_update", user?.name || "?", { resource: "admission", resourceId: a.id, message: "Discharge" });
    toast.success("Sortie enregistrée");
    setDetail(null);
  };

  const activeCount = activeAdmissions.length;
  const totalBeds = beds.length;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <BedDouble className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold flex-1">Hospitalisation</h1>
        <Badge variant="outline">{activeCount} admissions actives</Badge>
        <Badge variant="outline">{totalBeds - activeCount}/{totalBeds} lits libres</Badge>
        <Button size="sm" variant="outline" onClick={() => setWardDialog(true)}>
          <Plus className="w-4 h-4 mr-1" /> Service
        </Button>
      </div>

      <Tabs defaultValue="wards">
        <TabsList>
          <TabsTrigger value="wards"><Building2 className="w-4 h-4 mr-1" />Services & Lits</TabsTrigger>
          <TabsTrigger value="active"><ClipboardList className="w-4 h-4 mr-1" />Patients hospitalisés</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="wards" className="space-y-4">
          {wards.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              Aucun service. Créez-en un pour commencer.
            </CardContent></Card>
          )}
          {wards.map(w => {
            const wb = beds.filter(b => b.wardId === w.id);
            return (
              <Card key={w.id}>
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <div>
                    <CardTitle className="text-base">{w.name}</CardTitle>
                    {w.description && <p className="text-xs text-muted-foreground">{w.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setBedDialogWard(w)}>
                      <Plus className="w-4 h-4 mr-1" /> Lit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteWard(w)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {wb.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun lit</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {wb.map(b => {
                        const adm = activeByBed.get(b.id!);
                        const pat = adm ? patientById.get(adm.patientId) : null;
                        return (
                          <div key={b.id}
                            className={`border rounded-lg p-2 text-center relative ${
                              adm ? "bg-destructive/10 border-destructive/30"
                                  : "bg-emerald-500/10 border-emerald-500/30"
                            }`}>
                            <div className="font-semibold">{b.label}</div>
                            {adm && pat ? (
                              <button
                                onClick={() => setDetail(adm)}
                                className="text-xs mt-1 underline text-left w-full truncate"
                              >{pat.firstName} {pat.lastName}</button>
                            ) : (
                              <div className="flex flex-col gap-1 mt-1">
                                <Button size="sm" variant="secondary" className="h-7 text-xs"
                                  onClick={() => setAdmitBed(b)}>Admettre</Button>
                                <button onClick={() => deleteBed(b)} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-3 h-3 mx-auto" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="active">
          <Card><CardContent className="p-4 space-y-2">
            {activeAdmissions.length === 0 && <p className="text-sm text-muted-foreground">Aucun patient hospitalisé</p>}
            {activeAdmissions.map(a => {
              const p = patientById.get(a.patientId);
              const w = wards.find(x => x.id === a.wardId);
              const b = beds.find(x => x.id === a.bedId);
              return (
                <div key={a.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <div className="font-semibold">{p ? `${p.firstName} ${p.lastName}` : "Patient inconnu"}</div>
                    <div className="text-xs text-muted-foreground">
                      {w?.name} · Lit {b?.label} · Admis {new Date(a.admittedAt).toLocaleString()}
                    </div>
                    <div className="text-sm mt-1">{a.reason}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setDetail(a)}>Ouvrir</Button>
                </div>
              );
            })}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="history">
          <Card><CardContent className="p-4 space-y-2">
            {admissions.filter(a => a.status === "discharged").length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun antécédent d'hospitalisation</p>
            )}
            {admissions.filter(a => a.status === "discharged").map(a => {
              const p = patientById.get(a.patientId);
              const b = beds.find(x => x.id === a.bedId);
              return (
                <div key={a.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <b>{p ? `${p.firstName} ${p.lastName}` : "?"}</b>
                    <span className="text-muted-foreground">Lit {b?.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.admittedAt).toLocaleDateString()} → {a.dischargedAt ? new Date(a.dischargedAt).toLocaleDateString() : "?"}
                  </div>
                  <div className="mt-1">{a.reason}</div>
                  {a.dischargeSummary && <div className="mt-1 text-xs italic">Résumé : {a.dischargeSummary}</div>}
                </div>
              );
            })}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Add ward */}
      <Dialog open={wardDialog} onOpenChange={setWardDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau service</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom du service</Label><Input value={wardName} onChange={e => setWardName(e.target.value)} placeholder="Médecine générale" /></div>
            <div><Label>Description</Label><Input value={wardDesc} onChange={e => setWardDesc(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={addWard}>Créer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add bed */}
      <Dialog open={!!bedDialogWard} onOpenChange={o => !o && setBedDialogWard(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un lit — {bedDialogWard?.name}</DialogTitle></DialogHeader>
          <div><Label>Identifiant du lit</Label><Input value={bedLabel} onChange={e => setBedLabel(e.target.value)} placeholder="L-01" /></div>
          <DialogFooter><Button onClick={addBed}>Ajouter</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admit */}
      <Dialog open={!!admitBed} onOpenChange={o => !o && setAdmitBed(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Admission — Lit {admitBed?.label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Patient</Label>
              <Select value={admitPatientId ? String(admitPatientId) : ""} onValueChange={v => setAdmitPatientId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Choisir un patient" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {patients.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName} — {p.patientId}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Motif d'admission</Label><Textarea rows={2} value={admitReason} onChange={e => setAdmitReason(e.target.value)} /></div>
            <div><Label>Diagnostic présumé</Label><Input value={admitDiagnosis} onChange={e => setAdmitDiagnosis(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={doAdmit}>Admettre</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail + care notes */}
      {detail && (
        <AdmissionDetailDialog
          admission={detail}
          patient={patientById.get(detail.patientId) || null}
          ward={wards.find(w => w.id === detail.wardId) || null}
          bed={beds.find(b => b.id === detail.bedId) || null}
          onClose={() => setDetail(null)}
          onDischarge={doDischarge}
        />
      )}
    </div>
  );
}

function AdmissionDetailDialog({
  admission, patient, ward, bed, onClose, onDischarge,
}: {
  admission: Admission;
  patient: Patient | null;
  ward: Ward | null;
  bed: Bed | null;
  onClose: () => void;
  onDischarge: (a: Admission, summary: string) => void;
}) {
  const { user } = useAuth();
  const notes = useLive(
    () => db.careNotes.where("admissionId").equals(admission.id!).toArray(),
    [admission.id]
  ) || [];
  const [note, setNote] = useState("");
  const [bp, setBp] = useState(""); const [pulse, setPulse] = useState("");
  const [temp, setTemp] = useState(""); const [spo2, setSpo2] = useState("");
  const [summary, setSummary] = useState("");
  const [showDischarge, setShowDischarge] = useState(false);

  const addNote = async () => {
    if (!note.trim() || !admission.id) return;
    await db.careNotes.add({
      admissionId: admission.id,
      patientId: admission.patientId,
      authorName: user?.name || "?",
      authorRole: user?.role,
      note: note.trim(),
      vitals: (bp || pulse || temp || spo2) ? { bp, pulse, temp, spo2 } : undefined,
      createdAt: new Date().toISOString(),
      clinicId: admission.clinicId,
    });
    setNote(""); setBp(""); setPulse(""); setTemp(""); setSpo2("");
    toast.success("Note ajoutée");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {patient ? `${patient.firstName} ${patient.lastName}` : "Patient"} — {ward?.name} · Lit {bed?.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm p-3 rounded-lg bg-muted">
            <div><b>Admis le :</b> {new Date(admission.admittedAt).toLocaleString()}</div>
            <div><b>Par :</b> {admission.admittedBy || "?"}</div>
            <div><b>Motif :</b> {admission.reason}</div>
            {admission.diagnosis && <div><b>Diagnostic :</b> {admission.diagnosis}</div>}
          </div>

          <div className="space-y-2">
            <Label>Nouvelle note de suivi</Label>
            <div className="grid grid-cols-4 gap-2">
              <Input placeholder="TA" value={bp} onChange={e => setBp(e.target.value)} />
              <Input placeholder="Pouls" value={pulse} onChange={e => setPulse(e.target.value)} />
              <Input placeholder="T°" value={temp} onChange={e => setTemp(e.target.value)} />
              <Input placeholder="SpO2" value={spo2} onChange={e => setSpo2(e.target.value)} />
            </div>
            <Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Observation, soin administré, évolution…" />
            <Button size="sm" onClick={addNote}>Ajouter la note</Button>
          </div>

          <div className="space-y-2">
            <Label>Historique ({notes.length})</Label>
            {notes.length === 0 && <p className="text-sm text-muted-foreground">Aucune note</p>}
            {[...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(n => (
              <div key={n.id} className="border rounded-lg p-2 text-sm">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{n.authorName} ({n.authorRole})</span>
                  <span>{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                {n.vitals && (
                  <div className="text-xs mt-1">
                    {n.vitals.bp && `TA ${n.vitals.bp} `}
                    {n.vitals.pulse && `· P ${n.vitals.pulse} `}
                    {n.vitals.temp && `· T° ${n.vitals.temp} `}
                    {n.vitals.spo2 && `· SpO2 ${n.vitals.spo2}`}
                  </div>
                )}
                <div className="mt-1 whitespace-pre-wrap">{n.note}</div>
              </div>
            ))}
          </div>

          {admission.status === "active" && (
            !showDischarge ? (
              <Button variant="destructive" onClick={() => setShowDischarge(true)}>
                <LogOut className="w-4 h-4 mr-1" /> Sortie / Discharge
              </Button>
            ) : (
              <div className="space-y-2 border-t pt-3">
                <Label>Résumé de sortie</Label>
                <Textarea rows={4} value={summary} onChange={e => setSummary(e.target.value)}
                  placeholder="Évolution, traitement de sortie, recommandations…" />
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={() => onDischarge(admission, summary)}>Confirmer sortie</Button>
                  <Button variant="outline" onClick={() => window.print()}>
                    <Printer className="w-4 h-4 mr-1" /> Imprimer
                  </Button>
                  <Button variant="ghost" onClick={() => setShowDischarge(false)}>Annuler</Button>
                </div>
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
