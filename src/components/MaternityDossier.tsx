import { useEffect, useMemo, useState } from "react";
import { db, type MaternityFile, type AncVisit, type AncVisitKind, type MaternityRecord } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicSettings } from "@/lib/clinicSettings";
import { logAudit } from "@/lib/audit";
import { PartographPanel } from "./PartographPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Baby, Stethoscope, HeartPulse, Printer, Pencil, Check, X, Trash2, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const todayYmd = () => new Date().toISOString().slice(0, 10);
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// --- obstetric helpers ---
const addDays = (ymd: string, n: number) => {
  const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const weeksBetween = (fromYmd: string, toYmd: string) =>
  Math.max(0, Math.floor((new Date(toYmd + "T00:00:00").getTime() - new Date(fromYmd + "T00:00:00").getTime()) / (7 * 86400000)));
const gaFromDdr = (ddr?: string) => (ddr ? weeksBetween(ddr, todayYmd()) : undefined);
const dpaFromDdr = (ddr?: string) => (ddr ? addDays(ddr, 280) : undefined); // règle de Naegele
const frDate = (ymd?: string) => (ymd ? new Date(ymd + "T00:00:00").toLocaleDateString("fr-FR") : "—");

const PRESENT = ["Céphalique", "Siège", "Transverse"];
const ALBU = ["0", "+", "++", "+++"];
const VAT = ["VAT1", "VAT2", "VAT3", "VAT4", "VAT5"];
const ALLAIT = ["Exclusif", "Mixte", "Artificiel"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[11px] text-muted-foreground block mb-0.5">{label}</label>{children}</div>;
}
function Toggle({ on, onClick, children, danger }: { on: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return <Button type="button" size="sm" variant={on ? (danger ? "destructive" : "default") : "outline"} className="h-8 text-xs" onClick={onClick}>{children}</Button>;
}

export function MaternityDossier({ fileId, onBack, onRecordDelivery }: {
  fileId: number;
  onBack: () => void;
  onRecordDelivery: (file: MaternityFile) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [file, setFile] = useState<MaternityFile | null>(null);
  const [visits, setVisits] = useState<AncVisit[]>([]);
  const [delivery, setDelivery] = useState<MaternityRecord | null>(null);
  const [editHdr, setEditHdr] = useState(false);
  const [adding, setAdding] = useState<AncVisitKind | null>(null);

  const load = async () => {
    const f = await db.maternityFiles.get(fileId);
    setFile(f || null);
    const vs = await db.ancVisits.where("fileId").equals(fileId).toArray();
    setVisits(vs.filter(v => !v.deleted).sort((a, b) => (b.date || "").localeCompare(a.date || "")));
    // Resolve the delivery by fileId (robust across devices — the local
    // deliveryRecordId from another device would be meaningless here).
    const delRec = (await db.maternityRecords.toArray()).find(r => !r.deleted && r.fileId === fileId);
    setDelivery(delRec || (f?.deliveryRecordId ? (await db.maternityRecords.get(f.deliveryRecordId)) || null : null));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fileId]);

  const cpn = useMemo(() => visits.filter(v => v.kind === "cpn"), [visits]);
  const pnc = useMemo(() => visits.filter(v => v.kind === "postnatal"), [visits]);

  if (!file) return <div className="p-4 text-sm text-muted-foreground">Chargement du dossier…</div>;

  const ga = gaFromDdr(file.ddr);
  const dpa = file.dpa || dpaFromDdr(file.ddr);

  const saveFile = async (patch: Partial<MaternityFile>) => {
    await db.maternityFiles.update(fileId, { ...patch, updatedAt: new Date().toISOString() });
    await load();
  };

  const saveVisit = async (v: AncVisit, editId?: number) => {
    const now = new Date().toISOString();
    if (editId) {
      await db.ancVisits.update(editId, { ...v, updatedAt: now });
      await logAudit("anc_update", user?.name || "—", { resource: "ancVisit", resourceId: editId, message: `${file.motherName} · ${v.kind} · ${v.date}` });
    } else {
      const id = await db.ancVisits.add({ ...v, uid: uuid(), fileId, motherPatientId: file.motherPatientId, clinicId: file.clinicId, createdAt: now });
      await logAudit("anc_create", user?.name || "—", { resource: "ancVisit", resourceId: id, message: `${file.motherName} · ${v.kind} · ${v.date}` });
    }
    setAdding(null);
    toast.success("Visite enregistrée");
    await load();
  };

  const deleteVisit = async (v: AncVisit) => {
    await db.ancVisits.update(v.id!, { deleted: true, updatedAt: new Date().toISOString() });
    await logAudit("anc_delete", user?.name || "—", { resource: "ancVisit", resourceId: v.id, message: `${file.motherName} · ${v.date}` });
    await load();
  };

  // ---- Carnet de suivi (PDF A5) ----
  const printCarnet = () => {
    import("jspdf").then(({ jsPDF }) => {
      const c = getClinicSettings();
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      const W = 148, mg = 10; let y = 13;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
      doc.text((c?.name || "Hôpital").toUpperCase(), W / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("CARNET DE SUIVI MATERNITÉ", W / 2, y, { align: "center" }); y += 8;
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(40);
      const kv = (l: string, v: string, x = mg) => { doc.setFont("helvetica", "bold"); doc.text(l, x, y); doc.setFont("helvetica", "normal"); doc.text(v, x + 26, y); };
      kv("Nom :", file.motherName); y += 5;
      kv("Âge :", file.motherAge ? String(file.motherAge) + " ans" : "—"); kv("Tél :", file.motherPhone || "—", W / 2); y += 5;
      kv("G / P :", `${file.gravidite ?? "—"} / ${file.parite ?? "—"}`); kv("Groupe :", file.bloodGroup || "—", W / 2); y += 5;
      kv("DDR :", frDate(file.ddr)); kv("DPA :", frDate(dpa), W / 2); y += 5;
      if (file.riskFactors) { kv("Risques :", file.riskFactors); y += 5; }
      y += 2; doc.setDrawColor(30); doc.line(mg, y, W - mg, y); y += 5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Consultations prénatales (CPN)", mg, y); y += 5;
      doc.setFontSize(7.5);
      const heads = ["Date", "SA", "Poids", "TA", "HU", "BCF", "Obs"];
      const xs = [mg, mg + 22, mg + 33, mg + 48, mg + 63, mg + 74, mg + 88];
      doc.setFont("helvetica", "bold"); heads.forEach((h, i) => doc.text(h, xs[i], y)); y += 4;
      doc.setFont("helvetica", "normal");
      [...cpn].reverse().forEach(v => {
        if (y > 185) { doc.addPage(); y = 15; }
        const cells = [frDate(v.date), v.gaWeeks ? v.gaWeeks + "s" : "—", v.weight ? v.weight + "kg" : "—",
          (v.bpSys && v.bpDia) ? `${v.bpSys}/${v.bpDia}` : "—", v.hauteurUterine ? v.hauteurUterine + "" : "—",
          v.bcf ? v.bcf + "" : "—", (v.observations || "").slice(0, 18)];
        cells.forEach((cc, i) => doc.text(String(cc), xs[i], y));
        y += 4.2;
      });
      doc.setFontSize(6.5); doc.setTextColor(130);
      doc.text("Document généré par DivineLink · " + new Date().toLocaleString("fr-FR"), W / 2, 205, { align: "center" });
      doc.save(`carnet_maternite_${file.motherName.replace(/\s+/g, "_")}.pdf`);
    });
  };

  const statusBadge = () => {
    const map: Record<string, string> = { enceinte: "bg-blue-100 text-blue-700", accouchee: "bg-green-100 text-green-700", postpartum: "bg-amber-100 text-amber-700", clos: "bg-gray-100 text-gray-600" };
    const label: Record<string, string> = { enceinte: "Enceinte", accouchee: "Accouchée", postpartum: "Post-partum", clos: "Clos" };
    return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${map[file.status] || map.clos}`}>{label[file.status] || file.status}</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" className="gap-1 px-2" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Dossiers</Button>
        <h2 className="font-semibold text-sm sm:text-base">{file.motherName}</h2>
        {statusBadge()}
        <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={printCarnet}><Printer className="w-4 h-4" /> Carnet</Button>
      </div>

      {/* ---- IDENTITY / OBSTETRIC HEADER ---- */}
      <Card><CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Identité & obstétrique</p>
          {editHdr
            ? <Button size="sm" variant="default" className="h-7 gap-1 text-xs" onClick={() => setEditHdr(false)}><Check className="w-3.5 h-3.5" /> OK</Button>
            : <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setEditHdr(true)}><Pencil className="w-3.5 h-3.5" /> Modifier</Button>}
        </div>
        {!editHdr ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-sm">
            <div><span className="text-[11px] text-muted-foreground block">Âge</span>{file.motherAge ?? "—"}</div>
            <div><span className="text-[11px] text-muted-foreground block">Téléphone</span>{file.motherPhone || "—"}</div>
            <div><span className="text-[11px] text-muted-foreground block">Groupe / Rh</span>{file.bloodGroup || "—"}</div>
            <div><span className="text-[11px] text-muted-foreground block">G / P</span>{file.gravidite ?? "—"} / {file.parite ?? "—"}</div>
            <div><span className="text-[11px] text-muted-foreground block">DDR</span>{frDate(file.ddr)}</div>
            <div><span className="text-[11px] text-muted-foreground block">DPA</span>{frDate(dpa)}</div>
            <div><span className="text-[11px] text-muted-foreground block">Âge gest. (SA)</span>{ga != null ? `${ga} sem.` : "—"}</div>
            <div><span className="text-[11px] text-muted-foreground block">Quartier</span>{file.quarter || "—"}</div>
            {file.riskFactors && <div className="col-span-2 sm:col-span-4"><span className="text-[11px] text-muted-foreground block">Facteurs de risque</span>{file.riskFactors}</div>}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Âge"><Input type="number" className="h-8" value={file.motherAge ?? ""} onChange={e => saveFile({ motherAge: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
            <Field label="Téléphone"><Input className="h-8" value={file.motherPhone || ""} onChange={e => saveFile({ motherPhone: e.target.value })} /></Field>
            <Field label="Groupe / Rh"><Input className="h-8" placeholder="O+" value={file.bloodGroup || ""} onChange={e => saveFile({ bloodGroup: e.target.value })} /></Field>
            <Field label="Quartier"><Input className="h-8" value={file.quarter || ""} onChange={e => saveFile({ quarter: e.target.value })} /></Field>
            <Field label="Gestité (G)"><Input type="number" className="h-8" value={file.gravidite ?? ""} onChange={e => saveFile({ gravidite: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
            <Field label="Parité (P)"><Input type="number" className="h-8" value={file.parite ?? ""} onChange={e => saveFile({ parite: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
            <Field label="DDR"><Input type="date" className="h-8" max={todayYmd()} value={file.ddr || ""} onChange={e => saveFile({ ddr: e.target.value, dpa: e.target.value ? dpaFromDdr(e.target.value) : undefined })} /></Field>
            <Field label="DPA (auto)"><Input type="date" className="h-8" value={dpa || ""} onChange={e => saveFile({ dpa: e.target.value })} /></Field>
            <div className="col-span-2 sm:col-span-4"><Field label="Facteurs de risque / antécédents"><Input className="h-8" value={file.riskFactors || ""} onChange={e => saveFile({ riskFactors: e.target.value })} /></Field></div>
          </div>
        )}
      </CardContent></Card>

      {/* ---- CPN (prénatal) ---- */}
      <Card><CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold flex-1">Consultations prénatales (CPN) · {cpn.length}</p>
          {adding !== "cpn" && <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setAdding("cpn")}><Plus className="w-4 h-4" /> Ajouter CPN</Button>}
        </div>
        {adding === "cpn" && <VisitForm kind="cpn" suggestGa={ga} onCancel={() => setAdding(null)} onSave={v => saveVisit(v)} />}
        {cpn.length === 0 && adding !== "cpn" && <p className="text-xs text-muted-foreground">Aucune CPN enregistrée.</p>}
        <div className="space-y-1.5">
          {cpn.map(v => (
            <div key={v.id} className="rounded-md border p-2 text-xs flex items-start gap-2">
              <div className="flex-1">
                <span className="font-medium">{frDate(v.date)}</span>
                {v.gaWeeks != null && <span className="text-muted-foreground"> · {v.gaWeeks} SA</span>}
                <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                  {v.weight != null && <span>Poids {v.weight} kg</span>}
                  {v.bpSys && v.bpDia && <span>TA {v.bpSys}/{v.bpDia}</span>}
                  {v.hauteurUterine != null && <span>HU {v.hauteurUterine}</span>}
                  {v.bcf != null && <span>BCF {v.bcf}</span>}
                  {v.albuminurie && v.albuminurie !== "0" && <span className="text-amber-600">Alb {v.albuminurie}</span>}
                  {v.vatDose && <span>{v.vatDose}</span>}
                  {v.nextRdv && <span className="text-primary">RDV {frDate(v.nextRdv)}</span>}
                </div>
                {v.observations && <div className="mt-0.5">{v.observations}</div>}
              </div>
              {isAdmin && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => deleteVisit(v)}><Trash2 className="w-3.5 h-3.5" /></Button>}
            </div>
          ))}
        </div>
      </CardContent></Card>

      {/* ---- PARTOGRAMME (travail) ---- */}
      <PartographPanel fileId={fileId} motherName={file.motherName} labourStartAt={file.labourStartAt} onStartLabour={load} isAdmin={isAdmin} />

      {/* ---- ACCOUCHEMENT ---- */}
      <Card><CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Baby className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold flex-1">Accouchement</p>
        </div>
        {delivery ? (
          <div className="rounded-md border p-2 text-xs">
            <div><span className="font-medium">{frDate(delivery.deliveryDate)}</span>{delivery.deliveryTime ? ` · ${delivery.deliveryTime}` : ""} · {delivery.deliveryType === "cesarienne" ? "Césarienne" : delivery.deliveryType === "instrumentale" ? "Instrumentale" : "Voie basse"}</div>
            <div className="text-muted-foreground mt-0.5">
              {(delivery.newborns || []).map((n, i) => <span key={i} className={n.status !== "vivant" ? "text-destructive mr-2" : "mr-2"}>{n.sex || "?"}{n.weight ? ` ${n.weight}g` : ""}{n.status === "mort_ne" ? " (mort-né)" : n.status === "deces_neonatal" ? " (décès)" : ""}</span>)}
              {delivery.maternalOutcome === "deces_maternel" && <span className="text-destructive font-medium">· Décès maternel</span>}
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs mt-1.5" onClick={() => onRecordDelivery(file)}>Modifier l'accouchement</Button>
          </div>
        ) : (
          <Button size="sm" className="gap-1" onClick={() => onRecordDelivery(file)}><Plus className="w-4 h-4" /> Enregistrer l'accouchement</Button>
        )}
      </CardContent></Card>

      {/* ---- POST-PARTUM ---- */}
      <Card><CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold flex-1">Suivi post-partum · {pnc.length}</p>
          {adding !== "postnatal" && <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setAdding("postnatal")}><Plus className="w-4 h-4" /> Ajouter</Button>}
        </div>
        {adding === "postnatal" && <VisitForm kind="postnatal" deliveryDate={delivery?.deliveryDate} onCancel={() => setAdding(null)} onSave={v => saveVisit(v)} />}
        {pnc.length === 0 && adding !== "postnatal" && <p className="text-xs text-muted-foreground">Aucune visite post-partum.</p>}
        <div className="space-y-1.5">
          {pnc.map(v => (
            <div key={v.id} className="rounded-md border p-2 text-xs flex items-start gap-2">
              <div className="flex-1">
                <span className="font-medium">{frDate(v.date)}</span>
                {v.daysPostpartum != null && <span className="text-muted-foreground"> · J{v.daysPostpartum}</span>}
                <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                  {v.bpSys && v.bpDia && <span>TA {v.bpSys}/{v.bpDia}</span>}
                  {v.temperature != null && <span>T° {v.temperature}</span>}
                  {v.allaitement && <span>Allait. {v.allaitement}</span>}
                  {v.babyWeight != null && <span>Bébé {v.babyWeight}g</span>}
                  {v.babyIcterus && <span className="text-amber-600">Ictère</span>}
                  {v.babyImmun && <span>{v.babyImmun}</span>}
                  {v.nextRdv && <span className="text-primary">RDV {frDate(v.nextRdv)}</span>}
                </div>
                {v.observations && <div className="mt-0.5">{v.observations}</div>}
              </div>
              {isAdmin && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => deleteVisit(v)}><Trash2 className="w-3.5 h-3.5" /></Button>}
            </div>
          ))}
        </div>
      </CardContent></Card>

      {!isAdmin && <p className="text-[11px] text-muted-foreground">La suppression des visites est réservée à l'administrateur.</p>}
    </div>
  );
}

// ================= VISIT FORM =================
function VisitForm({ kind, suggestGa, deliveryDate, onCancel, onSave }: {
  kind: AncVisitKind;
  suggestGa?: number;
  deliveryDate?: string;
  onCancel: () => void;
  onSave: (v: AncVisit) => void;
}) {
  const [v, setV] = useState<AncVisit>({
    kind, date: todayYmd(), createdAt: "",
    gaWeeks: kind === "cpn" ? suggestGa : undefined,
    daysPostpartum: kind === "postnatal" && deliveryDate
      ? Math.max(0, Math.round((new Date(todayYmd() + "T00:00:00").getTime() - new Date(deliveryDate + "T00:00:00").getTime()) / 86400000))
      : undefined,
  } as AncVisit);
  const [showLabs, setShowLabs] = useState(false);
  const up = (patch: Partial<AncVisit>) => setV(s => ({ ...s, ...patch }));
  const num = (x: string) => (x ? parseFloat(x) : undefined);

  return (
    <div className="rounded-md border border-primary/40 bg-primary/[0.03] p-2.5 space-y-2.5">
      {/* common top row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="Date"><Input type="date" className="h-8" max={todayYmd()} value={v.date} onChange={e => up({ date: e.target.value })} /></Field>
        {kind === "cpn"
          ? <Field label="Âge gest. (SA)"><Input type="number" className="h-8" value={v.gaWeeks ?? ""} onChange={e => up({ gaWeeks: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
          : <Field label="Jour post-partum"><Input type="number" className="h-8" value={v.daysPostpartum ?? ""} onChange={e => up({ daysPostpartum: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>}
        <Field label="Poids mère (kg)"><Input type="number" className="h-8" value={v.weight ?? ""} onChange={e => up({ weight: num(e.target.value) })} /></Field>
        <Field label="Température (°C)"><Input type="number" className="h-8" value={v.temperature ?? ""} onChange={e => up({ temperature: num(e.target.value) })} /></Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="TA systolique"><Input type="number" className="h-8" placeholder="120" value={v.bpSys ?? ""} onChange={e => up({ bpSys: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
        <Field label="TA diastolique"><Input type="number" className="h-8" placeholder="80" value={v.bpDia ?? ""} onChange={e => up({ bpDia: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
        {kind === "cpn" && <>
          <Field label="Hauteur utérine (cm)"><Input type="number" className="h-8" value={v.hauteurUterine ?? ""} onChange={e => up({ hauteurUterine: num(e.target.value) })} /></Field>
          <Field label="BCF (/min)"><Input type="number" className="h-8" value={v.bcf ?? ""} onChange={e => up({ bcf: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
        </>}
      </div>

      {kind === "cpn" && (
        <>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Présentation</label>
            <div className="flex gap-1.5 flex-wrap">
              {PRESENT.map(p => <Toggle key={p} on={v.presentation === p} onClick={() => up({ presentation: v.presentation === p ? undefined : p })}>{p}</Toggle>)}
              <Toggle on={!!v.oedemes} onClick={() => up({ oedemes: !v.oedemes })} danger>Œdèmes</Toggle>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Albuminurie</label>
            <div className="flex gap-1.5 flex-wrap">
              {ALBU.map(a => <Toggle key={a} on={v.albuminurie === a} onClick={() => up({ albuminurie: a })} danger={a !== "0"}>{a}</Toggle>)}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Prévention</label>
            <div className="flex gap-1.5 flex-wrap items-center">
              {VAT.map(d => <Toggle key={d} on={v.vatDose === d} onClick={() => up({ vatDose: v.vatDose === d ? undefined : d })}>{d}</Toggle>)}
            </div>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              <Toggle on={!!v.ferFolate} onClick={() => up({ ferFolate: !v.ferFolate })}>Fer + Folate</Toggle>
              <Toggle on={!!v.milda} onClick={() => up({ milda: !v.milda })}>MILDA remise</Toggle>
              <Toggle on={!!v.deparasitage} onClick={() => up({ deparasitage: !v.deparasitage })}>Déparasitage</Toggle>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">TPI-SP</span>
                <Input className="h-8 w-14" placeholder="dose" value={v.tpiSpDose || ""} onChange={e => up({ tpiSpDose: e.target.value })} />
              </div>
            </div>
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setShowLabs(s => !s)}>
            {showLabs ? "Masquer les bilans" : "Ajouter les bilans"}
          </Button>
          {showLabs && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="VIH"><Input className="h-8" value={v.labHiv || ""} onChange={e => up({ labHiv: e.target.value })} /></Field>
              <Field label="Syphilis (VDRL)"><Input className="h-8" value={v.labVdrl || ""} onChange={e => up({ labVdrl: e.target.value })} /></Field>
              <Field label="Hb (g/dl)"><Input className="h-8" value={v.labHb || ""} onChange={e => up({ labHb: e.target.value })} /></Field>
              <Field label="Groupe / Rh"><Input className="h-8" value={v.labGroupeRh || ""} onChange={e => up({ labGroupeRh: e.target.value })} /></Field>
              <Field label="Ag HBs"><Input className="h-8" value={v.labAgHbs || ""} onChange={e => up({ labAgHbs: e.target.value })} /></Field>
              <Field label="Glycémie"><Input className="h-8" value={v.labGlycemie || ""} onChange={e => up({ labGlycemie: e.target.value })} /></Field>
              <Field label="GE / TDR palu"><Input className="h-8" value={v.labGe || ""} onChange={e => up({ labGe: e.target.value })} /></Field>
            </div>
          )}
        </>
      )}

      {kind === "postnatal" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Lochies"><Input className="h-8" placeholder="normales…" value={v.lochies || ""} onChange={e => up({ lochies: e.target.value })} /></Field>
            <Field label="Involution utérine"><Input className="h-8" value={v.involution || ""} onChange={e => up({ involution: e.target.value })} /></Field>
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground block mb-1">Allaitement</label>
              <div className="flex gap-1.5 flex-wrap">{ALLAIT.map(a => <Toggle key={a} on={v.allaitement === a} onClick={() => up({ allaitement: a })}>{a}</Toggle>)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Poids bébé (g)"><Input type="number" className="h-8" value={v.babyWeight ?? ""} onChange={e => up({ babyWeight: e.target.value ? parseInt(e.target.value) : undefined })} /></Field>
            <Field label="T° bébé (°C)"><Input type="number" className="h-8" value={v.babyTemp ?? ""} onChange={e => up({ babyTemp: num(e.target.value) })} /></Field>
            <div className="flex items-end"><Toggle on={!!v.babyIcterus} onClick={() => up({ babyIcterus: !v.babyIcterus })} danger>Ictère</Toggle></div>
            <Field label="Vaccins (BCG/VPO0/HepB)"><Input className="h-8" value={v.babyImmun || ""} onChange={e => up({ babyImmun: e.target.value })} /></Field>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label={kind === "cpn" ? "Plaintes / motif" : "Observations"}><Input className="h-8" value={v.plaintes || ""} onChange={e => up({ plaintes: e.target.value })} /></Field>
        <Field label="Conduite / observations"><Input className="h-8" value={v.observations || ""} onChange={e => up({ observations: e.target.value })} /></Field>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Field label="Prochain rendez-vous"><Input type="date" className="h-8" value={v.nextRdv || ""} onChange={e => up({ nextRdv: e.target.value })} /></Field></div>
        <CalendarClock className="w-4 h-4 text-muted-foreground mb-2" />
      </div>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" className="gap-1" onClick={onCancel}><X className="w-4 h-4" /> Annuler</Button>
        <Button size="sm" className="gap-1" onClick={() => onSave(v)}><Check className="w-4 h-4" /> Enregistrer</Button>
      </div>
    </div>
  );
}
