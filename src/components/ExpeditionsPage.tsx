import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MapPin, Users, Plus, ClipboardList, Download, Calendar, UserCheck } from "lucide-react";

const API = "https://divinelink.mooo.com/api";

const PROCEDURES_DENTAL = [
  "Extraction simple","Extraction chirurgicale","Detartrage",
  "Obturation composite","Obturation amalgame","Pulpectomie",
  "Traitement canalaire","Couronne","Bridge","Implant",
  "Prothese partielle","Prothese complete","Radiographie",
  "Consultation dentaire","Autre acte dentaire"
];

const PROCEDURES_GENERAL = [
  "Consultation generale","Pansement","Injection IM","Injection IV",
  "Perfusion","Suture","Ablation points","Prise de sang",
  "Certificat medical","Evacuation","Autre acte medical"
];

export function ExpeditionsPage() {
  const { user } = useAuth();
  const token = () => localStorage.getItem("divinelink.apiToken");
  const [expeditions, setExpeditions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [patients, setPatients] = useState([]);
  const [report, setReport] = useState(null);
  const [newExpOpen, setNewExpOpen] = useState(false);
  const [newPatOpen, setNewPatOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [expForm, setExpForm] = useState({
    name: "", location: "", date_start: "", date_end: "", notes: ""
  });
  const [patForm, setPatForm] = useState({
    first_name: "", last_name: "", age: "", gender: "M",
    village: "", phone: "", chief_complaint: "", diagnosis: "",
    procedures: [], treated_by: "", supervised_by: "",
    outcome: "treated", follow_up_needed: false, follow_up_date: "", notes: ""
  });

  useEffect(() => { loadExpeditions(); }, []);

  async function loadExpeditions() {
    try {
      const r = await fetch(API+"/expeditions", {headers:{Authorization:"Bearer "+token()}});
      if(r.ok) setExpeditions(await r.json());
    } catch{}
  }

  async function loadPatients(expId) {
    try {
      const r = await fetch(API+"/expeditions/"+expId+"/patients", {headers:{Authorization:"Bearer "+token()}});
      if(r.ok) setPatients(await r.json());
      const rr = await fetch(API+"/expeditions/"+expId+"/report", {headers:{Authorization:"Bearer "+token()}});
      if(rr.ok) setReport(await rr.json());
    } catch{}
  }

  async function createExpedition() {
    if(!expForm.name || !expForm.location || !expForm.date_start) {
      toast.error("Nom, lieu et date de debut requis"); return;
    }
    setLoading(true);
    try {
      const r = await fetch(API+"/expeditions", {
        method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},
        body: JSON.stringify(expForm)
      });
      if(r.ok) {
        toast.success("Expedition creee!");
        setNewExpOpen(false);
        setExpForm({name:"",location:"",date_start:"",date_end:"",notes:""});
        loadExpeditions();
      }
    } catch{ toast.error("Erreur reseau"); }
    setLoading(false);
  }

  async function addPatient() {
    if(!patForm.first_name || !patForm.last_name) {
      toast.error("Nom et prenom requis"); return;
    }
    setLoading(true);
    try {
      const r = await fetch(API+"/expeditions/"+selected.id+"/patients", {
        method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},
        body: JSON.stringify({...patForm, age: patForm.age ? Number(patForm.age) : null})
      });
      if(r.ok) {
        toast.success("Patient enregistre!");
        setNewPatOpen(false);
        setPatForm({first_name:"",last_name:"",age:"",gender:"M",village:"",phone:"",
          chief_complaint:"",diagnosis:"",procedures:[],treated_by:"",supervised_by:"",
          outcome:"treated",follow_up_needed:false,follow_up_date:"",notes:""});
        loadPatients(selected.id);
      }
    } catch{ toast.error("Erreur reseau"); }
    setLoading(false);
  }

  async function downloadReport() {
    if(!report||!selected) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({unit:"mm",format:"a4"});
    const W=210, m=15; let y=15;
    const T=[13,148,136], D=[15,23,42];

    doc.setFillColor(...T); doc.rect(0,0,W,30,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont("helvetica","bold");
    doc.text("RAPPORT D'EXPEDITION MEDICALE",W/2,12,{align:"center"});
    doc.setFontSize(10); doc.setFont("helvetica","normal");
    doc.text(selected.name+" - "+selected.location,W/2,20,{align:"center"});
    doc.text("Du "+selected.date_start+" au "+(selected.date_end||"..."),W/2,27,{align:"center"});
    y=38;

    const sec=t=>{doc.setFillColor(...T);doc.rect(m,y,W-m*2,7,"F");doc.setTextColor(255,255,255);doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text(t.toUpperCase(),m+2,y+5);y+=9;};
    const row=(l,v,shade=false)=>{if(shade){doc.setFillColor(240,253,250);doc.rect(m,y,W-m*2,7,"F");}doc.setTextColor(...D);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text(l,m+2,y+5);doc.setFont("helvetica","bold");doc.text(String(v),W-m-2,y+5,{align:"right"});y+=7;};

    sec("1. Resume General");
    row("Total patients pris en charge",report.totalPatients,true);
    row("Patients hommes",report.byGender?.male||0);
    row("Patients femmes",report.byGender?.female||0,true);
    row("Patients necessitant suivi",report.followUps||0);
    y+=3;

    sec("2. Actes Realises");
    Object.entries(report.procedures||{}).forEach(([p,c],i)=>row(p,c,i%2===0));
    y+=3;

    sec("3. Par Praticien");
    Object.entries(report.byDoctor||{}).forEach(([d,c],i)=>row(d,c,i%2===0));
    y+=3;

    sec("4. Resultats");
    row("Traites sur place",report.outcomes?.treated||0,true);
    row("Referes",report.outcomes?.referred||0);
    row("En attente",report.outcomes?.pending||0,true);
    y+=10;

    doc.setDrawColor(100,116,139);
    doc.line(m,y,m+60,y); doc.line(W-m-60,y,W-m,y);
    doc.setTextColor(100,116,139); doc.setFontSize(8);
    doc.text("Chef d'expedition",m+30,y+5,{align:"center"});
    doc.text("Responsable medical",W-m-30,y+5,{align:"center"});

    doc.setFillColor(...T); doc.rect(0,285,W,12,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(7);
    doc.text("Genere par DivineLink Field - "+selected.name+" - "+new Date().toLocaleDateString("fr-FR"),W/2,292,{align:"center"});

    doc.save("rapport_expedition_"+selected.name.replace(/\s/g,"_")+".pdf");
    toast.success("Rapport PDF telecharge!");
  }

  const statusColor = s => s==="active"?"bg-green-500":s==="completed"?"bg-blue-500":"bg-yellow-500";
  const statusLabel = s => s==="active"?"En cours":s==="completed"?"Terminee":"Planifiee";

  if(selected) return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={()=>{setSelected(null);setPatients([]);setReport(null);}}>← Retour</Button>
        <h2 className="text-lg font-bold flex-1">{selected.name}</h2>
        <Button size="sm" variant="outline" onClick={downloadReport} className="gap-1">
          <Download className="w-4 h-4"/>Rapport PDF
        </Button>
        <Button size="sm" onClick={()=>setNewPatOpen(true)} className="gap-1">
          <Plus className="w-4 h-4"/>Patient
        </Button>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><MapPin className="w-4 h-4"/>{selected.location}</span>
        <span className="flex items-center gap-1"><Calendar className="w-4 h-4"/>{selected.date_start}</span>
        <Badge className={statusColor(selected.status)}>{statusLabel(selected.status)}</Badge>
      </div>

      {report && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {l:"Patients",v:report.totalPatients,c:"text-teal-600"},
            {l:"Actes",v:Object.values(report.procedures||{}).reduce((s,v)=>s+v,0),c:"text-blue-600"},
            {l:"Suivis",v:report.followUps,c:"text-orange-600"},
          ].map((s,i)=>(
            <div key={i} className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">{s.l}</p>
              <p className={"text-2xl font-bold "+s.c}>{s.v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Patients ({patients.length})</p>
        {patients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50"/>
            <p className="text-sm">Aucun patient enregistre. Cliquez + Patient pour commencer.</p>
          </div>
        ) : patients.map((p,i)=>(
          <Card key={i}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{p.first_name} {p.last_name}</p>
                  <p className="text-xs text-muted-foreground">{p.age}ans · {p.gender} · {p.village}</p>
                  {p.diagnosis && <p className="text-xs mt-1 text-foreground">{p.diagnosis}</p>}
                </div>
                <Badge variant={p.outcome==="treated"?"default":p.outcome==="referred"?"destructive":"secondary"}>
                  {p.outcome==="treated"?"Traite":p.outcome==="referred"?"Refere":"En attente"}
                </Badge>
              </div>
              {p.treated_by && <p className="text-xs text-muted-foreground mt-1">Par: {p.treated_by}</p>}
              {p.follow_up_needed && <p className="text-xs text-orange-600 mt-1">Suivi requis: {p.follow_up_date||"date a definir"}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={newPatOpen} onOpenChange={setNewPatOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nouveau patient</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Prenom *</Label><Input value={patForm.first_name} onChange={e=>setPatForm(f=>({...f,first_name:e.target.value}))}/></div>
              <div><Label>Nom *</Label><Input value={patForm.last_name} onChange={e=>setPatForm(f=>({...f,last_name:e.target.value}))}/></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Age</Label><Input type="number" value={patForm.age} onChange={e=>setPatForm(f=>({...f,age:e.target.value}))}/></div>
              <div><Label>Sexe</Label>
                <Select value={patForm.gender} onValueChange={v=>setPatForm(f=>({...f,gender:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Feminin</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Village</Label><Input value={patForm.village} onChange={e=>setPatForm(f=>({...f,village:e.target.value}))}/></div>
            </div>
            <div><Label>Motif consultation</Label><Textarea rows={2} value={patForm.chief_complaint} onChange={e=>setPatForm(f=>({...f,chief_complaint:e.target.value}))}/></div>
            <div><Label>Diagnostic</Label><Input value={patForm.diagnosis} onChange={e=>setPatForm(f=>({...f,diagnosis:e.target.value}))}/></div>
            <div>
              <Label>Actes realises</Label>
              <div className="grid grid-cols-2 gap-1 mt-1 max-h-32 overflow-y-auto border rounded p-2">
                {[...PROCEDURES_DENTAL,...PROCEDURES_GENERAL].map(p=>(
                  <label key={p} className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="checkbox" checked={patForm.procedures.includes(p)}
                      onChange={e=>setPatForm(f=>({...f,procedures:e.target.checked?[...f.procedures,p]:f.procedures.filter(x=>x!==p)}))}/>
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Praticien</Label><Input value={patForm.treated_by} onChange={e=>setPatForm(f=>({...f,treated_by:e.target.value}))}/></div>
              <div><Label>Superviseur</Label><Input value={patForm.supervised_by} onChange={e=>setPatForm(f=>({...f,supervised_by:e.target.value}))}/></div>
            </div>
            <div>
              <Label>Resultat</Label>
              <Select value={patForm.outcome} onValueChange={v=>setPatForm(f=>({...f,outcome:v}))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="treated">Traite sur place</SelectItem>
                  <SelectItem value="referred">Refere</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={patForm.follow_up_needed}
                onChange={e=>setPatForm(f=>({...f,follow_up_needed:e.target.checked}))}/>
              <Label>Suivi necessaire</Label>
              {patForm.follow_up_needed && <Input type="date" value={patForm.follow_up_date} onChange={e=>setPatForm(f=>({...f,follow_up_date:e.target.value}))} className="flex-1"/>}
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={patForm.notes} onChange={e=>setPatForm(f=>({...f,notes:e.target.value}))}/></div>
            <Button onClick={addPatient} disabled={loading} className="w-full">
              {loading?"Enregistrement...":"Enregistrer le patient"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Expeditions Medicales</h2>
          <p className="text-sm text-muted-foreground">Gestion des sorties terrain et missions chirurgicales</p>
        </div>
        <Button onClick={()=>setNewExpOpen(true)} className="gap-2">
          <Plus className="w-4 h-4"/>Nouvelle expedition
        </Button>
      </div>

      {expeditions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30"/>
          <p className="font-medium">Aucune expedition</p>
          <p className="text-sm">Creez votre premiere expedition medicale de terrain</p>
        </div>
      ) : (
        <div className="space-y-3">
          {expeditions.map((exp,i)=>(
            <Card key={i} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={()=>{setSelected(exp);loadPatients(exp.id);}}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{exp.name}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3"/>{exp.location}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{exp.date_start}</p>
                  </div>
                  <Badge className={statusColor(exp.status)}>{statusLabel(exp.status)}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={newExpOpen} onOpenChange={setNewExpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouvelle expedition</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom de l'expedition *</Label>
              <Input placeholder="Ex: Mission Mbalmayo 2026" value={expForm.name} onChange={e=>setExpForm(f=>({...f,name:e.target.value}))}/>
            </div>
            <div><Label>Lieu / Village *</Label>
              <Input placeholder="Ex: Mbalmayo, Lekie" value={expForm.location} onChange={e=>setExpForm(f=>({...f,location:e.target.value}))}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Date debut *</Label><Input type="date" value={expForm.date_start} onChange={e=>setExpForm(f=>({...f,date_start:e.target.value}))}/></div>
              <div><Label>Date fin</Label><Input type="date" value={expForm.date_end} onChange={e=>setExpForm(f=>({...f,date_end:e.target.value}))}/></div>
            </div>
            <div><Label>Notes / Objectifs</Label>
              <Textarea rows={3} placeholder="Objectifs de la mission, materiel prevu..." value={expForm.notes} onChange={e=>setExpForm(f=>({...f,notes:e.target.value}))}/>
            </div>
            <Button onClick={createExpedition} disabled={loading} className="w-full">
              {loading?"Creation...":"Creer l'expedition"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
