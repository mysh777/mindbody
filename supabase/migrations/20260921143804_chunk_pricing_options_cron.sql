/*
# Re-chunk pricing_options into 5 smaller cron jobs (50 records each)

## Overview
Even with 100-record chunks, pricing_options times out (~140s for 100 records due to
per-record session_type linking). Reducing to 50 records per chunk (~70s estimated)
gives comfortable headroom under the 150s limit.

## Changes
1. Replace 3 chunks of 100 with 5 chunks of 50:
   - sync-pricing-options-1 at 03:06 (offset 0, limit 50)
   - sync-pricing-options-2 at 03:09 (offset 50, limit 50)
   - sync-pricing-options-3 at 03:12 (offset 100, limit 50)
   - sync-pricing-options-4 at 03:15 (offset 150, limit 50)
   - sync-pricing-options-5 at 03:18 (offset 200, limit 50)
2. Shift downstream jobs accordingly:
   - build_pricing_links: 03:21
   - clients: 03:24
   - client_services: 03:27
   - appointments: 03:30
   - sales Q1-Q4: 03:32/03:34/03:36/03:38
   - transactions: 03:40
   - client_visits: 03:42
   - packages: 03:43
   - retail_products: 03:44

## Important
- cleanup-stuck-sync-logs unchanged
- Manual calls without offset still sync everything
*/

-- 1. Drop ALL sync jobs (except cleanup) and recreate
DO $$
DECLARE jname text;
BEGIN
  FOR jname IN
    SELECT jobname FROM cron.job WHERE jobname != 'cleanup-stuck-sync-logs'
  LOOP
    PERFORM cron.unschedule(jname);
  END LOOP;
END $$;

-- 2. Full schedule with 5x50 pricing_options chunks

-- Phase 1: lightweight reference data
SELECT cron.schedule('sync-sites',            '0 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sites"}'::jsonb);$$);
SELECT cron.schedule('sync-locations',        '1 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"locations"}'::jsonb);$$);
SELECT cron.schedule('sync-staff',            '2 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff"}'::jsonb);$$);
SELECT cron.schedule('sync-programs',         '3 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"programs"}'::jsonb);$$);
SELECT cron.schedule('sync-services',         '4 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"services"}'::jsonb);$$);
SELECT cron.schedule('sync-staff-services',   '5 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff_services"}'::jsonb);$$);

-- Phase 2: pricing_options in 5 chunks of 50, spaced 3 min apart
SELECT cron.schedule('sync-pricing-options-1', '6 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":0,"pageLimit":50}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options-2', '9 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":50,"pageLimit":50}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options-3', '12 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":100,"pageLimit":50}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options-4', '15 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":150,"pageLimit":50}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options-5', '18 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":200,"pageLimit":50}'::jsonb);$$);

-- Phase 3: pricing links (after ALL pricing_options chunks)
SELECT cron.schedule('sync-pricing-links',    '21 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"build_pricing_links"}'::jsonb);$$);

-- Phase 4: clients + dependent data
SELECT cron.schedule('sync-clients',          '24 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"clients"}'::jsonb);$$);
SELECT cron.schedule('sync-client-services',  '27 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"client_services"}'::jsonb);$$);
SELECT cron.schedule('sync-appointments',     '30 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"appointments"}'::jsonb);$$);

-- Phase 5: sales in quarterly chunks
SELECT cron.schedule('sync-sales-q1',         '32 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":1,"monthTo":3}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q2',         '34 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":4,"monthTo":6}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q3',         '36 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":7,"monthTo":9}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q4',         '38 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":10,"monthTo":12}'::jsonb);$$);

-- Phase 6: remaining sync steps
SELECT cron.schedule('sync-transactions',     '40 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"transactions"}'::jsonb);$$);
SELECT cron.schedule('sync-client-visits',    '42 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"client_visits"}'::jsonb);$$);
SELECT cron.schedule('sync-packages',         '43 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"packages"}'::jsonb);$$);
SELECT cron.schedule('sync-retail-products',  '44 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"retail_products"}'::jsonb);$$);
