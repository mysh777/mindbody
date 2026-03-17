/*
  # Fix Sale Items Unique Constraint for Upsert

  1. Problem
    - Current partial unique index (WHERE sale_detail_id IS NOT NULL) doesn't work with Supabase upsert
    - Upsert requires a proper unique constraint, not a partial index

  2. Solution
    - Drop the partial index
    - Create a proper unique constraint on sale_detail_id
    - Handle existing NULL values by making sale_detail_id NOT NULL with a default

  3. Note
    - Existing records with NULL sale_detail_id will get auto-generated values
*/

DROP INDEX IF EXISTS sale_items_sale_detail_id_key;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) as rn
  FROM sale_items
  WHERE sale_detail_id IS NULL
),
max_val AS (
  SELECT COALESCE(MAX(sale_detail_id), 0) as max_id FROM sale_items
)
UPDATE sale_items si
SET sale_detail_id = (SELECT max_id FROM max_val) + n.rn
FROM numbered n
WHERE si.id = n.id;

ALTER TABLE sale_items 
ALTER COLUMN sale_detail_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sale_items_sale_detail_id_unique'
  ) THEN
    ALTER TABLE sale_items ADD CONSTRAINT sale_items_sale_detail_id_unique UNIQUE (sale_detail_id);
  END IF;
END $$;
