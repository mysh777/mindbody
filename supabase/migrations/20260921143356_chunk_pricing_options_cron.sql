/*
# Chunk pricing_options sync into 3 cron jobs

## Overview
pricing_options consistently times out at the 150s edge function limit (~218 records,
single call takes ~150s+). The syncPricingOptions function already supports pageOffset
and pageLimit parameters. This migration splits the single cron job into 3 chunks of
100 records each, spaced 3 minutes apart, and shifts downstream jobs accordingly.

## Changes
1. Remove single `sync-pricing-options` job at 03:06
2. Add 3 chunked jobs:
   - sync-pricing-options-1 at 03:06 (offset 0, limit 100)
   - sync-pricing-options-2 at 03:09 (offset 100, limit 100)
   - sync-pricing-options-3 at 03:12 (offset 200, limit 100)
3. Shift downstream jobs to start after last chunk finishes (~03:15):
   - build_pricing_links: 03:15 (was 03:09)
   - clients: 03:18 (was 03:12)
   - client_services: 03:21 (was 03:15)
   - appointments: 03:24 (was 03:18)
   - sales Q1-Q4: 03:26/03:28/03:30/03:32 (was 03:20/03:22/03:24/03:26)
   - transactions: 03:34 (was 03:28)
   - client_visits: 03:36 (was 03:30)
   - packages: 03:37 (was 03:31)
   - retail_products: 03:38 (was 03:32)

## Important
- Jobs before pricing_options (sites, locations, staff, programs, services,
  staff_services) are unchanged.
- cleanup-stuck-sync-logs is unchanged.
- Manual calls with syncType:"pricing_options" (no offset) still sync everything.
*/

-- 1. Drop ALL sync jobs (except cleanup) and recreate from scratch
DO $$
DECLARE jname text;
BEGIN
  FOR jname IN
    SELECT jobname FROM cron.job WHERE jobname != 'cleanup-stuck-sync-logs'
  LOOP
    PERFORM cron.unschedule(jname);
  END LOOP;
END $$;

-- 2. Recreate full schedule with chunked pricing_options

-- Phase 1: lightweight reference data (unchanged)
SELECT cron.schedule('sync-sites',            '0 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sites"}'::jsonb);$$);
SELECT cron.schedule('sync-locations',        '1 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"locations"}'::jsonb);$$);
SELECT cron.schedule('sync-staff',            '2 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff"}'::jsonb);$$);
SELECT cron.schedule('sync-programs',         '3 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"programs"}'::jsonb);$$);
SELECT cron.schedule('sync-services',         '4 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"services"}'::jsonb);$$);
SELECT cron.schedule('sync-staff-services',   '5 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff_services"}'::jsonb);$$);

-- Phase 2: pricing_options in 3 chunks of 100, spaced 3 min apart
SELECT cron.schedule('sync-pricing-options-1', '6 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":0,"pageLimit":100}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options-2', '9 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":100,"pageLimit":100}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options-3', '12 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":200,"pageLimit":100}'::jsonb);$$);

-- Phase 3: pricing links (must run after ALL pricing_options chunks finish)
SELECT cron.schedule('sync-pricing-links',    '15 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"build_pricing_links"}'::jsonb);$$);

-- Phase 4: clients + dependent data
SELECT cron.schedule('sync-clients',          '18 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"clients"}'::jsonb);$$);
SELECT cron.schedule('sync-client-services',  '21 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"client_services"}'::jsonb);$$);
SELECT cron.schedule('sync-appointments',     '24 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"appointments"}'::jsonb);$$);

-- Phase 5: sales in quarterly chunks
SELECT cron.schedule('sync-sales-q1',         '26 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":1,"monthTo":3}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q2',         '28 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":4,"monthTo":6}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q3',         '30 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":7,"monthTo":9}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q4',         '32 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":10,"monthTo":12}'::jsonb);$$);

-- Phase 6: remaining sync steps
SELECT cron.schedule('sync-transactions',     '34 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"transactions"}'::jsonb);$$);
SELECT cron.schedule('sync-client-visits',    '36 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"client_visits"}'::jsonb);$$);
SELECT cron.schedule('sync-packages',         '37 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"packages"}'::jsonb);$$);
SELECT cron.schedule('sync-retail-products',  '38 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"retail_products"}'::jsonb);$$);
