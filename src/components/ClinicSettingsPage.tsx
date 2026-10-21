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
  getClinicSettings, saveClinicSettings, generateClinicId, CLINIC_TYPES, type ClinicSettings,
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

  // ── Join / switch to another clinic (wipes THIS clinic's data on THIS device) ──
  const [switchName, setSwitchName] = useState("");
  const [switchCode, setSwitchCode] = useState("");
  const [switchPin, setSwitchPin] = useState("");
  const [switchBusy, setSwitchBusy] = useState(false);

  const wipeClinicalData = async () => {
    const { db } = await import("@/lib/db");
    const tables = ["patients", "consultations", "appointments", "documents", "payments", "drugs", "drugTransactions", "generatedDocs", "importedDocuments", "admissions", "careNotes", "surveys", "surveyResponses", "surveyInvites", "equipmentItems", "equipmentMovements", "auditLogs"];
    for (const t of tables) { try { await (db as any)[t]?.clear(); } catch { /* ignore */ } }
    try { localStorage.removeItem("dl.lastSyncAt"); } catch { /* ignore */ }
    // Reset per-clinic sync cursors so the new clinic re-downloads in full.
    // Without this, the wiped device thinks it is already synced and pulls nothing.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith("dl.lastSync."))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
  };

  const doSwitchClinic = async () => {
    const cn = switchName.trim(), c = switchCode.trim();
    if (!cn || !c || switchPin.length < 4) { toast.error(fr ? "Nom, code et PIN requis" : "Name, code and PIN required"); return; }
    if (!window.confirm(fr ? "Changer de clinique effacera les données de la clinique actuelle sur CET appareil (elles restent sur le serveur). Continuer ?" : "Switching clinic will erase the current clinic's data on THIS device (it stays safe on the server). Continue?")) return;
    setSwitchBusy(true);
    try {
      const res = await fetch("https://divinelink.mooo.com/api/clinic/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, pin: switchPin, name: cn }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        await wipeClinicalData();
        localStorage.setItem("divinelink.apiToken", data.token);
        localStorage.setItem("divinelink.clinicId", String(data.clinic_id));
        try {
          const { hashPin, db } = await import("@/lib/db");
          const role = (data.role || "receptionist") as any;
          const pinHash = await hashPin(switchPin);
          const existing = await db.users.where("role").equals(role).first();
          if (existing?.id) await db.users.update(existing.id, { pinHash, active: true });
        } catch { /* non-fatal */ }
        saveClinicSettings({ ...((getClinicSettings() as any) || {}), clinicId: generateClinicId(), name: data.clinic_name || cn, currency: "FCFA", createdAt: new Date().toISOString() });
        toast.success(fr ? `Basculé vers ${data.clinic_name} (${data.role})` : `Switched to ${data.clinic_name} (${data.role})`);
        setTimeout(() => window.location.reload(), 900);
      } else if (res.status === 401) toast.error(fr ? "PIN du personnel invalide" : "Invalid staff PIN");
      else if (res.status === 409) toast.error(fr ? "Le nom ne correspond pas" : "Clinic name doesn't match");
      else if (res.status === 404) toast.error(fr ? "Code clinique invalide" : "Invalid clinic code");
      else toast.error(fr ? "Échec du changement" : "Switch failed");
    } catch { toast.error(fr ? "Serveur injoignable" : "Server unreachable"); }
    finally { setSwitchBusy(false); }
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
    // If a clinic code is entered, verify against the server and link this
    // device. Linking now needs the staff PIN (the server decides the role).
    if (clinicCode.trim()) {
      const pin = (window.prompt(fr ? "PIN du personnel (admin 1111 · médecin 2222 · secrétaire 3333) :" : "Staff PIN (admin 1111 · doctor 2222 · reception 3333):") || "").trim();
      if (pin.length < 4) { toast.error(fr ? "PIN requis" : "PIN required"); return; }
      try {
        const res = await fetch("https://divinelink.mooo.com/api/clinic/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: clinicCode.trim(), pin, name: s.name.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token) {
          localStorage.setItem("divinelink.apiToken", data.token);
          localStorage.setItem("divinelink.clinicId", String(data.clinic_id));
          try {
            const { db, hashPin } = await import("@/lib/db");
            const role = (data.role || "receptionist") as any;
            const pinHash = await hashPin(pin);
            const existing = await db.users.where("role").equals(role).first();
            if (existing?.id) await db.users.update(existing.id, { pinHash, active: true });
          } catch { /* non-fatal */ }
          toast.success(fr ? `Clinique liée: ${data.clinic_name} (${data.role})` : `Linked: ${data.clinic_name} (${data.role})`);
        } else if (res.status === 401) {
          toast.error(fr ? "PIN du personnel invalide" : "Invalid staff PIN");
          return;
        } else if (res.status === 409) {
          toast.error(fr ? "Le nom ne correspond pas" : "Clinic name doesn't match");
          return;
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

      <Card className="p-5 mb-4 border-2 border-cyan-500/40 bg-cyan-50/40">
        <h2 className="font-bold text-base mb-1">{fr ? "Rejoindre / changer de clinique" : "Join / switch clinic"}</h2>
        <p className="text-xs text-muted-foreground mb-3">
          {fr ? "Lier cet appareil à une autre clinique. Les données de la clinique actuelle sur cet appareil seront effacées (elles restent sur le serveur)." : "Link this device to another clinic. The current clinic's data on this device will be erased (it stays safe on the server)."}
        </p>
        <div className="space-y-2">
          <Input value={switchName} onChange={e => setSwitchName(e.target.value)} placeholder={fr ? "Nom exact de la clinique" : "Exact clinic name"} />
          <Input value={switchCode} onChange={e => setSwitchCode(e.target.value.toUpperCase())} placeholder={fr ? "Code clinique" : "Clinic code"} />
          <Input type="password" inputMode="numeric" maxLength={6} value={switchPin}
            onChange={e => setSwitchPin(e.target.value.replace(/\D/g, ""))}
            placeholder={fr ? "PIN (admin 1111 · médecin 2222 · secrétaire 3333)" : "PIN (admin 1111 · doctor 2222 · reception 3333)"} />
          <Button onClick={doSwitchClinic} disabled={switchBusy} className="w-full">
            {switchBusy ? "…" : (fr ? "Rejoindre cette clinique" : "Join this clinic")}
          </Button>
        </div>
      </Card>

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

        <div>
          <Label className="text-sm font-semibold">Type de clinique / Clinic type</Label>
          <p className="text-xs text-muted-foreground mb-2">Adapte le menu et les fonctionnalites a votre activite</p>
          <div className="grid grid-cols-1 gap-2">
            {CLINIC_TYPES.map(t => (
              <button key={t.value} type="button"
                onClick={() => set("clinicType" as any, t.value)}
                className={"w-full text-left p-3 rounded-xl border transition-colors " + (s.clinicType === t.value ? "border-primary bg-primary/10" : "border-muted hover:border-primary/50")}>
                <span className="text-lg mr-2">{t.emoji}</span>
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" onClick={save}>
          {fr ? "Enregistrer" : "Save"}
        </Button>
      </Card>
      <div className="mt-4"><NotificationSettings /></div>
    </div>
  );
}
