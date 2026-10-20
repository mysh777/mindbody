/*
# Booking settings — excluded staff names

1. New Tables
- `booking_settings` — single-row settings table for the Booking page.
  - `id` (int, primary key, always 1)
  - `excluded_staff_names` (text array) — list of staff display-name substrings
    to hide from the Booking calendar (e.g. "Admin", "Test", "Sauna Test").
2. Security
- Enable RLS on `booking_settings`.
- Allow anon + authenticated CRUD — single-tenant no-auth app.
*/

CREATE TABLE IF NOT EXISTS booking_settings (
  id int PRIMARY KEY DEFAULT 1,
  excluded_staff_names text[] NOT NULL DEFAULT ARRAY['Admin', 'Test', 'Sauna Test']
);

ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_booking_settings" ON booking_settings;
CREATE POLICY "anon_select_booking_settings" ON booking_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_booking_settings" ON booking_settings;
CREATE POLICY "anon_update_booking_settings" ON booking_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_booking_settings" ON booking_settings;
CREATE POLICY "anon_insert_booking_settings" ON booking_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- seed default row
INSERT INTO booking_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
