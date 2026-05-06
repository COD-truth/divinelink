import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { LangToggle } from "@/components/LangToggle";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, FileImage,
  UserCog, Database, LogOut, Menu, X, ChevronRight, ChevronDown, RefreshCw,
  ScrollText, ShieldCheck, BarChart3, PanelLeftClose, PanelLeftOpen,
  ClipboardList, LayoutGrid, Lock, Home,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { db, hashPin, type User, type UserRole } from "@/lib/db";
import { useIsMobile } from "@/hooks/use-mobile";

export type Page =
  | "dashboard" | "patients" | "appointments" | "consultations"
  | "documents" | "diagnosis" | "users" | "backup" | "audit"
  | "security" | "research";

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

interface NavItem { page: Page; icon: React.ReactNode; label: string; roles: string[]; }
interface NavGroup { id: string; label: string; items: NavItem[]; }

const COLLAPSE_KEY = "divinelink.sidebar.collapsed";

export function AppLayout({ currentPage, onNavigate, children }: Props) {
  const { user, logout, hasRole, login, lockNow, sessionExpiresAt } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const { t } = useLang();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    patients: true, tools: true, admin: true,
  });
  const [switchOpen, setSwitchOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [pickedUser, setPickedUser] = useState<User | null>(null);
  const [switchPin, setSwitchPin] = useState("");
  const [switchErr, setSwitchErr] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

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
      const ok = await login(switchPin);
      if (ok) setSwitchOpen(false); else setSwitchErr(true);
    } else setSwitchErr(true);
  };

  const roleBadgeClass = (r?: UserRole) =>
    r === "admin" ? "bg-destructive text-destructive-foreground"
    : r === "doctor" ? "bg-primary text-primary-foreground"
    : "bg-secondary text-secondary-foreground";

  const dashItem: NavItem = { page: "dashboard", icon: <LayoutDashboard className="w-5 h-5" />, label: t("nav.dashboard"), roles: ["admin", "doctor", "receptionist"] };

  const groups: NavGroup[] = [
    { id: "patients", label: t("nav.group.patients"), items: [
      { page: "patients", icon: <Users className="w-5 h-5" />, label: t("nav.patients"), roles: ["admin", "doctor", "receptionist"] },
      { page: "appointments", icon: <CalendarDays className="w-5 h-5" />, label: t("nav.appointments"), roles: ["admin", "doctor", "receptionist"] },
      { page: "consultations", icon: <ClipboardList className="w-5 h-5" />, label: t("nav.consultations"), roles: ["admin", "doctor"] },
    ]},
    { id: "tools", label: t("nav.group.tools"), items: [
      { page: "diagnosis", icon: <Stethoscope className="w-5 h-5" />, label: t("nav.diagnosis"), roles: ["admin", "doctor"] },
      { page: "documents", icon: <FileImage className="w-5 h-5" />, label: t("nav.documents"), roles: ["admin", "doctor"] },
      { page: "research", icon: <BarChart3 className="w-5 h-5" />, label: t("nav.research"), roles: ["admin", "doctor"] },
    ]},
    { id: "admin", label: t("nav.group.admin"), items: [
      { page: "users", icon: <UserCog className="w-5 h-5" />, label: t("nav.users"), roles: ["admin"] },
      { page: "backup", icon: <Database className="w-5 h-5" />, label: t("nav.backup"), roles: ["admin"] },
      { page: "security", icon: <ShieldCheck className="w-5 h-5" />, label: t("nav.security"), roles: ["admin"] },
      { page: "audit", icon: <ScrollText className="w-5 h-5" />, label: t("nav.audit"), roles: ["admin"] },
    ]},
  ];

  const visibleGroups = groups
    .map(g => ({ ...g, items: g.items.filter(i => hasRole(i.roles as any)) }))
    .filter(g => g.items.length > 0);

  const allItems = [dashItem, ...visibleGroups.flatMap(g => g.items)];
  const currentLabel = allItems.find(i => i.page === currentPage)?.label || "";

  const navigate = (p: Page) => {
    onNavigate(p);
    setSidebarOpen(false);
    import("@/lib/metrics").then(m => m.trackNav(p));
  };

  useEffect(() => { import("@/lib/metrics").then(m => m.trackNav(currentPage)); }, [currentPage]);

  const sidebarWidth = collapsed ? "w-[60px]" : "w-64";

  // ---- Mobile bottom-nav: fixed 4 items ----
  type BottomItem =
    | { kind: "page"; page: Page; icon: React.ReactNode; label: string }
    | { kind: "more"; icon: React.ReactNode; label: string };
  const bottomNav: BottomItem[] = [
    { kind: "page", page: "dashboard", icon: <Home className="w-[26px] h-[26px]" />, label: t("nav.home") },
    { kind: "page", page: "patients", icon: <Users className="w-[26px] h-[26px]" />, label: t("nav.patients") },
    { kind: "page", page: "appointments", icon: <CalendarDays className="w-[26px] h-[26px]" />, label: t("nav.agenda") },
    { kind: "more", icon: <LayoutGrid className="w-[26px] h-[26px]" />, label: t("nav.more") },
  ];

  const moreItems = [
    { page: "consultations" as Page, icon: <ClipboardList className="w-6 h-6" />, label: t("nav.consultations"), roles: ["admin", "doctor"] },
    { page: "diagnosis" as Page, icon: <Stethoscope className="w-6 h-6" />, label: t("nav.diagnosis"), roles: ["admin", "doctor"] },
    { page: "documents" as Page, icon: <FileImage className="w-6 h-6" />, label: t("nav.documents"), roles: ["admin", "doctor"] },
    { page: "research" as Page, icon: <BarChart3 className="w-6 h-6" />, label: t("nav.stats"), roles: ["admin", "doctor"] },
    { page: "users" as Page, icon: <UserCog className="w-6 h-6" />, label: t("nav.users"), roles: ["admin"] },
    { page: "backup" as Page, icon: <Database className="w-6 h-6" />, label: t("nav.backup"), roles: ["admin"] },
    { page: "security" as Page, icon: <ShieldCheck className="w-6 h-6" />, label: t("nav.security"), roles: ["admin"] },
    { page: "audit" as Page, icon: <ScrollText className="w-6 h-6" />, label: t("nav.audit"), roles: ["admin"] },
  ].filter(i => hasRole(i.roles as any));

  const remainingMs = sessionExpiresAt ? Math.max(0, sessionExpiresAt - Date.now()) : 0;
  const remainingMin = Math.ceil(remainingMs / 60000);

  return (
    <div className="min-h-screen flex">
      {/* Mobile drawer overlay */}
      {sidebarOpen && !isMobile && (
        <div className="fixed inset-0 bg-foreground/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar (desktop + tablet drawer) — hidden on phone */}
      {!isMobile && (
        <aside className={`fixed lg:static inset-y-0 left-0 z-50 ${sidebarWidth} bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
          <div className="p-3 flex items-center gap-2 border-b border-sidebar-border">
            <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
              <Stethoscope className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-sm truncate">DivineLink</h1>
                <p className="text-xs text-sidebar-foreground/60 truncate">{user?.name} • {user?.role}</p>
              </div>
            )}
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCollapsed(c => !c)}
              className="hidden lg:block text-sidebar-foreground/70 hover:text-sidebar-foreground"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          <nav className="flex-1 p-2 space-y-2 overflow-y-auto">
            {/* Dashboard always shown */}
            <NavBtn item={dashItem} currentPage={currentPage} collapsed={collapsed} onClick={navigate} />

            {visibleGroups.map(g => {
              const open = openGroups[g.id] ?? true;
              return (
                <div key={g.id} className="space-y-1">
                  {!collapsed && (
                    <button
                      onClick={() => setOpenGroups(s => ({ ...s, [g.id]: !open }))}
                      className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-bold tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground"
                    >
                      <span>{g.label}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
                    </button>
                  )}
                  {(collapsed || open) && g.items.map(item => (
                    <NavBtn key={item.page} item={item} currentPage={currentPage} collapsed={collapsed} onClick={navigate} />
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="p-2 border-t border-sidebar-border space-y-1">
            <Button variant="ghost" className={`w-full ${collapsed ? "justify-center px-0" : "justify-start gap-3"} text-sidebar-foreground hover:bg-sidebar-accent/50`} onClick={() => setSwitchOpen(true)} title={t("role.switchUser")}>
              <RefreshCw className="w-5 h-5" />
              {!collapsed && t("role.switchUser")}
            </Button>
            <Button variant="ghost" className={`w-full ${collapsed ? "justify-center px-0" : "justify-start gap-3"} text-sidebar-foreground hover:bg-sidebar-accent/50`} onClick={logout} title={t("auth.logout")}>
              <LogOut className="w-5 h-5" />
              {!collapsed && t("auth.logout")}
            </Button>
          </div>
        </aside>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center px-4 gap-3 bg-card no-print">
          {isMobile ? (
            <button onClick={() => setSidebarOpen(true)} aria-label="Menu">
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
              <Menu className="w-5 h-5" />
            </button>
          )}
          <h2 className="font-semibold text-base truncate">{currentLabel}</h2>
          <Badge
            className={
              user?.role === "admin"
                ? "bg-destructive text-destructive-foreground"
                : user?.role === "doctor"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }
          >
            {t(`role.${user?.role}`)}
          </Badge>
          <div className="flex-1 flex justify-end">
            <GlobalSearch onNavigate={onNavigate} />
          </div>
          <LangToggle />
        </header>

        <div className={`flex-1 p-4 md:p-6 overflow-auto animate-fade-in ${isMobile ? "pb-20" : ""}`}>
          {children}
        </div>
      </main>

      {/* Mobile drawer with full menu */}
      {isMobile && sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-foreground/40 z-40" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col">
            <div className="p-3 flex items-center gap-2 border-b border-sidebar-border">
              <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-sidebar-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-sm truncate">DivineLink</h1>
                <p className="text-xs text-sidebar-foreground/60 truncate">{user?.name}</p>
              </div>
              <button onClick={() => setSidebarOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <nav className="flex-1 p-2 overflow-y-auto space-y-2">
              <NavBtn item={dashItem} currentPage={currentPage} collapsed={false} onClick={navigate} />
              {visibleGroups.map(g => (
                <div key={g.id} className="space-y-1">
                  <p className="px-3 py-1 text-[10px] font-bold tracking-wider text-sidebar-foreground/50">{g.label}</p>
                  {g.items.map(item => (
                    <NavBtn key={item.page} item={item} currentPage={currentPage} collapsed={false} onClick={navigate} />
                  ))}
                </div>
              ))}
            </nav>
            <div className="p-2 border-t border-sidebar-border space-y-1">
              <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={() => { setSwitchOpen(true); setSidebarOpen(false); }}>
                <RefreshCw className="w-5 h-5" /> {t("role.switchUser")}
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={logout}>
                <LogOut className="w-5 h-5" /> {t("auth.logout")}
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-card border-t flex no-print">
          {mobileBottomItems.map(item => (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
                currentPage === item.page ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {item.icon}
              <span className="truncate max-w-full px-1">{item.label}</span>
            </button>
          ))}
        </nav>
      )}

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
                  {t("common.back")}
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

function NavBtn({ item, currentPage, collapsed, onClick }: {
  item: NavItem; currentPage: Page; collapsed: boolean; onClick: (p: Page) => void;
}) {
  const active = currentPage === item.page;
  return (
    <button
      onClick={() => onClick(item.page)}
      title={collapsed ? item.label : undefined}
      className={`w-full flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-lg text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "hover:bg-sidebar-accent/50"
      }`}
    >
      {item.icon}
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && active && <ChevronRight className="w-4 h-4 ml-auto" />}
    </button>
  );
}
