/*
# Backfill sale_items for 2025 from sales.raw_data

## Overview
The sales table contains 4,501 sales from 2025 with PurchasedItems stored in raw_data
JSON but never extracted into the sale_items table (only 2026 data was synced via the
API sync function). This migration extracts ~6,990 line items from the raw JSON.

## What it does
- Reads raw_data->'PurchasedItems' from all sales with sale_date before 2026-01-01
- Maps JSON keys to sale_items columns (same mapping as syncSales in mindbody-sync)
- Inserts into sale_items using ON CONFLICT (sale_detail_id) DO NOTHING for safety
- Does NOT touch any existing 2026 records

## Rollback
DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE sale_date < '2026-01-01');

## Important
1. One-time data backfill, no schema changes
2. Idempotent via ON CONFLICT DO NOTHING
3. Sentinel dates '0001-01-01T00:00:00' are mapped to NULL for exp_date and active_date
*/

INSERT INTO sale_items (
  sale_id,
  sale_detail_id,
  mindbody_id,
  item_name,
  description,
  item_type,
  item_id,
  total_amount,
  unit_price,
  amount,
  quantity,
  discount_amount,
  discount_percent,
  tax_amount,
  tax,
  tax1,
  tax2,
  tax3,
  tax4,
  tax5,
  is_service,
  payment_ref_id,
  returned,
  barcode_id,
  category_id,
  sub_category_id,
  contract_id,
  notes,
  exp_date,
  active_date,
  gift_card_barcode_id,
  recipient_client_id,
  raw_data
)
SELECT
  s.id,
  (item->>'SaleDetailId')::integer,
  item->>'Id',
  item->>'Description',
  item->>'Description',
  CASE WHEN (item->>'IsService')::boolean THEN 'Service' ELSE 'Product' END,
  item->>'Id',
  (item->>'TotalAmount')::numeric,
  (item->>'UnitPrice')::numeric,
  (item->>'TotalAmount')::numeric,
  (item->>'Quantity')::integer,
  (item->>'DiscountAmount')::numeric,
  (item->>'DiscountPercent')::numeric,
  (item->>'TaxAmount')::numeric,
  (item->>'TaxAmount')::numeric,
  (item->>'Tax1')::numeric,
  (item->>'Tax2')::numeric,
  (item->>'Tax3')::numeric,
  (item->>'Tax4')::numeric,
  (item->>'Tax5')::numeric,
  (item->>'IsService')::boolean,
  (item->>'PaymentRefId')::integer,
  (item->>'Returned')::boolean,
  item->>'BarcodeId',
  (item->>'CategoryId')::integer,
  (item->>'SubCategoryId')::integer,
  item->>'ContractId',
  item->>'Notes',
  CASE WHEN item->>'ExpDate' IS NOT NULL AND item->>'ExpDate' != '0001-01-01T00:00:00' THEN (item->>'ExpDate')::timestamptz ELSE NULL END,
  CASE WHEN item->>'ActiveDate' IS NOT NULL AND item->>'ActiveDate' != '0001-01-01T00:00:00' THEN (item->>'ActiveDate')::timestamptz ELSE NULL END,
  item->>'GiftCardBarcodeId',
  CASE WHEN item->>'RecipientClientId' IS NOT NULL THEN (item->>'RecipientClientId')::text ELSE NULL END,
  item
FROM sales s,
  jsonb_array_elements(s.raw_data->'PurchasedItems') AS item
WHERE s.sale_date < '2026-01-01'
  AND s.raw_data->'PurchasedItems' IS NOT NULL
  AND jsonb_array_length(s.raw_data->'PurchasedItems') > 0
ON CONFLICT (sale_detail_id) DO NOTHING;
