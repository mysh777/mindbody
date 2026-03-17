/*
  # Add client_service_id to appointments

  1. Changes
    - Add `client_service_id` column to appointments table
    - This links appointments to the client's purchased pricing option (from client_services)
    - Essential for tracking which pricing option was used for each appointment

  2. Data Migration
    - Extracts ClientServiceId from raw_data for existing appointments
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'client_service_id'
  ) THEN
    ALTER TABLE appointments ADD COLUMN client_service_id text;
  END IF;
END $$;

UPDATE appointments
SET client_service_id = raw_data->>'ClientServiceId'
WHERE client_service_id IS NULL
  AND raw_data->>'ClientServiceId' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_client_service_id ON appointments(client_service_id);
