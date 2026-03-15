/*
  # Replace old services table with session_types

  1. Changes
    - Drop old empty services table (different structure)
    - Rename session_types to services (the actual service data)
    - Rename staff_session_types to staff_services
    - Update column names: session_type_id → service_id
    - Rename pricing_option_session_types to pricing_option_services
    
  2. Data Model
    - service_categories: "Aquabike", "Massage" (Programs)
    - services: "Aquabike Tonic1", "Massage 60min" (Individual services)
    - pricing_options: "1 sessija 30 min - €25" (Pricing tiers)
    
  3. Relationships
    - services.program_id → service_categories.id
    - staff_services links staff to services they can provide
    - appointments.service_id → services.id
*/

-- Drop old empty services table
DROP TABLE IF EXISTS services CASCADE;

-- Rename session_types to services
ALTER TABLE session_types RENAME TO services;

-- Rename staff_session_types to staff_services
ALTER TABLE staff_session_types RENAME TO staff_services;

-- Rename pricing_option_session_types to pricing_option_services
ALTER TABLE pricing_option_session_types RENAME TO pricing_option_services;

-- Update column names in staff_services
ALTER TABLE staff_services RENAME COLUMN session_type_id TO service_id;

-- Update column names in pricing_option_services
ALTER TABLE pricing_option_services RENAME COLUMN session_type_id TO service_id;

-- Update column names in appointments
ALTER TABLE appointments RENAME COLUMN session_type_id TO service_id;

-- Recreate foreign key constraints with new names
ALTER TABLE staff_services 
  DROP CONSTRAINT IF EXISTS staff_session_types_session_type_id_fkey,
  ADD CONSTRAINT staff_services_service_id_fkey 
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;

ALTER TABLE staff_services 
  DROP CONSTRAINT IF EXISTS staff_session_types_staff_id_fkey,
  ADD CONSTRAINT staff_services_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;

ALTER TABLE pricing_option_services
  DROP CONSTRAINT IF EXISTS pricing_option_session_types_session_type_id_fkey,
  ADD CONSTRAINT pricing_option_services_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;

ALTER TABLE pricing_option_services
  DROP CONSTRAINT IF EXISTS pricing_option_session_types_pricing_option_id_fkey,
  ADD CONSTRAINT pricing_option_services_pricing_option_id_fkey
    FOREIGN KEY (pricing_option_id) REFERENCES pricing_options(id) ON DELETE CASCADE;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_session_type_id_fkey,
  ADD CONSTRAINT appointments_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;

-- Recreate indexes with better names
CREATE INDEX IF NOT EXISTS idx_services_program_id ON services(program_id);
CREATE INDEX IF NOT EXISTS idx_staff_services_service_id ON staff_services(service_id);
CREATE INDEX IF NOT EXISTS idx_staff_services_staff_id ON staff_services(staff_id);
CREATE INDEX IF NOT EXISTS idx_pricing_option_services_service_id ON pricing_option_services(service_id);
CREATE INDEX IF NOT EXISTS idx_pricing_option_services_pricing_option_id ON pricing_option_services(pricing_option_id);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON appointments(service_id);
