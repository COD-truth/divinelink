import React, { lazy, Suspense, useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LangProvider } from "@/contexts/LangContext";
import { LoginScreen } from "@/components/LoginScreen";
import { DashboardPage } from "@/components/DashboardPage";
import { ClinicOnboarding } from "@/components/ClinicOnboarding";
import { AppLayout, type Page } from "@/components/AppLayout";
import { isClinicConfigured } from "@/lib/clinicSettings";

const PatientsPage = lazy(() => import("@/components/PatientsPage").then(m => ({ default: m.PatientsPage })));
const AgendaPage = lazy(() => import("@/components/AgendaPage").then(m => ({ default: m.AgendaPage })));
const ConsultationsPage = lazy(() => import("@/components/ConsultationsPage").then(m => ({ default: m.ConsultationsPage })));
const DocumentsPage = lazy(() => import("@/components/DocumentsPage").then(m => ({ default: m.DocumentsPage })));
const DiagnosisPage = lazy(() => import("@/components/DiagnosisPage").then(m => ({ default: m.DiagnosisPage })));
const ResearchPage = lazy(() => import("@/components/ResearchPage").then(m => ({ default: m.ResearchPage })));
const PharmacyPage = lazy(() => import("@/components/PharmacyPage").then(m => ({ default: m.PharmacyPage })));
const DentalExamPage = lazy(() => import("@/components/DentalExamPage").then(m => ({ default: m.DentalExamPage })));
const UsersPage = lazy(() => import("@/components/UsersPage").then(m => ({ default: m.UsersPage })));
const BackupPage = lazy(() => import("@/components/BackupPage").then(m => ({ default: m.BackupPage })));
const AuditLogPage = lazy(() => import("@/components/AuditLogPage").then(m => ({ default: m.AuditLogPage })));
const SecurityPage = lazy(() => import("@/components/SecurityPage").then(m => ({ default: m.SecurityPage })));
const ClinicSettingsPage = lazy(() => import("@/components/ClinicSettingsPage").then(m => ({ default: m.ClinicSettingsPage })));
const WorkspacePage = lazy(() => import("@/components/WorkspacePage").then(m => ({ default: m.WorkspacePage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { user } = useAuth();
  const [page, setPage] = useState<Page>("dashboard");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user && !isClinicConfigured()) setShowOnboarding(true);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Defer smart notifications — they don't need to block render
    const timer = setTimeout(() => {
      import("@/lib/smartNotifications").then(m => m.initSmartNotifications(user.name));
    }, 3000);
    return () => {
      clearTimeout(timer);
      import("@/lib/smartNotifications").then(m => m.stopSmartNotifications());
    };
  }, [user]);

  // Check for missed reminders — deferred
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(async () => {
      try {
        const { db } = await import("@/lib/db");
        const { toast } = await import("sonner");
        const now = new Date().toISOString().split("T")[0];
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
        const appointments = await db.appointments.toArray();
        const missed = appointments.filter(a => a.date >= twoDaysAgo && a.date < now && a.status === "scheduled");
        if (missed.length > 0) {
          toast.warning(`${missed.length} rendez-vous manqu(s) — consultez les rappels`, { duration: 8000 });
        }
      } catch {}
    }, 5000);
    return () => clearTimeout(timer);
  }, [user]);

  if (!user) return <LoginScreen />;

  const pages: Record<Page, React.ReactNode> = {
    dashboard: <DashboardPage onNavigate={setPage} />,
    patients: <Suspense fallback={<PageLoader />}><PatientsPage /></Suspense>,
    appointments: <Suspense fallback={<PageLoader />}><AgendaPage /></Suspense>,
    consultations: <Suspense fallback={<PageLoader />}><ConsultationsPage /></Suspense>,
    documents: <Suspense fallback={<PageLoader />}><DocumentsPage /></Suspense>,
    diagnosis: <Suspense fallback={<PageLoader />}><DiagnosisPage /></Suspense>,
    users: <Suspense fallback={<PageLoader />}><UsersPage /></Suspense>,
    backup: <Suspense fallback={<PageLoader />}><BackupPage /></Suspense>,
    audit: <Suspense fallback={<PageLoader />}><AuditLogPage /></Suspense>,
    security: <Suspense fallback={<PageLoader />}><SecurityPage /></Suspense>,
    research: <Suspense fallback={<PageLoader />}><ResearchPage /></Suspense>,
    clinic: <Suspense fallback={<PageLoader />}><ClinicSettingsPage /></Suspense>,
    pharmacy: <Suspense fallback={<PageLoader />}><PharmacyPage /></Suspense>,
    dental: <Suspense fallback={<PageLoader />}><DentalExamPage /></Suspense>,
    workspace: <Suspense fallback={<PageLoader />}><WorkspacePage /></Suspense>,
  };

  return (
    <>
      <AppLayout currentPage={page} onNavigate={setPage}>
        {pages[page]}
      </AppLayout>
      <ClinicOnboarding open={showOnboarding} onDone={() => setShowOnboarding(false)} />
    </>
  );
}

const Index = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      // Phase 1: Critical — crypto + DB (must complete before auth can work)
      const { initCrypto } = await import("@/lib/crypto");
      const { seedDatabase } = await import("@/lib/db");
      await initCrypto();

      // Phase 2: Recovery check (fast if DB has data)
      const { autoRestoreIfNeeded } = await import("@/lib/emergencyBackup");
      await autoRestoreIfNeeded();

      // Phase 3: Seed (only runs if no users exist)
      await seedDatabase();

      // Phase 4: Non-blocking — let the app render NOW
      setReady(true);

      // Phase 5: Background tasks after first paint
      requestIdleCallback(async () => {
        const { migrateEncryption } = await import("@/lib/patientCrypto");
        await migrateEncryption();

        const { installAutoSnapshotHooks, scheduleSnapshot } = await import("@/lib/emergencyBackup");
        installAutoSnapshotHooks();
        scheduleSnapshot();

        const { requestNotificationPermission } = await import("@/lib/smartNotifications");
        requestNotificationPermission();
      });
    })();
  }, []);

  if (!ready) return <StartupSplash />;

  return (
    <LangProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LangProvider>
  );
};

function StartupSplash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-amber-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-teal-600 flex items-center justify-center shadow-lg">
          <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.8 2.3A2 2 0 0 0 3 4.2V5a17 17 0 0 0 18 0v-.8A2 2 0 0 0 19.2 2.3" />
            <path d="M3 5v4a17 17 0 0 0 14 7.5" />
            <path d="M21 5v4a17 17 0 0 1-7 5.3" />
            <path d="M3 15v1a6 6 0 0 0 6 6h0" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">DivineLink</h1>
        <div className="w-6 h-6 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

export default Index;
