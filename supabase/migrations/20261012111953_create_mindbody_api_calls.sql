/*
# Mindbody API call log (one row per HTTP request)

Records every single HTTP request the sync engine sends to Mindbody so the
number of billed calls can be counted exactly. Diagnosis only: nothing reads
from this table to make sync decisions.

1. New Tables
- `mindbody_api_calls`
  - `id` (bigint, primary key)
  - `called_at` (timestamptz) – when the request was sent
  - `method` (text) – GET / POST
  - `endpoint` (text) – path, e.g. `appointment/staffappointments`
  - `step` (text) – sync step that made the call (e.g. `client_services`)
  - `run_id` (uuid) – groups calls of one nightly/manual run
  - `run_type` (text) – nightly / manual / ...
  - `page` (int), `page_offset` (int), `page_limit` (int) – paging
  - `staff_id`, `client_id`, `session_type_id` (text) – looped entity if any
  - `http_status` (int) – 0 when the request failed before a response
  - `duration_ms` (int)
  - `error` (text)

2. Security
- RLS enabled. Read-only for the app (SELECT for anon, authenticated) because
  the app is single-tenant without sign-in. No insert/update/delete policies:
  only the sync engine (service role) writes. No credentials are stored.

3. Rollback
- Revert the edge function to stop writing, then the table can be removed
  manually with `DROP TABLE mindbody_api_calls;` (log data only).
*/

CREATE TABLE IF NOT EXISTS mindbody_api_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  called_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'GET',
  endpoint text NOT NULL,
  step text,
  run_id uuid,
  run_type text,
  page int,
  page_offset int,
  page_limit int,
  staff_id text,
  client_id text,
  session_type_id text,
  http_status int,
  duration_ms int,
  error text
);

CREATE INDEX IF NOT EXISTS mindbody_api_calls_called_at_idx ON mindbody_api_calls (called_at);
CREATE INDEX IF NOT EXISTS mindbody_api_calls_run_step_idx ON mindbody_api_calls (run_id, step);

ALTER TABLE mindbody_api_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_mindbody_api_calls" ON mindbody_api_calls;
CREATE POLICY "read_mindbody_api_calls" ON mindbody_api_calls FOR SELECT
  TO anon, authenticated USING (true);
