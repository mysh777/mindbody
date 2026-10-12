/*
# Page load timings

1. New table `page_load_metrics`
   - `id` (bigserial), `created_at` (timestamptz)
   - `page` (text) – menu page id
   - `first_open` (boolean) – first open of this page in the browser session (cold) vs. repeat (warm)
   - `ms` (integer) – time from opening the page until its data finished loading
   - `requests` (integer), `kb` (integer) – database requests and data downloaded for that open
   - `app_version` (text) – build label, so before/after can be compared
   - `network` (text) – browser-reported connection type (e.g. 4g, 3g)
   - `viewport_width` (integer) – screen width, to separate phone from desktop
2. Security
   - RLS enabled. The app (no sign-in) may only INSERT rows, with bounded values.
   - No SELECT/UPDATE/DELETE policies: nobody reads the table through the app; reporting is done server-side.
3. Rollback
   - DROP TABLE page_load_metrics; (timing data only)
*/
CREATE TABLE IF NOT EXISTS page_load_metrics (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  page text NOT NULL CHECK (char_length(page) <= 40),
  first_open boolean NOT NULL,
  ms integer NOT NULL CHECK (ms BETWEEN 0 AND 600000),
  requests integer NOT NULL CHECK (requests BETWEEN 0 AND 100000),
  kb integer NOT NULL CHECK (kb BETWEEN 0 AND 10000000),
  app_version text CHECK (char_length(app_version) <= 40),
  network text CHECK (char_length(network) <= 20),
  viewport_width integer CHECK (viewport_width BETWEEN 0 AND 20000)
);
CREATE INDEX IF NOT EXISTS idx_page_load_metrics_created ON page_load_metrics (created_at);
ALTER TABLE page_load_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON page_load_metrics FROM anon, authenticated;
GRANT INSERT ON page_load_metrics TO anon, authenticated;
GRANT USAGE ON SEQUENCE page_load_metrics_id_seq TO anon, authenticated;
DROP POLICY IF EXISTS "app_can_record_page_timings" ON page_load_metrics;
CREATE POLICY "app_can_record_page_timings" ON page_load_metrics FOR INSERT
  TO anon, authenticated WITH CHECK (true);
