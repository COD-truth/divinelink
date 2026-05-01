import React, { useState, useEffect } from "react";
import { seedDatabase } from "@/lib/db";
import { initCrypto } from "@/lib/crypto";
import { migrateEncryption } from "@/lib/patientCrypto";
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

function AppContent() {
  const { user } = useAuth();
  const [page, setPage] = useState<Page>("dashboard");

  if (!user) return <LoginScreen />;

  const pages: Record<Page, React.ReactNode> = {
    dashboard: <DashboardPage />,
    patients: <PatientsPage />,
    appointments: <AppointmentsPage />,
    consultations: <ConsultationsPage />,
    documents: <DocumentsPage />,
    users: <UsersPage />,
    backup: <BackupPage />,
    audit: <AuditLogPage />,
    security: <SecurityPage />,
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
      await seedDatabase();
      await migrateEncryption();
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
