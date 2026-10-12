/*
# Speed up Client Segments loads

1. What it does
- `sales (sale_date, id)`: month-range reads of sales no longer scan the whole table.
- Partial `client_services (id) WHERE remaining > 0`: the open-packages read walks only
  packages with sessions left instead of every package ever sold.

2. Why
- Both reads ran into the 3-second read limit on Client Segments when loaded together.

3. Notes
- No data, tables, columns or security policies change. Idempotent.
*/

CREATE INDEX IF NOT EXISTS idx_sales_sale_date_id ON public.sales (sale_date, id);

CREATE INDEX IF NOT EXISTS idx_client_services_open_id
  ON public.client_services (id)
  WHERE remaining > 0;
