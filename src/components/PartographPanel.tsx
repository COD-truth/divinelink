import { useEffect, useMemo, useState } from "react";
import { db, type PartographEntry } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicSettings } from "@/lib/clinicSettings";
import { logAudit } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Activity, Plus, Trash2, Printer, Play, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowLocal = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const LIQUIDE = ["Intact", "Clair", "Méconial", "Sanglant"];
const MOULAGE = ["0", "+", "++", "+++"];
const CU_DUR = ["<20", "20-40", ">40"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[11px] text-muted-foreground block mb-0.5">{label}</label>{children}</div>;
}

export function PartographPanel({ fileId, motherName, labourStartAt, onStartLabour, isAdmin }: {
  fileId: number; motherName: string; labourStartAt?: string; onStartLabour: () => void; isAdmin: boolean;
}) {
  const { user } = useAuth();
  const cid = () => localStorage.getItem("divinelink.clinicId") || undefined;
  const [rows, setRows] = useState<PartographEntry[]>([]);
  const [open, setOpen] = useState(false);     // show add form
  const [more, setMore] = useState(false);     // show extra fields
  const [f, setF] = useState<any>({ time: nowLocal(), dilatation: "", rcf: "", contractions: "", contractionDuration: "", descent: "", liquide: "", moulage: "", bpSys: "", bpDia: "", pulse: "", temperature: "", oxytocin: "", notes: "" });

  const load = async () => {
    const all = await db.partographEntries.where("fileId").equals(fileId).toArray();
    setRows(all.filter(r => !r.deleted).sort((a, b) => (a.time || "").localeCompare(b.time || "")));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fileId]);

  const reset = () => setF({ time: nowLocal(), dilatation: "", rcf: "", contractions: "", contractionDuration: "", descent: "", liquide: "", moulage: "", bpSys: "", bpDia: "", pulse: "", temperature: "", oxytocin: "", notes: "" });

  const save = async () => {
    const num = (x: string) => (x === "" ? undefined : parseFloat(x));
    const rec: PartographEntry = {
      uid: uuid(), fileId,
      time: new Date(f.time).toISOString(),
      dilatation: num(f.dilatation), descent: num(f.descent), rcf: f.rcf ? parseInt(f.rcf) : undefined,
      contractions: f.contractions ? parseInt(f.contractions) : undefined, contractionDuration: f.contractionDuration || undefined,
      liquide: f.liquide || undefined, moulage: f.moulage || undefined,
      bpSys: f.bpSys ? parseInt(f.bpSys) : undefined, bpDia: f.bpDia ? parseInt(f.bpDia) : undefined,
      pulse: f.pulse ? parseInt(f.pulse) : undefined, temperature: num(f.temperature),
      oxytocin: f.oxytocin || undefined, notes: f.notes || undefined,
      recordedBy: user?.name || "—", clinicId: cid(), createdAt: new Date().toISOString(),
    };
    await db.partographEntries.add(rec);
    await logAudit("partograph_add", user?.name || "—", { resource: "partograph", message: `${motherName} · ${hhmm(rec.time)}` });
    toast.success("Observation enregistrée"); reset(); setOpen(false); await load();
  };

  const del = async (r: PartographEntry) => {
    await db.partographEntries.update(r.id!, { deleted: true, updatedAt: new Date().toISOString() });
    await load();
  };

  const startLabour = async () => {
    await db.maternityFiles.update(fileId, { labourStartAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    onStartLabour(); toast.success("Travail démarré — partogramme ouvert");
  };

  const hoursSince = (iso: string) => labourStartAt ? Math.max(0, (new Date(iso).getTime() - new Date(labourStartAt).getTime()) / 3600000) : 0;

  // ---- Print partograph (A4 paysage) ----
  const printPartograph = () => {
    import("jspdf").then(({ jsPDF }) => {
      const c = getClinicSettings();
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = 297, Hh = 210, mg = 12;
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text((c?.name || "Maternité").toUpperCase(), W / 2, 12, { align: "center" });
      doc.setFontSize(12); doc.text("PARTOGRAMME", W / 2, 18, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text(`Parturiente : ${motherName}`, mg, 25);
      if (labourStartAt) doc.text(`Début du travail : ${new Date(labourStartAt).toLocaleString("fr-FR")}`, mg + 110, 25);

      const dataH = rows.map(r => hoursSince(r.time));
      const maxH = Math.max(12, Math.ceil(Math.max(0, ...dataH)) + 1);
      const gx0 = mg + 18, gx1 = W - mg, gw = gx1 - gx0;
      const mapX = (h: number) => gx0 + (h / maxH) * gw;

      // ---- Dilatation graph (y 0..10 cm) ----
      const dy0 = 32, gh = 70; const dy1 = dy0 + gh;
      const mapYd = (d: number) => dy1 - (d / 10) * gh;
      doc.setDrawColor(150); doc.setLineWidth(0.1);
      for (let d = 0; d <= 10; d += 2) { doc.line(gx0, mapYd(d), gx1, mapYd(d)); doc.setFontSize(7); doc.setTextColor(90); doc.text(String(d), gx0 - 4, mapYd(d) + 1, { align: "right" }); }
      for (let h = 0; h <= maxH; h++) { doc.line(mapX(h), dy0, mapX(h), dy1); }
      doc.setDrawColor(60); doc.setLineWidth(0.3); doc.rect(gx0, dy0, gw, gh);
      doc.setFontSize(8); doc.setTextColor(30); doc.text("Dilatation du col (cm)", gx0, dy0 - 2);
      // alert line (4cm->10cm, 1cm/h) and action line (+4h)
      doc.setDrawColor(0x0F, 0x62, 0x8A); doc.setLineWidth(0.5);
      doc.line(mapX(0), mapYd(4), mapX(6), mapYd(10));            // alert
      doc.setDrawColor(0xB0, 0x1C, 0x1C);
      doc.line(mapX(4), mapYd(4), mapX(10), mapYd(10));           // action
      doc.setFontSize(6.5); doc.setTextColor(0x0F, 0x62, 0x8A); doc.text("Alerte", mapX(5.6), mapYd(10) - 1);
      doc.setTextColor(0xB0, 0x1C, 0x1C); doc.text("Action", Math.min(gx1 - 8, mapX(9.6)), mapYd(10) - 1);
      // plot dilatation
      doc.setDrawColor(20); doc.setLineWidth(0.5); doc.setFillColor(20,20,20);
      let prev: [number, number] | null = null;
      rows.forEach(r => { if (r.dilatation == null) return; const x = mapX(hoursSince(r.time)), y = mapYd(r.dilatation); if (prev) doc.line(prev[0], prev[1], x, y); doc.setFontSize(8); doc.text("X", x, y + 1, { align: "center" }); prev = [x, y]; });

      // ---- RCF strip (y 80..200) ----
      const ry0 = dy1 + 12, rh = 34; const ry1 = ry0 + rh;
      const mapYr = (v: number) => ry1 - ((v - 80) / 120) * rh;
      doc.setDrawColor(150); doc.setLineWidth(0.1);
      [80, 120, 160, 200].forEach(v => { doc.line(gx0, mapYr(v), gx1, mapYr(v)); doc.setFontSize(7); doc.setTextColor(90); doc.text(String(v), gx0 - 4, mapYr(v) + 1, { align: "right" }); });
      for (let h = 0; h <= maxH; h++) doc.line(mapX(h), ry0, mapX(h), ry1);
      doc.setDrawColor(60); doc.setLineWidth(0.3); doc.rect(gx0, ry0, gw, rh);
      doc.setFontSize(8); doc.setTextColor(30); doc.text("Rythme cardiaque fœtal (bpm)", gx0, ry0 - 2);
      doc.setDrawColor(0xB0, 0x1C, 0x1C); doc.setLineWidth(0.5); let pr: [number, number] | null = null;
      rows.forEach(r => { if (r.rcf == null) return; const x = mapX(hoursSince(r.time)), y = mapYr(Math.min(200, Math.max(80, r.rcf))); if (pr) doc.line(pr[0], pr[1], x, y); doc.setFillColor(0xB0, 0x1C, 0x1C); doc.circle(x, y, 0.8, "F"); pr = [x, y]; });

      // ---- Contractions / 10 min (bars) ----
      const cy0 = ry1 + 10, ch = 16; const cy1 = cy0 + ch;
      doc.setDrawColor(60); doc.setLineWidth(0.3); doc.rect(gx0, cy0, gw, ch);
      doc.setFontSize(8); doc.setTextColor(30); doc.text("Contractions / 10 min", gx0, cy0 - 2);
      doc.setFillColor(80,80,80); const bw = Math.max(2, gw / (maxH * 4));
      rows.forEach(r => { if (!r.contractions) return; const x = mapX(hoursSince(r.time)); const bh = Math.min(ch, (r.contractions / 5) * ch); doc.rect(x - bw / 2, cy1 - bh, bw, bh, "F"); });

      // ---- Observations table ----
      let ty = cy1 + 10;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(20);
      const headers = ["Heure", "Dilat", "Desc/5", "RCF", "CU/10", "Durée", "Liquide", "Moul.", "TA", "Pouls", "T°", "Ocyto."];
      const xs = [mg, mg + 20, mg + 36, mg + 52, mg + 66, mg + 82, mg + 98, mg + 122, mg + 136, mg + 156, mg + 172, mg + 186];
      headers.forEach((h, i) => doc.text(h, xs[i], ty)); ty += 2; doc.setDrawColor(120); doc.line(mg, ty, W - mg, ty); ty += 4;
      doc.setFont("helvetica", "normal");
      rows.forEach(r => {
        if (ty > Hh - 8) { doc.addPage({ orientation: "landscape", format: "a4" } as any); ty = 16; }
        const cells = [hhmm(r.time), r.dilatation != null ? r.dilatation + "" : "", r.descent != null ? r.descent + "" : "", r.rcf != null ? r.rcf + "" : "", r.contractions != null ? r.contractions + "" : "", r.contractionDuration || "", r.liquide || "", r.moulage || "", (r.bpSys && r.bpDia) ? `${r.bpSys}/${r.bpDia}` : "", r.pulse != null ? r.pulse + "" : "", r.temperature != null ? r.temperature + "" : "", r.oxytocin || ""];
        cells.forEach((cc, i) => doc.text(String(cc), xs[i], ty)); ty += 4.2;
      });
      doc.setFontSize(6.5); doc.setTextColor(130); doc.text("Généré par DivineLink · " + new Date().toLocaleString("fr-FR"), W / 2, Hh - 4, { align: "center" });
      doc.save(`partogramme_${motherName.replace(/\s+/g, "_")}.pdf`);
    });
  };

  const lastDilat = useMemo(() => { const d = [...rows].reverse().find(r => r.dilatation != null); return d?.dilatation; }, [rows]);

  return (
    <Card><CardContent className="p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Activity className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold flex-1">Partogramme (travail){rows.length ? ` · ${rows.length} obs.` : ""}{lastDilat != null ? ` · col ${lastDilat} cm` : ""}</p>
        {!labourStartAt
          ? <Button size="sm" className="h-8 gap-1 text-xs" onClick={startLabour}><Play className="w-4 h-4" /> Démarrer le travail</Button>
          : <>
              {!open && <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => { reset(); setOpen(true); }}><Plus className="w-4 h-4" /> Observation</Button>}
              {rows.length > 0 && <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={printPartograph}><Printer className="w-4 h-4" /> Imprimer</Button>}
            </>}
      </div>
      {labourStartAt && <p className="text-[11px] text-muted-foreground -mt-1">Début : {new Date(labourStartAt).toLocaleString("fr-FR")}</p>}

      {open && (
        <div className="rounded-md border border-primary/40 bg-primary/[0.03] p-2.5 space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Heure"><Input type="datetime-local" className="h-8" value={f.time} onChange={e => setF((s: any) => ({ ...s, time: e.target.value }))} /></Field>
            <Field label="Dilatation (cm)"><Input type="number" min={0} max={10} className="h-8" value={f.dilatation} onChange={e => setF((s: any) => ({ ...s, dilatation: e.target.value }))} /></Field>
            <Field label="RCF (bpm)"><Input type="number" className="h-8" value={f.rcf} onChange={e => setF((s: any) => ({ ...s, rcf: e.target.value }))} /></Field>
            <Field label="Contractions /10min"><Input type="number" className="h-8" value={f.contractions} onChange={e => setF((s: any) => ({ ...s, contractions: e.target.value }))} /></Field>
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setMore(m => !m)}>{more ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} {more ? "Moins" : "Plus de détails"}</Button>
          {more && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="Descente /5"><Input type="number" min={0} max={5} className="h-8" value={f.descent} onChange={e => setF((s: any) => ({ ...s, descent: e.target.value }))} /></Field>
                <Field label="TA sys"><Input type="number" className="h-8" value={f.bpSys} onChange={e => setF((s: any) => ({ ...s, bpSys: e.target.value }))} /></Field>
                <Field label="TA dia"><Input type="number" className="h-8" value={f.bpDia} onChange={e => setF((s: any) => ({ ...s, bpDia: e.target.value }))} /></Field>
                <Field label="Pouls"><Input type="number" className="h-8" value={f.pulse} onChange={e => setF((s: any) => ({ ...s, pulse: e.target.value }))} /></Field>
                <Field label="T° (°C)"><Input type="number" className="h-8" value={f.temperature} onChange={e => setF((s: any) => ({ ...s, temperature: e.target.value }))} /></Field>
                <Field label="Ocytocine / médoc"><Input className="h-8" value={f.oxytocin} onChange={e => setF((s: any) => ({ ...s, oxytocin: e.target.value }))} /></Field>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Durée contraction (sec)</label>
                <div className="flex gap-1.5">{CU_DUR.map(d => <Button key={d} type="button" size="sm" variant={f.contractionDuration === d ? "default" : "outline"} className="h-7 text-xs" onClick={() => setF((s: any) => ({ ...s, contractionDuration: d }))}>{d}</Button>)}</div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Liquide amniotique</label>
                <div className="flex gap-1.5 flex-wrap">{LIQUIDE.map(l => <Button key={l} type="button" size="sm" variant={f.liquide === l ? "default" : "outline"} className="h-7 text-xs" onClick={() => setF((s: any) => ({ ...s, liquide: l }))}>{l}</Button>)}</div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Moulage</label>
                <div className="flex gap-1.5">{MOULAGE.map(m => <Button key={m} type="button" size="sm" variant={f.moulage === m ? "default" : "outline"} className="h-7 text-xs" onClick={() => setF((s: any) => ({ ...s, moulage: m }))}>{m}</Button>)}</div>
              </div>
              <Field label="Notes"><Input className="h-8" value={f.notes} onChange={e => setF((s: any) => ({ ...s, notes: e.target.value }))} /></Field>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={save}>Enregistrer</Button>
          </div>
        </div>
      )}

      {labourStartAt && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground border-b">
              <th className="text-left py-1 pr-2">Heure</th><th className="text-right px-1">Col</th><th className="text-right px-1">RCF</th><th className="text-right px-1">CU</th><th className="text-left px-1">Liquide</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1 pr-2 whitespace-nowrap">{hhmm(r.time)}</td>
                  <td className="text-right px-1">{r.dilatation != null ? `${r.dilatation}cm` : "—"}</td>
                  <td className={`text-right px-1 ${r.rcf != null && (r.rcf < 110 || r.rcf > 160) ? "text-destructive font-medium" : ""}`}>{r.rcf ?? "—"}</td>
                  <td className="text-right px-1">{r.contractions ?? "—"}</td>
                  <td className="px-1">{r.liquide || "—"}</td>
                  <td className="text-right">{isAdmin && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => del(r)}><Trash2 className="w-3.5 h-3.5" /></Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {labourStartAt && rows.length === 0 && !open && <p className="text-xs text-muted-foreground">Aucune observation. « Observation » pour commencer le suivi.</p>}
    </CardContent></Card>
  );
}
