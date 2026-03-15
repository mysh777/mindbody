/*
  # Add Missing Fields to Pricing Options

  1. Changes to `pricing_options` Table
    - Add `product_id` (text) - Product ID from service
    - Add `program_id` (text) - Program ID reference
    - Add `priority` (text) - Service priority (Low, Medium, High)
    - Add `discontinued` (boolean) - Whether service is discontinued
    - Add `is_intro_offer` (boolean) - Whether this is an intro offer
    - Add `membership_id` (text) - Membership ID if applicable
    - Add `expiration_type` (text) - SaleDate, SessionCount, etc
    - Add `expiration_unit` (text) - Days, Months, etc
    - Add `expiration_length` (integer) - Length of expiration
    - Add `intro_offer_type` (text) - Type of intro offer
    - Add `use_at_location_ids` (jsonb) - Array of location IDs where can be used
    - Add `sell_at_location_ids` (jsonb) - Array of location IDs where can be sold
    - Add `sale_in_contract_only` (boolean) - Only sold in contracts
    - Add `restrict_to_membership_ids` (jsonb) - Restricted to specific memberships
    - Add `is_third_party_discount_pricing` (boolean)
    - Add `apply_member_discounts_of_membership_ids` (jsonb)
    - Add `program_name` (text) - Program name for reference

  2. Add indexes for new fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'product_id'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN product_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'program_id'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN program_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'priority'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN priority text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'discontinued'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN discontinued boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'is_intro_offer'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN is_intro_offer boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'membership_id'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN membership_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'expiration_type'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN expiration_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'expiration_unit'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN expiration_unit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'expiration_length'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN expiration_length integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'intro_offer_type'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN intro_offer_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'use_at_location_ids'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN use_at_location_ids jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'sell_at_location_ids'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN sell_at_location_ids jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'sale_in_contract_only'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN sale_in_contract_only boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'restrict_to_membership_ids'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN restrict_to_membership_ids jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'is_third_party_discount_pricing'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN is_third_party_discount_pricing boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'apply_member_discounts_of_membership_ids'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN apply_member_discounts_of_membership_ids jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pricing_options' AND column_name = 'program_name'
  ) THEN
    ALTER TABLE pricing_options ADD COLUMN program_name text;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pricing_options_product_id ON pricing_options(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_options_program_id ON pricing_options(program_id);
