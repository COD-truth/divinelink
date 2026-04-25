import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { LangToggle } from "@/components/LangToggle";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, FileImage,
  UserCog, Database, LogOut, Menu, X, ChevronRight, RefreshCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { db, hashPin, type User, type UserRole } from "@/lib/db";
import { toast } from "sonner";

export type Page = "dashboard" | "patients" | "appointments" | "consultations" | "documents" | "users" | "backup";

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

export function AppLayout({ currentPage, onNavigate, children }: Props) {
  const { user, logout, hasRole, login } = useAuth();
  const { t } = useLang();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [pickedUser, setPickedUser] = useState<User | null>(null);
  const [switchPin, setSwitchPin] = useState("");
  const [switchErr, setSwitchErr] = useState(false);

  useEffect(() => {
    if (switchOpen) {
      db.users.toArray().then(all => setUsers(all.filter(u => u.active !== false)));
      setPickedUser(null);
      setSwitchPin("");
      setSwitchErr(false);
    }
  }, [switchOpen]);

  const handleSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickedUser) return;
    const expected = await hashPin(switchPin);
    if (expected === pickedUser.pinHash) {
      // Re-login with this PIN
      const ok = await login(switchPin);
      if (ok) {
        setSwitchOpen(false);
      } else {
        setSwitchErr(true);
      }
    } else {
      setSwitchErr(true);
    }
  };

  const roleBadgeClass = (r?: UserRole) =>
    r === "admin" ? "bg-destructive text-destructive-foreground"
    : r === "doctor" ? "bg-primary text-primary-foreground"
    : "bg-secondary text-secondary-foreground";

  const navItems: { page: Page; icon: React.ReactNode; label: string; roles: string[] }[] = [
    { page: "dashboard", icon: <LayoutDashboard className="w-5 h-5" />, label: t("nav.dashboard"), roles: ["admin", "doctor", "receptionist"] },
    { page: "patients", icon: <Users className="w-5 h-5" />, label: t("nav.patients"), roles: ["admin", "doctor", "receptionist"] },
    { page: "appointments", icon: <CalendarDays className="w-5 h-5" />, label: t("nav.appointments"), roles: ["admin", "doctor", "receptionist"] },
    { page: "consultations", icon: <Stethoscope className="w-5 h-5" />, label: t("nav.consultations"), roles: ["admin", "doctor"] },
    { page: "documents", icon: <FileImage className="w-5 h-5" />, label: t("nav.documents"), roles: ["admin", "doctor"] },
    { page: "users", icon: <UserCog className="w-5 h-5" />, label: t("nav.users"), roles: ["admin"] },
    { page: "backup", icon: <Database className="w-5 h-5" />, label: t("nav.backup"), roles: ["admin"] },
  ];

  const visibleItems = navItems.filter(item => hasRole(item.roles as any));

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate">DivineLink</h1>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user?.name} • {user?.role}</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleItems.map(item => (
            <button
              key={item.page}
              onClick={() => { onNavigate(item.page); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                currentPage === item.page
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-sidebar-accent/50"
              }`}
            >
              {item.icon}
              {item.label}
              {currentPage === item.page && <ChevronRight className="w-4 h-4 ml-auto" />}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={logout}>
            <LogOut className="w-5 h-5" />
            {t("auth.logout")}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center px-4 gap-3 bg-card no-print">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-lg hidden md:block">
            {visibleItems.find(i => i.page === currentPage)?.label}
          </h2>
          <Badge
            className={
              user?.role === "admin"
                ? "bg-destructive text-destructive-foreground"
                : user?.role === "doctor"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }
            title={t("role.loggedInAs") + " " + (user?.name || "")}
          >
            {t(`role.${user?.role}`)}
          </Badge>
          <div className="flex-1 flex justify-center md:justify-end">
            <GlobalSearch onNavigate={onNavigate} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSwitchOpen(true)}
            title={t("role.switchUser")}
            aria-label={t("role.switchUser")}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <LangToggle />
        </header>
        <div className="flex-1 p-4 md:p-6 overflow-auto animate-fade-in">
          {children}
        </div>
      </main>

      {/* Switch account dialog */}
      <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("role.switchUser")}</DialogTitle>
          </DialogHeader>
          {!pickedUser ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setPickedUser(u); setSwitchPin(""); setSwitchErr(false); }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCog className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{u.name}</p>
                  </div>
                  <Badge className={roleBadgeClass(u.role)}>{t(`role.${u.role}`)}</Badge>
                </button>
              ))}
              <Button variant="outline" className="w-full mt-2" onClick={() => { setSwitchOpen(false); logout(); }}>
                <LogOut className="w-4 h-4 mr-2" />{t("auth.logout")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSwitch} className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">{pickedUser.name}</p>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={switchPin}
                onChange={e => { setSwitchPin(e.target.value.replace(/\D/g, "")); setSwitchErr(false); }}
                placeholder={t("auth.pin")}
                className="text-center text-xl tracking-[0.4em] h-12"
                autoFocus
              />
              {switchErr && <p className="text-destructive text-sm text-center">{t("auth.error")}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setPickedUser(null)}>
                  {t("common.back") || "Back"}
                </Button>
                <Button type="submit" className="flex-1" disabled={switchPin.length < 4}>
                  {t("auth.login")}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
