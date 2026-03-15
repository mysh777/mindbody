/*
  # Add API Raw Data Storage Table

  1. New Tables
    - `api_raw_data`
      - `id` (uuid, primary key)
      - `endpoint_type` (text) - Type of endpoint (clients, sales, classes, etc)
      - `response_data` (jsonb) - Full raw response from API
      - `record_count` (integer) - Number of records in response
      - `pagination_info` (jsonb) - Pagination details
      - `synced_at` (timestamptz) - When this was fetched
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `api_raw_data` table
    - Add policy for anonymous users to read data
*/

CREATE TABLE IF NOT EXISTS api_raw_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_type text NOT NULL,
  response_data jsonb NOT NULL,
  record_count integer DEFAULT 0,
  pagination_info jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_raw_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access to api_raw_data"
  ON api_raw_data
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to api_raw_data"
  ON api_raw_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);