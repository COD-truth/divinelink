import React, { useEffect, useState } from "react";
import { db, type Patient } from "@/lib/db";
import { decryptPatients } from "@/lib/patientCrypto";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card } from "@/components/ui/card";
import {
  Users, CalendarDays, Stethoscope, Clock,
  UserPlus, ClipboardPlus, CalendarPlus, Search, UserRound,
} from "lucide-react";
import type { Page } from "@/components/AppLayout";

interface Props { onNavigate?: (page: Page) => void; }

export function DashboardPage({ onNavigate }: Props) {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const [stats, setStats] = useState({ patients: 0, todayAppts: 0, weekAppts: 0, consultations: 0 });
  const [recent, setRecent] = useState<Patient[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().split("T")[0];
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const [patients, todayAppts, weekAppts, consultations, recentRaw] = await Promise.all([
        db.patients.count(),
        db.appointments.where("date").equals(today).count(),
        db.appointments.where("date")
          .between(weekStart.toISOString().split("T")[0], weekEnd.toISOString().split("T")[0], true, true)
          .count(),
        db.consultations.count(),
        db.patients.orderBy("id").reverse().limit(3).toArray(),
      ]);
      setStats({ patients, todayAppts, weekAppts, consultations });
      setRecent(await decryptPatients(recentRaw));
    })();
  }, []);

  const calcAge = (dob: string) => {
    if (!dob) return "—";
    const d = new Date(dob);
    if (isNaN(d.getTime())) return "—";
    const diff = Date.now() - d.getTime();
    return String(Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  const cards = [
    { title: t("dash.totalPatients"), value: stats.patients, icon: Users, bg: "bg-primary/10", fg: "text-primary" },
    { title: t("dash.todayAppts"), value: stats.todayAppts, icon: CalendarDays, bg: "bg-secondary/15", fg: "text-secondary" },
    { title: t("dash.thisWeek"), value: stats.weekAppts, icon: Clock, bg: "bg-info/10", fg: "text-info" },
    { title: t("nav.consultations"), value: stats.consultations, icon: Stethoscope, bg: "bg-success/10", fg: "text-success" },
  ];

  const actions = [
    { label: t("dash.newPatient"), icon: UserPlus, page: "patients" as Page, bg: "bg-primary", fg: "text-primary-foreground" },
    { label: t("dash.newConsult"), icon: ClipboardPlus, page: "consultations" as Page, bg: "bg-success", fg: "text-success-foreground" },
    { label: t("dash.newAppt"), icon: CalendarPlus, page: "appointments" as Page, bg: "bg-info", fg: "text-info-foreground" },
    { label: t("dash.searchAction"), icon: Search, page: "patients" as Page, bg: "bg-muted", fg: "text-foreground" },
  ];

  return (
    <div className="-m-4 md:-m-6">
      {/* Gradient header */}
      <div
        className="px-5 pt-5 pb-6 text-primary-foreground"
        style={{
          background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.75) 100%)",
          minHeight: 140,
        }}
      >
        <p className="text-xs opacity-80">{t("dash.welcome")}</p>
        <h1 className="text-2xl font-bold mt-1">{user?.name} 👋</h1>
        <p className="text-xs opacity-80 mt-1">
          {new Date().toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="bg-background px-4 py-4 space-y-5">
        {/* Stats 2x2 */}
        <div className="grid grid-cols-2 gap-3 -mt-10">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <Card key={i} className="p-3 flex flex-col justify-between" style={{ minHeight: 90, maxHeight: 100 }}>
                <div className="flex items-start justify-between">
                  <p className="text-3xl font-bold leading-none">{c.value}</p>
                  <div className={`w-8 h-8 rounded-lg ${c.bg} ${c.fg} flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">{c.title}</p>
              </Card>
            );
          })}
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-semibold mb-2">{t("dash.quickActions")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {actions.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={i}
                  onClick={() => onNavigate?.(a.page)}
                  className={`${a.bg} ${a.fg} rounded-xl aspect-square flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-sm`}
                >
                  <Icon className="w-7 h-7" />
                  <span className="text-xs font-medium text-center px-2 leading-tight">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent patients */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">{t("dash.recentPatients")}</h2>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <UserRound className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">{t("dash.noPatients")}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map(p => (
                <li
                  key={p.id}
                  className="py-2 flex items-center gap-3 active:bg-accent/50 -mx-2 px-2 rounded"
                  onClick={() => onNavigate?.("patients")}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                    {p.firstName.charAt(0)}{p.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-muted-foreground">
                      {calcAge(p.dob)} • {t("dash.lastVisit")}: {fmtDate(p.updatedAt || p.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
