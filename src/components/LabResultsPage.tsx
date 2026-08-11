import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Download, Edit, FlaskConical } from "lucide-react";
import { getClinicSettings } from "@/lib/clinicSettings";

interface LabField { name: string; value: string; unit: string; normalRange: string; isAbnormal?: boolean; }
interface LabResult { id?: number; patientId: number; template: string; title: string; date: string; fields: LabField[]; conclusion: string; clinicId: string; createdAt: string; }

const TEMPLATES: Record<string, { title: string; fields: Omit<LabField,"value"|"isAbnormal">[] }> = {
  nfs: { title: "NFS - Numeration Formule Sanguine", fields: [
    { name: "Globules rouges", unit: "10^6/uL", normalRange: "4.5-5.5 H / 4.0-5.0 F" },
    { name: "Hemoglobine", unit: "g/dL", normalRange: "13-17 H / 12-16 F" },
    { name: "Hematocrite", unit: "%", normalRange: "40-54 H / 36-48 F" },
    { name: "Globules blancs", unit: "10^3/uL", normalRange: "4.0-10.0" },
    { name: "Neutrophiles", unit: "%", normalRange: "50-70" },
    { name: "Lymphocytes", unit: "%", normalRange: "20-40" },
    { name: "Plaquettes", unit: "10^3/uL", normalRange: "150-400" },
  ]},
  glycemie: { title: "Glycemie", fields: [
    { name: "Glycemie a jeun", unit: "g/L", normalRange: "0.70-1.10" },
    { name: "Glycemie post-prandiale", unit: "g/L", normalRange: "< 1.40" },
    { name: "HbA1c", unit: "%", normalRange: "< 5.7 normal" },
  ]},
  renal: { title: "Bilan Renal", fields: [
    { name: "Creatinine", unit: "mg/L", normalRange: "6-12 F / 7-13 H" },
    { name: "Uree", unit: "g/L", normalRange: "0.15-0.45" },
    { name: "Acide urique", unit: "mg/L", normalRange: "25-70 H / 20-60 F" },
    { name: "Sodium Na+", unit: "mEq/L", normalRange: "136-145" },
    { name: "Potassium K+", unit: "mEq/L", normalRange: "3.5-5.0" },
  ]},
  hepatique: { title: "Bilan Hepatique", fields: [
    { name: "ASAT (TGO)", unit: "UI/L", normalRange: "< 40" },
    { name: "ALAT (TGP)", unit: "UI/L", normalRange: "< 41 H / < 33 F" },
    { name: "GGT", unit: "UI/L", normalRange: "< 55 H / < 38 F" },
    { name: "Bilirubine totale", unit: "mg/L", normalRange: "2-10" },
    { name: "Albumine", unit: "g/L", normalRange: "35-50" },
  ]},
  lipidique: { title: "Bilan Lipidique", fields: [
    { name: "Cholesterol total", unit: "g/L", normalRange: "< 2.00" },
    { name: "HDL-Cholesterol", unit: "g/L", normalRange: "> 0.40 H / > 0.50 F" },
    { name: "LDL-Cholesterol", unit: "g/L", normalRange: "< 1.30" },
    { name: "Triglycerides", unit: "g/L", normalRange: "< 1.50" },
  ]},
  paludisme: { title: "Goutte Epaisse / Paludisme", fields: [
    { name: "Goutte epaisse", unit: "", normalRange: "Negative" },
    { name: "Frottis sanguin", unit: "", normalRange: "Negatif" },
    { name: "TDR Paludisme", unit: "", normalRange: "Negatif" },
    { name: "Espece plasmodiale", unit: "", normalRange: "-" },
    { name: "Densite parasitaire", unit: "parasites/uL", normalRange: "0" },
  ]},
  ecbu: { title: "Analyse Urine - ECBU", fields: [
    { name: "Aspect", unit: "", normalRange: "Clair, jaune paille" },
    { name: "Leucocytes", unit: "/mm3", normalRange: "< 10" },
    { name: "Hematies", unit: "/mm3", normalRange: "< 5" },
    { name: "Proteines", unit: "", normalRange: "Negatives" },
    { name: "Nitrites", unit: "", normalRange: "Negatifs" },
    { name: "Germe identifie", unit: "", normalRange: "Absence" },
  ]},
  radio_dentaire: { title: "Compte-Rendu Radiographique Dentaire", fields: [
    { name: "Type de radiographie", unit: "", normalRange: "-" },
    { name: "Dents examinees", unit: "", normalRange: "-" },
    { name: "Tissu osseux alveolaire", unit: "", normalRange: "Normal" },
    { name: "Espaces peri-apicaux", unit: "", normalRange: "Libres" },
    { name: "Caries observees", unit: "", normalRange: "Aucune" },
    { name: "Anomalies osseuses", unit: "", normalRange: "Aucune" },
  ]},
};

