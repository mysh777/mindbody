/*
  # Add Pricing Options and Retail Products Tables

  ## Overview
  This migration creates tables for:
  1. Pricing options (services that can be booked as appointments)
  2. Retail products (physical products sold)
  3. Updates appointments table to link with pricing options

  ## New Tables
  
  ### `pricing_options`
  Stores service pricing from Mindbody (site/services endpoint)
  - `id` (uuid, primary key)
  - `mindbody_id` (text, unique) - Mindbody service ID
  - `name` (text) - Pricing option name
  - `service_type` (text) - Type: Appointments, Classes, etc
  - `service_category` (text) - Service category
  - `price` (numeric) - Base price
  - `online_price` (numeric) - Online price
  - `duration` (int) - Duration in minutes
  - `tax_included` (boolean) - Whether tax is included
  - `tax_rate` (numeric) - Tax rate percentage
  - `sold_online` (boolean) - Available for online booking
  - `bookable_online` (boolean) - Bookable online
  - `is_introductory` (boolean) - Is introductory offer
  - `session_count` (int) - Number of sessions (null for single)
  - `expiration_days` (int) - Days until expiration
  - `revenue_category` (text) - Revenue category
  - `active` (boolean) - Is active
  - `raw_data` (jsonb) - Full API response
  - `synced_at` (timestamptz) - Last sync timestamp

  ### `retail_products`
  Stores retail products from Mindbody (site/products endpoint)
  - `id` (uuid, primary key)
  - `mindbody_id` (text, unique) - Mindbody product ID
  - `name` (text) - Product name
  - `barcode` (text) - Product barcode
  - `retail_price` (numeric) - Regular retail price
  - `online_price` (numeric) - Online price
  - `cost` (numeric) - Our cost
  - `active` (boolean) - Is product active
  - `sell_online` (boolean) - Available online
  - `description` (text) - Product description
  - `category` (text) - Product category
  - `size` (text) - Product size
  - `color` (text) - Product color
  - `raw_data` (jsonb) - Full API response
  - `created_at` (timestamptz) - Created timestamp
  - `modified_at` (timestamptz) - Modified timestamp
  - `synced_at` (timestamptz) - Last sync timestamp

  ## Changes to Existing Tables

  ### `appointments` table updates
  - Add `pricing_option_id` (uuid) - Link to pricing_options table
  - Add `service_name` (text) - Service name for denormalization
  - Add `duration` (int) - Appointment duration in minutes
  - Add `price` (numeric) - Appointment price

  ### `staff` table updates
  - Add `phone` (text) - Staff phone number
  - Add `email` (text) - Staff email
  - Add `role` (text) - Staff role/position

  ## Security
  - Enable RLS on all new tables
  - Add read-only policies for authenticated users
  - Add anon read policies for public access
*/

-- Create pricing_options table
CREATE TABLE IF NOT EXISTS pricing_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mindbody_id text UNIQUE NOT NULL,
  name text NOT NULL,
  service_type text,
  service_category text,
  price numeric(10, 2),
  online_price numeric(10, 2),
  duration int,
  tax_included boolean DEFAULT false,
  tax_rate numeric(5, 2),
  sold_online boolean DEFAULT false,
  bookable_online boolean DEFAULT false,
  is_introductory boolean DEFAULT false,
  session_count int,
  expiration_days int,
  revenue_category text,
  active boolean DEFAULT true,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now()
);

-- Create retail_products table
CREATE TABLE IF NOT EXISTS retail_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mindbody_id text UNIQUE NOT NULL,
  name text NOT NULL,
  barcode text,
  retail_price numeric(10, 2),
  online_price numeric(10, 2),
  cost numeric(10, 2),
  active boolean DEFAULT true,
  sell_online boolean DEFAULT false,
  description text,
  category text,
  size text,
  color text,
  raw_data jsonb,
  created_at timestamptz,
  modified_at timestamptz,
  synced_at timestamptz DEFAULT now()
);

-- Add columns to appointments table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'pricing_option_id'
  ) THEN
    ALTER TABLE appointments ADD COLUMN pricing_option_id uuid REFERENCES pricing_options(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'service_name'
  ) THEN
    ALTER TABLE appointments ADD COLUMN service_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'duration'
  ) THEN
    ALTER TABLE appointments ADD COLUMN duration int;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'price'
  ) THEN
    ALTER TABLE appointments ADD COLUMN price numeric(10, 2);
  END IF;
END $$;

-- Add columns to staff table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'phone'
  ) THEN
    ALTER TABLE staff ADD COLUMN phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'email'
  ) THEN
    ALTER TABLE staff ADD COLUMN email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'role'
  ) THEN
    ALTER TABLE staff ADD COLUMN role text;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE pricing_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_products ENABLE ROW LEVEL SECURITY;

-- Policies for pricing_options
CREATE POLICY "Anyone can read pricing options"
  ON pricing_options
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policies for retail_products
CREATE POLICY "Anyone can read retail products"
  ON retail_products
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pricing_options_mindbody_id ON pricing_options(mindbody_id);
CREATE INDEX IF NOT EXISTS idx_pricing_options_service_category ON pricing_options(service_category);
CREATE INDEX IF NOT EXISTS idx_pricing_options_active ON pricing_options(active);
CREATE INDEX IF NOT EXISTS idx_retail_products_mindbody_id ON retail_products(mindbody_id);
CREATE INDEX IF NOT EXISTS idx_retail_products_category ON retail_products(category);
CREATE INDEX IF NOT EXISTS idx_retail_products_active ON retail_products(active);
CREATE INDEX IF NOT EXISTS idx_appointments_pricing_option_id ON appointments(pricing_option_id);
