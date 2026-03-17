/*
  # Remove Foreign Key Constraints from Sales Tables
  
  This migration removes foreign key constraints that prevent bulk import of sales data.
  The sales, payments, sale_items, and transactions tables need to accept data without
  requiring exact matches to referenced tables (clients, locations, etc.)
  
  1. Changes
    - Drop FK constraint: sales -> clients
    - Drop FK constraint: sales -> locations  
    - Drop FK constraint: payments -> sales
    - Drop FK constraint: sale_items -> sales
    - Drop FK constraint: transactions -> sales
    
  2. Reason
    - Sales data from Mindbody API contains client_id and location_id that may not
      exist in our synced clients/locations tables yet
    - We store mindbody_id references for later joining instead of strict FK
*/

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_client_id_fkey;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_location_id_fkey;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_sale_id_fkey;
ALTER TABLE sale_items DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_sale_id_fkey;
