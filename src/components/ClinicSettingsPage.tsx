import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, Upload, Copy, Bell } from "lucide-react";
import { useLang } from "@/contexts/LangContext";
import {
  getClinicSettings, saveClinicSettings, generateClinicId, type ClinicSettings,
} from "@/lib/clinicSettings";
import { NotificationSettings } from "@/components/NotificationSettings";
import { compressImage } from "@/lib/imageUtils";

interface Props { onSaved?: () => void; embedded?: boolean; }

export function ClinicSettingsPage({ onSaved, embedded }: Props) {
  const { lang } = useLang();
  const fr = lang === "fr";
  const [s, setS] = useState<ClinicSettings>(() =>
    getClinicSettings() ?? {
      clinicId: "",
      name: "",
      currency: "FCFA",
      createdAt: new Date().toISOString(),
    }
  );

  useEffect(() => {
    const cur = getClinicSettings();
    if (cur) setS(cur);
  }, []);

  const set = <K extends keyof ClinicSettings>(k: K, v: ClinicSettings[K]) =>
    setS(prev => ({ ...prev, [k]: v }));

  const handleLogo = async (f?: File) => {
    if (!f) return;
    const data = await compressImage(f);
    set("logo", data);
  };

const [clinicCode, setClinicCode] = useState("");
const createWorkspace = async () => {
    if (!s.name.trim()) {
      toast.error(fr ? "Entrez d'abord le nom" : "Enter a name first");
      return;
    }
    try {
      const res = await fetch("https://divinelink.mooo.com/api/clinic/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name.trim() }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("divinelink.apiToken", data.token);
        localStorage.setItem("divinelink.clinicId", String(data.clinic_id));
        toast.success(fr ? `Espace créé ! Code: ${data.code}` : `Workspace created! Code: ${data.code}`);
      } else {
        toast.error(fr ? "Échec de création" : "Creation failed");
      }
    } catch {
      toast.error(fr ? "Serveur injoignable" : "Server unreachable");
    }
  };

  const save = async () => {
    if (!s.name.trim()) {
      toast.error(fr ? "Nom de la clinique requis" : "Clinic name required");
      return;
    }
    // If a clinic code is entered, verify against the server and link this device
    if (clinicCode.trim()) {
      try {
        const res = await fetch("https://divinelink.mooo.com/api/clinic/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: clinicCode.trim() }),
        });
        const data = await res.json();
        if (data.token) {
          localStorage.setItem("divinelink.apiToken", data.token);
          localStorage.setItem("divinelink.clinicId", String(data.clinic_id));
          toast.success(fr ? `Clinique liée: ${data.clinic_name}` : `Linked: ${data.clinic_name}`);
        } else {
          toast.error(fr ? "Code clinique invalide" : "Invalid clinic code");
          return;
        }
      } catch {
        toast.error(fr ? "Serveur injoignable" : "Server unreachable");
        return;
      }
    }
    const next: ClinicSettings = {
      ...s,
      clinicId: s.clinicId || generateClinicId(s.city),
      createdAt: s.createdAt || new Date().toISOString(),
    };
    saveClinicSettings(next);
    setS(next);
    toast.success(fr ? "Paramètres enregistrés ✓" : "Settings saved ✓");
    onSaved?.();
  };

  const copyId = () => {
    if (!s.clinicId) return;
    navigator.clipboard.writeText(s.clinicId);
    toast.success(fr ? "Copié" : "Copied");
  };

  return (
    <div className={embedded ? "" : "max-w-2xl mx-auto"}>
      {!embedded && (
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">{fr ? "Paramètres clinique" : "Clinic settings"}</h1>
        </div>
      )}

      <Card className="p-5 space-y-4">
        {s.clinicId && (
          <div className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Clinic ID</p>
              <p className="font-mono text-sm">{s.clinicId}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={copyId}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        )}
<div>
          <Label>{fr ? "Code de la clinique (pour synchroniser plusieurs appareils)" : "Clinic code (to sync multiple devices)"}</Label>
          <Input value={clinicCode} onChange={e => setClinicCode(e.target.value)} placeholder="DIVINE001" />
        </div>
        <div className="pt-1">
          <Button variant="outline" className="w-full" onClick={createWorkspace}>
            {fr ? "🆕 Créer mon propre espace (gratuit)" : "🆕 Create my own workspace (free)"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">
            {fr ? "Pour les étudiants : créez votre espace et partagez le code avec votre équipe." : "For students: create your workspace and share the code with your team."}
          </p>
        </div>
        <div>
          <Label>{fr ? "Nom de la clinique *" : "Clinic name *"}</Label>
          <Input value={s.name} onChange={e => set("name", e.target.value)} placeholder="DivineLink Clinic" />
        </div>

        <div>
          <Label>{fr ? "Logo" : "Logo"}</Label>
          <div className="flex items-center gap-3">
            {s.logo && <img src={s.logo} alt="logo" className="w-14 h-14 rounded object-cover border" />}
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm hover:bg-accent">
              <Upload className="w-4 h-4" />
              {fr ? "Téléverser" : "Upload"}
              <input type="file" accept="image/*" className="hidden"
                onChange={e => handleLogo(e.target.files?.[0])} />
            </label>
            {s.logo && (
              <Button variant="ghost" size="sm" onClick={() => set("logo", undefined)}>
                {fr ? "Retirer" : "Remove"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{fr ? "Ville" : "City"}</Label>
            <Input value={s.city || ""} onChange={e => set("city", e.target.value)} />
          </div>
          <div>
            <Label>{fr ? "Région" : "Region"}</Label>
            <Input value={s.region || ""} onChange={e => set("region", e.target.value)} />
          </div>
        </div>

        <div>
          <Label>{fr ? "Adresse" : "Address"}</Label>
          <Textarea rows={2} value={s.address || ""} onChange={e => set("address", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{fr ? "Téléphone" : "Phone"}</Label>
            <Input value={s.phone || ""} onChange={e => set("phone", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={s.email || ""} onChange={e => set("email", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{fr ? "Médecin responsable" : "Lead doctor"}</Label>
            <Input value={s.doctorName || ""} onChange={e => set("doctorName", e.target.value)} />
          </div>
          <div>
            <Label>{fr ? "N° licence médicale" : "Medical license #"}</Label>
            <Input value={s.licenseNumber || ""} onChange={e => set("licenseNumber", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{fr ? "Heures d'ouverture" : "Opening hours"}</Label>
            <Input value={s.openingHours || ""} onChange={e => set("openingHours", e.target.value)}
              placeholder="Lun–Ven 8h–17h" />
          </div>
          <div>
            <Label>{fr ? "Devise" : "Currency"}</Label>
            <Input value={s.currency || "FCFA"} onChange={e => set("currency", e.target.value)} />
          </div>
        </div>

        <Button className="w-full" onClick={save}>
          {fr ? "Enregistrer" : "Save"}
        </Button>
      </Card>
    </div>
  );
}
