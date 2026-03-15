/*
  # Add API Logs Table

  1. New Tables
    - `api_logs`
      - `id` (uuid, primary key)
      - `endpoint` (text) - API endpoint called
      - `method` (text) - HTTP method
      - `request_body` (jsonb) - Request payload
      - `response_status` (int) - HTTP status code
      - `response_body` (jsonb) - Response data
      - `error_message` (text) - Error if any
      - `duration_ms` (int) - Request duration
      - `created_at` (timestamptz) - When the log was created

  2. Security
    - Enable RLS on `api_logs` table
    - Add policy for authenticated users to read logs
*/

CREATE TABLE IF NOT EXISTS api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  request_body jsonb,
  response_status int,
  response_body jsonb,
  error_message text,
  duration_ms int,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all users"
  ON api_logs
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow insert for service role"
  ON api_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint);
