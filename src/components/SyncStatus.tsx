import React, { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact sync-status pill for the app header.
 * Green = online + recently synced, Yellow = online but stale/never,
 * Red = offline.
 */
export function SyncStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<number | null>(() => {
    const v = localStorage.getItem("dl.lastSyncAt");
    return v ? Number(v) : null;
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const id = setInterval(() => {
      const v = localStorage.getItem("dl.lastSyncAt");
      setLastSync(v ? Number(v) : null);
      setTick(t => t + 1);
    }, 15_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(id);
    };
  }, []);

  const ageMin = lastSync ? Math.floor((Date.now() - lastSync) / 60_000) : null;
  const state: "offline" | "stale" | "ok" =
    !online ? "offline" : (!ageMin && ageMin !== 0) || ageMin > 15 ? "stale" : "ok";

  const label =
    state === "offline" ? "Hors ligne"
    : state === "ok" ? "Synchronisé"
    : ageMin == null ? "Jamais sync." : `${ageMin} min`;

  const Icon = state === "offline" ? WifiOff : state === "ok" ? CheckCircle2 : RefreshCw;

  const classes = cn(
    "hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border",
    state === "offline" && "bg-destructive/10 text-destructive border-destructive/30",
    state === "stale" && "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    state === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  );

  return (
    <span className={classes} title={lastSync ? `Dernière sync : ${new Date(lastSync).toLocaleString()}` : "Aucune synchronisation"}>
      <Icon className={cn("w-3.5 h-3.5", state === "stale" && "animate-pulse")} />
      {label}
    </span>
  );
}
