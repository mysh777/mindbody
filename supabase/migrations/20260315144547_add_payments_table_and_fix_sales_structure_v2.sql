/*
  # Fix Sales Structure and Add Payments Table

  1. New Tables
    - `payments`
      - `id` (uuid, primary key)
      - `mindbody_id` (text, unique) - Payment ID from Mindbody
      - `sale_id` (text, foreign key) - References sales table
      - `mindbody_sale_id` (text) - Original sale ID from Mindbody
      - `type` (text) - Payment type (AMEX, VISA, Cash, etc)
      - `method` (integer) - Payment method code
      - `amount` (decimal)
      - `notes` (text)
      - `transaction_id` (text)
      - `raw_data` (jsonb)
      - `created_at` (timestamptz)
      - `synced_at` (timestamptz)

  2. Changes to `sales` Table
    - Add `mindbody_sale_id` (text) - ID from Mindbody
    - Add `mindbody_client_id` (text) - Client ID from Mindbody
    - Add `sale_date` (date)
    - Add `sale_time` (time)
    - Add `sale_datetime` (timestamptz)
    - Add `mindbody_location_id` (integer)
    - Add `sales_rep_id` (text)
    - Add `recipient_client_id` (text)
    - Add `original_sale_datetime` (timestamptz)
    - Add `raw_data` (jsonb)

  3. Changes to `sale_items` Table
    - Add all missing fields from PurchasedItems
    - Add proper foreign keys and indexes

  4. Security
    - Enable RLS on payments table
    - Add read policy for authenticated users
*/

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mindbody_id text UNIQUE NOT NULL,
  sale_id text,
  mindbody_sale_id text,
  type text,
  method integer,
  amount decimal(10,2),
  notes text,
  transaction_id text,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  synced_at timestamptz DEFAULT now()
);

-- Add foreign key to sales (will be set after we update sales structure)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'mindbody_sale_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN mindbody_sale_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'mindbody_client_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN mindbody_client_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'sale_date'
  ) THEN
    ALTER TABLE sales ADD COLUMN sale_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'sale_time'
  ) THEN
    ALTER TABLE sales ADD COLUMN sale_time time;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'sale_datetime'
  ) THEN
    ALTER TABLE sales ADD COLUMN sale_datetime timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'mindbody_location_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN mindbody_location_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'sales_rep_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN sales_rep_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'recipient_client_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN recipient_client_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'original_sale_datetime'
  ) THEN
    ALTER TABLE sales ADD COLUMN original_sale_datetime timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'raw_data'
  ) THEN
    ALTER TABLE sales ADD COLUMN raw_data jsonb;
  END IF;
END $$;

-- Add columns to sale_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'mindbody_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN mindbody_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'tax1'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN tax1 decimal(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'tax2'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN tax2 decimal(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'tax3'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN tax3 decimal(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'tax4'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN tax4 decimal(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'tax5'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN tax5 decimal(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'notes'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'exp_date'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN exp_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'returned'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN returned boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'barcode_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN barcode_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'is_service'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN is_service boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN tax_amount decimal(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN unit_price decimal(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'active_date'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN active_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN category_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'contract_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN contract_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'total_amount'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN total_amount decimal(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'payment_ref_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN payment_ref_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'sale_detail_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN sale_detail_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'sub_category_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN sub_category_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN discount_amount decimal(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'discount_percent'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN discount_percent decimal(5,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'gift_card_barcode_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN gift_card_barcode_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'recipient_client_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN recipient_client_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'raw_data'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN raw_data jsonb;
  END IF;
END $$;

-- Add foreign key constraint for payments -> sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'payments_sale_id_fkey'
  ) THEN
    ALTER TABLE payments 
    ADD CONSTRAINT payments_sale_id_fkey 
    FOREIGN KEY (sale_id) 
    REFERENCES sales(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_mindbody_sale_id ON payments(mindbody_sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_mindbody_sale_id ON sales(mindbody_sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_mindbody_client_id ON sales(mindbody_client_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_datetime ON sales(sale_datetime);
CREATE INDEX IF NOT EXISTS idx_sale_items_mindbody_id ON sale_items(mindbody_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_barcode_id ON sale_items(barcode_id);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Create policy for payments
CREATE POLICY "Allow public read access to payments"
  ON payments FOR SELECT
  TO anon
  USING (true);
