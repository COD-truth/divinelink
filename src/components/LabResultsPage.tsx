import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, FlaskConical, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { type Patient } from "@/lib/db";

const LAB_CATALOGUE = [
  { category: "Hematologie", exams: [
    { id: "nfs", name: "NFS - Numeration Formule Sanguine", short: "NFS", fields: [
      { key: "gb", label: "Globules Blancs", unit: "G/L", min: 4, max: 10 },
      { key: "gr", label: "Globules Rouges", unit: "T/L", min: 4.2, max: 5.4 },
      { key: "hb", label: "Hemoglobine", unit: "g/dL", min: 12, max: 17 },
      { key: "ht", label: "Hematocrite", unit: "%", min: 37, max: 50 },
      { key: "plaquettes", label: "Plaquettes", unit: "G/L", min: 150, max: 400 },
    ]},
    { id: "vs", name: "VS - Vitesse de Sedimentation", short: "VS", fields: [
      { key: "vs1h", label: "VS 1ere heure", unit: "mm", min: 0, max: 15 },
      { key: "vs2h", label: "VS 2eme heure", unit: "mm", min: 0, max: 30 },
    ]},
    { id: "crp", name: "CRP - Proteine C Reactive", short: "CRP", fields: [
      { key: "crp", label: "CRP", unit: "mg/L", min: 0, max: 6 },
    ]},
  ]},
  { category: "Biochimie", exams: [
    { id: "glycemie", name: "Glycemie", short: "GLY", fields: [
      { key: "glycemie", label: "Glycemie a jeun", unit: "g/L", min: 0.7, max: 1.1 },
      { key: "hba1c", label: "HbA1c", unit: "%", min: 0, max: 6.5 },
    ]},
    { id: "bilan_hepatique", name: "Bilan Hepatique", short: "BH", fields: [
      { key: "asat", label: "ASAT (TGO)", unit: "UI/L", min: 0, max: 40 },
      { key: "alat", label: "ALAT (TGP)", unit: "UI/L", min: 0, max: 40 },
      { key: "ggt", label: "GGT", unit: "UI/L", min: 0, max: 50 },
      { key: "bilirubine_t", label: "Bilirubine Totale", unit: "umol/L", min: 0, max: 17 },
      { key: "phosphatases", label: "Phosphatases Alcalines", unit: "UI/L", min: 40, max: 130 },
    ]},
    { id: "bilan_renal", name: "Bilan Renal", short: "BR", fields: [
      { key: "creatinine", label: "Creatinine", unit: "umol/L", min: 60, max: 110 },
      { key: "uree", label: "Uree", unit: "mmol/L", min: 2.5, max: 7.5 },
      { key: "acide_urique", label: "Acide Urique", unit: "umol/L", min: 150, max: 420 },
    ]},
    { id: "bilan_lipidique", name: "Bilan Lipidique", short: "BL", fields: [
      { key: "cholesterol_t", label: "Cholesterol Total", unit: "g/L", min: 0, max: 2 },
      { key: "hdl", label: "HDL", unit: "g/L", min: 0.4, max: 0.7 },
      { key: "ldl", label: "LDL", unit: "g/L", min: 0, max: 1.6 },
      { key: "triglycerides", label: "Triglycerides", unit: "g/L", min: 0, max: 1.5 },
    ]},
    { id: "ionogramme", name: "Ionogramme Sanguin", short: "IONO", fields: [
      { key: "sodium", label: "Sodium (Na+)", unit: "mmol/L", min: 136, max: 145 },
      { key: "potassium", label: "Potassium (K+)", unit: "mmol/L", min: 3.5, max: 5 },
      { key: "chlore", label: "Chlore (Cl-)", unit: "mmol/L", min: 98, max: 107 },
      { key: "calcium", label: "Calcium (Ca2+)", unit: "mmol/L", min: 2.2, max: 2.6 },
    ]},
  ]},
  { category: "Infectiologie", exams: [
    { id: "paludisme", name: "Test Paludisme (TDR/GE)", short: "PALU", fields: [
      { key: "tdr_palu", label: "TDR Paludisme", unit: "", min: 0, max: 0, isSelect: true, options: ["Negatif", "Positif (+)", "Positif (++)", "Positif (+++)"] },
      { key: "parasitemie", label: "Parasitemie", unit: "parasites/uL", min: 0, max: 0 },
      { key: "espece", label: "Espece parasitaire", unit: "", min: 0, max: 0, isText: true },
    ]},
    { id: "hiv", name: "Serologie VIH", short: "VIH", fields: [
      { key: "hiv1", label: "VIH 1", unit: "", min: 0, max: 0, isSelect: true, options: ["Negatif", "Positif", "Indetermine"] },
      { key: "hiv2", label: "VIH 2", unit: "", min: 0, max: 0, isSelect: true, options: ["Negatif", "Positif", "Indetermine"] },
    ]},
    { id: "hepatites", name: "Serologie Hepatites", short: "HEP", fields: [
      { key: "hbs_ag", label: "AgHBs (Hepatite B)", unit: "", min: 0, max: 0, isSelect: true, options: ["Negatif", "Positif"] },
      { key: "hcv", label: "Anti-VHC (Hepatite C)", unit: "", min: 0, max: 0, isSelect: true, options: ["Negatif", "Positif"] },
    ]},
    { id: "ecbu", name: "ECBU", short: "ECBU", fields: [
      { key: "leucocytes_u", label: "Leucocytes urinaires", unit: "/mm3", min: 0, max: 10000 },
      { key: "bacteriurie", label: "Bacteriurie", unit: "", min: 0, max: 0, isSelect: true, options: ["Absence", "< 10^3 UFC/mL", "10^3-10^5 UFC/mL", "> 10^5 UFC/mL"] },
      { key: "germe", label: "Germe identifie", unit: "", min: 0, max: 0, isText: true },
    ]},
    { id: "widal", name: "Widal et Felix", short: "WIDAL", fields: [
      { key: "to", label: "TO", unit: "", min: 0, max: 0, isText: true },
      { key: "th", label: "TH", unit: "", min: 0, max: 0, isText: true },
      { key: "ao", label: "AO", unit: "", min: 0, max: 0, isText: true },
      { key: "ah", label: "AH", unit: "", min: 0, max: 0, isText: true },
    ]},
  ]},
  { category: "Hormonologie", exams: [
    { id: "thyroide", name: "Bilan Thyroidien", short: "TSH", fields: [
      { key: "tsh", label: "TSH", unit: "mUI/L", min: 0.4, max: 4 },
      { key: "t4", label: "T4 Libre", unit: "pmol/L", min: 11, max: 22 },
    ]},
    { id: "beta_hcg", name: "Test Grossesse (HCG)", short: "HCG", fields: [
      { key: "resultat_hcg", label: "Resultat", unit: "", min: 0, max: 0, isSelect: true, options: ["Negatif", "Positif"] },
      { key: "beta_hcg_val", label: "Beta-HCG quantitatif", unit: "mUI/mL", min: 0, max: 5 },
    ]},
  ]},
  { category: "Dentaire / Radiologie", exams: [
    { id: "radio_dentaire", name: "Radiographie Dentaire", short: "RX", fields: [
      { key: "type_radio", label: "Type de radio", unit: "", min: 0, max: 0, isSelect: true, options: ["Retroalveolaire", "Panoramique (OPG)", "Mordu", "Cone Beam (CBCT)"] },
      { key: "dents_concernees", label: "Dents concernees (FDI)", unit: "", min: 0, max: 0, isText: true },
      { key: "observations_rx", label: "Observations radiologiques", unit: "", min: 0, max: 0, isText: true },
    ]},
    { id: "test_vitalite", name: "Test de Vitalite Pulpaire", short: "TVP", fields: [
      { key: "dent_testee", label: "Dent testee (FDI)", unit: "", min: 0, max: 0, isText: true },
      { key: "resultat_vitalite", label: "Resultat", unit: "", min: 0, max: 0, isSelect: true, options: ["Vitale", "Non-vitale", "Douteux"] },
      { key: "methode", label: "Methode", unit: "", min: 0, max: 0, isSelect: true, options: ["Test au froid", "Test electrique", "Test a la chaleur"] },
    ]},
  ]},
];

