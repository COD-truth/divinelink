import { useEffect, useMemo, useState } from "react";
import { db, type MaternityRecord, type Newborn, type DeliveryType, type MaternalOutcome, type NewbornStatus, type Patient, type MaternityFile } from "@/lib/db";
import { decryptPatients } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicSettings } from "@/lib/clinicSettings";
import { logAudit } from "@/lib/audit";
import { PatientPicker } from "./PatientPicker";
import { MaternityDossier } from "./MaternityDossier";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Baby, Plus, Trash2, FileText, ClipboardList, BarChart3, Printer, Search, FolderOpen, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const frDate = (ymd?: string) => (ymd ? new Date(ymd + "T00:00:00").toLocaleDateString("fr-FR") : "—");
const gaFromDdr = (ddr?: string) => (ddr ? Math.max(0, Math.floor((Date.now() - new Date(ddr + "T00:00:00").getTime()) / (7 * 86400000))) : undefined);
const FILE_STATUS: Record<string, { l: string; c: string }> = {
  enceinte: { l: "Enceinte", c: "bg-blue-100 text-blue-700" },
  accouchee: { l: "Accouchée", c: "bg-green-100 text-green-700" },
  postpartum: { l: "Post-partum", c: "bg-amber-100 text-amber-700" },
  clos: { l: "Clos", c: "bg-gray-100 text-gray-600" },
};

const DTYPE: { v: DeliveryType; l: string }[] = [
  { v: "voie_basse", l: "Voie basse" }, { v: "cesarienne", l: "Césarienne" }, { v: "instrumentale", l: "Instrumentale" },
];
const NSTATUS: { v: NewbornStatus; l: string }[] = [
  { v: "vivant", l: "Né vivant" }, { v: "mort_ne", l: "Mort-né" }, { v: "deces_neonatal", l: "Décès néonatal" },
];
const todayYmd = () => new Date().toISOString().slice(0, 10);
const emptyNb = (): Newborn => ({ sex: "", status: "vivant", weight: undefined, apgar: "", birthTime: "", name: "" });

