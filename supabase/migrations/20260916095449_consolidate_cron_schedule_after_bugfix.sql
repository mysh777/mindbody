/*
# Consolidate cron schedule after totalRecords bug fix

## Overview
The totalRecords calculation bug (storing "34[object Object]" in an integer column)
was causing the sync_logs UPDATE to silently fail, making staff_services and
pricing_options look "stuck" when they actually completed fine. Now that the bug
is fixed, we can simplify:

1. staff_services: revert from 10 chunks back to a single call (completes in ~10s)
2. pricing_options: revert from 2 chunks back to a single call (completes in ~122s)
3. sales: KEEP quarterly chunking (full year genuinely exceeds 150s)
4. Fix pricing-links ordering (must run after pricing_options finishes)
5. Reorder the full schedule with no time-slot conflicts

## Updated schedule (all times UTC)
- 03:00  sites           (~2s)
- 03:01  locations        (~2s)
- 03:02  staff            (~2s)
- 03:03  programs         (~2s)
- 03:04  services         (~7-17s)
- 03:05  staff_services   (~10s) -- single call, no chunking
- 03:06  pricing_options  (~122s) -- single call, no chunking
- 03:09  build_pricing_links (~67s) -- starts at +3m to ensure pricing_options finishes
- 03:12  clients          (~39s)
- 03:15  client_services  (~48s)
- 03:18  appointments     (~32s)
- 03:20  sales Q1 months 1-3 (~58s)
- 03:22  sales Q2 months 4-6 (~57s)
- 03:24  sales Q3 months 7-9 (~55s)
- 03:26  sales Q4 months 10-12 (~1s, future quarters)
- 03:28  transactions     (~15s)
- 03:30  client_visits    (~2s)
- 03:31  packages         (~3s)
- 03:32  retail_products  (~5s)

## Preserved
- cleanup-stuck-sync-logs (every 30 min) -- unchanged
*/

-- 1. Drop all existing sync jobs (except cleanup)
DO $$
DECLARE jname text;
BEGIN
  FOR jname IN
    SELECT jobname FROM cron.job WHERE jobname != 'cleanup-stuck-sync-logs'
  LOOP
    PERFORM cron.unschedule(jname);
  END LOOP;
END $$;

-- 2. Create consolidated schedule
SELECT cron.schedule('sync-sites',            '0 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sites"}'::jsonb);$$);
SELECT cron.schedule('sync-locations',        '1 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"locations"}'::jsonb);$$);
SELECT cron.schedule('sync-staff',            '2 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff"}'::jsonb);$$);
SELECT cron.schedule('sync-programs',         '3 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"programs"}'::jsonb);$$);
SELECT cron.schedule('sync-services',         '4 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"services"}'::jsonb);$$);
SELECT cron.schedule('sync-staff-services',   '5 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff_services"}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-options',  '6 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"pricing_options"}'::jsonb);$$);
SELECT cron.schedule('sync-pricing-links',    '9 3 * * *',  $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"build_pricing_links"}'::jsonb);$$);
SELECT cron.schedule('sync-clients',          '12 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"clients"}'::jsonb);$$);
SELECT cron.schedule('sync-client-services',  '15 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"client_services"}'::jsonb);$$);
SELECT cron.schedule('sync-appointments',     '18 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"appointments"}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q1',         '20 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":1,"monthTo":3}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q2',         '22 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":4,"monthTo":6}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q3',         '24 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":7,"monthTo":9}'::jsonb);$$);
SELECT cron.schedule('sync-sales-q4',         '26 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"sales","monthFrom":10,"monthTo":12}'::jsonb);$$);
SELECT cron.schedule('sync-transactions',     '28 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"transactions"}'::jsonb);$$);
SELECT cron.schedule('sync-client-visits',    '30 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"client_visits"}'::jsonb);$$);
SELECT cron.schedule('sync-packages',         '31 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"packages"}'::jsonb);$$);
SELECT cron.schedule('sync-retail-products',  '32 3 * * *', $$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"retail_products"}'::jsonb);$$);
