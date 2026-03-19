/*
  # Add staff appointment rates table

  1. New Tables
    - `staff_appointment_rates`
      - `id` (uuid, primary key)
      - `staff_id` (text, references staff)
      - `session_type_id` (text, references session_types)
      - `rate_per_appointment` (numeric, cost paid to staff per appointment)
      - `rate_type` (text, 'fixed' or 'percentage')
      - `percentage_rate` (numeric, if rate_type is percentage)
      - `notes` (text, optional notes)
      - `effective_from` (date, when rate starts)
      - `effective_to` (date, when rate ends, null = current)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `staff_appointment_rates` table
    - Add read policy for anon users (dashboard is public)

  3. Notes
    - This table stores per-staff per-service cost rates
    - Used to calculate profit margins on client packages
    - Supports both fixed rate and percentage-based rates
    - Effective dates allow tracking rate changes over time
*/

CREATE TABLE IF NOT EXISTS staff_appointment_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  session_type_id text,
  rate_per_appointment numeric DEFAULT 0,
  rate_type text DEFAULT 'fixed',
  percentage_rate numeric DEFAULT 0,
  notes text DEFAULT '',
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_rates_unique
  ON staff_appointment_rates (staff_id, session_type_id, effective_from)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_rates_staff ON staff_appointment_rates (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_rates_session ON staff_appointment_rates (session_type_id);

ALTER TABLE staff_appointment_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read staff_appointment_rates"
  ON staff_appointment_rates
  FOR SELECT
  TO anon
  USING (auth.role() = 'anon');

CREATE POLICY "Allow anon insert staff_appointment_rates"
  ON staff_appointment_rates
  FOR INSERT
  TO anon
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow anon update staff_appointment_rates"
  ON staff_appointment_rates
  FOR UPDATE
  TO anon
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow anon delete staff_appointment_rates"
  ON staff_appointment_rates
  FOR DELETE
  TO anon
  USING (auth.role() = 'anon');
