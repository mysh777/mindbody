/*
# Update cron schedule for chunked pricing_options, staff_services, and sales

## Overview
Replaces the single cron jobs for pricing_options, staff_services, and sales with
multiple chunked calls, since these sync types consistently exceed the 150s edge
function runtime limit when called as a single operation.

## Changes
1. sync-pricing-options (single) replaced by sync-pricing-options-1 and sync-pricing-options-2
   - Chunk 1: offset 0, limit 100 (first 100 records) at 03:09
   - Chunk 2: offset 100, limit 200 (remaining records) at 03:11
2. sync-staff-services (single) replaced by sync-staff-services-1 and sync-staff-services-2
   - Chunk 1: staffOffset 0, staffLimit 14 (first 14 staff) at 03:06
   - Chunk 2: staffOffset 14, staffLimit 14 (remaining staff) at 03:08
3. sync-sales (single) replaced by sync-sales-q1 through sync-sales-q4
   - Q1: months 1-3 at 03:24
   - Q2: months 4-6 at 03:26
   - Q3: months 7-9 at 03:28
   - Q4: months 10-12 at 03:30
4. sync-transactions moves to 03:34 (was 03:30, now blocked by sales Q4)
5. sync-client-visits moves to 03:36 (was 03:33)
6. sync-packages moves to 03:38 (was 03:35)
7. sync-retail-products moves to 03:40 (was 03:37)

## Preserved
- cleanup-stuck-sync-logs (every 30 min) -- unchanged
- All other sync jobs -- unchanged (sites, locations, staff, programs, services,
  build_pricing_links, clients, client_services, appointments)

## Important Notes
1. Idempotent: drops old jobs before creating new ones.
2. Pricing options chunking uses pageOffset and pageLimit body params (new).
3. Staff services chunking uses staffOffset and staffLimit body params (new).
4. Sales chunking uses existing year/monthFrom/monthTo body params (monthFrom/monthTo new).
5. Each chunk is a separate sync_logs entry, so you can see which chunk succeeded.
*/

-- 1. Drop old single-call jobs
DO $$
DECLARE
  jname text;
BEGIN
  FOR jname IN
    SELECT unnest(ARRAY[
      'sync-pricing-options', 'sync-staff-services', 'sync-sales',
      'sync-pricing-options-1', 'sync-pricing-options-2',
      'sync-staff-services-1', 'sync-staff-services-2',
      'sync-sales-q1', 'sync-sales-q2', 'sync-sales-q3', 'sync-sales-q4',
      'sync-transactions', 'sync-client-visits', 'sync-packages', 'sync-retail-products'
    ])
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = jname) THEN
      PERFORM cron.unschedule(jname);
    END IF;
  END LOOP;
END $$;

-- 2. Staff services chunks (28 real staff, split into 2 x 14)
SELECT cron.schedule('sync-staff-services-1', '6 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "staff_services", "staffOffset": 0, "staffLimit": 14}'::jsonb
  );$$
);

SELECT cron.schedule('sync-staff-services-2', '8 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "staff_services", "staffOffset": 14, "staffLimit": 14}'::jsonb
  );$$
);

-- 3. Pricing options chunks (218 records, 100/page, split into 2 chunks)
SELECT cron.schedule('sync-pricing-options-1', '9 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "pricing_options", "pageOffset": 0, "pageLimit": 100}'::jsonb
  );$$
);

SELECT cron.schedule('sync-pricing-options-2', '11 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "pricing_options", "pageOffset": 100, "pageLimit": 200}'::jsonb
  );$$
);

-- 4. Sales chunks (split by quarter)
SELECT cron.schedule('sync-sales-q1', '24 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "sales", "monthFrom": 1, "monthTo": 3}'::jsonb
  );$$
);

SELECT cron.schedule('sync-sales-q2', '26 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "sales", "monthFrom": 4, "monthTo": 6}'::jsonb
  );$$
);

SELECT cron.schedule('sync-sales-q3', '28 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "sales", "monthFrom": 7, "monthTo": 9}'::jsonb
  );$$
);

SELECT cron.schedule('sync-sales-q4', '30 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "sales", "monthFrom": 10, "monthTo": 12}'::jsonb
  );$$
);

-- 5. Shifted later steps (to make room for the quarterly sales calls)
SELECT cron.schedule('sync-transactions', '34 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "transactions"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-client-visits', '36 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "client_visits"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-packages', '38 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "packages"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-retail-products', '40 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "retail_products"}'::jsonb
  );$$
);
