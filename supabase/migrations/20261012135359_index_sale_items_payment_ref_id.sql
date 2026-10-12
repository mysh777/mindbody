/*
# Index for package-price lookups on the Margin pages

1. Change
   - New index `idx_sale_items_payment_ref` on `sale_items(payment_ref_id)` covering `total_amount, item_id`,
     only for rows where both payment_ref_id and total_amount are set (the exact filter the Margin pages use).
   - Before: every 100-id lookup scanned all ~12,500 sale_items rows (up to 1.2 s on a cold read).

2. Effect on numbers
   - None. Same query, same rows; only the way the database finds them changes.

3. Security
   - No policy or privilege changes.

4. Rollback
   - DROP INDEX IF EXISTS public.idx_sale_items_payment_ref;
*/

CREATE INDEX IF NOT EXISTS idx_sale_items_payment_ref
  ON public.sale_items (payment_ref_id) INCLUDE (total_amount, item_id)
  WHERE payment_ref_id IS NOT NULL AND total_amount IS NOT NULL;
