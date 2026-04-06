import React, { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarDays, Stethoscope, Clock } from "lucide-react";

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [stats, setStats] = useState({ patients: 0, todayAppts: 0, weekAppts: 0, consultations: 0 });

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().split("T")[0];
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const patients = await db.patients.count();
      const todayAppts = await db.appointments.where("date").equals(today).count();
      const weekAppts = await db.appointments
        .where("date")
        .between(weekStart.toISOString().split("T")[0], weekEnd.toISOString().split("T")[0], true, true)
        .count();
      const consultations = await db.consultations.count();

      setStats({ patients, todayAppts, weekAppts, consultations });
    })();
  }, []);

  const cards = [
    { title: t("dash.totalPatients"), value: stats.patients, icon: <Users className="w-5 h-5" />, color: "bg-primary" },
    { title: t("dash.todayAppts"), value: stats.todayAppts, icon: <CalendarDays className="w-5 h-5" />, color: "bg-secondary" },
    { title: t("dash.thisWeek"), value: stats.weekAppts, icon: <Clock className="w-5 h-5" />, color: "bg-info" },
    { title: t("nav.consultations"), value: stats.consultations, icon: <Stethoscope className="w-5 h-5" />, color: "bg-success" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("dash.welcome")}, {user?.name} 👋</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <Card key={i} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <div className={`w-9 h-9 rounded-lg ${c.color} flex items-center justify-center text-primary-foreground`}>
                {c.icon}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
