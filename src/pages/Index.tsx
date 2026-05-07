import React, { useState, useEffect } from "react";
import { seedDatabase } from "@/lib/db";
import { initCrypto } from "@/lib/crypto";
import { migrateEncryption } from "@/lib/patientCrypto";
import { autoRestoreIfNeeded, installAutoSnapshotHooks, scheduleSnapshot } from "@/lib/emergencyBackup";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LangProvider } from "@/contexts/LangContext";
import { LoginScreen } from "@/components/LoginScreen";
import { AppLayout, type Page } from "@/components/AppLayout";
import { DashboardPage } from "@/components/DashboardPage";
import { PatientsPage } from "@/components/PatientsPage";
import { AppointmentsPage } from "@/components/AppointmentsPage";
import { ConsultationsPage } from "@/components/ConsultationsPage";
import { DocumentsPage } from "@/components/DocumentsPage";
import { UsersPage } from "@/components/UsersPage";
import { BackupPage } from "@/components/BackupPage";
import { AuditLogPage } from "@/components/AuditLogPage";
import { SecurityPage } from "@/components/SecurityPage";
import { ResearchPage } from "@/components/ResearchPage";
import { DiagnosisPage } from "@/components/DiagnosisPage";
import { ClinicSettingsPage } from "@/components/ClinicSettingsPage";
import { ClinicOnboarding } from "@/components/ClinicOnboarding";
import { isClinicConfigured } from "@/lib/clinicSettings";

function AppContent() {
  const { user } = useAuth();
  const [page, setPage] = useState<Page>("dashboard");

  if (!user) return <LoginScreen />;

  const pages: Record<Page, React.ReactNode> = {
    dashboard: <DashboardPage onNavigate={setPage} />,
    patients: <PatientsPage />,
    appointments: <AppointmentsPage />,
    consultations: <ConsultationsPage />,
    documents: <DocumentsPage />,
    diagnosis: <DiagnosisPage />,
    users: <UsersPage />,
    backup: <BackupPage />,
    audit: <AuditLogPage />,
    security: <SecurityPage />,
    research: <ResearchPage />,
    clinic: <ClinicSettingsPage />,
  };

  return (
    <AppLayout currentPage={page} onNavigate={setPage}>
      {pages[page]}
    </AppLayout>
  );
}

const Index = () => {
  useEffect(() => {
    (async () => {
      await initCrypto();
      // Try silent restore BEFORE seeding so we don't overwrite a recovered admin.
      await autoRestoreIfNeeded();
      await seedDatabase();
      await migrateEncryption();
      installAutoSnapshotHooks();
      // Take an initial snapshot once everything is ready.
      scheduleSnapshot();
    })();
  }, []);

  return (
    <LangProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LangProvider>
  );
};

export default Index;
