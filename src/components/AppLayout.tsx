import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { LangToggle } from "@/components/LangToggle";
import { GlobalSearch } from "@/components/GlobalSearch";
import { InstallPWAButton } from "@/components/InstallPWAButton";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, CalendarDays, Stethoscope, FileImage, UserCog, Database, LogOut, Menu, X, ChevronRight, ChevronDown, RefreshCw, ScrollText, ShieldCheck, ChartBar as BarChart3, PanelLeftClose, PanelLeftOpen, ClipboardList, LayoutGrid, Lock, Chrome as Home, Building2, Pill, Settings, Smile, Bell, BellRing, CreditCard, Package, Upload, GripVertical, ArrowUpDown, Check, AlertTriangle, BedDouble, MapPin, Warehouse, FlaskConical, Zap, TrendingUp, Baby } from "lucide-react";
import { AppGuide } from "@/components/AppGuide";
import { SyncStatus } from "@/components/SyncStatus";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { db, hashPin, type User, type UserRole } from "@/lib/db";
import { useIsMobile } from "@/hooks/use-mobile";
import { NotificationBell } from "@/components/NotificationBell";
import { isPushSupported, isSubscribed, enablePushNotifications, disablePushNotifications } from "@/lib/pushNotifications";
import { getClinicId } from "@/lib/clinicSettings";
import { toast } from "sonner";
import { getClinicPages } from "@/lib/clinicSettings";

export type Page =
  | "dashboard" | "patients" | "appointments" | "consultations"
  | "documents" | "diagnosis" | "users" | "backup" | "audit"
  | "security" | "research" | "clinic" | "pharmacy" | "payments" | "workspace" | "equipment"
  | "templates" | "importPatients" | "sync" | "conflicts" | "surveys" | "specialties"
  | "staff" | "myspace" | "docCategories" | "admissions" | "maternity"
  | "dentalExam" | "dentalQuote"
  | "minsante"
  | "expeditions"
  | "magasin"
  | "lab"
  | "massconsult"
  | "visit"
  | "profits";

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

interface NavItem { page: Page; icon: React.ReactNode; label: string; roles: string[]; }

const COLLAPSE_KEY = "divinelink.sidebar.collapsed";
const ADMIN_GROUP_KEY = "divinelink.sidebar.adminOpen";

