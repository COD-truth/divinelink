import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getClinicSettings } from "@/lib/clinicSettings";
import { Button } from "@/components/ui/button";
import type { Page } from "@/components/AppLayout";
type DentalTab = { page: Page; label: string };
const clinicalTabs: DentalTab[] = [
  {page:"dentalExam",label:"Odontogramme"},
  {page:"dentalQuote",label:"Plan & devis"},
  {page:"consultations",label:"Séances"},
  {page:"documents",label:"Ordonnances & documents"},
  {page:"appointments",label:"Rendez-vous"},
  {page:"patients",label:"Patients"},
  {page:"payments",label:"Caisse"},
];
const settingsTabs: DentalTab[] = [
  {page:"clinic",label:"Paramètres du cabinet"},
  {page:"users",label:"Personnel & accès"},
  {page:"backup",label:"Sauvegarde"},
  {page:"sync",label:"Synchronisation"},
];
export function DentalWorkspace({page,onNavigate,children}:{page:Page;onNavigate:(p:Page)=>void;children:ReactNode}) {
  const {user,logout}=useAuth();
  const clinic=getClinicSettings();
  const tabs = user?.role === "admin" ? [...clinicalTabs,...settingsTabs] : clinicalTabs.filter(x=>x.page!=="payments" || user?.role==="receptionist");
  const active = tabs.some(t=>t.page===page) ? page : "dentalExam";
  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-3 py-3 flex items-center justify-between gap-3">
        <div><p className="text-xs uppercase tracking-widest text-muted-foreground">DIVINELINK · Unité dentaire</p>
          <h1 className="font-semibold text-lg">{clinic?.name || "Cabinet dentaire"}</h1>
          <p className="text-xs text-muted-foreground">{user?.name} · {user?.role}</p></div>
        <Button variant="outline" size="sm" onClick={logout}>Déconnexion</Button>
      </div>
      <nav aria-label="Espace dentaire" className="mx-auto max-w-6xl flex gap-1 overflow-x-auto px-3 pb-2">
        {tabs.map(t=><Button key={t.page} size="sm" variant={active===t.page?"default":"ghost"} className="shrink-0" onClick={()=>onNavigate(t.page)}>{t.label}</Button>)}
      </nav>
    </header>
    <main className="mx-auto max-w-6xl py-4 px-2">{children}</main>
  </div>;
}
