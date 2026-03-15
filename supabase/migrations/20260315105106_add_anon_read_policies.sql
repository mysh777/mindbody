/*
  # Add anonymous read access to all tables

  1. Security Changes
    - Add SELECT policies for anon role to all tables
    - This allows unauthenticated users to read data
    - Write operations still require authentication

  2. Tables Affected
    - clients
    - appointments
    - classes
    - class_descriptions
    - class_visits
    - sales
    - sale_items
    - staff
    - locations
    - products
    - services
    - sync_logs
    - api_logs
*/

-- Clients
DROP POLICY IF EXISTS "Anonymous users can read clients" ON clients;
CREATE POLICY "Anonymous users can read clients"
  ON clients FOR SELECT
  TO anon
  USING (true);

-- Appointments
DROP POLICY IF EXISTS "Anonymous users can read appointments" ON appointments;
CREATE POLICY "Anonymous users can read appointments"
  ON appointments FOR SELECT
  TO anon
  USING (true);

-- Classes
DROP POLICY IF EXISTS "Anonymous users can read classes" ON classes;
CREATE POLICY "Anonymous users can read classes"
  ON classes FOR SELECT
  TO anon
  USING (true);

-- Class Descriptions
DROP POLICY IF EXISTS "Anonymous users can read class_descriptions" ON class_descriptions;
CREATE POLICY "Anonymous users can read class_descriptions"
  ON class_descriptions FOR SELECT
  TO anon
  USING (true);

-- Class Visits
DROP POLICY IF EXISTS "Anonymous users can read class_visits" ON class_visits;
CREATE POLICY "Anonymous users can read class_visits"
  ON class_visits FOR SELECT
  TO anon
  USING (true);

-- Sales
DROP POLICY IF EXISTS "Anonymous users can read sales" ON sales;
CREATE POLICY "Anonymous users can read sales"
  ON sales FOR SELECT
  TO anon
  USING (true);

-- Sale Items
DROP POLICY IF EXISTS "Anonymous users can read sale_items" ON sale_items;
CREATE POLICY "Anonymous users can read sale_items"
  ON sale_items FOR SELECT
  TO anon
  USING (true);

-- Staff
DROP POLICY IF EXISTS "Anonymous users can read staff" ON staff;
CREATE POLICY "Anonymous users can read staff"
  ON staff FOR SELECT
  TO anon
  USING (true);

-- Locations
DROP POLICY IF EXISTS "Anonymous users can read locations" ON locations;
CREATE POLICY "Anonymous users can read locations"
  ON locations FOR SELECT
  TO anon
  USING (true);

-- Products
DROP POLICY IF EXISTS "Anonymous users can read products" ON products;
CREATE POLICY "Anonymous users can read products"
  ON products FOR SELECT
  TO anon
  USING (true);

-- Services
DROP POLICY IF EXISTS "Anonymous users can read services" ON services;
CREATE POLICY "Anonymous users can read services"
  ON services FOR SELECT
  TO anon
  USING (true);

-- Sync Logs
DROP POLICY IF EXISTS "Anonymous users can read sync_logs" ON sync_logs;
CREATE POLICY "Anonymous users can read sync_logs"
  ON sync_logs FOR SELECT
  TO anon
  USING (true);

-- API Logs
DROP POLICY IF EXISTS "Anonymous users can read api_logs" ON api_logs;
CREATE POLICY "Anonymous users can read api_logs"
  ON api_logs FOR SELECT
  TO anon
  USING (true);