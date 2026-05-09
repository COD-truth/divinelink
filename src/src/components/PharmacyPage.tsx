import React, { useEffect, useState, useMemo } from "react";
import { db, type Drug, type DrugTransaction, type DrugCategory, type DrugUnit } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pill, Plus, ArrowDownCircle, ArrowUpCircle, AlertTriangle, Search, BarChart3, History, Trash2, Edit, TrendingUp, Package } from "lucide-react";
import { saveFile, toCsv, withDateStamp } from "@/lib/download";

const CATEGORIES: DrugCategory[] = ["Antibiotique","Antalgique","Antipaludéen","Antiparasitaire","Antihypertenseur","Antidiabétique","Vitamines","Anti-inflammatoire","Antiseptique","Anesthésique","Autre"];
const UNITS: DrugUnit[] = ["comprimés","flacons","ampoules","sachets","gélules","ml","mg","autre"];

function drugStatus(drug: Drug): { label: string; color: string } {
  const daysToExpiry = Math.ceil((new Date(drug.expiryDate).getTime() - Date.now()) / 86400000);
  if (drug.stock === 0) return { label: "Épuisé 🔴", color: "bg-red-100 text-red-700 border-red-300" };
  if (daysToExpiry <= 30) return { label: "Expire bientôt ⚠️", color: "bg-orange-100 text-orange-700 border-orange-300" };
  if (drug.stock <= drug.minStock) return { label: "Stock faible 🟡", color: "bg-yellow-100 text-yellow-700 border-yellow-300" };
  return { label: "En stock 🟢", color: "bg-green-100 text-green-700 border-green-300" };
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const emptyDrug = (): Partial<Drug> => ({ name:"", category:"Antibiotique", stock:0, unit:"comprimés", purchasePrice:0, sellingPrice:0, expiryDate:"", minStock:5, supplier:"", notes:"" });

export function PharmacyPage() {
  const { user } = useAuth();
  const clinicId = localStorage.getItem("divinelink.clinicId") || "";
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [transactions, setTransactions] = useState<DrugTransaction[]>([]);
  const [patients, setPatients] = useState<{id:number;name:string}[]>([]);
  const [search, setSearch] = useState("");
  const [txSearch, setTxSearch] = useState("");
  const [tab, setTab] = useState("inventory");
  const [addDrugOpen, setAddDrugOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [dispenseOpen, setDispenseOpen] = useState(false);
  const [editDrug, setEditDrug] = useState<Drug | null>(null);
  const [deleteDrug, setDeleteDrug] = useState<Drug | null>(null);
  const [drugForm, setDrugForm] = useState<Partial<Drug>>(emptyDrug());
  const [receiveForm, setReceiveForm] = useState({ drugId:"", qty:0, purchasePrice:0, expiryDate:"", supplier:"" });
  const [dispenseForm, setDispenseForm] = useState({ drugId:"", qty:0, patientId:"", amountCharged:0, paid:false, paymentMode:"espèces", notes:"" });

  const load = async () => {
    setDrugs((await db.drugs.toArray()).sort((a,b)=>a.name.localeCompare(b.name)));
    setTransactions(await db.drugTransactions.reverse().toArray());
    setPatients((await db.patients.toArray()).map(p=>({id:p.id!,name:`${p.firstName} ${p.lastName}`})));
  };

  useEffect(()=>{load();},[]);

  const filtered = useMemo(()=>drugs.filter(d=>d.name.toLowerCase().includes(search.toLowerCase())||d.category.toLowerCase().includes(search.toLowerCase())),[drugs,search]);
  const filteredTx = useMemo(()=>transactions.filter(tx=>tx.drugName.toLowerCase().includes(txSearch.toLowerCase())||(tx.patientName||"").toLowerCase().includes(txSearch.toLowerCase())),[transactions,txSearch]);
  const alerts = drugs.filter(d=>drugStatus(d).label!=="En stock 🟢");
  const totalStockValue = drugs.reduce((s,d)=>s+d.stock*d.purchasePrice,0);
  const today = new Date().toISOString().split("T")[0];
  const todayRevenue = transactions.filter(tx=>tx.type==="out"&&tx.createdAt.startsWith(today)&&tx.amountCharged).reduce((s,tx)=>s+(tx.amountCharged||0),0);
  const topDrugs = useMemo(()=>{
    const c:Record<string,number>={};
    transactions.filter(tx=>tx.type==="out").forEach(tx=>{c[tx.drugName]=(c[tx.drugName]||0)+tx.quantity;});
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,5);
  },[transactions]);

  const saveDrug = async () => {
    if(!drugForm.name||!drugForm.expiryDate) return;
    const now = new Date().toISOString();
    if(editDrug?.id) {
      await db.drugs.update(editDrug.id,{...drugForm,updatedAt:now});
      toast.success("Médicament mis à jour");
    } else {
      await db.drugs.add({...drugForm,clinicId,createdAt:now,updatedAt:now} as Drug);
      toast.success("Médicament ajouté");
    }
    setAddDrugOpen(false); setEditDrug(null); setDrugForm(emptyDrug()); load();
  };

  const receiveStock = async () => {
    const drug = drugs.find(d=>d.id===Number(receiveForm.drugId));
    if(!drug||!receiveForm.qty) return;
    const now = new Date().toISOString();
    const newStock = drug.stock+receiveForm.qty;
    await db.drugs.update(drug.id!,{stock:newStock,purchasePrice:receiveForm.purchasePrice||drug.purchasePrice,expiryDate:receiveForm.expiryDate||drug.expiryDate,updatedAt:now});
    await db.drugTransactions.add({drugId:drug.id!,drugName:drug.name,type:"in",quantity:receiveForm.qty,stockAfter:newStock,notes:receiveForm.supplier?`Fournisseur: ${receiveForm.supplier}`:undefined,clinicId,createdAt:now});
    toast.success(`✅ ${receiveForm.qty} ${drug.unit} reçus — stock: ${newStock}`);
    setReceiveOpen(false); setReceiveForm({drugId:"",qty:0,purchasePrice:0,expiryDate:"",supplier:""}); load();
  };

  const dispenseDrug = async () => {
    const drug = drugs.find(d=>d.id===Number(dispenseForm.drugId));
    if(!drug||!dispenseForm.qty) return;
    if(dispenseForm.qty>drug.stock){toast.error(`Stock insuffisant (${drug.stock} disponibles)`);return;}
    const now = new Date().toISOString();
    const newStock = drug.stock-dispenseForm.qty;
    await db.drugs.update(drug.id!,{stock:newStock,updatedAt:now});
    const patient = patients.find(p=>p.id===Number(dispenseForm.patientId));
    await db.drugTransactions.add({drugId:drug.id!,drugName:drug.name,type:"out",quantity:dispenseForm.qty,stockAfter:newStock,patientId:patient?.id,patientName:patient?.name,amountCharged:dispenseForm.amountCharged||drug.sellingPrice*dispenseForm.qty,paid:dispenseForm.paid,paymentMode:dispenseForm.paymentMode,notes:dispenseForm.notes||undefined,clinicId,createdAt:now});
    toast.success(`✅ ${dispenseForm.qty} ${drug.unit} dispensés — stock restant: ${newStock}`);
    if(newStock<=drug.minStock) toast.warning(`⚠️ ${drug.name}: stock faible!`);
    setDispenseOpen(false); setDispenseForm({drugId:"",qty:0,patientId:"",amountCharged:0,paid:false,paymentMode:"espèces",notes:""}); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2"><Pill className="w-6 h-6 text-primary"/><h1 className="text-2xl font-bold">Pharmacie</h1></div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={()=>setReceiveOpen(true)}><ArrowDownCircle className="w-4 h-4 mr-1"/>Entrée stock</Button>
          <Button size="sm" variant="outline" onClick={()=>setDispenseOpen(true)}><ArrowUpCircle className="w-4 h-4 mr-1"/>Dispenser</Button>
          <Button size="sm" onClick={()=>{setEditDrug(null);setDrugForm(emptyDrug());setAddDrugOpen(true);}}><Plus className="w-4 h-4 mr-1"/>Nouveau médicament</Button>
        </div>
      </div>

      {alerts.length>0&&(
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-orange-600"/><span className="font-semibold text-orange-700">{alerts.length} alerte(s)</span></div>
            {alerts.map(d=>{const st=drugStatus(d);return(<div key={d.id} className="text-sm flex justify-between py-1"><span>{d.name}</span><Badge variant="outline" className={st.color}>{st.label} — {d.stock} {d.unit}</Badge></div>);})}
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="inventory" className="flex-1"><Package className="w-4 h-4 mr-1"/>Stock</TabsTrigger>
          <TabsTrigger value="transactions" className="flex-1"><History className="w-4 h-4 mr-1"/>Transactions</TabsTrigger>
          <TabsTrigger value="stats" className="flex-1"><BarChart3 className="w-4 h-4 mr-1"/>Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input className="pl-9" placeholder="Rechercher médicament..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div className="space-y-2">
            {filtered.length===0&&<div className="text-center py-10 text-muted-foreground"><Pill className="w-10 h-10 mx-auto mb-2 opacity-30"/><p>Aucun médicament. Cliquez sur "Nouveau médicament".</p></div>}
            {filtered.map(drug=>{const st=drugStatus(drug);return(
              <Card key={drug.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base">{drug.name}</span>
                        <Badge variant="secondary" className="text-xs">{drug.category}</Badge>
                        <Badge variant="outline" className={`text-xs ${st.color}`}>{st.label}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-3">
                        <span className="font-bold text-foreground text-lg">{drug.stock} <span className="text-sm font-normal">{drug.unit}</span></span>
                        <span>Achat: {drug.purchasePrice.toLocaleString()} FCFA</span>
                        <span>Vente: {drug.sellingPrice.toLocaleString()} FCFA</span>
                        <span>Expire: {fmtDate(drug.expiryDate)}</span>
                        {drug.supplier&&<span>Fourn: {drug.supplier}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={()=>{setEditDrug(drug);setDrugForm({...drug});setAddDrugOpen(true);}}><Edit className="w-4 h-4"/></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={()=>setDeleteDrug(drug)}><Trash2 className="w-4 h-4"/></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );})}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input className="pl-9" placeholder="Rechercher..." value={txSearch} onChange={e=>setTxSearch(e.target.value)}/></div>
            <Button variant="outline" size="sm" onClick={()=>{const rows=filteredTx.map(tx=>({Date:fmtDateTime(tx.createdAt),Médicament:tx.drugName,Type:tx.type==="in"?"Entrée":"Sortie",Quantité:tx.quantity,Patient:tx.patientName||"—","Montant FCFA":tx.amountCharged||"—","Stock après":tx.stockAfter}));saveFile(toCsv(rows),withDateStamp("pharmacie")+".csv","text/csv");}}>Export CSV</Button>
          </div>
          <div className="space-y-2">
            {filteredTx.length===0&&<div className="text-center py-8 text-muted-foreground">Aucune transaction</div>}
            {filteredTx.slice(0,50).map(tx=>(
              <Card key={tx.id} className="border-l-4" style={{borderLeftColor:tx.type==="in"?"#22c55e":"#3b82f6"}}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        {tx.type==="in"?<ArrowDownCircle className="w-4 h-4 text-green-600"/>:<ArrowUpCircle className="w-4 h-4 text-blue-600"/>}
                        <span className="font-semibold">{tx.drugName}</span>
                        <Badge variant="outline" className={tx.type==="in"?"text-green-700":"text-blue-700"}>{tx.type==="in"?"Entrée":"Sortie"}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        <span className="font-bold text-foreground">{tx.quantity}</span> unité(s)
                        {tx.patientName&&<span> · {tx.patientName}</span>}
                        {tx.amountCharged&&<span> · {tx.amountCharged.toLocaleString()} FCFA</span>}
                        {tx.notes&&<span> · {tx.notes}</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground"><div>{fmtDateTime(tx.createdAt)}</div><div>Stock: {tx.stockAfter}</div></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card><CardContent className="pt-4 pb-4 text-center"><div className="text-3xl font-bold text-primary">{totalStockValue.toLocaleString()}</div><div className="text-sm text-muted-foreground">FCFA valeur stock</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center"><div className="text-3xl font-bold text-green-600">{todayRevenue.toLocaleString()}</div><div className="text-sm text-muted-foreground">FCFA aujourd'hui</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center"><div className="text-3xl font-bold">{drugs.length}</div><div className="text-sm text-muted-foreground">Médicaments</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 text-center"><div className="text-3xl font-bold text-orange-600">{alerts.length}</div><div className="text-sm text-muted-foreground">Alertes actives</div></CardContent></Card>
          </div>
          {topDrugs.length>0&&<Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4"/>Top dispensés</CardTitle></CardHeader><CardContent><div className="space-y-2">{topDrugs.map(([name,count])=><div key={name} className="flex justify-between"><span className="text-sm">{name}</span><Badge>{count} unités</Badge></div>)}</div></CardContent></Card>}
        </TabsContent>
      </Tabs>

      {/* ADD/EDIT DRUG */}
      <Dialog open={addDrugOpen} onOpenChange={o=>{setAddDrugOpen(o);if(!o)setEditDrug(null);}}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editDrug?"Modifier":"Nouveau médicament"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom *</Label><Input value={drugForm.name||""} onChange={e=>setDrugForm(f=>({...f,name:e.target.value}))} placeholder="ex: Amoxicilline 500mg"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Catégorie</Label><Select value={drugForm.category} onValueChange={v=>setDrugForm(f=>({...f,category:v as DrugCategory}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Unité</Label><Select value={drugForm.unit} onValueChange={v=>setDrugForm(f=>({...f,unit:v as DrugUnit}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{UNITS.map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Quantité</Label><Input type="number" min={0} value={drugForm.stock||0} onChange={e=>setDrugForm(f=>({...f,stock:+e.target.value}))}/></div>
              <div><Label>Stock min. alerte</Label><Input type="number" min={0} value={drugForm.minStock||5} onChange={e=>setDrugForm(f=>({...f,minStock:+e.target.value}))}/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Prix achat (FCFA)</Label><Input type="number" min={0} value={drugForm.purchasePrice||0} onChange={e=>setDrugForm(f=>({...f,purchasePrice:+e.target.value}))}/></div>
              <div><Label>Prix vente (FCFA)</Label><Input type="number" min={0} value={drugForm.sellingPrice||0} onChange={e=>setDrugForm(f=>({...f,sellingPrice:+e.target.value}))}/></div>
            </div>
            <div><Label>Date expiration *</Label><Input type="date" value={drugForm.expiryDate||""} onChange={e=>setDrugForm(f=>({...f,expiryDate:e.target.value}))}/></div>
            <div><Label>Fournisseur</Label><Input value={drugForm.supplier||""} onChange={e=>setDrugForm(f=>({...f,supplier:e.target.value}))}/></div>
            <div><Label>Notes</Label><Textarea value={drugForm.notes||""} onChange={e=>setDrugForm(f=>({...f,notes:e.target.value}))} rows={2}/></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setAddDrugOpen(false)}>Annuler</Button><Button onClick={saveDrug}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECEIVE */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle><ArrowDownCircle className="inline w-4 h-4 mr-1 text-green-600"/>Entrée de stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Médicament *</Label><Select value={receiveForm.drugId} onValueChange={v=>setReceiveForm(f=>({...f,drugId:v}))}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{drugs.map(d=><SelectItem key={d.id} value={String(d.id)}>{d.name} (stock: {d.stock})</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Quantité reçue *</Label><Input type="number" min={1} value={receiveForm.qty||""} onChange={e=>setReceiveForm(f=>({...f,qty:+e.target.value}))}/></div>
            <div><Label>Prix achat (FCFA)</Label><Input type="number" min={0} value={receiveForm.purchasePrice||""} onChange={e=>setReceiveForm(f=>({...f,purchasePrice:+e.target.value}))}/></div>
            <div><Label>Date expiration</Label><Input type="date" value={receiveForm.expiryDate} onChange={e=>setReceiveForm(f=>({...f,expiryDate:e.target.value}))}/></div>
            <div><Label>Fournisseur</Label><Input value={receiveForm.supplier} onChange={e=>setReceiveForm(f=>({...f,supplier:e.target.value}))}/></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setReceiveOpen(false)}>Annuler</Button><Button onClick={receiveStock} className="bg-green-600 hover:bg-green-700">Confirmer entrée</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DISPENSE */}
      <Dialog open={dispenseOpen} onOpenChange={setDispenseOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle><ArrowUpCircle className="inline w-4 h-4 mr-1 text-blue-600"/>Dispenser médicament</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Médicament *</Label><Select value={dispenseForm.drugId} onValueChange={v=>{const drug=drugs.find(d=>d.id===Number(v));setDispenseForm(f=>({...f,drugId:v,amountCharged:drug?drug.sellingPrice:0}));}}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{drugs.filter(d=>d.stock>0).map(d=><SelectItem key={d.id} value={String(d.id)}>{d.name} (stock: {d.stock} {d.unit})</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Quantité *</Label><Input type="number" min={1} value={dispenseForm.qty||""} onChange={e=>setDispenseForm(f=>({...f,qty:+e.target.value}))}/></div>
            <div><Label>Patient (optionnel)</Label><Select value={dispenseForm.patientId} onValueChange={v=>setDispenseForm(f=>({...f,patientId:v}))}><SelectTrigger><SelectValue placeholder="Aucun"/></SelectTrigger><SelectContent><SelectItem value="">Aucun</SelectItem>{patients.map(p=><SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Montant facturé (FCFA)</Label><Input type="number" min={0} value={dispenseForm.amountCharged||""} onChange={e=>setDispenseForm(f=>({...f,amountCharged:+e.target.value}))}/></div>
            <div className="flex items-center gap-2"><input type="checkbox" id="paid" checked={dispenseForm.paid} onChange={e=>setDispenseForm(f=>({...f,paid:e.target.checked}))} className="w-4 h-4"/><Label htmlFor="paid">Payé</Label></div>
            {dispenseForm.paid&&<div><Label>Mode</Label><Select value={dispenseForm.paymentMode} onValueChange={v=>setDispenseForm(f=>({...f,paymentMode:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="espèces">Espèces</SelectItem><SelectItem value="mtn">MTN MoMo</SelectItem><SelectItem value="orange">Orange Money</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div>}
            <div><Label>Notes</Label><Input value={dispenseForm.notes} onChange={e=>setDispenseForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setDispenseOpen(false)}>Annuler</Button><Button onClick={dispenseDrug} className="bg-blue-600 hover:bg-blue-700">Confirmer sortie</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE */}
      <Dialog open={!!deleteDrug} onOpenChange={()=>setDeleteDrug(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer {deleteDrug?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteDrug(null)}>Annuler</Button><Button variant="destructive" onClick={async()=>{if(deleteDrug?.id){await db.drugs.delete(deleteDrug.id);toast.success("Supprimé");setDeleteDrug(null);load();}}}>Supprimer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
