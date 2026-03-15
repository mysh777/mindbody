/*
  # Rebuild MINDBODY Architecture

  Corrects database architecture based on actual MINDBODY API structure.

  ## Key Principles

  1. **Two Separate Planes:**
     - Plane A: Bookable (Programs, SessionTypes, Staff, Appointments)
     - Plane B: Sellable (PricingOptions, Products, Packages, ClientServices, Sales)

  2. **Critical Facts:**
     - SessionTypes ≠ Services (different entities)
     - GET Services endpoint returns pricing options
     - ClientServices.ProductId -> PricingOptions.ProductId

  ## Changes

  - Rename `services` → `session_types`
  - Add `service_subcategories`, `client_services`, `client_visits`, etc.
  - Update relationships and add proper indexes
*/

-- ============================================================================
-- STEP 1: Rename services back to session_types
-- ============================================================================

ALTER TABLE IF EXISTS services RENAME TO session_types;

-- Update junction table names
ALTER TABLE IF EXISTS staff_services RENAME TO staff_session_types;
ALTER TABLE IF EXISTS pricing_option_services RENAME TO pricing_option_session_types;

-- Update column names
ALTER TABLE IF EXISTS staff_session_types RENAME COLUMN service_id TO session_type_id;
ALTER TABLE IF EXISTS pricing_option_session_types RENAME COLUMN service_id TO session_type_id;
ALTER TABLE IF EXISTS appointments RENAME COLUMN service_id TO session_type_id;

-- ============================================================================
-- STEP 2: Service Subcategories
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_subcategories (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE,
  category_id text REFERENCES service_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean DEFAULT true,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STEP 3: Update Session Types
-- ============================================================================

ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS category_id text;
ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS category_name text;
ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS subcategory_id text;
ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS subcategory_name text;
ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS num_deducted integer DEFAULT 1;
ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS staff_time_length integer;
ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS available_for_add_on boolean DEFAULT false;
ALTER TABLE IF EXISTS session_types ADD COLUMN IF NOT EXISTS online_description text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'session_types_category_id_fkey'
  ) THEN
    ALTER TABLE session_types
      ADD CONSTRAINT session_types_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'session_types_subcategory_id_fkey'
  ) THEN
    ALTER TABLE session_types
      ADD CONSTRAINT session_types_subcategory_id_fkey
        FOREIGN KEY (subcategory_id) REFERENCES service_subcategories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Update Sites
-- ============================================================================

ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS page_color1 text;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS page_color2 text;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS page_color3 text;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS page_color4 text;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS accepts_visa boolean DEFAULT false;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS accepts_discover boolean DEFAULT false;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS accepts_mastercard boolean DEFAULT false;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS accepts_amex boolean DEFAULT false;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS tax_inclusive_prices boolean DEFAULT false;

-- ============================================================================
-- STEP 5: Update Locations
-- ============================================================================

ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS site_id text;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS has_classes boolean DEFAULT false;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS phone_extension text;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS tax1 numeric;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS tax2 numeric;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS tax3 numeric;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS tax4 numeric;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS tax5 numeric;

-- ============================================================================
-- STEP 6: Update Products (Retail)
-- ============================================================================

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS sell_online boolean DEFAULT false;
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS discontinued boolean DEFAULT false;
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS tax_rate numeric;
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS revenue_category text;

-- ============================================================================
-- STEP 7: Packages
-- ============================================================================

