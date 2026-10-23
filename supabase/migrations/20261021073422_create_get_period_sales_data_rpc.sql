/*
# Create get_period_sales_data RPC

Returns all sales, sale_items, and payments for a given date range in a single
call, replacing dozens of paginated REST requests from computeSalesByDateData.

## Parameters
  p_start date, p_end date — inclusive date range

## Returns
  Single row with three JSON arrays: sales, sale_items, payments
*/
CREATE OR REPLACE FUNCTION public.get_period_sales_data(p_start date, p_end date)
RETURNS TABLE(sales jsonb, sale_items jsonb, payments jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH period_sales AS MATERIALIZED (
    SELECT sa.id::text        AS id,
           sa.client_id,
           sa.location_id,
           to_char(sa.sale_date, 'YYYY-MM-DD') AS sale_date
    FROM sales sa
    WHERE sa.sale_date >= p_start AND sa.sale_date <= p_end
    ORDER BY sa.id
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', ps.id, 'client_id', ps.client_id,
      'location_id', ps.location_id, 'sale_date', ps.sale_date
    )), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sale_id', si.sale_id::text, 'item_id', si.item_id,
        'total_amount', si.total_amount::numeric, 'is_service', si.is_service,
        'description', si.description, 'returned', si.returned, 'category_id', si.category_id
      ))
      FROM sale_items si
      JOIN period_sales ps ON ps.id = si.sale_id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sale_id', p.sale_id::text, 'type', p.type, 'amount', p.amount::numeric
      ))
      FROM payments p
      JOIN period_sales ps ON ps.id = p.sale_id
    ), '[]'::jsonb)
  FROM period_sales ps
$$;

ALTER FUNCTION public.get_period_sales_data OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_period_sales_data(p_start date, p_end date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_period_sales_data(p_start date, p_end date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_sales_data(p_start date, p_end date) TO anon;
