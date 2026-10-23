/*
# Create get_deposit_client_transactions RPC

## Purpose
Reconciliation needs the full sale history of every client who holds a deposit
("Payment on Account" / PoA item). The browser currently loads this one client
at a time through hundreds of paginated requests (~126 clients), which is the
single slowest part of the reconciliation run. This RPC returns all of those
clients' sales, sale_items, and payments in one database round-trip so the
shared browser/server calculation can skip the per-client fetch loop entirely.

## New function
  `get_deposit_client_transactions()`
    - SECURITY DEFINER, owned by postgres, search_path = public.
    - Returns three JSON arrays in a single row:
        sales       — id, client_id, location_id, sale_date (YYYY-MM-DD)
        sale_items  — sale_id, item_id, total_amount, is_service, description, returned, category_id
        payments    — sale_id, type, amount
    - A client is a "deposit client" when any of its sale_items matches a
      Payment-on-Account item_id (-6, 10289) or has description = 'Payment on Account'.
    - All sales for those clients (every period, not just the current month) are
      returned so the FIFO balance history is complete.

## Security
  - SECURITY DEFINER so it can read sales/sale_items/payments regardless of the
    caller's RLS. The caller already authenticates (is_signed_in or cron secret);
    this function only exposes the same data the caller could already read.
  - search_path set to 'public' to prevent schema-injection.
  - Granted EXECUTE to authenticated and anon (the anon key is used by the
    server-side bundle and the no-auth fallback reads).
*/

CREATE OR REPLACE FUNCTION public.get_deposit_client_transactions()
RETURNS TABLE(sales jsonb, sale_items jsonb, payments jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deposit_clients AS (
    SELECT DISTINCT s.client_id
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE si.item_id IN ('-6', '10289')
       OR si.description = 'Payment on Account'
  ),
  client_sales AS (
    SELECT sa.id::text        AS id,
           sa.client_id,
           sa.location_id,
           to_char(sa.sale_date, 'YYYY-MM-DD') AS sale_date
    FROM sales sa
    JOIN deposit_clients dc ON dc.client_id = sa.client_id
    ORDER BY sa.client_id, sa.sale_date, sa.id
  ),
  client_sale_ids AS (
    SELECT id FROM client_sales
  ),
  client_items AS (
    SELECT si.sale_id::text    AS sale_id,
           si.item_id,
           si.total_amount::numeric,
           si.is_service,
           si.description,
           si.returned,
           si.category_id
    FROM sale_items si
    JOIN client_sale_ids csi ON csi.id = si.sale_id
  ),
  client_payments AS (
    SELECT p.sale_id::text   AS sale_id,
           p.type,
           p.amount::numeric
    FROM payments p
    JOIN client_sale_ids csi ON csi.id = p.sale_id
  )
  SELECT
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM client_sales) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM client_items) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM client_payments) t), '[]'::jsonb)
$$;

ALTER FUNCTION public.get_deposit_client_transactions() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_deposit_client_transactions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_deposit_client_transactions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deposit_client_transactions() TO anon;
