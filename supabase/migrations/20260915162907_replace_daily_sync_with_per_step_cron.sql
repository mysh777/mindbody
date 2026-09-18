/*
# Replace single daily-sync with per-step cron jobs

## Overview
Removes the single daily-mindbody-sync cron job (which called syncType "all" and
always exceeded the 150s edge function runtime limit) and replaces it with 16
individual cron jobs -- one per sync type -- staggered across 03:00-03:37 UTC.

Each job calls the mindbody-sync edge function directly via net.http_post with
a specific syncType. Every individual sync type completes well within the 150s
limit (the heaviest is build_pricing_links at avg 129s, max 132s).

## Execution order rationale
Reference tables first (sites, locations, staff, programs, services), then
relationships (staff_services), then pricing (pricing_options, build_pricing_links),
then clients, then client_services (before appointments, since appointments
reference client_services), then appointments, sales, transactions, visits,
packages, and finally retail_products.

## Jobs created (16 total)
- sync-sites           03:00
- sync-locations       03:02
- sync-staff           03:03
- sync-programs        03:04
- sync-services        03:05
- sync-staff-services  03:07
- sync-pricing-options 03:09
- sync-pricing-links   03:13 (build_pricing_links, avg 129s, needs generous gap)
- sync-clients         03:17
- sync-client-services 03:20 (before appointments)
- sync-appointments    03:24
- sync-sales           03:26 (avg 72s, max 132s)
- sync-transactions    03:30
- sync-client-visits   03:33
- sync-packages        03:35
- sync-retail-products 03:37

## Jobs preserved
- cleanup-stuck-sync-logs (every 30 minutes) -- unchanged, still useful as safety net

## Important Notes
1. The daily-sync edge function is no longer called by cron. It still exists
   and can be invoked manually if needed, but it will still time out with "all".
2. All jobs use the same pattern: POST to mindbody-sync with a JSON body
   containing the specific syncType.
3. The SUPABASE_URL is public (same as VITE_SUPABASE_URL in frontend .env).
4. mindbody-sync has verify_jwt=false, so no Authorization header is needed.
5. Idempotent: safe to re-run (drops all jobs before re-creating).
*/

-- 1. Remove old single "all" job
SELECT cron.unschedule('daily-mindbody-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-mindbody-sync');

-- 2. Remove any previous versions of new jobs (idempotent)
DO $$ 
DECLARE
  jname text;
BEGIN
  FOR jname IN
    SELECT unnest(ARRAY[
      'sync-sites', 'sync-locations', 'sync-staff', 'sync-programs',
      'sync-services', 'sync-staff-services', 'sync-pricing-options',
      'sync-pricing-links', 'sync-clients', 'sync-client-services',
      'sync-appointments', 'sync-sales', 'sync-transactions',
      'sync-client-visits', 'sync-packages', 'sync-retail-products'
    ])
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = jname) THEN
      PERFORM cron.unschedule(jname);
    END IF;
  END LOOP;
END $$;

-- 3. Create individual sync jobs

-- Phase 1: Reference tables (fast, public endpoints)

SELECT cron.schedule('sync-sites', '0 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "sites"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-locations', '2 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "locations"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-staff', '3 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "staff"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-programs', '4 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "programs"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-services', '5 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "services"}'::jsonb
  );$$
);

-- Phase 2: Staff relationships and pricing

SELECT cron.schedule('sync-staff-services', '7 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "staff_services"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-pricing-options', '9 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "pricing_options"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-pricing-links', '13 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "build_pricing_links"}'::jsonb
  );$$
);

-- Phase 3: Clients and their data

SELECT cron.schedule('sync-clients', '17 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "clients"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-client-services', '20 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "client_services"}'::jsonb
  );$$
);

-- Phase 4: Activity data (appointments after client_services)

SELECT cron.schedule('sync-appointments', '24 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "appointments"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-sales', '26 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "sales"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-transactions', '30 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "transactions"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-client-visits', '33 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "client_visits"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-packages', '35 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "packages"}'::jsonb
  );$$
);

SELECT cron.schedule('sync-retail-products', '37 3 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "retail_products"}'::jsonb
  );$$
);
