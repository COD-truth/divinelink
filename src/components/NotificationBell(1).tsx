import React, { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bell, AlertTriangle, CalendarDays, Pill,
  CreditCard, Database, Check, CheckCheck, X
} from "lucide-react";
import type { Page } from "@/components/AppLayout";
import { decryptPatients } from "@/lib/patientCrypto";

interface NotifItem {
  id: string;
  type: "appointment" | "drug" | "payment" | "backup" | "expiry";
  title: string;
  message: string;
  page: Page;
  urgency: "high" | "medium" | "low";
  read: boolean;
  time?: string;
}

const READ_KEY = "divinelink.notif.read.v2";
const DISMISSED_KEY = "divinelink.notif.dismissed";

function getReadIds() {
  try { return new Set<string>(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); }
  catch { return new Set<string>(); }
}
function getDismissed() {
  try { return new Set<string>(JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]")); }
  catch { return new Set<string>(); }
}
function saveReadIds(ids: Set<string>) {
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}
function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export function NotificationBell({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(getReadIds);
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed);

  const load = useCallback(async () => {
    const notifs: NotifItem[] = [];
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const twoHoursLater = new Date(now.getTime() + 2 * 3600000);

    // --- Appointments today ---
    try {
      const appts = await db.appointments.where("date").equals(today).toArray();
      const pats = await decryptPatients(await db.patients.toArray());
      appts
        .filter(a => a.status !== "completed" && a.status !== "cancelled")
        .forEach(a => {
          const apptTime = new Date(`${a.date}T${a.time || "00:00"}`);
          const pat = pats.find(p => p.id === a.patientId);
          const patName = pat ? `${pat.firstName} ${pat.lastName}` : "Patient";
          const diffMin = Math.round((apptTime.getTime() - now.getTime()) / 60000);

          if (apptTime >= now && apptTime <= twoHoursLater) {
            notifs.push({
              id: `apt-soon-${a.id}`,
              type: "appointment",
              title: `⏰ RDV dans ${diffMin} min`,
              message: `${patName} — ${a.time} — ${a.reason || "Consultation"}`,
              page: "appointments",
              urgency: diffMin <= 30 ? "high" : "medium",
              read: false,
              time: a.time,
            });
          } else if (apptTime < now && apptTime > new Date(now.getTime() - 3600000)) {
            notifs.push({
              id: `apt-now-${a.id}`,
              type: "appointment",
              title: "📅 RDV en cours",
              message: `${patName} — ${a.time}`,
              page: "appointments",
              urgency: "high",
              read: false,
            });
          }
        });
    } catch {}

    // --- All appointments today count ---
    try {
      const allToday = await db.appointments.where("date").equals(today).count();
      if (allToday > 0) {
        notifs.push({
          id: `apt-today-${today}`,
          type: "appointment",
          title: `📅 ${allToday} rendez-vous aujourd'hui`,
          message: "Voir l'agenda du jour",
          page: "appointments",
          urgency: "low",
          read: false,
        });
      }
    } catch {}

    // --- Unpaid patients ---
    try {
      const payments = await db.payments.toArray();
      const unpaid = payments.filter(p => p.status === "unpaid" || p.status === "partial");
      const totalOwed = unpaid.reduce((s, p) => s + (p.amountDue - p.amountPaid), 0);
      if (unpaid.length > 0) {
        notifs.push({
          id: `pay-owed-${today}`,
          type: "payment",
          title: `💰 ${unpaid.length} patient(s) avec solde`,
          message: `Total à encaisser: ${totalOwed.toLocaleString()} FCFA`,
          page: "payments" as Page,
          urgency: unpaid.length >= 5 ? "high" : "medium",
          read: false,
        });
      }
    } catch {}

    // --- Drug alerts ---
    try {
      const drugs = await db.drugs.toArray();
      const lowDrugs = drugs.filter(d => d.status === "low" || d.status === "out");
      if (lowDrugs.length > 0) {
        notifs.push({
          id: `drug-low-${today}`,
          type: "drug",
          title: `💊 ${lowDrugs.length} médicament(s) en alerte`,
          message: lowDrugs.slice(0,3).map(d => `${d.name}: ${d.stock} ${d.unit}`).join(", "),
          page: "pharmacy",
          urgency: lowDrugs.some(d => d.status === "out") ? "high" : "medium",
          read: false,
        });
      }

      // Expiring drugs
      const expiring = drugs.filter(d => {
        if (!d.expiration) return false;
        const days = (new Date(d.expiration).getTime() - Date.now()) / 86400000;
        return days <= 30 && days > 0;
      });
      if (expiring.length > 0) {
        notifs.push({
          id: `drug-exp-${today}`,
          type: "expiry",
          title: `⚠️ ${expiring.length} médicament(s) expirent bientôt`,
          message: expiring.slice(0,2).map(d => d.name).join(", "),
          page: "pharmacy",
          urgency: "medium",
          read: false,
        });
      }
    } catch {}

    // --- Backup reminder ---
    try {
      const lastBackup = localStorage.getItem("divinelink.lastBackup");
      if (!lastBackup) {
        notifs.push({
          id: "backup-never",
          type: "backup",
          title: "💾 Aucune sauvegarde effectuée",
          message: "Sauvegardez vos données maintenant",
          page: "backup",
          urgency: "high",
          read: false,
        });
      } else {
        const daysSince = (Date.now() - new Date(lastBackup).getTime()) / 86400000;
        if (daysSince >= 7) {
          notifs.push({
            id: `backup-${Math.floor(daysSince)}d`,
            type: "backup",
            title: `💾 Sauvegarde: il y a ${Math.floor(daysSince)} jours`,
            message: "Pensez à sauvegarder vos données",
            page: "backup",
            urgency: daysSince >= 14 ? "high" : "low",
            read: false,
          });
        }
      }
    } catch {}

    // Filter dismissed
    const visible = notifs.filter(n => !dismissed.has(n.id));
    // Mark read ones
    visible.forEach(n => { if (readIds.has(n.id)) n.read = true; });
    // Sort: high urgency first, then unread
    visible.sort((a, b) => {
      const urgOrder = { high:0, medium:1, low:2 };
      if (a.read !== b.read) return a.read ? 1 : -1;
      return urgOrder[a.urgency] - urgOrder[b.urgency];
    });
    setItems(visible);
  }, [readIds, dismissed]);

  useEffect(() => { load(); }, [load]);
  // Refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = items.filter(i => !i.read).length;

  const markOneRead = (id: string) => {
    const newIds = new Set(readIds);
    newIds.add(id);
    setReadIds(newIds);
    saveReadIds(newIds);
    setItems(prev => prev.map(i => i.id === id ? { ...i, read: true } : i));
  };

  const dismissOne = (id: string) => {
    const newDis = new Set(dismissed);
    newDis.add(id);
    setDismissed(newDis);
    saveDismissed(newDis);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const markAllRead = () => {
    const newIds = new Set(readIds);
    items.forEach(i => newIds.add(i.id));
    setReadIds(newIds);
    saveReadIds(newIds);
    setItems(prev => prev.map(i => ({ ...i, read: true })));
  };

  const ICONS = {
    appointment: <CalendarDays className="w-4 h-4 text-blue-500" />,
    drug: <Pill className="w-4 h-4 text-orange-500" />,
    expiry: <AlertTriangle className="w-4 h-4 text-orange-600" />,
    payment: <CreditCard className="w-4 h-4 text-green-600" />,
    backup: <Database className="w-4 h-4 text-purple-500" />,
  };

  const URGENCY_BORDER = {
    high: "border-l-red-500",
    medium: "border-l-orange-400",
    low: "border-l-blue-400",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-[10px] h-4">{unreadCount}</Badge>
            )}
          </div>
          {items.some(i => !i.read) && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              <CheckCheck className="w-3 h-3 mr-1" /> Tout lire
            </Button>
          )}
        </div>

        {/* Items */}
        <div className="overflow-y-auto flex-1">
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Tout est à jour!</p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map(item => (
                <div
                  key={item.id}
                  className={`flex gap-3 px-3 py-3 border-l-4 cursor-pointer transition-colors
                    ${item.read ? "opacity-60" : ""}
                    ${URGENCY_BORDER[item.urgency]}
                    hover:bg-muted/50`}
                  onClick={() => {
                    markOneRead(item.id);
                    onNavigate(item.page);
                    setOpen(false);
                  }}
                >
                  <div className="mt-0.5 shrink-0">{ICONS[item.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm leading-tight">{item.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.message}</div>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={e => { e.stopPropagation(); dismissOne(item.id); }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 text-[10px] text-muted-foreground flex justify-between items-center">
          <span>Se rafraîchit toutes les 5 min</span>
          <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={load}>
            Actualiser
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
