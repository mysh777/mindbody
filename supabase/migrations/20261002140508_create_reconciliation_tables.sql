/*
# Create reconciliation tables for Mindbody cross-check

Three tables to protect against revenue calculation regressions:

1. New Tables

  - `reconciliation_references`
    Mindbody totals (gold-standard) for verified periods.
    - `id` (uuid, PK)
    - `period` (text, e.g. '2026-09')
    - `metric` (text: 'sales_total', 'sales_qty', 'staff_cost')
    - `location` (text: 'all', '1', '3')
    - `value` (numeric)
    - `source` (text, default 'mindbody')
    - `note` (text, nullable)
    - `entered_at` (timestamptz)

  - `reconciliation_baseline`
    Per-tariff / per-staff snapshot taken when totals match Mindbody.
    - `id` (uuid, PK)
    - `period` (text)
    - `report` (text: 'sales_by_tariff', 'staff_cost_by_staff')
    - `location` (text)
    - `key` (text — tariff name or staff_id)
    - `qty` (integer)
    - `value` (numeric)
    - `created_at` (timestamptz)

  - `reconciliation_cases`
    Hard regression-test cases derived from real discrepancies.
    - `id` (uuid, PK)
    - `case_number` (integer, unique)
    - `description` (text)
    - `period` (text)
    - `report` (text)
    - `location` (text)
    - `client_id` (text, nullable)
    - `tariff_name` (text, nullable)
    - `expected_value` (numeric, nullable)
    - `expected_qty` (integer, nullable)
    - `note` (text, nullable)
    - `created_at` (timestamptz)

2. Security
  - RLS enabled on all three tables.
  - anon + authenticated can SELECT (read-only from frontend).
  - anon + authenticated can INSERT/UPDATE/DELETE (admin operations from frontend).

3. Unique constraints
  - reconciliation_references: (period, metric, location)
  - reconciliation_baseline: (period, report, location, key)
  - reconciliation_cases: (case_number)
*/

-- reconciliation_references
CREATE TABLE IF NOT EXISTS reconciliation_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  metric text NOT NULL,
  location text NOT NULL DEFAULT 'all',
  value numeric NOT NULL,
  source text NOT NULL DEFAULT 'mindbody',
  note text,
  entered_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_ref_period_metric_loc
  ON reconciliation_references (period, metric, location);

ALTER TABLE reconciliation_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recon_ref_select" ON reconciliation_references;
CREATE POLICY "recon_ref_select" ON reconciliation_references FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "recon_ref_insert" ON reconciliation_references;
CREATE POLICY "recon_ref_insert" ON reconciliation_references FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recon_ref_update" ON reconciliation_references;
CREATE POLICY "recon_ref_update" ON reconciliation_references FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "recon_ref_delete" ON reconciliation_references;
CREATE POLICY "recon_ref_delete" ON reconciliation_references FOR DELETE
  TO anon, authenticated USING (true);

-- reconciliation_baseline
CREATE TABLE IF NOT EXISTS reconciliation_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  report text NOT NULL,
  location text NOT NULL DEFAULT 'all',
  key text NOT NULL,
  qty integer NOT NULL DEFAULT 0,
  value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_base_period_report_loc_key
  ON reconciliation_baseline (period, report, location, key);

ALTER TABLE reconciliation_baseline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recon_base_select" ON reconciliation_baseline;
CREATE POLICY "recon_base_select" ON reconciliation_baseline FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "recon_base_insert" ON reconciliation_baseline;
CREATE POLICY "recon_base_insert" ON reconciliation_baseline FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recon_base_update" ON reconciliation_baseline;
CREATE POLICY "recon_base_update" ON reconciliation_baseline FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "recon_base_delete" ON reconciliation_baseline;
CREATE POLICY "recon_base_delete" ON reconciliation_baseline FOR DELETE
  TO anon, authenticated USING (true);

-- reconciliation_cases
CREATE TABLE IF NOT EXISTS reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number integer NOT NULL UNIQUE,
  description text NOT NULL,
  period text NOT NULL,
  report text NOT NULL DEFAULT 'sales_by_tariff',
  location text NOT NULL DEFAULT 'all',
  client_id text,
  tariff_name text,
  expected_value numeric,
  expected_qty integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reconciliation_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recon_cases_select" ON reconciliation_cases;
CREATE POLICY "recon_cases_select" ON reconciliation_cases FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "recon_cases_insert" ON reconciliation_cases;
CREATE POLICY "recon_cases_insert" ON reconciliation_cases FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recon_cases_update" ON reconciliation_cases;
CREATE POLICY "recon_cases_update" ON reconciliation_cases FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "recon_cases_delete" ON reconciliation_cases;
CREATE POLICY "recon_cases_delete" ON reconciliation_cases FOR DELETE
  TO anon, authenticated USING (true);