CREATE TABLE IF NOT EXISTS packages (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE,
  name text NOT NULL,
  description text,
  sell_online boolean DEFAULT false,
  price numeric(10,2),
  online_price numeric(10,2),
  discontinued boolean DEFAULT false,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STEP 8: Client Services - CRITICAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mindbody_id text UNIQUE,
  client_id text NOT NULL,
  product_id text NOT NULL,
  pricing_option_id uuid REFERENCES pricing_options(id) ON DELETE SET NULL,
  name text,
  payment_date timestamptz,
  active_date timestamptz,
  expiration_date timestamptz,
  count integer,
  remaining integer,
  current boolean DEFAULT false,
  program_id text,
  program_name text,
  status text,
  activation_type text,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STEP 9: Client Complete Info Snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_complete_info_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  snapshot_data jsonb NOT NULL,
  use_activate_date boolean,
  show_active_only boolean,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STEP 10: Client Visits
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id text UNIQUE,
  mindbody_id text UNIQUE,
  client_id text NOT NULL,
  class_id text,
  visit_datetime timestamptz NOT NULL,
  service_id text,
  service_name text,
  session_type_id text REFERENCES session_types(id) ON DELETE SET NULL,
  location_id text REFERENCES locations(id) ON DELETE SET NULL,
  staff_id text REFERENCES staff(id) ON DELETE SET NULL,
  signed_in boolean DEFAULT false,
  make_up boolean DEFAULT false,
  late_cancelled boolean DEFAULT false,
  web_signup boolean DEFAULT false,
  appointment_id text,
  appointment_status text,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STEP 11: Payment Types
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_types (
  id text PRIMARY KEY,
  mindbody_id text UNIQUE,
  name text NOT NULL,
  type_code text,
  active boolean DEFAULT true,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STEP 12: Transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text UNIQUE,
  mindbody_id text UNIQUE,
  sale_id text,
  payment_processor text,
  transaction_status text,
  amount numeric(10,2),
  transaction_date timestamptz,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'transactions_sale_id_fkey'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_sale_id_fkey
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- STEP 13: Update Sale Items
-- ============================================================================

ALTER TABLE IF EXISTS sale_items ADD COLUMN IF NOT EXISTS subcategory_id integer;

-- ============================================================================
-- STEP 14: Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_service_subcategories_category_id ON service_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_session_types_category_id ON session_types(category_id);
CREATE INDEX IF NOT EXISTS idx_session_types_subcategory_id ON session_types(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_session_types_program_id ON session_types(program_id);

CREATE INDEX IF NOT EXISTS idx_client_services_client_id ON client_services(client_id);
CREATE INDEX IF NOT EXISTS idx_client_services_product_id ON client_services(product_id);
CREATE INDEX IF NOT EXISTS idx_client_services_pricing_option_id ON client_services(pricing_option_id);

CREATE INDEX IF NOT EXISTS idx_client_visits_client_id ON client_visits(client_id);
CREATE INDEX IF NOT EXISTS idx_client_visits_visit_datetime ON client_visits(visit_datetime);

CREATE INDEX IF NOT EXISTS idx_transactions_sale_id ON transactions(sale_id);

CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(product_id);

CREATE INDEX IF NOT EXISTS idx_staff_session_types_staff_id ON staff_session_types(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_session_types_session_type_id ON staff_session_types(session_type_id);

CREATE INDEX IF NOT EXISTS idx_pricing_option_session_types_pricing_option_id ON pricing_option_session_types(pricing_option_id);
CREATE INDEX IF NOT EXISTS idx_pricing_option_session_types_session_type_id ON pricing_option_session_types(session_type_id);

-- ============================================================================
-- STEP 15: RLS
-- ============================================================================

ALTER TABLE service_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_complete_info_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read service_subcategories" ON service_subcategories FOR SELECT TO anon USING (true);
CREATE POLICY "Public read packages" ON packages FOR SELECT TO anon USING (true);
CREATE POLICY "Public read payment_types" ON payment_types FOR SELECT TO anon USING (true);
CREATE POLICY "Public read client_services" ON client_services FOR SELECT TO anon USING (true);
CREATE POLICY "Public read client_complete_info_snapshots" ON client_complete_info_snapshots FOR SELECT TO anon USING (true);
CREATE POLICY "Public read client_visits" ON client_visits FOR SELECT TO anon USING (true);
CREATE POLICY "Public read transactions" ON transactions FOR SELECT TO anon USING (true);

-- ============================================================================
-- STEP 16: Comments
-- ============================================================================

COMMENT ON TABLE session_types IS 'Bookable services from GET SessionTypes';
COMMENT ON TABLE pricing_options IS 'Sellable pricing options from GET Services';
COMMENT ON TABLE products IS 'Retail products';
COMMENT ON TABLE packages IS 'Package entities';
COMMENT ON TABLE client_services IS 'Client ownership - ProductId links to pricing_options.product_id';
COMMENT ON TABLE client_visits IS 'Client visit history';
COMMENT ON TABLE sales IS 'Sales transactions';
COMMENT ON TABLE transactions IS 'Payment transactions';
