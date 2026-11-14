import { useEffect, useMemo, useState } from "react";
import { db, type Patient } from "@/lib/db";
import { decryptPatients } from "@/lib/patientCrypto";
import { getClinicId } from "@/lib/clinicSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DENTAL_SERVICES, calculateDentalQuote, type DentalQuoteLine } from "@/lib/dentalQuote";
type Tariffs = Record<string, number>;
const format = (n:number) => n.toLocaleString("fr-FR") + " FCFA";
const clamp = (n:number) => Math.min(100,Math.max(0,Number.isFinite(n)?n:0));
export function DentalQuotePage() {
  const { user } = useAuth();
  const clinicId = getClinicId();
  const tariffKey = "dl.dental.tariffs.v1." + clinicId;
  const [patients,setPatients] = useState<Patient[]>([]);
  const [patientId,setPatientId] = useState("");
  const [booklet,setBooklet] = useState("");
  const [allergies,setAllergies] = useState(false);
  const [history,setHistory] = useState(false);
  const [medications,setMedications] = useState(false);
  const [lines,setLines] = useState<DentalQuoteLine[]>([]);
  const [discount,setDiscount] = useState(0);
  const [insurance,setInsurance] = useState(0);
  const [insurer,setInsurer] = useState("");
  const [prescriptionNotes,setPrescriptionNotes] = useState("");
  const [tariffs,setTariffs] = useState<Tariffs>(()=>{try { return JSON.parse(localStorage.getItem(tariffKey) || "{}") as Tariffs } catch {return {}}});
  const [editTariffs,setEditTariffs] = useState(false);
  useEffect(()=>{let active=true; db.patients.toArray().then(rows=>decryptPatients(rows.filter(p=>!p.deleted && p.clinicId===clinicId))).then(rows=>{if(active)setPatients(rows)}).catch(console.warn);return()=>{active=false}},[clinicId]);
  useEffect(()=>{try {setTariffs(JSON.parse(localStorage.getItem(tariffKey)||"{}"))}catch{setTariffs({})}},[tariffKey]);
  const selected = patients.find(p=>String(p.id)===patientId);
  const totals = useMemo(()=>calculateDentalQuote(lines,discount,insurance),[lines,discount,insurance]);
  const update=(id:string,patch:Partial<DentalQuoteLine>)=>setLines(xs=>xs.map(x=>x.id===id?{...x,...patch}:x));
  const addLine=(label:string)=>setLines(xs=>[...xs,{id:crypto.randomUUID(),label,tooth:"",quantity:1,unitPrice:tariffs[label]||0}]);
  const saveTariffs=()=>{localStorage.setItem(tariffKey,JSON.stringify(tariffs));setEditTariffs(false)};
  return <div className="max-w-5xl mx-auto p-3 space-y-4">
    <div className="flex justify-between gap-3 items-center"><div><h1 className="text-2xl font-bold">Unité dentaire · Examen & devis</h1><p className="text-sm text-muted-foreground">Plan de traitement et proforma en FCFA · sans facturation automatique</p></div><Button disabled={!selected||!lines.length} onClick={()=>window.print()}>Imprimer</Button></div>
    <Card><CardHeader><CardTitle>1 · Patient & carnet médical</CardTitle></CardHeader><CardContent className="space-y-3">
      <select className="w-full p-3 border rounded-md bg-background" aria-label="Choisir le patient" value={patientId} onChange={e=>{setPatientId(e.target.value);setBooklet("");setLines([]);setPrescriptionNotes("");setDiscount(0);setInsurance(0)}}>
        <option value="">Choisir un patient de cette clinique</option>{patients.map(p=><option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.patientId}</option>)}
      </select>
      <div className="flex flex-wrap gap-4 text-sm">
        <label><input type="checkbox" checked={allergies} onChange={e=>setAllergies(e.target.checked)}/> Allergies vérifiées</label>
        <label><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/> Antécédents vérifiés</label>
        <label><input type="checkbox" checked={medications} onChange={e=>setMedications(e.target.checked)}/> Traitements actuels vérifiés</label>
      </div>
      <Textarea aria-label="Observation clinique" placeholder="Motif, carnet médical, dents concernées, diagnostic et soins à envisager..." value={booklet} onChange={e=>setBooklet(e.target.value)}/>
      <p className="text-xs text-muted-foreground">Ces notes sont un brouillon non enregistré. Pour conserver l'examen, utiliser Examen dentaire dans le dossier du patient.</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>2 · Plan de traitement & tarif du cabinet</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="flex gap-2 flex-wrap">{DENTAL_SERVICES.map(s=><Button size="sm" variant="outline" key={s} onClick={()=>addLine(s)}>+ {s}</Button>)}</div>
      {lines.map(l=><div key={l.id} className="grid grid-cols-12 gap-2 items-center">
        <Input aria-label="Acte" className="col-span-12 sm:col-span-4" value={l.label} onChange={e=>update(l.id,{label:e.target.value})}/>
        <Input aria-label="Dent" className="col-span-3 sm:col-span-2" placeholder="Dent" value={l.tooth} onChange={e=>update(l.id,{tooth:e.target.value})}/>
        <Input aria-label="Quantité" type="number" min={1} className="col-span-3 sm:col-span-2" value={l.quantity} onChange={e=>update(l.id,{quantity:Math.max(1,Number(e.target.value)||1)})}/>
        <Input aria-label="Prix FCFA" type="number" min={0} className="col-span-4 sm:col-span-3" value={l.unitPrice} onChange={e=>update(l.id,{unitPrice:Math.max(0,Number(e.target.value)||0)})}/>
        <Button className="col-span-2 sm:col-span-1" variant="ghost" aria-label="Retirer" onClick={()=>setLines(xs=>xs.filter(x=>x.id!==l.id))}>×</Button>
      </div>)}
      {user?.role==="admin"&&<><Button size="sm" variant="secondary" onClick={()=>setEditTariffs(v=>!v)}>{editTariffs?"Fermer tarifs":"Configurer les tarifs"}</Button>
        {editTariffs&&<div className="grid sm:grid-cols-2 gap-2 border rounded-lg p-3">{DENTAL_SERVICES.map(s=><label className="text-xs" key={s}>{s}<Input type="number" min={0} value={tariffs[s]??0} onChange={e=>setTariffs(t=>({...t,[s]:Math.max(0,Number(e.target.value)||0)}))}/></label>)}<Button onClick={saveTariffs}>Enregistrer les tarifs sur cet appareil</Button></div>}
      </>}
      <p className="text-xs text-muted-foreground">Les tarifs configurés ici restent sur cet appareil; ils ne sont pas encore synchronisés entre postes. Tout prix de ligne peut être ajusté pour ce devis.</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>3 · Devis, réduction & assurance</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">Réduction (%)<Input type="number" min={0} max={100} value={discount} onChange={e=>setDiscount(clamp(Number(e.target.value)))}/></label>
      <label className="text-sm">Assurance (%)<Input type="number" min={0} max={100} value={insurance} onChange={e=>setInsurance(clamp(Number(e.target.value)))}/></label>
      <label className="text-sm">Assureur<Input value={insurer} onChange={e=>setInsurer(e.target.value)}/></label></div>
      <div className="border-t pt-3 space-y-2 text-sm">
        <p className="flex justify-between"><span>Sous-total</span><strong>{format(totals.subtotal)}</strong></p>
        <p className="flex justify-between"><span>Réduction</span><span>- {format(totals.discount)}</span></p>
        <p className="flex justify-between"><span>Assurance estimée</span><span>- {format(totals.insurance)}</span></p>
        <p className="flex justify-between text-lg"><strong>Reste à charge</strong><strong>{format(totals.patientDue)}</strong></p>
      </div>
      <p className="text-xs text-muted-foreground">Proforma indicative. La prise en charge effective dépend des conditions contractuelles et doit être vérifiée avant l'encaissement.</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>4 · Médicaments & ordonnance (brouillon)</CardTitle></CardHeader><CardContent className="space-y-2">
      <Textarea aria-label="Brouillon ordonnance" placeholder="Médicament, dose, voie, fréquence, durée, instructions. À remplir et valider par le praticien." value={prescriptionNotes} onChange={e=>setPrescriptionNotes(e.target.value)}/>
      <p className="text-xs text-muted-foreground">Aucun médicament n'est prescrit automatiquement. Vérifier allergies, interactions, contre-indications et posologies. Brouillon non enregistré.</p>
    </CardContent></Card>
  </div>;
}
