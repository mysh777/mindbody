/*
# Staff working time from Mindbody

1. New Tables
- `staff_schedule_items` - working time blocks (availabilities) and breaks (unavailabilities) of each staff member,
  as returned by Mindbody /appointment/scheduleitems. Used to compute staff utilisation
  (visit hours / working hours) and studio fill rate on the Overview page.
  - `id` (text, primary key) - "a:<MindbodyId>" for availabilities, "u:<MindbodyId>" for unavailabilities
  - `kind` (text) - 'available' or 'unavailable'
  - `staff_id` (text) - staff id (same as staff.id / appointments.staff_id)
  - `location_id` (text, nullable) - location id; Mindbody gives none for breaks
  - `start_datetime`, `end_datetime` (timestamptz) - studio local time stored as UTC, same convention as appointments
  - `description` (text) - break description
  - `raw_data` (jsonb) - original Mindbody record without the nested staff object
  - `synced_at`, `last_seen_at` (timestamptz)
  - `stale` (boolean) - true when a later sync of the same period no longer returned the block (never deleted)

2. Security
- RLS enabled. The dashboard has no sign-in and only reads this table, so anon gets SELECT only.
- Writes happen exclusively from the sync function with the service role; no insert/update/delete policies for anon.

3. Notes
1. Nothing existing is modified.
2. Index on (start_datetime) and (staff_id, start_datetime) for monthly reads.
*/

CREATE TABLE IF NOT EXISTS staff_schedule_items (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('available', 'unavailable')),
  staff_id text NOT NULL,
  location_id text,
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  description text,
  raw_data jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  stale boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS staff_schedule_items_start_idx ON staff_schedule_items (start_datetime);
CREATE INDEX IF NOT EXISTS staff_schedule_items_staff_start_idx ON staff_schedule_items (staff_id, start_datetime);

ALTER TABLE staff_schedule_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can read staff schedule" ON staff_schedule_items;
CREATE POLICY "Anon can read staff schedule"
ON staff_schedule_items FOR SELECT
TO anon, authenticated
USING (true);
