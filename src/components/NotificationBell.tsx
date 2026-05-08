import React, { useEffect, useState, useMemo } from "react";
import { db } from "@/lib/db";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, TriangleAlert as AlertTriangle, CalendarDays, Pill, CreditCard, Database, Check } from "lucide-react";
import type { Page } from "@/components/AppLayout";

interface NotifItem { id: string; type: string; message: string; page: Page; read: boolean; }

const READ_KEY = "divinelink.notif.read";

function getReadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); } catch { return new Set(); }
}
function markRead(id: string) {
  const s = getReadIds(); s.add(id);
  localStorage.setItem(READ_KEY, JSON.stringify([...s]));
}

export function NotificationBell({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);

  const load = async () => {
    const notifs: NotifItem[] = [];
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Appointments in 2 hours
    const appts = await db.appointments.where("date").equals(today).toArray();
    const twoHoursLater = new Date(now.getTime() + 2 * 3600000);
    appts.filter(a => a.status !== "completed" && a.status !== "cancelled").forEach(a => {
      const apptTime = new Date(`${a.date}T${a.time || "00:00"}`);
      if (apptTime <= twoHoursLater && apptTime >= now) {
        notifs.push({ id: `apt-${a.id}`, type: "appointment", message: `RDV ${a.time}`, page: "appointments", read: false });
      }
    });

    // Low drug stock
    const drugs = await db.drugs.toArray();
    drugs.filter(d => d.status === "low" || d.status === "out").forEach(d => {
      notifs.push({ id: `drug-${d.id}`, type: "drug", message: `${d.name}: ${d.status === "out" ? "épuisé" : "stock faible"}`, page: "pharmacy", read: false });
    });

    // Drugs expiring <30 days
    drugs.filter(d => d.expiration).forEach(d => {
      const days = (new Date(d.expiration!).getTime() - Date.now()) / 86400000;
      if (days < 30 && days > 0) {
        notifs.push({ id: `exp-${d.id}`, type: "expiring", message: `${d.name}: expire ${d.expiration}`, page: "pharmacy", read: false });
      }
    });

    // Unpaid patients >7 days
    const payments = await db.payments.toArray();
    const unpaidByPatient = new Map<number, number>();
    payments.forEach(p => {
      const bal = Math.max(0, (p.amountDue || 0) - (p.amountPaid || 0));
      if (bal > 0) unpaidByPatient.set(p.patientId, (unpaidByPatient.get(p.patientId) || 0) + bal);
    });
    unpaidByPatient.forEach((bal, pid) => {
      const firstPay = payments.find(p => p.patientId === pid);
      if (firstPay && (Date.now() - new Date(firstPay.createdAt).getTime()) > 7 * 86400000) {
        notifs.push({ id: `unpaid-${pid}`, type: "unpaid", message: `Solde impayé: ${bal.toFixed(0)} FCFA`, page: "patients", read: false });
      }
    });

    // Backup >7 days
    const lastSync = localStorage.getItem("dl.sync.lastExport.v1");
    if (!lastSync || (Date.now() - new Date(lastSync).getTime()) > 7 * 86400000) {
      notifs.push({ id: "backup-overdue", type: "backup", message: t("notif.backup7d"), page: "backup", read: false });
    }

    const readIds = getReadIds();
    notifs.forEach(n => { n.read = readIds.has(n.id); });
    setItems(notifs);
  };

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, []);

  const unread = items.filter(i => !i.read).length;

  const handleMarkRead = (id: string) => {
    markRead(id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, read: true } : i));
  };

  const handleMarkAllRead = () => {
    items.forEach(i => markRead(i.id));
    setItems(prev => prev.map(i => ({ ...i, read: true })));
  };

  const icon = (type: string) => {
    switch (type) {
      case "appointment": return <CalendarDays className="w-4 h-4 text-primary" />;
      case "drug": return <Pill className="w-4 h-4 text-warning" />;
      case "expiring": return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "unpaid": return <CreditCard className="w-4 h-4 text-destructive" />;
      case "backup": return <Database className="w-4 h-4 text-destructive" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-md hover:bg-accent transition-colors">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">{t("notif.title")}</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={handleMarkAllRead}>
              <Check className="w-3 h-3 mr-1" />{t("notif.markRead")}
            </Button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("notif.noAlerts")}</p>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                onClick={() => { handleMarkRead(n.id); onNavigate(n.page); setOpen(false); }}
                className={`w-full text-left p-3 border-b last:border-0 hover:bg-accent/50 transition-colors flex items-start gap-2 ${n.read ? "opacity-50" : ""}`}
              >
                {icon(n.type)}
                <span className="text-sm flex-1">{n.message}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
