/*
# Optimize get_deposit_client_transactions RPC

The first version used nested subqueries with row_to_json which caused statement
timeouts. This version uses jsonb_build_object directly in the aggregation, which
is much faster, and uses a materialized CTE for the deposit client list.
*/

CREATE OR REPLACE FUNCTION public.get_deposit_client_transactions()
RETURNS TABLE(sales jsonb, sale_items jsonb, payments jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deposit_clients AS MATERIALIZED (
    SELECT DISTINCT s.client_id
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE si.item_id IN ('-6', '10289')
       OR si.description = 'Payment on Account'
  ),
  client_sales AS MATERIALIZED (
    SELECT sa.id::text        AS id,
           sa.client_id,
           sa.location_id,
           to_char(sa.sale_date, 'YYYY-MM-DD') AS sale_date
    FROM sales sa
    JOIN deposit_clients dc ON dc.client_id = sa.client_id
    ORDER BY sa.client_id, sa.sale_date, sa.id
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', cs.id, 'client_id', cs.client_id,
      'location_id', cs.location_id, 'sale_date', cs.sale_date
    )), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sale_id', si.sale_id::text, 'item_id', si.item_id,
        'total_amount', si.total_amount::numeric, 'is_service', si.is_service,
        'description', si.description, 'returned', si.returned, 'category_id', si.category_id
      ))
      FROM sale_items si
      JOIN client_sales cs ON cs.id = si.sale_id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sale_id', p.sale_id::text, 'type', p.type, 'amount', p.amount::numeric
      ))
      FROM payments p
      JOIN client_sales cs ON cs.id = p.sale_id
    ), '[]'::jsonb)
  FROM client_sales cs
$$;

ALTER FUNCTION public.get_deposit_client_transactions() OWNER TO postgres;
