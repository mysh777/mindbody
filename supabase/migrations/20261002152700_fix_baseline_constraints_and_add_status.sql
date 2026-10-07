/*
# Fix reconciliation_baseline constraints and add reconciliation_status table

1. Modified Tables
   - `reconciliation_baseline`: make `qty` nullable (staff_cost rows have no qty),
     add unique constraint on (period, report, location, key) for upsert support

2. New Tables
   - `reconciliation_status`: single-row table storing last check timestamp and result,
     shared across all users
     - `id` (integer, always 1)
     - `checked_at` (timestamptz)
     - `all_ok` (boolean)
     - `error_count` (integer)

3. Security
   - RLS enabled on reconciliation_status with anon+authenticated CRUD
*/

ALTER TABLE reconciliation_baseline ALTER COLUMN qty SET DEFAULT 0;
ALTER TABLE reconciliation_baseline ALTER COLUMN qty DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reconciliation_baseline_unique_key'
  ) THEN
    ALTER TABLE reconciliation_baseline
      ADD CONSTRAINT reconciliation_baseline_unique_key
      UNIQUE (period, report, location, key);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reconciliation_status (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  checked_at timestamptz NOT NULL DEFAULT now(),
  all_ok boolean NOT NULL DEFAULT false,
  error_count integer NOT NULL DEFAULT 0
);

ALTER TABLE reconciliation_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_recon_status" ON reconciliation_status;
CREATE POLICY "anon_select_recon_status" ON reconciliation_status FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_recon_status" ON reconciliation_status;
CREATE POLICY "anon_insert_recon_status" ON reconciliation_status FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_recon_status" ON reconciliation_status;
CREATE POLICY "anon_update_recon_status" ON reconciliation_status FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_recon_status" ON reconciliation_status;
CREATE POLICY "anon_delete_recon_status" ON reconciliation_status FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO reconciliation_status (id, checked_at, all_ok, error_count)
VALUES (1, now() - interval '25 hours', false, 0)
ON CONFLICT (id) DO NOTHING;
