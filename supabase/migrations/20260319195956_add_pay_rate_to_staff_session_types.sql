/*
  # Add pay rate and time length to staff_session_types

  1. Modified Tables
    - `staff_session_types`
      - `pay_rate` (numeric, default 0) - staff pay rate per appointment from Mindbody API
      - `time_length` (integer) - staff-specific duration override from API
      - `synced_at` (timestamptz) - when this record was last synced

  2. Notes
    - PayRate is read from Mindbody GET /staff/staffsessiontypes response
    - This replaces manual rate entry for synced data
    - staff_appointment_rates table remains for manual overrides
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_session_types' AND column_name = 'pay_rate'
  ) THEN
    ALTER TABLE staff_session_types ADD COLUMN pay_rate numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_session_types' AND column_name = 'time_length'
  ) THEN
    ALTER TABLE staff_session_types ADD COLUMN time_length integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_session_types' AND column_name = 'synced_at'
  ) THEN
    ALTER TABLE staff_session_types ADD COLUMN synced_at timestamptz DEFAULT now();
  END IF;
END $$;
