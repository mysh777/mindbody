/*
# Create resources table for booking interface

1. New table: `resources`
   - `id` text PK — Mindbody resource ID as string
   - `mindbody_id` text — same as id, kept for convention
   - `name` text — resource name (e.g. "Aquabike 1")
   - `location_id` text — which location this resource belongs to
   - `resource_type` text — "Room" or "Equipment" or similar from Mindbody
   - `active` boolean default true
   - `raw_data` jsonb — full Mindbody response object
   - `synced_at` timestamptz
   - `created_at` timestamptz default now()

2. Security
   - RLS enabled.
   - anon + authenticated SELECT only (read-only reference data; sync writes via service role).

3. Index
   - on location_id for filtering by location in the calendar.

4. Not touched
   - No existing tables modified. No business data.

5. Rollback
   - DROP TABLE IF EXISTS public.resources CASCADE;
*/

CREATE TABLE IF NOT EXISTS public.resources (
  id text PRIMARY KEY,
  mindbody_id text,
  name text,
  location_id text,
  resource_type text,
  active boolean DEFAULT true,
  raw_data jsonb,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_resources" ON resources;
CREATE POLICY "anon_select_resources"
  ON resources FOR SELECT
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_resources_location_id ON public.resources (location_id);
