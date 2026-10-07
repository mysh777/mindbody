/*
# Track when each appointment was last returned by Mindbody

1. Modified Tables
  - `appointments`
    - `last_seen_at` (timestamptz, nullable): time of the last sync run in which
      Mindbody returned this appointment.
    - `stale` (boolean, not null, default false): true when a sync re-read the
      appointment's date range completely and Mindbody did NOT return it
      (cancelled / deleted / no longer visible). Rows are never deleted.
  - Index on (stale, start_datetime) for segment queries.

2. Security
  - No RLS changes (existing appointments policies apply).

3. Notes
  1. Existing rows start with last_seen_at = NULL and stale = false.
  2. Only the segments / funnel page excludes stale rows; other reports unchanged.
  3. Reverse migration (run manually if needed):
       DROP INDEX IF EXISTS idx_appointments_stale_start;
       ALTER TABLE appointments DROP COLUMN IF EXISTS stale;
       ALTER TABLE appointments DROP COLUMN IF EXISTS last_seen_at;
*/

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stale boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_appointments_stale_start ON appointments (stale, start_datetime);