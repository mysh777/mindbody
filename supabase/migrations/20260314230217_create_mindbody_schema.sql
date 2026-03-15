/*
  # Mindbody Data Sync Schema

  1. New Tables
    - `clients`
      - Stores client information from Mindbody
      - Fields: id, first_name, last_name, email, phone, birthdate, status, created_date, etc.
    
    - `appointments`
      - Stores appointment bookings
      - Fields: id, client_id, staff_id, start_datetime, end_datetime, status, notes, etc.
    
    - `classes`
      - Stores class schedules
      - Fields: id, class_description_id, location_id, start_datetime, end_datetime, staff_id, etc.
    
    - `class_descriptions`
      - Stores class types and descriptions
      - Fields: id, name, description, category, etc.
    
    - `class_visits`
      - Stores client class bookings
      - Fields: id, class_id, client_id, visit_id, status, etc.
    
    - `sales`
      - Stores sales transactions
      - Fields: id, sale_date, client_id, total, payment_amount, etc.
    
    - `sale_items`
      - Stores individual items in sales
      - Fields: id, sale_id, item_type, item_id, amount, quantity, etc.
    
    - `staff`
      - Stores staff information
      - Fields: id, first_name, last_name, email, is_active, etc.
    
    - `products`
      - Stores retail products
      - Fields: id, name, description, price, etc.
    
    - `services`
      - Stores services and pricing options
      - Fields: id, name, price, count, etc.
    
    - `locations`
      - Stores location information
      - Fields: id, name, address, city, state, etc.
    
    - `sync_logs`
      - Tracks sync history and status
      - Fields: id, sync_type, status, started_at, completed_at, records_synced, error_message
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read all data
    - Only backend can write data (via service role)
*/

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  first_name text,
  last_name text,
  email text,
  mobile_phone text,
  home_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  birth_date date,
  gender text,
  status text,
  is_company boolean DEFAULT false,
  liability_release boolean DEFAULT false,
  emergency_contact_name text,
  emergency_contact_phone text,
  creation_date timestamptz,
  last_modified_date timestamptz,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  client_id text,
  staff_id text,
  location_id text,
  session_type_id text,
  start_datetime timestamptz,
  end_datetime timestamptz,
  status text,
  duration integer,
  notes text,
  staff_requested boolean DEFAULT false,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Class descriptions table
CREATE TABLE IF NOT EXISTS class_descriptions (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category_id text,
  category_name text,
  subcategory_id text,
  subcategory_name text,
  level_id text,
  level_name text,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Classes table
CREATE TABLE IF NOT EXISTS classes (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  class_description_id text,
  location_id text,
  staff_id text,
  start_datetime timestamptz,
  end_datetime timestamptz,
  max_capacity integer DEFAULT 0,
  web_capacity integer DEFAULT 0,
  total_booked integer DEFAULT 0,
  web_booked integer DEFAULT 0,
  total_wait_listed integer DEFAULT 0,
  is_canceled boolean DEFAULT false,
  is_available boolean DEFAULT true,
  is_waitlist_available boolean DEFAULT false,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Class visits table
CREATE TABLE IF NOT EXISTS class_visits (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  class_id text,
  client_id text,
  visit_id text,
  name text,
  start_datetime timestamptz,
  end_datetime timestamptz,
  signed_in boolean DEFAULT false,
  makeup_for_id text,
  service_id text,
  service_name text,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  sale_date timestamptz,
  sale_time text,
  sale_datetime timestamptz,
  client_id text,
  location_id text,
  total numeric(10,2) DEFAULT 0,
  payment_amount numeric(10,2) DEFAULT 0,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id text NOT NULL,
  item_type text,
  item_id text,
  item_name text,
  amount numeric(10,2) DEFAULT 0,
  quantity integer DEFAULT 1,
  discount_amount numeric(10,2) DEFAULT 0,
  tax numeric(10,2) DEFAULT 0,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Staff table
CREATE TABLE IF NOT EXISTS staff (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  first_name text,
  last_name text,
  email text,
  mobile_phone text,
  home_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  bio text,
  is_male boolean,
  sort_order integer,
  is_independent_contractor boolean DEFAULT false,
  always_allow_double_booking boolean DEFAULT false,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  name text NOT NULL,
  group_id text,
  category_id text,
  subcategory_id text,
  price numeric(10,2) DEFAULT 0,
  online_price numeric(10,2) DEFAULT 0,
  tax_included numeric(10,2) DEFAULT 0,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Services (pricing options) table
CREATE TABLE IF NOT EXISTS services (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  name text NOT NULL,
  count integer DEFAULT 0,
  program_id text,
  price numeric(10,2) DEFAULT 0,
  online_price numeric(10,2) DEFAULT 0,
  type text,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE NOT NULL,
  name text NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  state_prov_code text,
  postal_code text,
  phone text,
  latitude numeric(10,6),
  longitude numeric(10,6),
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Sync logs table
CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  records_synced integer DEFAULT 0,
  error_message text,
  raw_response jsonb
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_synced_at ON clients(synced_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_staff_id ON appointments(staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_datetime ON appointments(start_datetime);
CREATE INDEX IF NOT EXISTS idx_classes_start_datetime ON classes(start_datetime);
CREATE INDEX IF NOT EXISTS idx_classes_class_description_id ON classes(class_description_id);
CREATE INDEX IF NOT EXISTS idx_class_visits_class_id ON class_visits(class_id);
CREATE INDEX IF NOT EXISTS idx_class_visits_client_id ON class_visits(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_datetime ON sales(sale_datetime);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type ON sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users to read all data
CREATE POLICY "Authenticated users can read clients"
  ON clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read class descriptions"
  ON class_descriptions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read classes"
  ON classes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read class visits"
  ON class_visits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read sales"
  ON sales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read sale items"
  ON sale_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read staff"
  ON staff FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read services"
  ON services FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read locations"
  ON locations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read sync logs"
  ON sync_logs FOR SELECT
  TO authenticated
  USING (true);