function generateLabPDF(result: LabResult, patient: any) {
  import("jspdf").then(({ jsPDF }) => {
    const clinic = getClinicSettings();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210; const margin = 15; const cW = W - margin * 2;
    let y = 14;
    const TEAL: [number,number,number] = [13,148,136];
    const DARK: [number,number,number] = [15,23,42];
    const GREY: [number,number,number] = [100,116,139];
    const RED: [number,number,number] = [239,68,68];

    doc.setFillColor(...TEAL); doc.rect(0,0,W,24,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont("helvetica","bold");
    doc.text(clinic?.name || "DivineLink Clinic", margin, 10);
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text("RESULTATS D'ANALYSES", W-margin, 10, {align:"right"});
    doc.text(result.date, W-margin, 16, {align:"right"});
    y = 30;

    doc.setTextColor(...DARK); doc.setFontSize(13); doc.setFont("helvetica","bold");
    doc.text(result.title, W/2, y, {align:"center"}); y += 8;

    doc.setFillColor(240,253,250); doc.rect(margin,y,cW,14,"F");
    doc.setFontSize(9); doc.setFont("helvetica","bold");
    doc.text(`Patient: ${patient?.firstName||""} ${patient?.lastName||""}`, margin+2, y+5);
    doc.text(`Date: ${result.date}`, W-margin-2, y+5, {align:"right"});
    y += 18;

    doc.setFillColor(...TEAL); doc.rect(margin,y,cW,8,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(8.5); doc.setFont("helvetica","bold");
    doc.text("Analyse", margin+2, y+5.5);
    doc.text("Resultat", margin+90, y+5.5);
    doc.text("Unite", margin+120, y+5.5);
    doc.text("Valeurs normales", margin+145, y+5.5);
    y += 8;

    result.fields.forEach((field, i) => {
      if (i%2===0) { doc.setFillColor(248,250,252); doc.rect(margin,y,cW,8,"F"); }
      if (field.isAbnormal) { doc.setFillColor(254,242,242); doc.rect(margin,y,cW,8,"F"); }
      doc.setTextColor(field.isAbnormal?220:30, field.isAbnormal?20:30, field.isAbnormal?20:46);
      doc.setFont("helvetica", field.isAbnormal?"bold":"normal");
      doc.setFontSize(8);
      doc.text(field.name, margin+2, y+5.5);
      doc.text(field.value||"-", margin+90, y+5.5);
      doc.setTextColor(...GREY);
      doc.text(field.unit, margin+120, y+5.5);
      doc.text(field.normalRange, margin+145, y+5.5);
      if (field.isAbnormal) { doc.setTextColor(...RED); doc.text("*", margin+108, y+5.5); }
      y += 8;
    });

    y += 8;
    if (result.conclusion) {
      doc.setFillColor(240,253,250); doc.rect(margin,y,cW,6,"F");
      doc.setTextColor(...TEAL); doc.setFont("helvetica","bold"); doc.setFontSize(9);
      doc.text("CONCLUSION", margin+2, y+4.5); y += 8;
      doc.setTextColor(...DARK); doc.setFont("helvetica","normal");
      const lines = doc.splitTextToSize(result.conclusion, cW-4);
      doc.text(lines, margin+2, y); y += lines.length*5+4;
    }

    y = Math.max(y, 250);
    doc.setDrawColor(...GREY); doc.line(W-margin-50,y,W-margin,y);
    doc.setTextColor(...GREY); doc.setFontSize(8);
    doc.text("Signature & Cachet", W-margin-25, y+5, {align:"center"});

    doc.setFillColor(...TEAL); doc.rect(0,285,W,12,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(7);
    doc.text(`Genere par DivineLink - ${clinic?.name||""} - ${new Date().toLocaleDateString("fr-FR")}`, W/2, 292, {align:"center"});

    doc.save(`lab_${result.template}_${(patient?.lastName||"patient")}.pdf`);
  });
}

interface Props { patientId: number; }

export function LabResultsPage({ patientId }: Props) {
  const { user } = useAuth();
  const clinicId = localStorage.getItem("divinelink.clinicId") || "";
  const [results, setResults] = useState<LabResult[]>([]);
  const [patient, setPatient] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<LabResult | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  useEffect(() => {
    loadResults();
    db.patients.get(patientId).then(p => setPatient(p));
  }, [patientId]);

  async function loadResults() {
    try {
      const docs = await db.documents.where("patientId").equals(patientId)
        .filter((d: any) => d.tag === "lab").toArray();
      const parsed = docs.map((d: any) => { try { return JSON.parse(d.name); } catch { return null; } }).filter(Boolean);
      setResults(parsed);
    } catch {}
  }

  function startNew(templateKey: string) {
    const tpl = TEMPLATES[templateKey];
    if (!tpl) return;
    setCurrent({
      patientId, template: templateKey, title: tpl.title,
      date: new Date().toLocaleDateString("fr-FR"),
      fields: tpl.fields.map(f => ({ ...f, value: "", isAbnormal: false })),
      conclusion: "", clinicId, createdAt: new Date().toISOString(),
    });
    setEditOpen(true);
  }

  async function saveResult() {
    if (!current) return;
    try {
      await (db.documents as any).add({
        patientId, name: JSON.stringify(current), tag: "lab",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), clinicId,
      });
      toast.success("Resultats sauvegardes!");
      setEditOpen(false);
      loadResults();
    } catch { toast.error("Erreur lors de la sauvegarde."); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="w-5 h-5 text-primary" />
            Nouveau resultat d'analyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choisir un modele..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATES).map(([key, tpl]) => (
                  <SelectItem key={key} value={key}>{tpl.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => selectedTemplate && startNew(selectedTemplate)}
              disabled={!selectedTemplate} className="gap-2">
              <Plus className="w-4 h-4" /> Creer
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucun resultat d'analyse pour ce patient.
        </p>
      ) : (
        <div className="space-y-2">
          {results.map((r, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.date}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1 h-8"
                    onClick={() => generateLabPDF(r, patient)}>
                    <Download className="w-3.5 h-3.5" /> PDF
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 h-8"
                    onClick={() => { setCurrent(r); setEditOpen(true); }}>
                    <Edit className="w-3.5 h-3.5" /> Modifier
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{current?.title}</DialogTitle>
          </DialogHeader>
          {current && (
            <div className="space-y-4">
              <div>
                <Label>Date</Label>
                <Input value={current.date}
                  onChange={e => setCurrent(c => c ? {...c, date: e.target.value} : c)} />
              </div>
              <div className="space-y-3">
                <Label>Resultats</Label>
                {current.fields.map((field, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {field.name} ({field.unit}) — Normal: {field.normalRange}
                    </p>
                    <div className="flex gap-2">
                      <Input placeholder="Valeur..."
                        value={field.value}
                        onChange={e => {
                          const fields = [...current.fields];
                          fields[i] = {...field, value: e.target.value};
                          setCurrent(c => c ? {...c, fields} : c);
                        }}
                        className={field.isAbnormal ? "border-red-400 flex-1" : "flex-1"}
                      />
                      <Button type="button" size="sm"
                        variant={field.isAbnormal ? "destructive" : "outline"}
                        className="h-9 text-xs whitespace-nowrap"
                        onClick={() => {
                          const fields = [...current.fields];
                          fields[i] = {...field, isAbnormal: !field.isAbnormal};
                          setCurrent(c => c ? {...c, fields} : c);
                        }}>
                        {field.isAbnormal ? "Anormal" : "Normal"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <Label>Conclusion</Label>
                <Textarea value={current.conclusion}
                  onChange={e => setCurrent(c => c ? {...c, conclusion: e.target.value} : c)}
                  placeholder="Commentaire du medecin..." rows={3} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveResult} className="flex-1">Sauvegarder</Button>
                <Button variant="outline" className="gap-2"
                  onClick={() => current && generateLabPDF(current, patient)}>
                  <Download className="w-4 h-4" /> PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