export function LabResultsPage({ patient, patientId }: { patient?: Patient; patientId?: number }) {
  const displayName = patient ? patient.firstName + " " + patient.lastName : "Patient #" + (patientId || "");
  const [search, setSearch] = useState("");
  const [selectedExam, setSelectedExam] = useState(null);
  const [values, setValues] = useState({});
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saved, setSaved] = useState([]);
  const [showCatalogue, setShowCatalogue] = useState(true);
  const [expanded, setExpanded] = useState(new Set());

  const filtered = LAB_CATALOGUE.map(cat => ({
    ...cat,
    exams: cat.exams.filter(e =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.short.toLowerCase().includes(search.toLowerCase()) ||
      cat.category.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(cat => cat.exams.length > 0);

  const getStatus = (field, val) => {
    if (field.isSelect || field.isText || !val || (field.min === 0 && field.max === 0)) return "normal";
    const num = parseFloat(val);
    if (isNaN(num)) return "normal";
    return (num < field.min || num > field.max) ? "abnormal" : "normal";
  };

  const hasAbnormal = (entry) => {
    const exam = LAB_CATALOGUE.flatMap(c => c.exams).find(e => e.id === entry.examId);
    return Object.entries(entry.values).some(([k, v]) => {
      const field = exam?.fields.find(f => f.key === k);
      return field && getStatus(field, v) === "abnormal";
    });
  };

  const saveEntry = () => {
    if (!selectedExam) return;
    setSaved(prev => [{ examId: selectedExam.id, examName: selectedExam.name, date, values, notes }, ...prev]);
    toast.success("Resultat enregistre!");
    setSelectedExam(null);
    setShowCatalogue(true);
    setValues({});
    setNotes("");
  };

  const toggleExpand = (i) => {
    setExpanded(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Analyses — {displayName}</h2>
      </div>

      {saved.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resultats enregistres</p>
          {saved.map((entry, i) => (
            <Card key={i} className="border-muted">
              <CardContent className="p-3">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(i)}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{entry.date}</Badge>
                    <p className="text-sm font-medium">{entry.examName}</p>
                    {hasAbnormal(entry) && <Badge className="bg-red-100 text-red-700 text-xs border-0">Anomalie</Badge>}
                  </div>
                  {expanded.has(i) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
                {expanded.has(i) && (
                  <div className="mt-3 space-y-1 border-t pt-2">
                    {Object.entries(entry.values).map(([k, v]) => {
                      const exam = LAB_CATALOGUE.flatMap(c => c.exams).find(e => e.id === entry.examId);
                      const field = exam?.fields.find(f => f.key === k);
                      if (!field || !v) return null;
                      const abnormal = getStatus(field, v) === "abnormal";
                      return (
                        <div key={k} className="flex justify-between text-sm py-1 border-b border-muted/40">
                          <span className="text-muted-foreground">{field.label}</span>
                          <span className={abnormal ? "font-bold text-red-600" : "font-medium text-green-700"}>
                            {v} {field.unit} {abnormal ? "!" : ""}
                          </span>
                        </div>
                      );
                    })}
                    {entry.notes && <p className="text-xs text-muted-foreground italic mt-2">{entry.notes}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCatalogue && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nouvelle analyse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Chercher: NFS, Glycemie, Paludisme, Radio..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {filtered.map(cat => (
                <div key={cat.category}>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">{cat.category}</p>
                  <div className="space-y-1">
                    {cat.exams.map(exam => (
                      <button key={exam.id} onClick={() => { setSelectedExam(exam); setShowCatalogue(false); }}
                        className="w-full text-left p-2.5 rounded-lg border border-muted hover:border-primary/50 hover:bg-muted/30 transition-colors flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs shrink-0 font-bold">{exam.short}</Badge>
                        <span className="text-sm">{exam.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedExam && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{selectedExam.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedExam(null); setShowCatalogue(true); }}>Retour</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Date de l examen</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44 mt-1" />
            </div>
            {selectedExam.fields.map((field) => {
              const val = values[field.key] || "";
              const abnormal = getStatus(field, val) === "abnormal";
              return (
                <div key={field.key}>
                  <Label className="text-sm">{field.label} {field.unit && <span className="text-muted-foreground text-xs">({field.unit})</span>}</Label>
                  {field.isSelect && field.options ? (
                    <select value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                      className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">-- Choisir --</option>
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : field.isText ? (
                    <Input value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))} placeholder="Saisir..." className="mt-1" />
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <Input type="number" step="any" value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                        placeholder={field.min && field.max ? ("Norme: " + field.min + "-" + field.max) : "Valeur"}
                        className={abnormal ? "border-red-400 bg-red-50" : ""} />
                      {val && <Badge className={abnormal ? "bg-red-100 text-red-700 border-0 shrink-0" : "bg-green-100 text-green-700 border-0 shrink-0"}>{abnormal ? "Anormal" : "Normal"}</Badge>}
                    </div>
                  )}
                  {field.min > 0 && field.max > 0 && <p className="text-xs text-muted-foreground mt-0.5">Normes: {field.min} - {field.max} {field.unit}</p>}
                </div>
              );
            })}
            <div>
              <Label>Notes / Interpretation</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Interpretation, commentaires..." rows={3} className="mt-1" />
            </div>
            <Button onClick={saveEntry} className="w-full gap-2">
              <FlaskConical className="w-4 h-4" /> Enregistrer le resultat
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}