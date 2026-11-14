import { useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicSettings } from "@/lib/clinicSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Page } from "@/components/AppLayout";
type Tab = "odo"|"plan"|"sea"|"rx"|"labo"|"rdv"|"settings";
const tabs: {key:Tab; label:string}[] = [
  {key:"odo",label:"Odontogramme"},
  {key:"plan",label:"Plan & devis"},
  {key:"sea",label:"Séances"},
  {key:"rx",label:"Ordonnances"},
  {key:"labo",label:"Prothèse"},
  {key:"rdv",label:"Rendez-vous"},
];
const empty: Record<"sea"|"rx"|"labo"|"rdv", {title:string;description:string}> = {
  sea: {title:"Journal des séances",description:"Les consultations réalisées et les soins effectués seront enregistrés ici par patient."},
  rx: {title:"Ordonnances",description:"Une ordonnance doit être enregistrée dans le dossier du patient et validée par le praticien."},
  labo: {title:"Travaux de prothèse",description:"Le suivi des commandes, empreintes, laboratoires et livraisons sera relié au patient."},
  rdv: {title:"Rendez-vous dentaires",description:"Les rendez-vous seront liés aux étapes du plan de traitement."},
};
export function DentalWorkspace({page,onNavigate,renderPage}:{page:Page;onNavigate:(p:Page)=>void;renderPage:(p:Page)=>ReactNode}) {
  const {user,logout}=useAuth();
  const [tab,setTab]=useState<Tab>("odo");
  const [settingsPage,setSettingsPage]=useState<Page>("clinic");
  const clinic=getClinicSettings();
  const admin=user?.role==="admin";
  const canPractice=admin||user?.role==="doctor";
  const canQuote=canPractice||user?.role==="receptionist";
  const allowedPages:Page[]=["clinic","users","staff","security","audit","backup","sync"];
  const showSettings=tab==="settings" && admin;
  const settingsAllowed=allowedPages.includes(settingsPage);
  return <div className="min-h-screen bg-[#f4f6f5] text-[#141a19]">
    <header className="sticky top-0 z-30 border-b border-[#d5dddb] bg-white">
      <div className="mx-auto max-w-5xl px-4 py-3 flex justify-between items-center gap-3">
        <div><p className="text-[11px] tracking-widest font-semibold text-[#0d6b5f]">DIVINELINK · UNITÉ DENTAIRE</p>
          <h1 className="text-lg font-semibold">{clinic?.name || "Cabinet dentaire"}</h1>
          <p className="text-xs text-[#596562]">{user?.name} · {user?.role}</p></div>
        <div className="flex gap-2">
          {admin&&<Button size="sm" variant="outline" onClick={()=>setTab(v=>v==="settings"?"odo":"settings")}>Paramètres</Button>}
          <Button size="sm" variant="outline" onClick={logout}>Sortir</Button>
        </div>
      </div>
      <nav aria-label="Onglets du cabinet dentaire" className="mx-auto max-w-5xl px-3 pb-2 flex gap-1 overflow-x-auto">
        {tabs.map(t=><button type="button" key={t.key} aria-current={tab===t.key?"page":undefined} className={"shrink-0 rounded-md px-3 py-2 text-sm "+(tab===t.key?"bg-[#0d6b5f] text-white":"text-[#596562] hover:bg-[#eaefed]")} onClick={()=>setTab(t.key)}>{t.label}</button>)}
      </nav>
    </header>
    <main className="mx-auto max-w-5xl p-3 md:p-5">
      {showSettings ? <div className="space-y-3"><div className="flex flex-wrap gap-2">{allowedPages.map(p=><Button key={p} size="sm" variant={settingsPage===p?"default":"outline"} onClick={()=>setSettingsPage(p)}>{({clinic:"Cabinet",users:"Utilisateurs",staff:"Personnel",security:"Sécurité",audit:"Journal",backup:"Sauvegarde",sync:"Synchronisation"} as Record<string,string>)[p]}</Button>)}</div>{settingsAllowed&&renderPage(settingsPage)}</div>
      : tab==="odo" ? canPractice ? renderPage("dentalExam") : <Card><CardContent className="p-5">Réservé au praticien.</CardContent></Card>
      : tab==="plan" ? canQuote ? renderPage("dentalQuote") : <Card><CardContent className="p-5">Accès non autorisé.</CardContent></Card>
      : <Card className="border-[#d5dddb] bg-white"><CardContent className="p-5 space-y-2"><h2 className="text-lg font-semibold">{empty[tab as keyof typeof empty].title}</h2><p className="text-sm text-muted-foreground">{empty[tab as keyof typeof empty].description}</p><p className="text-xs text-muted-foreground">Workflow en préparation. Aucun dossier n'est modifié depuis cet écran.</p></CardContent></Card>}
    </main>
  </div>;
}
