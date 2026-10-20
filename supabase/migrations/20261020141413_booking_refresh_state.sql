/*
# Booking refresh state — shared cooldown

1. Change
   - New table `booking_refresh_state` (single row, id=1) tracking last refresh timestamp.
   - RLS enabled, anon+authenticated can read and update (no-auth app pattern).

2. Not touched
   - No existing tables modified. No business data.

3. Rollback
   - DROP TABLE booking_refresh_state;
*/

CREATE TABLE booking_refresh_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_refresh_at timestamptz,
  updated_by text
);

INSERT INTO booking_refresh_state (id, last_refresh_at) VALUES (1, null) ON CONFLICT DO NOTHING;

ALTER TABLE booking_refresh_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_refresh_state" ON booking_refresh_state FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "update_refresh_state" ON booking_refresh_state FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "insert_refresh_state" ON booking_refresh_state FOR INSERT
  TO anon, authenticated WITH CHECK (true);
