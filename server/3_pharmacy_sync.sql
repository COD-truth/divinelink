-- Pharmacy multi-device sync tables. Run once on the divinelink Postgres DB:
--   psql -U <user> -d divinelink -f 3_pharmacy_sync.sql
-- Safe to re-run (IF NOT EXISTS). Nothing is dropped.

CREATE TABLE IF NOT EXISTS drugs (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  name TEXT, category TEXT, unit TEXT, pack_size INTEGER,
  buy_price NUMERIC DEFAULT 0, sell_price NUMERIC DEFAULT 0,
  min_stock INTEGER DEFAULT 0, initial_stock INTEGER DEFAULT 0,
  stock_magasin INTEGER DEFAULT 0, min_stock_magasin INTEGER DEFAULT 0,
  supplier TEXT, expiration TEXT, batch_number TEXT, location TEXT, status TEXT,
  sync_base_stock INTEGER, sync_base_at TIMESTAMPTZ,
  deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (clinic_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_drugs_clinic_updated ON drugs (clinic_id, updated_at);

CREATE TABLE IF NOT EXISTS drug_transactions (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  drug_uid TEXT,
  type TEXT, quantity INTEGER, price NUMERIC DEFAULT 0,
  patient_id INTEGER, payment_status TEXT, exit_reason TEXT,
  batch_number TEXT, performed_by TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (clinic_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_drugtx_clinic_created ON drug_transactions (clinic_id, created_at);