export function AppLayout({ currentPage, onNavigate, children }: Props) {
  const { user, logout, hasRole, login, lockNow, sessionExpiresAt } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const { t, lang } = useLang();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(ADMIN_GROUP_KEY) || "{}"); } catch { return {}; }
  });
  const [switchOpen, setSwitchOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [pickedUser, setPickedUser] = useState<User | null>(null);
  const [switchPin, setSwitchPin] = useState("");
  const [switchErr, setSwitchErr] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [reorderMode, setReorderMode] = useState(false);
  const [navOrder, setNavOrder] = useState<Page[]>([]);
  const [draftOrder, setDraftOrder] = useState<Page[]>([]);
  const dragFromRef = React.useRef<number | null>(null);

  // Poll low-stock count for nav badge
  useEffect(() => {
    let stop = false;
    const refresh = async () => {
      try {
        const all = await db.equipmentItems.toArray();
        if (!stop) setLowStockCount(all.filter(i => i.stock <= i.lowStockThreshold).length);
      } catch { /* */ }
    };
    refresh();
    const id = setInterval(refresh, 60000);
    return () => { stop = true; clearInterval(id); };
  }, [currentPage]);


  const orderKey = `navOrder_${user?.id ?? "anon"}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(orderKey);
      if (raw) setNavOrder(JSON.parse(raw));
      else setNavOrder([]);
    } catch { setNavOrder([]); }
  }, [orderKey]);

  const applyOrder = (items: NavItem[], order: Page[]): NavItem[] => {
    if (!order.length) return items;
    const map = new Map(items.map(i => [i.page, i]));
    const ordered: NavItem[] = [];
    for (const p of order) {
      const it = map.get(p);
      if (it) { ordered.push(it); map.delete(p); }
    }
    return [...ordered, ...Array.from(map.values())];
  };

  // Check push subscription status on mount
  useEffect(() => {
    if (!isPushSupported()) return;
    isSubscribed().then(setPushEnabled);
  }, []);

  const togglePush = async () => {
    if (pushEnabled) {
      await disablePushNotifications();
      setPushEnabled(false);
      toast.success(t("push.disabled"));
    } else {
      const clinicId = getClinicId();
      const result = await enablePushNotifications(user?.id || 0, user?.name || "", clinicId);
      if (result.success) {
        setPushEnabled(true);
        toast.success(t("push.enabled"));
      } else {
        toast.error(result.error === "Permission denied or subscription failed"
          ? t("push.permissionDenied")
          : result.error === "Push notifications not supported in this browser"
          ? t("push.notSupported")
          : t("push.registerFailed"));
      }
    }
  };

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(ADMIN_GROUP_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  // Anti-exfiltration: block long-press/right-click menus (stops "save image" and
  // context-copy on sensitive records). Inputs keep normal text selection so the
  // staff can still type and edit.
  useEffect(() => {
    const blockCtx = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", blockCtx);
    const style = document.createElement("style");
    style.setAttribute("data-dl-guard", "1");
    style.textContent = "body{-webkit-user-select:none;user-select:none}input,textarea,[contenteditable='true']{-webkit-user-select:text;user-select:text}";
    document.head.appendChild(style);
    return () => { document.removeEventListener("contextmenu", blockCtx); style.remove(); };
  }, []);

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
    // login() verifies the PIN against the stored per-user salted hash.
    const ok = await login(switchPin);
    if (ok) setSwitchOpen(false); else setSwitchErr(true);
  };

  const roleBadgeClass = (r?: UserRole) =>
    r === "admin" ? "bg-destructive text-destructive-foreground"
    : r === "doctor" ? "bg-primary text-primary-foreground"
    : "bg-secondary text-secondary-foreground";

  // ── Grouped navigation (Hospital Management System structure) ──
  // Each group renders under its own header; ADMINISTRATION is collapsible.
  // Role + per-user permission filtering is applied at render via canAccess.
  interface NavGroup { key: string; title: string; collapsible?: boolean; items: NavItem[]; }
  const navGroups: NavGroup[] = [
    {
      key: "clinique", title: "Clinique",
      items: [
        { page: "dashboard", icon: <LayoutDashboard className="w-5 h-5" />, label: t("nav.dashboard"), roles: ["admin", "doctor", "receptionist"] },
        { page: "patients", icon: <Users className="w-5 h-5" />, label: t("nav.patients"), roles: ["admin", "doctor", "receptionist"] },
        { page: "appointments", icon: <CalendarDays className="w-5 h-5" />, label: t("nav.appointments"), roles: ["admin", "doctor", "receptionist"] },
        { page: "consultations", icon: <ClipboardList className="w-5 h-5" />, label: t("nav.consultations"), roles: ["admin", "doctor"] },
        { page: "dentalExam", icon: <Stethoscope className="w-5 h-5" />, label: lang === "en" ? "Dental exam" : "Examen dentaire", roles: ["admin", "doctor"] },
        { page: "dentalQuote", icon: <ClipboardList className="w-5 h-5" />, label: lang === "en" ? "Dental estimate" : "Devis dentaire", roles: ["admin", "doctor", "receptionist"] },
        { page: "diagnosis", icon: <Stethoscope className="w-5 h-5" />, label: t("nav.diagnostics"), roles: ["admin", "doctor"] },
        { page: "admissions", icon: <BedDouble className="w-5 h-5" />, label: t("nav.admissions"), roles: ["admin", "doctor", "receptionist"] },
        { page: "maternity", icon: <Baby className="w-5 h-5" />, label: "Maternité", roles: ["admin", "doctor", "receptionist"] },
        { page: "documents", icon: <FileImage className="w-5 h-5" />, label: t("nav.documents"), roles: ["admin", "doctor"] },
      ],
    },
    {
      key: "operations", title: "Pharmacie, Labo & Caisse",
      items: [
        { page: "magasin", icon: <Warehouse className="w-5 h-5" />, label: t("nav.magasin"), roles: ["admin", "doctor", "receptionist"] },
        { page: "pharmacy", icon: <Pill className="w-5 h-5" />, label: t("nav.pharmacy"), roles: ["admin", "doctor", "receptionist"] },
        { page: "lab", icon: <FlaskConical className="w-5 h-5" />, label: t("nav.lab"), roles: ["admin", "doctor"] },
        { page: "payments", icon: <CreditCard className="w-5 h-5" />, label: t("nav.payments"), roles: ["admin", "doctor", "receptionist"] },
        { page: "profits", icon: <TrendingUp className="w-5 h-5" />, label: lang === "en" ? "Profit & Back-fill" : "Bénéfices & Saisie", roles: ["admin", "doctor"] },
        { page: "equipment", icon: <Package className="w-5 h-5" />, label: t("nav.equipment"), roles: ["admin", "doctor"] },
      ],
    },
    {
      key: "field", title: "Terrain & Recherche", collapsible: true,
      items: [
        { page: "expeditions", icon: <MapPin className="w-5 h-5" />, label: t("nav.expeditions"), roles: ["admin", "doctor"] },
        { page: "massconsult", icon: <Zap className="w-5 h-5" />, label: t("nav.massconsult"), roles: ["admin", "doctor", "receptionist"] },
        { page: "visit", icon: <Stethoscope className="w-5 h-5" />, label: t("nav.visit"), roles: ["admin", "doctor", "receptionist"] },
        { page: "surveys", icon: <ClipboardList className="w-5 h-5" />, label: t("nav.surveys"), roles: ["admin", "doctor"] },
        { page: "research", icon: <BarChart3 className="w-5 h-5" />, label: t("nav.statistics"), roles: ["admin", "doctor"] },
        { page: "minsante", icon: <BarChart3 className="w-5 h-5" />, label: t("nav.minsante"), roles: ["admin"] },
      ],
    },
    {
      key: "personal", title: "Mon espace",
      items: [
        { page: "myspace", icon: <Lock className="w-5 h-5" />, label: t("nav.myspace"), roles: ["admin", "doctor", "receptionist"] },
      ],
    },
    {
      key: "admin", title: t("nav.group.admin"), collapsible: true,
      items: [
        { page: "users", icon: <UserCog className="w-5 h-5" />, label: t("nav.users"), roles: ["admin"] },
        { page: "staff", icon: <UserCog className="w-5 h-5" />, label: t("nav.staff"), roles: ["admin", "doctor", "receptionist"] },
        { page: "clinic", icon: <Building2 className="w-5 h-5" />, label: t("nav.clinic"), roles: ["admin"] },
        { page: "importPatients", icon: <Upload className="w-5 h-5" />, label: t("nav.importPatients"), roles: ["admin"] },
        { page: "security", icon: <ShieldCheck className="w-5 h-5" />, label: t("nav.security"), roles: ["admin"] },
        { page: "audit", icon: <ScrollText className="w-5 h-5" />, label: t("nav.audit"), roles: ["admin"] },
        { page: "backup", icon: <Database className="w-5 h-5" />, label: t("nav.backup"), roles: ["admin"] },
        { page: "sync", icon: <RefreshCw className="w-5 h-5" />, label: t("nav.sync"), roles: ["admin"] },
      ],
    },
  ];
  const allNavItems: NavItem[] = navGroups.flatMap(g => g.items);

  const userPerms = user?.permissions;
  const clinicPages = getClinicPages();
  const administrationPages = new Set<Page>(["users","staff","clinic","security","audit","backup","sync","importPatients"]);
  const allowedForSpecialty = (page: Page) => !clinicPages || clinicPages.includes(page) || administrationPages.has(page);
  const canAccess = (item: NavItem) => {
    if (!hasRole(item.roles as any) || !allowedForSpecialty(item.page)) return false;
    if (!userPerms || userPerms.length === 0) return true;
    return userPerms.includes(item.page);
  };
  // Visible groups: filter each group's items by role+permission, apply the
  // user's saved order within the group, drop empty groups.
  const visibleGroups = navGroups
    .map(g => ({ ...g, items: g.items.filter(canAccess) }))
    .filter(g => g.items.length > 0);
  const allItems = visibleGroups.flatMap(g => g.items);
  // Once the user has a custom order, the sidebar becomes ONE flat drag-anywhere
  // list across all groups (Lab can sit next to Pharmacy, etc.). Until then we
  // keep the tidy grouped layout with headers + collapsible admin.
  const useFlatNav = navOrder.length > 0;
  const flatItems = applyOrder(allItems, navOrder);
  const currentLabel = allItems.find(i => i.page === currentPage)?.label || "";

  const navigate = (p: Page) => {
    onNavigate(p);
    setSidebarOpen(false);
    import("@/lib/metrics").then(m => m.trackNav(p));
  };

  useEffect(() => { import("@/lib/metrics").then(m => m.trackNav(currentPage)); }, [currentPage]);

  const sidebarWidth = collapsed ? "w-[60px]" : "w-[220px]";

  // ---- Mobile bottom-nav: 5 items ----
  type BottomItem =
    | { kind: "page"; page: Page; icon: React.ReactNode; label: string }
    | { kind: "more"; icon: React.ReactNode; label: string };
  const bottomNav: BottomItem[] = [
    { kind: "page", page: "dashboard", icon: <Home className="w-6 h-6" />, label: t("nav.home") },
    { kind: "page", page: "patients", icon: <Users className="w-6 h-6" />, label: t("nav.patients") },
    { kind: "page", page: "appointments", icon: <CalendarDays className="w-6 h-6" />, label: t("nav.agenda") },
    { kind: "page", page: "consultations", icon: <ClipboardList className="w-6 h-6" />, label: t("nav.consultations") },
    { kind: "more", icon: <LayoutGrid className="w-6 h-6" />, label: t("nav.more") },
  ];

  // Mobile "More" sheet = every destination NOT already in the bottom bar,
  // role + permission filtered. Derived from the full grouped nav so no page
  // is ever unreachable on mobile (previously surveys, expeditions,
  // hospitalisation, mon espace, etc. had no mobile entry point).
  const bottomPages: Page[] = ["dashboard", "patients", "appointments", "consultations"];
  const moreItems = applyOrder(
    allNavItems.filter(i => !bottomPages.includes(i.page) && canAccess(i)),
    navOrder,
  );

  const remainingMs = sessionExpiresAt ? Math.max(0, sessionExpiresAt - Date.now()) : 0;
  const remainingMin = Math.ceil(remainingMs / 60000);

  // Reorder helpers
  const startReorder = () => {
    // Seed from the current visible order (flat list honoring any saved order)
    // so editing preserves what the user already arranged.
    const combined = (useFlatNav ? flatItems : allItems).map(i => i.page);
    setDraftOrder(combined);
    setReorderMode(true);
  };
  const saveReorder = () => {
    setNavOrder(draftOrder);
    try { localStorage.setItem(orderKey, JSON.stringify(draftOrder)); } catch { /* */ }
    setReorderMode(false);
  };
  const cancelReorder = () => { setReorderMode(false); setDraftOrder([]); };

  const onDragStart = (i: number) => () => { dragFromRef.current = i; };
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragFromRef.current;
    if (from == null || from === i) return;
    setDraftOrder(prev => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(i, 0, m);
      dragFromRef.current = i;
      return next;
    });
  };
  const onDragEnd = () => { dragFromRef.current = null; };

  const renderReorderList = () => {
    const all = allItems;
    const byPage = new Map(all.map(i => [i.page, i]));
    return (
      <div className="space-y-1">
        {draftOrder.map((p, i) => {
          const it = byPage.get(p);
          if (!it) return null;
          return (
            <div
              key={p}
              draggable
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver(i)}
              onDragEnd={onDragEnd}
              className="flex items-center gap-2 px-2 py-2 rounded bg-sidebar-accent/40 cursor-move text-sm"
            >
              <GripVertical className="w-4 h-4 text-sidebar-foreground/50" />
              {it.icon}
              <span className="truncate">{it.label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSidebarNav = (isCollapsed: boolean) => (
    <>
      {reorderMode && !isCollapsed ? (
        <>
          {renderReorderList()}
          <div className="flex gap-2 pt-2">
            <Button size="sm" className="flex-1 gap-1" onClick={saveReorder}>
              <Check className="w-3 h-3" /> {t("nav.reorderSave")}
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={cancelReorder}>
              {t("common.cancel")}
            </Button>
          </div>
        </>
      ) : useFlatNav ? (
        <>
          {/* Flat nav — user has a custom order; render one drag-anywhere list,
              no group headers, in the saved order across all groups. */}
          {flatItems.map(item => (
            <NavBtn
              key={item.page}
              item={item}
              currentPage={currentPage}
              collapsed={isCollapsed}
              onClick={navigate}
              badgeCount={item.page === "equipment" ? lowStockCount : undefined}
            />
          ))}
          {!isCollapsed && (
            <button
              onClick={startReorder}
              className="w-full mt-3 pt-2 border-t border-sidebar-border/50 flex items-center gap-2 px-3 py-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground/90 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {t("nav.reorder")}
            </button>
          )}
        </>
      ) : (
        <>
          {/* Grouped nav — each group under its own header; admin collapsible */}
          {visibleGroups.map((group, gi) => {
            const isAdminGroup = !!group.collapsible;
            const open = !isAdminGroup || isCollapsed || !!openGroups[group.key];
            return (
              <div
                key={group.key}
                className={isAdminGroup ? "mt-2 pt-2 border-t border-sidebar-border/50" : gi === 0 ? "" : "mt-2"}
              >
                {!isCollapsed && (
                  isAdminGroup ? (
                    <button
                      onClick={() => setOpenGroups(g => ({ ...g, [group.key]: !g[group.key] }))}
                      className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-bold tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
                    >
                      <span className="flex items-center gap-1.5"><Settings className="w-3 h-3" />{group.title}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${openGroups[group.key] ? "" : "-rotate-90"}`} />
                    </button>
                  ) : (
                    <div className="px-3 pt-1 pb-0.5 text-[10px] font-bold tracking-wider text-sidebar-foreground/40 uppercase">
                      {group.title}
                    </div>
                  )
                )}
                {open && group.items.map(item => (
                  <NavBtn
                    key={item.page}
                    item={item}
                    currentPage={currentPage}
                    collapsed={isCollapsed}
                    onClick={navigate}
                    muted={isAdminGroup}
                    badgeCount={item.page === "equipment" ? lowStockCount : undefined}
                  />
                ))}
              </div>
            );
          })}

          {/* Reorder trigger — bottom of sidebar nav, expanded only */}
          {!isCollapsed && (
            <button
              onClick={startReorder}
              className="w-full mt-3 pt-2 border-t border-sidebar-border/50 flex items-center gap-2 px-3 py-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground/90 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {t("nav.reorder")}
            </button>
          )}
        </>
      )}
    </>
  );

  // Traceability watermark stamp (user + time), refreshes with the 30s tick.
  const wmStamp = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="min-h-screen bg-background">
      {/* Traceability watermark over everything (incl. dialogs) — any screenshot
          carries who viewed it and when. pointer-events-none = non-blocking. */}
      {user && (
        <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden select-none no-print" aria-hidden="true">
          <div className="absolute -inset-1/3 flex flex-wrap gap-x-14 gap-y-9 rotate-[-28deg] opacity-[0.06]">
            {Array.from({ length: 140 }).map((_, i) => (
              <span key={i} className="text-[11px] font-semibold whitespace-nowrap text-foreground">{user.name} · {wmStamp}</span>
            ))}
          </div>
        </div>
      )}
      {/* ── Desktop sidebar: fixed, full height, never scrolls with content ── */}
      {!isMobile && (
        <>
          {/* Overlay for tablet (below lg) when drawer is open */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-foreground/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          )}

          <aside
            className={`
              fixed top-0 left-0 z-50 h-screen
              ${sidebarWidth}
              bg-sidebar text-sidebar-foreground
              flex flex-col
              transition-all duration-300
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            `}
          >
            {/* Logo / brand */}
            <div className="p-3 flex items-center gap-2 border-b border-sidebar-border flex-shrink-0">
              <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
                <Stethoscope className="w-5 h-5 text-sidebar-primary-foreground" />
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <h1 className="font-bold text-sm truncate">DivineLink</h1>
                  <p className="text-xs text-sidebar-foreground/60 truncate">{user?.name} &bull; {user?.role}</p>
                </div>
              )}
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCollapsed(c => !c)}
                className="hidden lg:block text-sidebar-foreground/70 hover:text-sidebar-foreground flex-shrink-0"
                title={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </div>

            {/* Nav — scrollable within the sidebar */}
            <nav className="flex-1 p-2 space-y-1 overflow-y-auto min-h-0">
              {renderSidebarNav(collapsed)}
            </nav>

            {/* Bottom actions — always visible */}
            <div className="p-2 border-t border-sidebar-border space-y-1 flex-shrink-0">
              <Button
                variant="ghost"
                className={`w-full ${collapsed ? "justify-center px-0" : "justify-start gap-3"} text-sidebar-foreground hover:bg-sidebar-accent/50`}
                onClick={() => setSwitchOpen(true)}
                title={t("role.switchUser")}
              >
                <RefreshCw className="w-5 h-5" />
                {!collapsed && t("role.switchUser")}
              </Button>
              <Button
                variant="ghost"
                className={`w-full ${collapsed ? "justify-center px-0" : "justify-start gap-3"} text-sidebar-foreground hover:bg-sidebar-accent/50`}
                onClick={logout}
                title={t("auth.logout")}
              >
                <LogOut className="w-5 h-5" />
                {!collapsed && t("auth.logout")}
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* ── Main area: offset by sidebar width on desktop ── */}
      <div
        className={`flex flex-col h-[100dvh] transition-[padding] duration-300 ${
          !isMobile ? (collapsed ? "lg:pl-[60px]" : "lg:pl-[220px]") : ""
        }`}
      >
        {/* ── Top header: sticky, never scrolls away ── */}
        <header className="sticky top-0 z-30 h-14 border-b flex items-center px-4 gap-3 bg-card no-print flex-shrink-0">
          {/* Hamburger — mobile opens drawer, tablet opens sidebar */}
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu"
            className={isMobile ? "block" : "lg:hidden"}
          >
            <Menu className="w-5 h-5" />
          </button>

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

          <div className="flex-1 flex justify-end items-center gap-2">
            <SyncStatus />
            <GlobalSearch onNavigate={onNavigate} />
          </div>

          <Button variant="ghost" size="icon" onClick={() => window.location.reload()} title="Actualiser">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <NotificationBell onNavigate={onNavigate} />

          {isPushSupported() && (
            <button
              onClick={togglePush}
              className={`relative p-2 rounded-md hover:bg-accent transition-colors ${pushEnabled ? "text-primary" : "text-muted-foreground"}`}
              title={pushEnabled ? t("push.disable") : t("push.enable")}
            >
              {pushEnabled ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
            </button>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent"
                title={t("session.locksIn")}
              >
                <Lock className="w-4 h-4" />
                {sessionExpiresAt && <span className="hidden sm:inline">{remainingMin}m</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end">
              <p className="text-sm font-medium">{t("session.locksIn")}</p>
              <p className="text-2xl font-bold mt-1">{remainingMin} min</p>
              <Button size="sm" variant="outline" className="w-full mt-3" onClick={lockNow}>
                <Lock className="w-4 h-4 mr-2" />{t("session.lockNow")}
              </Button>
            </PopoverContent>
          </Popover>

          <InstallPWAButton />
          <LangToggle />
        </header>

        {/* ── Page content: the ONLY thing that scrolls ── */}
        <main className={`flex-1 p-4 md:p-6 overflow-auto animate-fade-in ${isMobile ? "pb-40" : ""}`}>
          {children}
        </main>
      </div>

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
            <nav className="flex-1 p-2 overflow-y-auto space-y-1">
              {renderSidebarNav(false)}
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

      {/* Mobile bottom nav (5 items) */}
      {isMobile && (
        <nav
          className="fixed bottom-0 inset-x-0 z-30 bg-card flex no-print"
          style={{ height: 65, boxShadow: "0 -4px 12px hsl(var(--foreground) / 0.08)" }}
        >
          {bottomNav.map((item, idx) => {
            const isActive = item.kind === "page"
              ? currentPage === item.page
              : moreItems.some(m => m.page === currentPage);
            return (
              <button
                key={idx}
                onClick={() => item.kind === "page" ? onNavigate(item.page) : setMoreOpen(true)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.icon}
                <span className="truncate max-w-full px-0.5">{item.label}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-primary" />}
              </button>
            );
          })}
        </nav>
      )}

      {/* More sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("nav.more")}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 mt-4 pb-4">
            {moreItems.map(m => (
              <button
                key={m.page}
                onClick={() => { onNavigate(m.page); setMoreOpen(false); }}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border active:scale-95 transition-transform ${
                  currentPage === m.page ? "border-primary bg-primary/5 text-primary" : "bg-card"
                }`}
              >
                {m.icon}
                <span className="text-xs font-medium text-center">{m.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

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
      <AppGuide />
    </div>
  );
}

function NavBtn({ item, currentPage, collapsed, onClick, muted, badgeCount }: {
  item: NavItem; currentPage: Page; collapsed: boolean; onClick: (p: Page) => void; muted?: boolean; badgeCount?: number;
}) {
  const active = currentPage === item.page;
  return (
    <button
      onClick={() => onClick(item.page)}
      title={collapsed ? item.label : undefined}
      className={`w-full flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-lg text-sm transition-colors relative ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : muted
            ? "text-sidebar-foreground/50 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground/80"
            : "hover:bg-sidebar-accent/50"
      }`}
    >
      <span className="relative">
        {item.icon}
        {badgeCount && badgeCount > 0 && collapsed ? (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center">{badgeCount > 99 ? "99+" : badgeCount}</span>
        ) : null}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badgeCount && badgeCount > 0 ? (
        <span className="ml-auto bg-red-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{badgeCount > 99 ? "99+" : badgeCount}</span>
      ) : null}
      {!collapsed && active && !badgeCount && <ChevronRight className="w-4 h-4 ml-auto" />}
    </button>

  );
}
