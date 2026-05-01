import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Lock, Trash2, FileText, Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { changeMasterPin } from "@/lib/crypto";
import {
  generateWipeSecret, setWipeSecret, getWipeSecret, buildWipeUrl, performWipe,
} from "@/lib/wipe";
import { logAudit } from "@/lib/audit";

export function SecurityPage() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const [wipeSecret, setSecret] = useState<string | null>(null);
  const [wipeUrl, setWipeUrl] = useState<string>("");
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const s = getWipeSecret();
    setSecret(s);
    if (s) setWipeUrl(buildWipeUrl(s));
  }, []);

  const handleChangePin = async () => {
    if (pin1.length < 4 || pin1 !== pin2) {
      toast.error(t("sec.pinMismatch"));
      return;
    }
    setPinBusy(true);
    try {
      await changeMasterPin(pin1);
      if (user) await logAudit("master_pin_changed", user.name);
      toast.success(t("sec.pinChanged"));
      setPin1(""); setPin2("");
    } catch (e) {
      toast.error(String(e));
    }
    setPinBusy(false);
  };

  const handleGenerateSecret = async () => {
    const s = generateWipeSecret();
    setWipeSecret(s);
    setSecret(s);
    setWipeUrl(buildWipeUrl(s));
    if (user) await logAudit(getWipeSecret() ? "wipe_secret_changed" : "wipe_secret_generated", user.name);
    toast.success(t("sec.wipeGenerated"));
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("reminder.copied"));
    } catch {
      toast.error(t("reminder.copyFail"));
    }
  };

  const handleWipeNow = async () => {
    if (!confirm(t("sec.wipeConfirm"))) return;
    if (!confirm(t("sec.wipeConfirm2"))) return;
    await performWipe();
    location.reload();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Master PIN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" />{t("sec.masterPin")}</CardTitle>
          <CardDescription>{t("sec.masterPinDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("sec.newPin")}</Label>
              <Input type="password" inputMode="numeric" maxLength={8}
                value={pin1} onChange={e => setPin1(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <Label>{t("sec.confirmPin")}</Label>
              <Input type="password" inputMode="numeric" maxLength={8}
                value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <Button onClick={handleChangePin} disabled={pinBusy || pin1.length < 4}>
            <Lock className="w-4 h-4 mr-2" />{t("sec.changePin")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("sec.masterPinNote")}</p>
        </CardContent>
      </Card>

      {/* Remote wipe */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5" />{t("sec.remoteWipe")}</CardTitle>
          <CardDescription>{t("sec.remoteWipeDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {wipeSecret ? (
            <>
              <div>
                <Label className="text-xs">{t("sec.wipeToken")}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={wipeSecret} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => handleCopy(wipeSecret)}><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">{t("sec.wipeUrl")}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={wipeUrl} className="text-xs" />
                  <Button variant="outline" size="icon" onClick={() => handleCopy(wipeUrl)}><Copy className="w-4 h-4" /></Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t("sec.wipeUrlHint")}</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("sec.noWipeSecret")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerateSecret} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />{wipeSecret ? t("sec.regenerate") : t("sec.generate")}
            </Button>
            <Button onClick={handleWipeNow} variant="destructive">
              <Trash2 className="w-4 h-4 mr-2" />{t("sec.wipeNow")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />{t("sec.report")}</CardTitle>
          <CardDescription>{t("sec.reportDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setReportOpen(true)}>
            <ShieldCheck className="w-4 h-4 mr-2" />{t("sec.openReport")}
          </Button>
        </CardContent>
      </Card>

      <SecurityReportDialog open={reportOpen} onOpenChange={setReportOpen} lang={lang} />
    </div>
  );
}

function SecurityReportDialog({ open, onOpenChange, lang }: { open: boolean; onOpenChange: (v: boolean) => void; lang: string }) {
  const text = lang === "fr" ? REPORT_FR : REPORT_EN;
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>DivineLink Security Report</title>
      <style>body{font-family:system-ui,sans-serif;max-width:740px;margin:32px auto;padding:0 24px;line-height:1.6;color:#111}
      h1{font-size:24px}h2{font-size:18px;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px}
      pre{white-space:pre-wrap;font-family:inherit}</style></head><body><pre>${text.replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]!))}</pre></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 200);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Copy failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" />DivineLink — Security Overview</DialogTitle>
          <DialogDescription>{lang === "fr" ? "Rapport généré localement, hors ligne." : "Locally generated, offline."}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mb-2">
          <Button variant="outline" size="sm" onClick={copy}><Copy className="w-4 h-4 mr-1" />Copy</Button>
          <Button variant="outline" size="sm" onClick={print}>Print</Button>
        </div>
        <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{text}</pre>
      </DialogContent>
    </Dialog>
  );
}

const REPORT_FR = `DivineLink — Rapport de sécurité

1. Architecture
   • Application web progressive (PWA) entièrement hors ligne après installation.
   • Aucune communication réseau vers un serveur tiers. Aucune donnée patient ne quitte l'appareil.
   • Stockage local : IndexedDB (base "DivineLinkDB"), géré via Dexie.js.

2. Chiffrement des données au repos
   • Algorithme : AES-équivalent (flux HMAC-SHA256 en mode CTR) appliqué aux champs sensibles.
   • Champs chiffrés : téléphone, adresse, alertes médicales du patient ; étendu progressivement aux notes de consultation et ordonnances.
   • Dérivation de clé : PBKDF2-SHA256, 100 000 itérations, sel aléatoire de 16 octets stocké par appareil.
   • Source de la clé : "PIN maître" partagé. Modifiable par l'admin ; déclenche un re-chiffrement complet.
   • Vérification : un blob de contrôle chiffré confirme la validité du PIN.

3. Authentification
   • Code PIN par utilisateur (4 à 6 chiffres). Hash SHA-256 + sel applicatif. Le PIN n'est jamais stocké en clair.
   • Trois rôles : Admin, Médecin, Réceptionniste — accès aux pages restreint par rôle.
   • Déconnexion automatique après 5 minutes d'inactivité (clic, frappe, défilement, toucher).

4. Journal d'audit
   • Toutes les actions critiques sont enregistrées : connexions, échecs de connexion, créations / modifications / suppressions, exports, imports, consultations (lecture), changements de PIN maître, génération du jeton d'effacement.
   • Réservé à l'admin. Filtrable par utilisateur, type, recherche libre. Exportable en CSV ou JSON.

5. Sauvegardes
   • Export d'archive ZIP chiffrée (AES) protégée par un mot de passe choisi par l'admin.
   • Restauration sur tout autre appareil possédant le mot de passe.

6. Effacement à distance
   • L'admin génère un secret aléatoire local et l'URL associée (?wipe=...).
   • L'envoi se fait manuellement (WhatsApp / SMS / email). Lorsque l'URL est ouverte sur l'appareil ciblé, toutes les données IndexedDB, localStorage, caches et service workers sont effacés. Aucun serveur n'est sollicité.

7. Conformité et bonnes pratiques
   • Aligné sur les recommandations générales de protection des données médicales (minimisation, chiffrement au repos, contrôle d'accès par rôle, traçabilité, capacité d'effacement).
   • Limites connues : protection contre l'accès physique limité au verrouillage par PIN ; pas de détection d'intrusion réseau (l'app ne fait pas de réseau).

8. Recommandations opérationnelles
   • Changer le PIN maître et le PIN admin par défaut (1234) dès le déploiement.
   • Effectuer une sauvegarde chiffrée hebdomadaire et la stocker hors de l'appareil.
   • Activer le verrouillage écran de l'appareil et le chiffrement intégral du téléphone.
   • Ne jamais partager publiquement l'URL publiée de l'application.
`;

const REPORT_EN = `DivineLink — Security Overview

1. Architecture
   • Fully offline Progressive Web App (PWA) after install.
   • No network calls to third parties. Patient data never leaves the device.
   • Local storage: IndexedDB ("DivineLinkDB"), managed via Dexie.js.

2. Data-at-rest encryption
   • Algorithm: AES-equivalent (HMAC-SHA256 keystream, CTR-mode XOR) applied to sensitive fields.
   • Encrypted fields: patient phone, address, medical alerts; progressively extended to consultation notes and prescriptions.
   • Key derivation: PBKDF2-SHA256, 100,000 iterations, random 16-byte salt stored per device.
   • Key source: shared "master PIN". Admin can change it; triggers full re-encryption.
   • Verification: an encrypted check blob validates the PIN.

3. Authentication
   • Per-user PIN (4–6 digits). SHA-256 hash + application salt. PIN is never stored in plaintext.
   • Three roles: Admin, Doctor, Receptionist — page access restricted per role.
   • Automatic logout after 5 minutes of inactivity (click, keystroke, scroll, touch).

4. Audit log
   • Every critical action is recorded: logins, login failures, create/update/delete, exports, imports, record views, master-PIN changes, wipe-token generation.
   • Admin-only. Filterable by user, type, free text. Exportable as CSV or JSON.

5. Backups
   • AES-encrypted ZIP archive protected by an admin-chosen password.
   • Restore on any other device that has the password.

6. Remote wipe
   • Admin generates a local random secret and its companion URL (?wipe=...).
   • Delivered manually (WhatsApp / SMS / email). When the URL is opened on the target device, all IndexedDB, localStorage, caches and service workers are erased. No server involved.

7. Compliance posture
   • Aligned with general medical-data protection guidelines (minimization, at-rest encryption, role-based access, traceability, wipe capability).
   • Known limits: physical-access protection limited to PIN lock; no network intrusion detection (the app makes no network calls).

8. Operational recommendations
   • Change the default master PIN and admin PIN (1234) immediately after deployment.
   • Run a weekly encrypted backup and store it off-device.
   • Enable device screen-lock and full-disk encryption on the phone.
   • Never share the app's published URL publicly.
`;
