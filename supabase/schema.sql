-- ============================================================
-- DivineLink – Supabase cloud sync schema
-- Each table mirrors the local IndexedDB tables.
-- Composite PK: _pk = clinicId_localId
-- RLS is enabled; policy uses app.clinic_id session variable.
-- ============================================================

-- ─── patients ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  _pk          TEXT PRIMARY KEY,
  _clinic_id   TEXT NOT NULL,
  _local_id    INTEGER NOT NULL,

  "patientId"  TEXT,
  "anonCode"   TEXT,
  "firstName"  TEXT,
  "lastName"   TEXT,
  phone        TEXT,
  dob          TEXT,
  "ageYears"   NUMERIC,
  address      TEXT,
  "medicalAlerts" TEXT,
  photo        TEXT,
  antecedents  JSONB,
  "clinicId"   TEXT,
  "createdAt"  TEXT,
  "updatedAt"  TEXT
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY patients_clinic ON patients
  FOR ALL USING (_clinic_id = current_setting('app.clinic_id', true));

-- ─── consultations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultations (
  _pk              TEXT PRIMARY KEY,
  _clinic_id       TEXT NOT NULL,
  _local_id        INTEGER NOT NULL,

  "patientId"      INTEGER,
  "doctorId"       INTEGER,
  date             TEXT,
  symptoms         TEXT,
  diagnosis        TEXT,
  "treatmentPlan"  TEXT,
  prescription     TEXT,
  notes            TEXT,
  "chiefComplaint" TEXT,
  "historyOfPresentIllness" TEXT,
  "medicalHistory" TEXT,
  "dentalHistory"  TEXT,
  "reviewOfSystems" TEXT,
  "generalExam"    TEXT,
  anthropometric   JSONB,
  "oralFindings"   TEXT,
  "dentalCheckboxes" JSONB,
  vitals           JSONB,
  "consultType"    TEXT,
  template         TEXT,
  dental           JSONB,
  "clinicId"       TEXT,
  "createdAt"      TEXT,
  "parentId"       INTEGER,
  "originalId"     INTEGER,
  "isLatest"       BOOLEAN,
  "versionNumber"  INTEGER,
  "editedAt"       TEXT,
  "editedBy"       TEXT
);

ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultations_clinic ON consultations
  FOR ALL USING (_clinic_id = current_setting('app.clinic_id', true));

-- ─── appointments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  _pk              TEXT PRIMARY KEY,
  _clinic_id       TEXT NOT NULL,
  _local_id        INTEGER NOT NULL,

  "patientId"      INTEGER,
  "doctorId"       INTEGER,
  date             TEXT,
  time             TEXT,
  reason           TEXT,
  status           TEXT,
  reminder         BOOLEAN,
  "reminderOffset" TEXT,
  "clinicId"       TEXT,
  "createdAt"      TEXT,
  "updatedAt"      TEXT
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_clinic ON appointments
  FOR ALL USING (_clinic_id = current_setting('app.clinic_id', true));

-- ─── payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  _pk              TEXT PRIMARY KEY,
  _clinic_id       TEXT NOT NULL,
  _local_id        INTEGER NOT NULL,

  "patientId"      INTEGER,
  "consultationId" INTEGER,
  label            TEXT,
  "amountDue"      NUMERIC,
  "amountPaid"     NUMERIC,
  balance          NUMERIC,
  status           TEXT,
  method           TEXT,
  "paidAt"         TEXT,
  "dueDate"        TEXT,
  installments     JSONB,
  notes            TEXT,
  "clinicId"       TEXT,
  "createdAt"      TEXT,
  "updatedAt"      TEXT
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_clinic ON payments
  FOR ALL USING (_clinic_id = current_setting('app.clinic_id', true));

-- ─── drugs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drugs (
  _pk              TEXT PRIMARY KEY,
  _clinic_id       TEXT NOT NULL,
  _local_id        INTEGER NOT NULL,

  name             TEXT,
  category         TEXT,
  stock            NUMERIC,
  "initialStock"   NUMERIC,
  unit             TEXT,
  "buyPrice"       NUMERIC,
  "sellPrice"      NUMERIC,
  expiration       TEXT,
  "minStock"       NUMERIC,
  supplier         TEXT,
  "batchNumber"    TEXT,
  location         TEXT,
  status           TEXT,
  "clinicId"       TEXT,
  "createdAt"      TEXT,
  "updatedAt"      TEXT
);

ALTER TABLE drugs ENABLE ROW LEVEL SECURITY;
CREATE POLICY drugs_clinic ON drugs
  FOR ALL USING (_clinic_id = current_setting('app.clinic_id', true));

-- ─── equipment_items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_items (
  _pk                  TEXT PRIMARY KEY,
  _clinic_id           TEXT NOT NULL,
  _local_id            INTEGER NOT NULL,

  name                 TEXT,
  stock                NUMERIC,
  "lowStockThreshold"  NUMERIC,
  "clinicId"           TEXT,
  "createdAt"          TEXT,
  "updatedAt"          TEXT
);

ALTER TABLE equipment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipment_items_clinic ON equipment_items
  FOR ALL USING (_clinic_id = current_setting('app.clinic_id', true));

-- ─── equipment_movements (append-only) ───────────────────────
CREATE TABLE IF NOT EXISTS equipment_movements (
  _pk              TEXT PRIMARY KEY,
  _clinic_id       TEXT NOT NULL,
  _local_id        INTEGER NOT NULL,

  "itemId"         INTEGER,
  "quantityChange" NUMERIC,
  "newStock"       NUMERIC,
  reason           TEXT,
  "performedBy"    TEXT,
  "patientId"      INTEGER,
  "clinicId"       TEXT,
  "createdAt"      TEXT
);

ALTER TABLE equipment_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipment_movements_clinic ON equipment_movements
  FOR ALL USING (_clinic_id = current_setting('app.clinic_id', true));

-- ─── drug_transactions (append-only) ─────────────────────────
CREATE TABLE IF NOT EXISTS drug_transactions (
  _pk              TEXT PRIMARY KEY,
  _clinic_id       TEXT NOT NULL,
  _local_id        INTEGER NOT NULL,

  "drugId"         INTEGER,
  type             TEXT,
  quantity         NUMERIC,
  price            NUMERIC,
  "patientId"      INTEGER,
  "paymentStatus"  TEXT,
  "exitReason"     TEXT,
  "batchNumber"    TEXT,
  "performedBy"    TEXT,
  "stockBefore"    NUMERIC,
  "stockAfter"     NUMERIC,
  notes            TEXT,
  "clinicId"       TEXT,
  "createdAt"      TEXT
);

ALTER TABLE drug_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY drug_transactions_clinic ON drug_transactions
  FOR ALL USING (_clinic_id = current_setting('app.clinic_id', true));
