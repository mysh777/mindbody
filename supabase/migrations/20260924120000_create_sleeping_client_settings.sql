/*
# Create sleeping_client_settings table

1. New Tables
   - `sleeping_client_settings`
     - `group_key` (text, primary key) — program ID or '__global' for global params
     - `group_name` (text, not null) — display name of the service group
     - `threshold_days` (integer, not null) — days without visit to consider client "sleeping"
     - `min_visits` (integer) — minimum visits in lookback period to qualify as "regular"
     - `lookback_days` (integer) — period to check visit history
     - `max_days_silent` (integer) — upper bound; beyond this, client is "lost", not "sleeping"
     - `updated_at` (timestamptz)

2. Security
   - Enable RLS
   - Allow anon + authenticated full CRUD (single-tenant app, no auth)

3. Notes
   - Row with group_key = '__global' stores global defaults (min_visits, lookback_days, max_days_silent)
   - Other rows store per-program thresholds
   - Reverse migration: DROP TABLE sleeping_client_settings;
*/

CREATE TABLE IF NOT EXISTS sleeping_client_settings (
  group_key      text PRIMARY KEY,
  group_name     text NOT NULL,
  threshold_days integer NOT NULL DEFAULT 30,
  min_visits     integer,
  lookback_days  integer,
  max_days_silent integer,
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE sleeping_client_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sleeping_settings" ON sleeping_client_settings;
CREATE POLICY "anon_select_sleeping_settings" ON sleeping_client_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sleeping_settings" ON sleeping_client_settings;
CREATE POLICY "anon_insert_sleeping_settings" ON sleeping_client_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sleeping_settings" ON sleeping_client_settings;
CREATE POLICY "anon_update_sleeping_settings" ON sleeping_client_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sleeping_settings" ON sleeping_client_settings;
CREATE POLICY "anon_delete_sleeping_settings" ON sleeping_client_settings FOR DELETE
  TO anon, authenticated USING (true);