export function MaternityPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const inClinic = (c?: string) => { const a = cid(); return !a || !c || String(c) === String(a); };

  const [view, setView] = useState<"dossiers" | "dossier" | "new" | "registre" | "bilan">("dossiers");
  const [rows, setRows] = useState<MaternityRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [del, setDel] = useState<MaternityRecord | null>(null);

  // dossiers (EMR)
  const [files, setFiles] = useState<MaternityFile[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [currentFileId, setCurrentFileId] = useState<number | null>(null);
  const [linkedFileId, setLinkedFileId] = useState<number | null>(null); // delivery being recorded for this dossier
  const [newDossier, setNewDossier] = useState(false);
  const [ndMotherId, setNdMotherId] = useState("");
  const [nd, setNd] = useState({ name: "", age: "", phone: "", quarter: "", ddr: "", g: "", p: "" });

  // capture form
  const [motherId, setMotherId] = useState("");
  const [f, setF] = useState({ motherName: "", motherAge: "", motherPhone: "", quarter: "", gravidite: "", parite: "", sa: "", deliveryDate: todayYmd(), deliveryTime: new Date().toTimeString().slice(0, 5), type: "voie_basse" as DeliveryType, accoucheur: user?.name || "", outcome: "vivante" as MaternalOutcome, complications: "" });
  const [nbs, setNbs] = useState<Newborn[]>([emptyNb()]);
  const [editId, setEditId] = useState<number | null>(null);

  const [bilanMonth, setBilanMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = async () => {
    const all = await db.maternityRecords.orderBy("createdAt").reverse().toArray();
    setRows(all.filter(r => !r.deleted && inClinic(r.clinicId)));
    setPatients((await decryptPatients(await db.patients.toArray())).filter(p => !p.deleted && inClinic(p.clinicId)));
    const fs = await db.maternityFiles.orderBy("createdAt").reverse().toArray();
    setFiles(fs.filter(x => !x.deleted && inClinic(x.clinicId)));
  };
  useEffect(() => { load(); }, []);

  // ---- Dossiers (EMR) ----
  const onPickNdMother = (id: string) => {
    setNdMotherId(id);
    const p = patients.find(x => String(x.id) === id);
    if (p) setNd(s => ({ ...s, name: `${p.firstName} ${p.lastName}`.trim(), phone: p.phone || s.phone, quarter: (p as any).quarter || s.quarter, age: p.ageYears ? String(p.ageYears) : s.age }));
  };
  const resetNd = () => { setNewDossier(false); setNdMotherId(""); setNd({ name: "", age: "", phone: "", quarter: "", ddr: "", g: "", p: "" }); };
  const createDossier = async () => {
    if (!nd.name.trim()) { toast.error("Nom de la mère requis"); return; }
    const now = new Date().toISOString();
    const file: MaternityFile = {
      uid: uuid(), motherPatientId: ndMotherId ? parseInt(ndMotherId) : undefined,
      motherName: nd.name.trim(), motherAge: nd.age ? parseInt(nd.age) : undefined,
      motherPhone: nd.phone.trim() || undefined, quarter: nd.quarter.trim() || undefined,
      ddr: nd.ddr || undefined, dpa: nd.ddr ? new Date(new Date(nd.ddr + "T00:00:00").getTime() + 280 * 86400000).toISOString().slice(0, 10) : undefined,
      gravidite: nd.g ? parseInt(nd.g) : undefined, parite: nd.p ? parseInt(nd.p) : undefined,
      status: "enceinte", clinicId: cid(), createdAt: now, updatedAt: now,
    };
    const id = await db.maternityFiles.add(file);
    await logAudit("maternity_file_create", user?.name || "—", { resource: "maternityFile", resourceId: id, message: nd.name });
    toast.success("Dossier créé");
    resetNd(); await load(); setCurrentFileId(id as number); setView("dossier");
  };
  const openDossier = (id: number) => { setCurrentFileId(id); setView("dossier"); };

  // Called from the dossier to record/modify the delivery for that file
  const recordDeliveryForFile = (file: MaternityFile) => {
    // Find the existing delivery by fileId (robust across devices), falling back
    // to the local deliveryRecordId for same-device records.
    const existingDel = rows.find(x => x.fileId === file.id && !x.deleted) || (file.deliveryRecordId ? rows.find(x => x.id === file.deliveryRecordId) : undefined);
    if (existingDel) { startEdit(existingDel); setLinkedFileId(file.id!); return; } // startEdit clears it, so set after
    resetForm();
    setF(s => ({ ...s, motherName: file.motherName, motherAge: file.motherAge ? String(file.motherAge) : "", motherPhone: file.motherPhone || "", quarter: file.quarter || "", gravidite: file.gravidite ? String(file.gravidite) : "", parite: file.parite ? String(file.parite) : "", sa: gaFromDdr(file.ddr) != null ? String(gaFromDdr(file.ddr)) : "" }));
    setMotherId(file.motherPatientId ? String(file.motherPatientId) : "");
    setLinkedFileId(file.id!);
    setView("new");
  };

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    const list = q ? files.filter(x => x.motherName.toLowerCase().includes(q) || (x.motherPhone || "").includes(q)) : files;
    return list;
  }, [files, fileSearch]);

  const resetForm = () => {
    setMotherId(""); setNbs([emptyNb()]); setEditId(null);
    setF({ motherName: "", motherAge: "", motherPhone: "", quarter: "", gravidite: "", parite: "", sa: "", deliveryDate: todayYmd(), deliveryTime: new Date().toTimeString().slice(0, 5), type: "voie_basse", accoucheur: user?.name || "", outcome: "vivante", complications: "" });
  };

  const onPickMother = (id: string) => {
    setMotherId(id);
    const p = patients.find(x => String(x.id) === id);
    if (p) setF(s => ({ ...s, motherName: `${p.firstName} ${p.lastName}`.trim(), motherPhone: p.phone || s.motherPhone, quarter: (p as any).quarter || s.quarter, motherAge: p.ageYears ? String(p.ageYears) : s.motherAge }));
  };

  const updNb = (i: number, patch: Partial<Newborn>) => setNbs(a => a.map((n, idx) => idx === i ? { ...n, ...patch } : n));
  const rmNb = (i: number) => setNbs(a => a.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!f.motherName.trim()) { toast.error("Nom de la mère requis"); return; }
    const now = new Date().toISOString();
    const rec: MaternityRecord = {
      uid: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      motherPatientId: motherId ? parseInt(motherId) : undefined,
      motherName: f.motherName.trim(), motherAge: f.motherAge ? parseInt(f.motherAge) : undefined,
      motherPhone: f.motherPhone.trim() || undefined, quarter: f.quarter.trim() || undefined,
      gravidite: f.gravidite ? parseInt(f.gravidite) : undefined,
      parite: f.parite ? parseInt(f.parite) : undefined,
      gestationalWeeks: f.sa ? parseInt(f.sa) : undefined,
      deliveryDate: f.deliveryDate, deliveryTime: f.deliveryTime || undefined,
      deliveryType: f.type, accoucheur: f.accoucheur.trim() || undefined, maternalOutcome: f.outcome,
      complications: f.complications.trim() || undefined,
      newborns: nbs.filter(n => n.sex || n.weight || n.name).map(n => ({ ...n, weight: n.weight || undefined })),
      fileId: linkedFileId || undefined,
      clinicId: cid(), createdAt: now, updatedAt: now,
    };
    let deliveryId = editId;
    if (editId) {
      await db.maternityRecords.update(editId, { ...rec, createdAt: rows.find(r => r.id === editId)?.createdAt || now });
      await logAudit("maternity_update", user?.name || "—", { resource: "maternity", resourceId: editId, message: `${f.motherName} · ${f.deliveryDate}` });
    } else {
      deliveryId = await db.maternityRecords.add(rec) as number;
      await logAudit("maternity_create", user?.name || "—", { resource: "maternity", resourceId: deliveryId, message: `${f.motherName} · ${f.deliveryDate} · ${f.type}` });
    }
    // link the delivery back to its dossier and advance the file status
    const goFile = linkedFileId;
    if (goFile) {
      await db.maternityFiles.update(goFile, { deliveryRecordId: deliveryId || undefined, status: "accouchee", updatedAt: now });
    }
    toast.success("Accouchement enregistré");
    resetForm(); await load();
    if (goFile) { setLinkedFileId(null); setCurrentFileId(goFile); setView("dossier"); }
    else setView("registre");
  };

  const startEdit = (r: MaternityRecord) => {
    setLinkedFileId(null);
    setEditId(r.id!); setMotherId(r.motherPatientId ? String(r.motherPatientId) : "");
    setF({ motherName: r.motherName, motherAge: r.motherAge ? String(r.motherAge) : "", motherPhone: r.motherPhone || "", quarter: r.quarter || "", gravidite: r.gravidite ? String(r.gravidite) : "", parite: r.parite ? String(r.parite) : "", sa: r.gestationalWeeks ? String(r.gestationalWeeks) : "", deliveryDate: r.deliveryDate, deliveryTime: r.deliveryTime || "", type: r.deliveryType, accoucheur: r.accoucheur || "", outcome: r.maternalOutcome, complications: r.complications || "" });
    setNbs(r.newborns && r.newborns.length ? r.newborns.map(n => ({ ...n })) : [emptyNb()]);
    setView("new");
  };

  const doDelete = async (r: MaternityRecord) => {
    await db.maternityRecords.update(r.id!, { deleted: true, updatedAt: new Date().toISOString() });
    await logAudit("maternity_delete", user?.name || "—", { resource: "maternity", resourceId: r.id, message: `${r.motherName} · ${r.deliveryDate}` });
    toast.success("Supprimé"); setDel(null); await load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.motherName.toLowerCase().includes(q) || (r.accoucheur || "").toLowerCase().includes(q));
  }, [rows, search]);

  // ---- Bilan ----
  const bilan = useMemo(() => {
    const inMonth = rows.filter(r => (r.deliveryDate || "").startsWith(bilanMonth));
    const nbAll = inMonth.flatMap(r => r.newborns || []);
    const count = (t: DeliveryType) => inMonth.filter(r => r.deliveryType === t).length;
    const ns = (s: NewbornStatus) => nbAll.filter(n => n.status === s).length;
    return {
      acc: inMonth.length, vb: count("voie_basse"), cs: count("cesarienne"), inst: count("instrumentale"),
      vivants: ns("vivant"), mortNes: ns("mort_ne"), decesNeo: ns("deces_neonatal"),
      decesMat: inMonth.filter(r => r.maternalOutcome === "deces_maternel").length,
      garcons: nbAll.filter(n => n.sex === "M").length, filles: nbAll.filter(n => n.sex === "F").length,
      txCs: inMonth.length ? Math.round(count("cesarienne") / inMonth.length * 100) : 0,
    };
  }, [rows, bilanMonth]);

  // ---- Birth declaration (PDF) ----
  const declaration = (r: MaternityRecord) => {
    import("jspdf").then(({ jsPDF }) => {
      const c = getClinicSettings();
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      const W = 148, mg = 12; let y = 14;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
      doc.text((c?.name || "Hôpital").toUpperCase(), W / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(90);
      if (c?.address) { doc.text(c.address, W / 2, y, { align: "center" }); y += 3.5; }
      if (c?.phone) { doc.text("Tél: " + c.phone, W / 2, y, { align: "center" }); y += 3.5; }
      y += 2; doc.setDrawColor(30); doc.line(mg, y, W - mg, y); y += 7;
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20);
      doc.text("DÉCLARATION DE NAISSANCE", W / 2, y, { align: "center" }); y += 9;
      const live = (r.newborns || []).filter(n => n.status !== "mort_ne");
      const list = live.length ? live : (r.newborns || []);
      doc.setFontSize(9.5); doc.setFont("helvetica", "normal");
      const line = (lbl: string, val: string) => { doc.setFont("helvetica", "bold"); doc.text(lbl, mg, y); doc.setFont("helvetica", "normal"); doc.text(val, mg + 42, y); y += 6; };
      list.forEach((n, i) => {
        if (list.length > 1) { doc.setFont("helvetica", "bold"); doc.text(`Enfant ${i + 1}`, mg, y); y += 6; }
        line("Nom de l'enfant :", n.name || "—");
        line("Sexe :", n.sex === "M" ? "Masculin" : n.sex === "F" ? "Féminin" : "—");
        line("Né(e) le :", `${new Date(r.deliveryDate).toLocaleDateString("fr-FR")}${n.birthTime || r.deliveryTime ? " à " + (n.birthTime || r.deliveryTime) : ""}`);
        line("Poids :", n.weight ? `${n.weight} g` : "—");
        y += 1;
      });
      doc.setDrawColor(200); doc.line(mg, y, W - mg, y); y += 6;
      line("Mère :", r.motherName);
      if (c?.city) line("Lieu de naissance :", c.city);
      line("Accoucheur :", r.accoucheur || "—");
      y += 10;
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("Le Responsable", W - mg - 2, y, { align: "right" });
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(130);
      doc.text("Document généré par DivineLink · " + new Date().toLocaleString("fr-FR"), W / 2, 205, { align: "center" });
      doc.save(`declaration_naissance_${(list[0]?.name || r.motherName).replace(/\s+/g, "_")}.pdf`);
    });
  };

  const printBilan = () => {
    import("jspdf").then(({ jsPDF }) => {
      const c = getClinicSettings();
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, mg = 16; let y = 18;
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text((c?.name || "Hôpital").toUpperCase(), W / 2, y, { align: "center" }); y += 7;
      doc.setFontSize(13); doc.text("BILAN MATERNITÉ — " + bilanMonth, W / 2, y, { align: "center" }); y += 10;
      doc.setFontSize(11); doc.setFont("helvetica", "normal");
      const row = (l: string, v: string) => { doc.setFont("helvetica", "normal"); doc.text(l, mg, y); doc.setFont("helvetica", "bold"); doc.text(v, W - mg, y, { align: "right" }); y += 8; };
      row("Accouchements", String(bilan.acc));
      row("  dont voie basse", String(bilan.vb));
      row("  dont césariennes", `${bilan.cs}  (${bilan.txCs}%)`);
      row("  dont instrumentales", String(bilan.inst));
      row("Naissances vivantes", String(bilan.vivants));
      row("Mort-nés", String(bilan.mortNes));
      row("Décès néonatals", String(bilan.decesNeo));
      row("Décès maternels", String(bilan.decesMat));
      row("Garçons / Filles", `${bilan.garcons} / ${bilan.filles}`);
      doc.save(`bilan_maternite_${bilanMonth}.pdf`);
    });
  };

  // Full-screen dossier (its own header + back button)
  if (view === "dossier" && currentFileId) {
    return (
      <MaternityDossier
        fileId={currentFileId}
        onBack={() => { setCurrentFileId(null); setView("dossiers"); load(); }}
        onRecordDelivery={recordDeliveryForFile}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Baby className="w-5 h-5 text-primary" />
        <h2 className="font-semibold">Maternité</h2>
        <div className="flex gap-1.5 ml-auto flex-wrap">
          <Button size="sm" variant={view === "dossiers" ? "default" : "outline"} className="gap-1" onClick={() => setView("dossiers")}><FolderOpen className="w-4 h-4" /> Dossiers</Button>
          <Button size="sm" variant={view === "new" ? "default" : "outline"} className="gap-1" onClick={() => { setLinkedFileId(null); resetForm(); setView("new"); }}><Plus className="w-4 h-4" /> Accouchement</Button>
          <Button size="sm" variant={view === "registre" ? "default" : "outline"} className="gap-1" onClick={() => setView("registre")}><ClipboardList className="w-4 h-4" /> Registre</Button>
          <Button size="sm" variant={view === "bilan" ? "default" : "outline"} className="gap-1" onClick={() => setView("bilan")}><BarChart3 className="w-4 h-4" /> Bilan</Button>
        </div>
      </div>

      {/* ---- DOSSIERS (EMR) ---- */}
      {view === "dossiers" && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Rechercher une mère…" value={fileSearch} onChange={e => setFileSearch(e.target.value)} />
            </div>
            <Button size="sm" className="gap-1 shrink-0" onClick={() => { resetNd(); setNewDossier(true); }}><Plus className="w-4 h-4" /> Nouveau dossier</Button>
          </div>

          {newDossier && (
            <Card><CardContent className="p-3 space-y-3">
              <p className="text-sm font-semibold">Nouveau dossier maternité</p>
              <div>
                <label className="text-xs text-muted-foreground">Mère (patiente existante — optionnel)</label>
                <PatientPicker patients={patients} value={ndMotherId} onPick={onPickNdMother} placeholder="Rechercher une patiente…" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground">Nom de la mère *</label><Input value={nd.name} onChange={e => setNd(s => ({ ...s, name: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-muted-foreground">Âge</label><Input type="number" value={nd.age} onChange={e => setNd(s => ({ ...s, age: e.target.value }))} /></div>
                  <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={nd.phone} onChange={e => setNd(s => ({ ...s, phone: e.target.value }))} /></div>
                </div>
                <div><label className="text-xs text-muted-foreground">Quartier</label><Input value={nd.quarter} onChange={e => setNd(s => ({ ...s, quarter: e.target.value }))} /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-xs text-muted-foreground">DDR</label><Input type="date" max={todayYmd()} value={nd.ddr} onChange={e => setNd(s => ({ ...s, ddr: e.target.value }))} /></div>
                  <div><label className="text-xs text-muted-foreground">G</label><Input type="number" value={nd.g} onChange={e => setNd(s => ({ ...s, g: e.target.value }))} /></div>
                  <div><label className="text-xs text-muted-foreground">P</label><Input type="number" value={nd.p} onChange={e => setNd(s => ({ ...s, p: e.target.value }))} /></div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetNd}>Annuler</Button>
                <Button onClick={createDossier}>Créer le dossier</Button>
              </div>
            </CardContent></Card>
          )}

          {!newDossier && filteredFiles.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucun dossier. Cliquez « Nouveau dossier » pour suivre une grossesse (CPN → accouchement → post-partum).
            </div>
          )}

          <div className="space-y-1.5">
            {filteredFiles.map(file => {
              const ga = gaFromDdr(file.ddr);
              const st = FILE_STATUS[file.status] || FILE_STATUS.clos;
              return (
                <button key={file.id} onClick={() => openDossier(file.id!)} className="w-full text-left rounded-md border p-3 hover:bg-muted/50 transition flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{file.motherName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${st.c}`}>{st.l}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      {file.motherAge != null && <span>{file.motherAge} ans</span>}
                      {file.gravidite != null && <span>G{file.gravidite}{file.parite != null ? `P${file.parite}` : ""}</span>}
                      {file.status === "enceinte" && ga != null && <span>{ga} SA</span>}
                      {file.status === "enceinte" && file.dpa && <span>DPA {frDate(file.dpa)}</span>}
                      {file.motherPhone && <span>{file.motherPhone}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ---- CAPTURE ---- */}
      {view === "new" && (
        <Card><CardContent className="p-3 space-y-3">
          <p className="text-sm font-semibold">{editId ? "Modifier l'accouchement" : "Nouvel accouchement"}</p>
          {linkedFileId && <p className="text-[11px] text-primary -mt-2">Lié au dossier maternité de {f.motherName}</p>}
          <div>
            <label className="text-xs text-muted-foreground">Mère (patiente existante — optionnel)</label>
            <PatientPicker patients={patients} value={motherId} onPick={onPickMother} placeholder="Rechercher une patiente…" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">Nom de la mère *</label><Input value={f.motherName} onChange={e => setF(s => ({ ...s, motherName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Âge</label><Input type="number" value={f.motherAge} onChange={e => setF(s => ({ ...s, motherAge: e.target.value }))} /></div>
              <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={f.motherPhone} onChange={e => setF(s => ({ ...s, motherPhone: e.target.value }))} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Quartier</label><Input value={f.quarter} onChange={e => setF(s => ({ ...s, quarter: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-muted-foreground" title="Gestité — nombre total de grossesses">Gestité (G)</label><Input type="number" value={f.gravidite} onChange={e => setF(s => ({ ...s, gravidite: e.target.value }))} /></div>
              <div><label className="text-xs text-muted-foreground" title="Parité — nombre d'accouchements">Parité (P)</label><Input type="number" value={f.parite} onChange={e => setF(s => ({ ...s, parite: e.target.value }))} /></div>
              <div><label className="text-xs text-muted-foreground" title="Âge gestationnel en semaines d'aménorrhée">Terme (SA)</label><Input type="number" value={f.sa} onChange={e => setF(s => ({ ...s, sa: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Date</label><Input type="date" value={f.deliveryDate} max={todayYmd()} onChange={e => setF(s => ({ ...s, deliveryDate: e.target.value }))} /></div>
              <div><label className="text-xs text-muted-foreground">Heure</label><Input type="time" value={f.deliveryTime} onChange={e => setF(s => ({ ...s, deliveryTime: e.target.value }))} /></div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Type d'accouchement</label>
            <div className="flex gap-1.5 flex-wrap">
              {DTYPE.map(t => <Button key={t.v} type="button" size="sm" variant={f.type === t.v ? "default" : "outline"} onClick={() => setF(s => ({ ...s, type: t.v }))}>{t.l}</Button>)}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">Accoucheur</label><Input value={f.accoucheur} onChange={e => setF(s => ({ ...s, accoucheur: e.target.value }))} /></div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Issue maternelle</label>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant={f.outcome === "vivante" ? "default" : "outline"} onClick={() => setF(s => ({ ...s, outcome: "vivante" }))}>Mère vivante</Button>
                <Button type="button" size="sm" variant={f.outcome === "deces_maternel" ? "destructive" : "outline"} onClick={() => setF(s => ({ ...s, outcome: "deces_maternel" }))}>Décès maternel</Button>
              </div>
            </div>
          </div>
          <div><label className="text-xs text-muted-foreground">Complications (optionnel)</label><Input value={f.complications} onChange={e => setF(s => ({ ...s, complications: e.target.value }))} /></div>

          {/* newborns */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Nouveau-né(s)</label>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setNbs(a => [...a, emptyNb()])}><Plus className="w-3.5 h-3.5" /> Ajouter (jumeau)</Button>
            </div>
            {nbs.map((n, i) => (
              <div key={i} className="rounded-md border p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium flex-1">Enfant {i + 1}</span>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant={n.sex === "M" ? "default" : "outline"} className="h-7 w-9" onClick={() => updNb(i, { sex: "M" })}>M</Button>
                    <Button type="button" size="sm" variant={n.sex === "F" ? "default" : "outline"} className="h-7 w-9" onClick={() => updNb(i, { sex: "F" })}>F</Button>
                  </div>
                  {nbs.length > 1 && <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => rmNb(i)}><Trash2 className="w-4 h-4" /></Button>}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {NSTATUS.map(s => <Button key={s.v} type="button" size="sm" variant={n.status === s.v ? (s.v === "vivant" ? "default" : "destructive") : "outline"} className="h-7 text-xs" onClick={() => updNb(i, { status: s.v })}>{s.l}</Button>)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><label className="text-[10px] text-muted-foreground block">Poids (g)</label><Input type="number" className="h-8" value={n.weight ?? ""} onChange={e => updNb(i, { weight: e.target.value ? parseInt(e.target.value) : undefined })} /></div>
                  <div><label className="text-[10px] text-muted-foreground block">APGAR</label><Input className="h-8" value={n.apgar || ""} onChange={e => updNb(i, { apgar: e.target.value })} placeholder="9/10" /></div>
                  <div><label className="text-[10px] text-muted-foreground block">Heure</label><Input type="time" className="h-8" value={n.birthTime || ""} onChange={e => updNb(i, { birthTime: e.target.value })} /></div>
                  <div><label className="text-[10px] text-muted-foreground block">Nom</label><Input className="h-8" value={n.name || ""} onChange={e => updNb(i, { name: e.target.value })} /></div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { const g = linkedFileId; resetForm(); setLinkedFileId(null); if (g) { setCurrentFileId(g); setView("dossier"); } else setView("registre"); }}>Annuler</Button>
            <Button onClick={save}>{editId ? "Enregistrer les modifications" : "Enregistrer"}</Button>
          </div>
        </CardContent></Card>
      )}

      {/* ---- REGISTRE ---- */}
      {view === "registre" && (
        <>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher une mère, un accoucheur…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Mère</TableHead><TableHead>Type</TableHead>
                <TableHead>Issue mère</TableHead><TableHead>Nouveau-né(s)</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Aucun accouchement enregistré.</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.deliveryDate).toLocaleDateString("fr-FR")}{r.deliveryTime ? ` · ${r.deliveryTime}` : ""}</TableCell>
                    <TableCell className="font-medium text-sm">{r.motherName}{r.motherAge ? <span className="text-xs text-muted-foreground"> · {r.motherAge} ans</span> : null}</TableCell>
                    <TableCell className="text-xs">{DTYPE.find(t => t.v === r.deliveryType)?.l}</TableCell>
                    <TableCell className="text-xs">{r.maternalOutcome === "deces_maternel" ? <span className="text-destructive font-medium">Décès</span> : "Vivante"}</TableCell>
                    <TableCell className="text-xs">
                      {(r.newborns || []).map((n, i) => (
                        <span key={i} className={`inline-block mr-1 ${n.status !== "vivant" ? "text-destructive" : ""}`}>{n.sex || "?"}{n.status === "mort_ne" ? " (mort-né)" : n.status === "deces_neonatal" ? " (décès)" : ""}{i < (r.newborns.length - 1) ? "," : ""}</span>
                      ))}
                      {(!r.newborns || r.newborns.length === 0) && "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Déclaration de naissance" onClick={() => declaration(r)}><FileText className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => startEdit(r)}>Modifier</Button>
                        {isAdmin && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Supprimer (admin)" onClick={() => setDel(r)}><Trash2 className="w-4 h-4" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!isAdmin && <p className="text-[11px] text-muted-foreground">La suppression est réservée à l'administrateur.</p>}
        </>
      )}

      {/* ---- BILAN ---- */}
      {view === "bilan" && (
        <Card><CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm">Mois :</label>
            <Input type="month" className="h-9 w-40" value={bilanMonth} onChange={e => setBilanMonth(e.target.value)} />
            {isAdmin
              ? <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={printBilan}><Printer className="w-4 h-4" /> Imprimer le bilan</Button>
              : <span className="ml-auto text-[11px] text-muted-foreground">Export du bilan réservé à l'administrateur</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              ["Accouchements", bilan.acc], ["Voie basse", bilan.vb], [`Césariennes (${bilan.txCs}%)`, bilan.cs],
              ["Instrumentales", bilan.inst], ["Naissances vivantes", bilan.vivants], ["Mort-nés", bilan.mortNes],
              ["Décès néonatals", bilan.decesNeo], ["Décès maternels", bilan.decesMat], [`Garçons / Filles`, `${bilan.garcons} / ${bilan.filles}`],
            ].map(([l, v], i) => (
              <div key={i} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className={`text-2xl font-bold ${(l as string).includes("Décès") || (l as string).includes("Mort") ? "text-destructive" : ""}`}>{v as any}</p>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {/* delete confirm */}
      <Dialog open={!!del} onOpenChange={v => !v && setDel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer cet enregistrement ?</DialogTitle></DialogHeader>
          {del && <p className="text-sm">{del.motherName} · {new Date(del.deliveryDate).toLocaleDateString("fr-FR")}</p>}
          <p className="text-xs text-muted-foreground">Action réservée à l'administrateur, tracée dans l'audit.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => del && doDelete(del)}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
