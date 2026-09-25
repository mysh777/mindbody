/*
# Finalize pricing_options cron: 3 chunks of 100 (batch upsert makes it fast)

## Overview
After optimizing syncPricingOptions to use batch upserts (instead of per-record
upsert + session type linking), each chunk of 100 records completes in ~3-5s.
Reverting from 5 chunks of 50 back to 3 chunks of 100, which tightens the
schedule window. Session type linking is handled by the separate
build_pricing_links job.

## Updated schedule (all times UTC)
- 03:00-03:05  reference data (unchanged)
- 03:06/03:08/03:10  pricing_options chunks 1-3 (~5s each)
- 03:12  build_pricing_links
- 03:15  clients
- 03:18  client_services
- 03:21  appointments
- 03:23/03:25/03:27/03:29  sales Q1-Q4
- 03:31  transactions
- 03:33  client_visits
- 03:34  packages
- 03:35  retail_products
*/

DO $$
DECLARE jname text;
BEGIN
  FOR jname IN
    SELECT jobname FROM cron.job WHERE jobname != 'cleanup-stuck-sync-logs'
  LOOP
    PERFORM cron.unschedule(jname);
  END LOOP;
END $$;

-- Phase 1: lightweight reference data
SELECT cron.schedule('sync-sites',            '0 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sites"}'::jsonb);$$);
SELECT cron.schedule('sync-locations',        '1 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"locations"}'::jsonb);$$);
SELECT cron.schedule('sync-staff',            '2 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff"}'::jsonb);$$);
SELECT cron.schedule('sync-programs',         '3 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"programs"}'::jsonb);$$);
SELECT cron.schedule('sync-services',         '4 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"services"}'::jsonb);$$);
SELECT cron.schedule('sync-staff-services',   '5 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff_services"}'::jsonb);$$);

-- Phase 2: pricing_options in 3 chunks of 100 (~5s each)
SELECT cron.schedule('sync-pricing-options-1', '6 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":0,"pageLimit":100}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options-2', '8 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":100,"pageLimit":100}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options-3', '10 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options","pageOffset":200,"pageLimit":100}'::jsonb);$$);

-- Phase 3: pricing links
SELECT cron.schedule('sync-pricing-links',    '12 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"build_pricing_links"}'::jsonb);$$);

-- Phase 4: clients + dependent data
SELECT cron.schedule('sync-clients',          '15 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"clients"}'::jsonb);$$);
SELECT cron.schedule('sync-client-services',  '18 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"client_services"}'::jsonb);$$);
SELECT cron.schedule('sync-appointments',     '21 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"appointments"}'::jsonb);$$);

-- Phase 5: sales in quarterly chunks
SELECT cron.schedule('sync-sales-q1',         '23 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":1,"monthTo":3}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q2',         '25 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":4,"monthTo":6}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q3',         '27 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":7,"monthTo":9}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q4',         '29 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":10,"monthTo":12}'::jsonb);$$);

-- Phase 6: remaining
SELECT cron.schedule('sync-transactions',     '31 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"transactions"}'::jsonb);$$);
SELECT cron.schedule('sync-client-visits',    '33 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"client_visits"}'::jsonb);$$);
SELECT cron.schedule('sync-packages',         '34 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"packages"}'::jsonb);$$);
SELECT cron.schedule('sync-retail-products',  '35 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"retail_products"}'::jsonb);$$);
