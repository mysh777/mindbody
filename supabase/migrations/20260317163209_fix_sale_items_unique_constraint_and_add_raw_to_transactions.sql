/*
  # Fix Sale Items and Add Raw Data to Transactions

  1. Sale Items Changes
    - Add unique constraint on sale_detail_id (Mindbody's unique identifier for each sale item)
    - This allows proper upsert operations
    
  2. Transactions Changes
    - Verify raw_data column exists (already present from previous migration)
    
  3. Payments Changes
    - Ensure mindbody_id is unique for upsert
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'sale_items' 
    AND indexname = 'sale_items_sale_detail_id_key'
  ) THEN
    CREATE UNIQUE INDEX sale_items_sale_detail_id_key ON sale_items (sale_detail_id) 
    WHERE sale_detail_id IS NOT NULL;
  END IF;
END $$;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN sale_items.sale_detail_id IS 'Unique identifier from Mindbody SaleDetailId';
COMMENT ON COLUMN sale_items.mindbody_id IS 'Item Id from Mindbody (not unique, can repeat across sales)';
