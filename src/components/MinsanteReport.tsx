import { useState } from "react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, BarChart3, Badge } from "lucide-react";
import { getClinicSettings } from "@/lib/clinicSettings";
import { toast } from "sonner";

const MONTHS = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"];

export function MinsanteReport() {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const clinic = getClinicSettings();
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const consults = await db.consultations.filter(c => (c.createdAt||c.date||"") >= start && (c.createdAt||c.date||"") <= end).toArray();
      const patients = await db.patients.toArray();
      const newPats = patients.filter(p => (p.createdAt||"") >= start && (p.createdAt||"") <= end);
      const payments = await db.payments.filter(p => (p.createdAt||"") >= start && (p.createdAt||"") <= end).toArray();
      const revenue = payments.reduce((s,p) => s + (p.amountPaid||0), 0);
      const bySpec: Record<string,number> = {};
      const diagCount: Record<string,number> = {};
      consults.forEach(c => {
        const s = c.consultType || "general";
        bySpec[s] = (bySpec[s]||0) + 1;
        if (c.diagnosis) { const d = c.diagnosis.trim().slice(0,50); diagCount[d] = (diagCount[d]||0)+1; }
      });
      const topDiag = Object.entries(diagCount).sort((a,b)=>b[1]-a[1]).slice(0,10);
      const drugTx = await db.drugTransactions.filter(t => (t.createdAt||"") >= start && (t.createdAt||"") <= end && t.type==="out").toArray();
      setData({ period: MONTHS[month]+" "+year, clinic: clinic?.name||"Clinique", totalConsults: consults.length, newPatients: newPats.length, returning: Math.max(0,consults.length-newPats.length), bySpec, topDiag, drugs: drugTx.length, revenue });
      toast.success("Rapport genere!");
    } catch(e) { toast.error("Erreur: "+String(e)); }
    setLoading(false);
  }

  async function downloadPDF() {
    if (!data) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({unit:"mm",format:"a4"});
    const W=210, mg=15; let y=15;
    const T:[number,number,number]=[13,148,136];
    const D:[number,number,number]=[15,23,42];
    doc.setFillColor(...T); doc.rect(0,0,W,30,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont("helvetica","bold");
    doc.text("RAPPORT MENSUEL DE SANTE",W/2,12,{align:"center"});
    doc.setFontSize(10); doc.setFont("helvetica","normal");
    doc.text("MINSANTE - Ministere de la Sante Publique du Cameroun",W/2,19,{align:"center"});
    doc.text(data.clinic+" - "+data.period,W/2,26,{align:"center"});
    y=38;
    const sec=(t:string)=>{doc.setFillColor(...T);doc.rect(mg,y,W-mg*2,7,"F");doc.setTextColor(255,255,255);doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text(t.toUpperCase(),mg+2,y+5);y+=9;};
    const row=(l:string,v:string,shade=false)=>{if(shade){doc.setFillColor(240,253,250);doc.rect(mg,y,W-mg*2,7,"F");}doc.setTextColor(...D);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text(l,mg+2,y+5);doc.setFont("helvetica","bold");doc.text(v,W-mg-2,y+5,{align:"right"});y+=7;};
    sec("1. Activites Curatives");
    row("Total consultations",String(data.totalConsults),true);
    row("Nouveaux patients",String(data.newPatients));
    row("Patients en suivi",String(data.returning),true);
    y+=3;
    sec("2. Par Specialite");
    Object.entries(data.bySpec).forEach(([s,c]:any,i)=>row(s==="dental"?"Dentaire":s==="general"?"Medecine generale":s,String(c),i%2===0));
    y+=3;
    sec("3. Principaux Diagnostics");
    data.topDiag.forEach(([d,c]:any,i:number)=>row(d,String(c),i%2===0));
    y+=3;
    sec("4. Pharmacie");
    row("Medicaments dispensees",String(data.drugs),true);
    y+=3;
    sec("5. Finances FCFA");
    row("Total recettes",data.revenue.toLocaleString()+" FCFA",true);
    y+=10;
    doc.setDrawColor(100,116,139);
    doc.line(mg,y,mg+60,y);doc.line(W-mg-60,y,W-mg,y);
    doc.setTextColor(100,116,139);doc.setFontSize(8);
    doc.text("Signature Responsable",mg+30,y+5,{align:"center"});
    doc.text("Cachet Formation Sanitaire",W-mg-30,y+5,{align:"center"});
    doc.setFillColor(...T);doc.rect(0,285,W,12,"F");
    doc.setTextColor(255,255,255);doc.setFontSize(7);
    doc.text("Genere par DivineLink - "+data.clinic+" - "+data.period,W/2,292,{align:"center"});
    doc.save("rapport_minsante_"+data.period.replace(" ","_")+".pdf");
    toast.success("PDF telecharge!");
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-6 h-6 text-primary"/>
        <h2 className="text-xl font-bold">Rapport MINSANTE</h2>
      </div>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Periode du rapport</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <Select value={String(month)} onValueChange={v=>setMonth(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
              <SelectContent>{MONTHS.map((m,i)=><SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v=>setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue/></SelectTrigger>
              <SelectContent>{[2024,2025,2026,2027].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={generate} disabled={loading} className="gap-2">
              <BarChart3 className="w-4 h-4"/>{loading?"Generation...":"Generer"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {data && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Rapport - {data.period}</CardTitle>
              <Button onClick={downloadPDF} size="sm" className="gap-2">
                <Download className="w-4 h-4"/>PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                {l:"Consultations",v:data.totalConsults,c:"text-teal-600"},
                {l:"Nouveaux patients",v:data.newPatients,c:"text-blue-600"},
                {l:"En suivi",v:data.returning,c:"text-purple-600"},
                {l:"Medicaments",v:data.drugs,c:"text-green-600"},
                {l:"Recettes FCFA",v:data.revenue.toLocaleString(),c:"text-emerald-600"},
              ].map((s,i)=>(
                <div key={i} className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{s.l}</p>
                  <p className={"text-2xl font-bold "+s.c}>{s.v}</p>
                </div>
              ))}
            </div>
            {data.topDiag.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Principaux diagnostics</p>
                {data.topDiag.map(([d,c]:any,i:number)=>(
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-muted">
                    <span className="text-muted-foreground truncate flex-1 mr-2">{d}</span>
                    <span className="font-medium">{c}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">Rapport conforme MINSANTE - DivineLink</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
