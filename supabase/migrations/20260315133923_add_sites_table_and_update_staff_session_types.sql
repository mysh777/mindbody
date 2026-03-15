/*
  # Add Sites Table and Update Staff-Session Types

  ## New Tables
  
  ### `sites`
  - `id` (uuid, primary key) - Internal unique identifier
  - `mindbody_id` (text, unique) - Mindbody site ID
  - `name` (text) - Site name
  - `per_staff_pricing` (boolean) - Whether pricing is per-staff
  - `raw_data` (jsonb) - Complete API response
  - `synced_at` (timestamptz) - Last sync timestamp
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Table Updates
  
  ### `staff_session_types` - Add missing columns
  - `is_active` (boolean) - Renamed from `active` for consistency
  - `location_id` (text, nullable) - Optional location ID
  - `duration_override` (integer, nullable) - Optional duration override in minutes
  - `raw_data` (jsonb) - Complete API response
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on sites table
  - Add policies for anonymous read access
*/

-- Create sites table
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mindbody_id text UNIQUE NOT NULL,
  name text,
  per_staff_pricing boolean DEFAULT false,
  raw_data jsonb,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add missing columns to staff_session_types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_session_types' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE staff_session_types ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_session_types' AND column_name = 'location_id'
  ) THEN
    ALTER TABLE staff_session_types ADD COLUMN location_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_session_types' AND column_name = 'duration_override'
  ) THEN
    ALTER TABLE staff_session_types ADD COLUMN duration_override integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_session_types' AND column_name = 'raw_data'
  ) THEN
    ALTER TABLE staff_session_types ADD COLUMN raw_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_session_types' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE staff_session_types ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sites_mindbody_id ON sites(mindbody_id);
CREATE INDEX IF NOT EXISTS idx_staff_session_types_location_id ON staff_session_types(location_id);

-- Enable RLS on sites
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous read access to sites
CREATE POLICY "Allow anonymous read access to sites"
  ON sites
  FOR SELECT
  TO anon
  USING (true);

-- Create policies for authenticated users
CREATE POLICY "Allow authenticated users to read sites"
  ON sites
  FOR SELECT
  TO authenticated
  USING (true);