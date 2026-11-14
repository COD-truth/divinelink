import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { Stethoscope, KeyRound, Sparkles, ArrowLeft } from "lucide-react";
import { getClinicSettings, saveClinicSettings, generateClinicId } from "@/lib/clinicSettings";

interface Props { open: boolean; onDone: () => void; }

type Mode = "choose" | "join" | "create";

export function ClinicOnboarding({ open, onDone }: Props) {
  const { lang } = useLang();
  const fr = lang === "fr";
  const [mode, setMode] = useState<Mode>("choose");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const persistLocal = (clinicName: string) => {
    const cur = getClinicSettings();
    const next = {
      ...(cur || {}),
      clinicId: cur?.clinicId || generateClinicId(),
      name: clinicName,
      currency: cur?.currency || "FCFA",
      createdAt: cur?.createdAt || new Date().toISOString(),
    };
    saveClinicSettings(next);
  };

  const doJoin = async () => {
    const cn = name.trim();
    const c = code.trim();
    if (!cn) { toast.error(fr ? "Entrez le nom exact de la clinique" : "Enter the exact clinic name"); return; }
    if (!c) { toast.error(fr ? "Entrez le code" : "Enter the code"); return; }
    if (pin.length < 4) { toast.error(fr ? "Entrez le PIN du personnel" : "Enter the staff PIN"); return; }
    setBusy(true);
    try {
      const res = await fetch("https://divinelink.mooo.com/api/clinic/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, pin, name: cn }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        // Clean start on this clinic: wipe any previous clinic's data on this device.
        try {
          const { db: dbw } = await import("@/lib/db");
          const tables = ["patients", "consultations", "appointments", "documents", "drugs", "drugTransactions", "generatedDocs", "importedDocuments", "admissions", "careNotes", "surveys", "surveyResponses", "surveyInvites", "equipmentItems", "equipmentMovements", "auditLogs"];
          for (const tbl of tables) { try { await (dbw as any)[tbl]?.clear(); } catch { /* ignore */ } }
          localStorage.removeItem("dl.lastSyncAt");
          // CRITICAL: also reset the per-clinic sync cursors. We just cleared the
          // local tables, so the device must re-download EVERYTHING from the
          // server. If the cursor is left in place, the next pull thinks it is
          // already up to date and downloads nothing → the joined device shows
          // an empty/near-empty clinic while the server has all the records.
          try {
            Object.keys(localStorage)
              .filter(k => k.startsWith("dl.lastSync."))
              .forEach(k => localStorage.removeItem(k));
          } catch { /* ignore */ }
        } catch { /* non-fatal */ }
        localStorage.setItem("divinelink.apiToken", data.token);
        localStorage.setItem("divinelink.clinicId", String(data.clinic_id));
        // Set this role's local login PIN to the staff PIN just used, so the
        // person logs in day-to-day with the same PIN (server decided the role).
        try {
          const { db, hashPin } = await import("@/lib/db");
          const role = (data.role || "receptionist") as any;
          const pinHash = await hashPin(pin);
          const existing = await db.users.where("role").equals(role).first();
          if (existing?.id) await db.users.update(existing.id, { pinHash, active: true });
          else await db.users.add({ name: String(role).charAt(0).toUpperCase() + String(role).slice(1), role, pinHash, active: true, createdAt: new Date().toISOString() });
        } catch { /* non-fatal */ }
        persistLocal(data.clinic_name || cn);
        toast.success(fr ? `Clinique liée: ${data.clinic_name} (${data.role})` : `Linked: ${data.clinic_name} (${data.role})`);
        onDone();
      } else if (res.status === 401) {
        toast.error(fr ? "PIN du personnel invalide" : "Invalid staff PIN");
      } else if (res.status === 409) {
        toast.error(fr ? `Le nom ne correspond pas${data.clinic_name ? ` (${data.clinic_name})` : ""}` : `Clinic name doesn't match${data.clinic_name ? ` (${data.clinic_name})` : ""}`);
      } else if (res.status === 404) {
        toast.error(fr ? "Code clinique invalide" : "Invalid clinic code");
      } else {
        toast.error(fr ? "Échec de la connexion" : "Join failed");
      }
    } catch {
      toast.error(fr ? "Serveur injoignable" : "Server unreachable");
    } finally { setBusy(false); }
  };

  const doCreate = async () => {
    const n = name.trim();
    if (!n) { toast.error(fr ? "Entrez le nom" : "Enter a name"); return; }
    setBusy(true);
    try {
      const res = await fetch("https://divinelink.mooo.com/api/clinic/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.token) {
        // Clean start: a new clinic must NOT inherit the previous clinic's local
        // data (which would otherwise get uploaded into it). Wipe clinical tables
        // and reset the sync cursors, same as joining an existing clinic.
        try {
          const { db: dbw } = await import("@/lib/db");
          const tables = ["patients", "consultations", "appointments", "documents", "drugs", "drugTransactions", "generatedDocs", "importedDocuments", "admissions", "careNotes", "surveys", "surveyResponses", "surveyInvites", "equipmentItems", "equipmentMovements", "auditLogs"];
          for (const tbl of tables) { try { await (dbw as any)[tbl]?.clear(); } catch { /* ignore */ } }
          localStorage.removeItem("dl.lastSyncAt");
          Object.keys(localStorage).filter(k => k.startsWith("dl.lastSync.")).forEach(k => localStorage.removeItem(k));
        } catch { /* non-fatal */ }
        localStorage.setItem("divinelink.apiToken", data.token);
        localStorage.setItem("divinelink.clinicId", String(data.clinic_id));
        persistLocal(n);
        toast.success(fr ? `Espace créé ! Code: ${data.code}` : `Workspace created! Code: ${data.code}`);
        onDone();
      } else {
        // Offline / server unreachable → fall back to local-only
        persistLocal(n);
        toast.success(fr ? "Espace local créé (hors-ligne)" : "Local workspace created (offline)");
        onDone();
      }
    } catch {
      persistLocal(n);
      toast.success(fr ? "Espace local créé (hors-ligne)" : "Local workspace created (offline)");
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* must complete */ }}>
      <DialogContent className="max-w-2xl" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" />
            <DialogTitle>{fr ? "Bienvenue sur DivineLink" : "Welcome to DivineLink"}</DialogTitle>
          </div>
          <DialogDescription>
            {mode === "choose"
              ? (fr ? "Comment souhaitez-vous commencer ?" : "How would you like to start?")
              : mode === "join"
                ? (fr ? "Rejoindre une clinique avec un code." : "Join a clinic with a code.")
                : (fr ? "Créer un nouvel espace pour votre équipe." : "Create a new workspace for your team.")}
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" && (
          <div className="space-y-4">
            {/* Primary: Join with code */}
            <Card className="p-5 border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer"
              onClick={() => setMode("join")}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base mb-1">
                    {fr ? "J'ai un code clinique" : "I have a clinic code"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {fr
                      ? "Votre clinique existe déjà sur DivineLink. Entrez le code partagé par votre équipe pour synchroniser cet appareil."
                      : "Your clinic already exists on DivineLink. Enter the code shared by your team to sync this device."}
                  </p>
                  <Button className="mt-3" onClick={(e) => { e.stopPropagation(); setMode("join"); }}>
                    {fr ? "Rejoindre →" : "Join →"}
                  </Button>
                </div>
              </div>
            </Card>

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{fr ? "ou" : "or"}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Secondary: Create new */}
            <Card className="p-5 border-dashed hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => setMode("create")}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base mb-1">
                    {fr ? "Créer un nouvel espace" : "Create a new workspace"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {fr
                      ? "Pour les étudiants, nouvelles équipes ou cliniques sans compte. Vous recevrez un code à partager avec votre équipe."
                      : "For students, new teams, or clinics without an account. You'll get a code to share with your team."}
                  </p>
                  <Button variant="outline" className="mt-3" onClick={(e) => { e.stopPropagation(); setMode("create"); }}>
                    {fr ? "Créer →" : "Create →"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-4">
            <div>
              <Label>{fr ? "Nom exact de la clinique" : "Exact clinic name"}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={fr ? "Clinique Divine" : "Divine Clinic"} autoFocus />
            </div>
            <div>
              <Label>{fr ? "Code de la clinique" : "Clinic code"}</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="DIVINE001" />
              <p className="text-xs text-muted-foreground mt-1">
                {fr ? "Demandez le code à l'administrateur de votre clinique." : "Ask your clinic admin for the code."}
              </p>
            </div>
            <div>
              <Label>{fr ? "PIN du personnel" : "Staff PIN"}</Label>
              <Input type="password" inputMode="numeric" maxLength={6} value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••"
                onKeyDown={e => { if (e.key === "Enter") doJoin(); }} />
              <p className="text-xs text-muted-foreground mt-1">
                {fr ? "Le PIN détermine votre rôle : admin 1111 · médecin 2222 · secrétaire 3333" : "Your PIN sets your role: admin 1111 · doctor 2222 · reception 3333"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setMode("choose")} className="gap-1">
                <ArrowLeft className="w-4 h-4" />{fr ? "Retour" : "Back"}
              </Button>
              <Button onClick={doJoin} disabled={busy} className="flex-1">
                {busy ? "…" : (fr ? "Rejoindre la clinique" : "Join clinic")}
              </Button>
            </div>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-4">
            <div>
              <Label>{fr ? "Nom de la clinique / équipe" : "Clinic / team name"}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={fr ? "Ma Clinique" : "My Clinic"} autoFocus
                onKeyDown={e => { if (e.key === "Enter") doCreate(); }} />
              <p className="text-xs text-muted-foreground mt-1">
                {fr
                  ? "Un nouvel espace sera créé et vous recevrez un code à partager avec vos collègues."
                  : "A new workspace will be created and you'll get a code to share with colleagues."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setMode("choose")} className="gap-1">
                <ArrowLeft className="w-4 h-4" />{fr ? "Retour" : "Back"}
              </Button>
              <Button onClick={doCreate} disabled={busy} className="flex-1">
                {busy ? "…" : (fr ? "Créer l'espace" : "Create workspace")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
