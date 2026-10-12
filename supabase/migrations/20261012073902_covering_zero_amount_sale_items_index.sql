/*
# Make the free-visit lookup answerable from the index alone

1. What it does
- Replaces the partial index on zero-price sale items with one that also carries
  `sale_id` and `payment_ref_id`, so the read never touches the wide table rows.

2. Why
- The previous index still had to fetch each full row (about 0.35 s per page of 1000),
  which could push Client Segments over the 3-second read limit under load.

3. Notes
- No data, tables, columns or security policies change. Only an index is swapped.
*/

CREATE INDEX IF NOT EXISTS idx_sale_items_zero_amount_ref_cov
  ON public.sale_items (id) INCLUDE (sale_id, payment_ref_id)
  WHERE total_amount = 0 AND payment_ref_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_sale_items_zero_amount_ref;
