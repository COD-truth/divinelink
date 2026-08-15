import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, Check, X, Loader2 } from "lucide-react";

const API = "https://divinelink.mooo.com/api";

interface Preferences {
  low_stock: boolean;
  expiring_drugs: boolean;
  appointments: boolean;
  unpaid_invoices: boolean;
  daily_summary: boolean;
}

const DEFAULT_PREFS: Preferences = {
  low_stock: true,
  expiring_drugs: true,
  appointments: true,
  unpaid_invoices: true,
  daily_summary: false,
};

const PREF_LABELS = {
  low_stock:       { emoji: "💊", label: "Stock faible",        desc: "Quand un medicament est presque epuise" },
  expiring_drugs:  { emoji: "⏰", label: "Medicaments perimes", desc: "30 jours avant expiration" },
  appointments:    { emoji: "📅", label: "Rendez-vous",         desc: "30 min et 5 min avant chaque RDV" },
  unpaid_invoices: { emoji: "💰", label: "Factures impayees",   desc: "Non payees depuis 3+ jours" },
  daily_summary:   { emoji: "📊", label: "Resume quotidien",    desc: "Bilan de la journee chaque matin" },
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function NotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false); return;
    }
    setPermission(Notification.permission);
    try { const s = localStorage.getItem("dl.notif.prefs"); if (s) setPrefs(JSON.parse(s)); } catch {}
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription().then(setSubscription));
  }, []);

  const savePrefs = useCallback((p: Preferences) => {
    setPrefs(p);
    localStorage.setItem("dl.notif.prefs", JSON.stringify(p));
    if (subscription) {
      const token = localStorage.getItem("divinelink.apiToken");
      fetch(`${API}/push/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: subscription.endpoint, preferences: p })
      }).catch(() => {});
    }
  }, [subscription]);

  const subscribe = async () => {
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { toast.error("Permission refusee."); return; }
      const token = localStorage.getItem("divinelink.apiToken");
      const vRes = await fetch(`${API}/push/vapid-key`, { headers: { Authorization: `Bearer ${token}` } });
      const { publicKey } = await vRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      setSubscription(sub);
      const subJson = sub.toJSON();
      const res = await fetch(`${API}/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: subJson.keys, preferences: prefs })
      });
      if (res.ok) toast.success("Notifications activees!");
      else toast.error("Erreur serveur.");
    } catch { toast.error("Impossible d'activer."); }
    finally { setLoading(false); }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      if (subscription) {
        const token = localStorage.getItem("divinelink.apiToken");
        await fetch(`${API}/push/subscribe`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
        setSubscription(null);
        toast.success("Notifications desactivees.");
      }
    } catch { toast.error("Erreur."); }
    finally { setLoading(false); }
  };

  const sendTest = async () => {
    if (!subscription) return;
    const token = localStorage.getItem("divinelink.apiToken");
    const res = await fetch(`${API}/push/test`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    if (res.ok) toast.success("Notification test envoyee!");
    else toast.error("Echec.");
  };

  if (!supported) return (
    <Card><CardContent className="pt-6">
      <div className="flex items-center gap-3 text-muted-foreground">
        <BellOff className="w-5 h-5" />
        <p className="text-sm">Utilisez Chrome sur Android pour les notifications push.</p>
      </div>
    </CardContent></Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="w-5 h-5 text-primary" />
            Notifications Push
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={subscription ? "default" : "secondary"} className={subscription ? "bg-green-500" : ""}>
              {subscription ? <><Check className="w-3 h-3 mr-1" />Activees</> : <><X className="w-3 h-3 mr-1" />Desactivees</>}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {subscription ? "Alertes meme quand l'app est fermee" : "Activez pour recevoir des alertes"}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!subscription ? (
              <Button onClick={subscribe} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Activer les notifications
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={sendTest} className="gap-2"><BellRing className="w-4 h-4" />Tester</Button>
                <Button variant="ghost" onClick={unsubscribe} disabled={loading} className="gap-2 text-destructive hover:text-destructive">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}Desactiver
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Choisir les alertes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(PREF_LABELS) as (keyof Preferences)[]).map(key => {
            const { emoji, label, desc } = PREF_LABELS[key];
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-xl mt-0.5">{emoji}</span>
                  <div>
                    <Label className="text-sm font-medium">{label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
                <Switch checked={prefs[key]} onCheckedChange={val => savePrefs({...prefs, [key]: val})} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
