import React, { useEffect, useState } from "react";
import { db, type SyncConflict } from "@/lib/db";
import { resolveConflict } from "@/lib/sync";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function pretty(v: any): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function ConflictCard({ c, onResolved }: { c: SyncConflict; onResolved: () => void }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);

  const handle = async (choice: "local" | "remote") => {
    setBusy(true);
    try {
      await resolveConflict(c.id!, choice, user?.name || "admin");
      toast.success(t("conflicts.resolved"));
      onResolved();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-l-4 border-l-destructive">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="font-semibold">{c.label}</span>
          <Badge variant="outline" className="text-xs">{c.resource}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("conflicts.detected")}: {new Date(c.detectedAt).toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border rounded p-2 bg-muted/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase">{t("conflicts.local")}</span>
            <span className="text-[10px] text-muted-foreground">{c.localUpdatedAt ? new Date(c.localUpdatedAt).toLocaleString() : "—"}</span>
          </div>
          <pre className="text-[10px] max-h-60 overflow-auto whitespace-pre-wrap break-words">{pretty(c.localData)}</pre>
          <Button size="sm" className="w-full mt-2 gap-1" onClick={() => handle("local")} disabled={busy}>
            <Check className="w-3 h-3" /> {t("conflicts.keepLocal")}
          </Button>
        </div>
        <div className="border rounded p-2 bg-muted/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase">{t("conflicts.remote")}</span>
            <span className="text-[10px] text-muted-foreground">{c.remoteUpdatedAt ? new Date(c.remoteUpdatedAt).toLocaleString() : "—"}</span>
          </div>
          <pre className="text-[10px] max-h-60 overflow-auto whitespace-pre-wrap break-words">{pretty(c.remoteData)}</pre>
          <Button size="sm" variant="secondary" className="w-full mt-2 gap-1" onClick={() => handle("remote")} disabled={busy}>
            <Check className="w-3 h-3" /> {t("conflicts.keepRemote")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function SyncConflictsPage() {
  const { t } = useLang();
  const [pending, setPending] = useState<SyncConflict[]>([]);
  const [resolved, setResolved] = useState<SyncConflict[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const all = await db.syncConflicts.orderBy("detectedAt").reverse().toArray();
      setPending(all.filter(c => c.status === "pending"));
      setResolved(all.filter(c => c.status !== "pending"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("conflicts.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("conflicts.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh") || "Refresh"}
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            {t("conflicts.pending")} <Badge variant="destructive" className="ml-2">{pending.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="resolved">
            {t("conflicts.history")} <Badge variant="outline" className="ml-2">{resolved.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {pending.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">{t("conflicts.empty")}</Card>
          ) : (
            pending.map(c => <ConflictCard key={c.id} c={c} onResolved={load} />)
          )}
        </TabsContent>

        <TabsContent value="resolved" className="space-y-2 mt-4">
          {resolved.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">—</Card>
          ) : (
            resolved.map(c => (
              <Card key={c.id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{c.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">({c.resource})</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.status.replace("resolved_", "")} • {c.resolvedBy} • {c.resolvedAt ? new Date(c.resolvedAt).toLocaleString() : ""}
                </div>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
