/*
# Speed up the lookup of zero-price sale items

1. What it does
- Adds a small partial index on `sale_items (id)` covering only rows with `total_amount = 0`
  and a `payment_ref_id`. Client Segments, the Overview new-clients count and Reconciliation
  read exactly these rows to find free (Comp/Guest) visits.

2. Why
- Without it, the lookup walks the whole table in id order (about 0.7 s per page of 1000 rows),
  which can exceed the 3-second read limit when it runs alongside other loads.

3. Notes
- No data, tables, columns or security policies change.
- Idempotent (IF NOT EXISTS).
*/

CREATE INDEX IF NOT EXISTS idx_sale_items_zero_amount_ref
  ON public.sale_items (id)
  WHERE total_amount = 0 AND payment_ref_id IS NOT NULL;