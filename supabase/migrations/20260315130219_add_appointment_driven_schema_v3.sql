/*
  # Appointment-Driven Business Model Schema

  1. Overview
    - Remove class-based tables (classes, class_descriptions, class_visits, courses)
    - Add appointment-centric tables (service_categories, session_types, staff_session_types)
    - Restructure pricing and appointments for proper relationships

  2. Core Reference Tables
    - `service_categories` - Categories of services (e.g., Body Contouring, Facial Treatments)
    - `session_types` - Specific appointment types (e.g., Aquabike Tonic, EMS Sculptor)
    - `staff_session_types` - Which staff can perform which session types
    - `pricing_option_session_types` - How session types are priced/sold

  3. Operational Tables
    - Enhanced `appointments` - Actual bookings with full details
    - Enhanced `sale_items` - Proper product/service tracking

  4. Security
    - Enable RLS on all new tables
    - Allow anonymous read access for dashboard viewing
*/

-- Drop old class-based tables
DROP TABLE IF EXISTS class_visits CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS class_descriptions CASCADE;
DROP TABLE IF EXISTS courses CASCADE;

-- Create service_categories table
CREATE TABLE IF NOT EXISTS service_categories (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create session_types table (the actual services/appointment types)
CREATE TABLE IF NOT EXISTS session_types (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  name text NOT NULL,
  service_category_id text REFERENCES service_categories(id),
  default_duration_minutes integer,
  description text,
  active boolean DEFAULT true,
  online_booking_enabled boolean DEFAULT false,
  program_id text,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create staff_session_types junction table
CREATE TABLE IF NOT EXISTS staff_session_types (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  staff_id text REFERENCES staff(id) ON DELETE CASCADE,
  session_type_id text REFERENCES session_types(id) ON DELETE CASCADE,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, session_type_id)
);

-- Create pricing_option_session_types junction table (pricing_options uses uuid)
CREATE TABLE IF NOT EXISTS pricing_option_session_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_option_id uuid REFERENCES pricing_options(id) ON DELETE CASCADE,
  session_type_id text REFERENCES session_types(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(pricing_option_id, session_type_id)
);

-- Drop and recreate appointments table with proper structure
DROP TABLE IF EXISTS appointments CASCADE;

CREATE TABLE appointments (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  client_id text REFERENCES clients(id),
  staff_id text REFERENCES staff(id),
  location_id text REFERENCES locations(id),
  session_type_id text REFERENCES session_types(id),
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  duration_minutes integer,
  status text,
  notes text,
  first_appointment boolean DEFAULT false,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add appointment_addons table for add-on services
CREATE TABLE IF NOT EXISTS appointment_addons (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  appointment_id text REFERENCES appointments(id) ON DELETE CASCADE,
  addon_id text,
  addon_name text NOT NULL,
  addon_price numeric(10,2),
  created_at timestamptz DEFAULT now()
);

-- Update sale_items to include proper product/service tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'item_name'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN item_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'item_type'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN item_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'session_type_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN session_type_id text REFERENCES session_types(id);
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_types_category ON session_types(service_category_id);
CREATE INDEX IF NOT EXISTS idx_session_types_active ON session_types(active);
CREATE INDEX IF NOT EXISTS idx_staff_session_types_staff ON staff_session_types(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_session_types_session ON staff_session_types(session_type_id);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments(staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_session_type ON appointments(session_type_id);
CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(start_datetime);
CREATE INDEX IF NOT EXISTS idx_pricing_option_session_types_pricing ON pricing_option_session_types(pricing_option_id);
CREATE INDEX IF NOT EXISTS idx_pricing_option_session_types_session ON pricing_option_session_types(session_type_id);

-- Enable RLS
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_option_session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_addons ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous read access
CREATE POLICY "Allow anonymous read access to service_categories"
  ON service_categories FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to session_types"
  ON session_types FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to staff_session_types"
  ON staff_session_types FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to pricing_option_session_types"
  ON pricing_option_session_types FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to appointments"
  ON appointments FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to appointment_addons"
  ON appointment_addons FOR SELECT
  TO anon
  USING (true);