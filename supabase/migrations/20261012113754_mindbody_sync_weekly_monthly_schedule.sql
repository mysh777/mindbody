/*
# Mindbody sync: nightly / weekly / monthly schedule

Cuts billed Mindbody API calls from ~1,300/night to an estimated ~1,400/month
while keeping data complete.

1. Nightly (03:00 UTC, run group "nightly-<date>")
   - clients (scope changed: only clients modified since last run)
   - appointments (scope recent: 7 days back .. 30 days ahead, stale marking for that window)
   - sales (scope recent: last 7 days; refunds are new sales dated today)
   - client_services (scope changed: clients with a visit, new booking or sale since last run)
   - overview-totals at 03:45 is unchanged
2. Weekly, Sunday 04:00 UTC (run group "weekly-<date>")
   - sites, locations, staff, services, staff_services, pricing_options x3,
     build_pricing_links (scope new), packages, retail_products, staff_schedule,
     clients (full), appointments (scope weekly: 90 days back .. 30 ahead, stale marking),
     sales (scope quarter: current quarter)
3. Monthly, day 1 05:00 UTC (run group "monthly-<date>")
   - build_pricing_links full rebuild, client_services full (active 6 months),
     sales Q1..Q4 of the year that just ended the previous day

4. Rollback (restores the old every-night schedule)
   - SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'mb-%';
   - Re-create the old nightly jobs (all '{"syncType":X}' || nightly runId):
     sync-sites 0 3, sync-locations 1 3, sync-staff 2 3, sync-services 4 3,
     sync-staff-services 5 3, sync-pricing-options-1/2/3 6/8/10 3 (pageOffset 0/100/200, pageLimit 100),
     sync-pricing-links 12 3, sync-clients 15 3, sync-client-services 18 3,
     sync-appointments 21 3, sync-sales-q1..q4 23/25/27/29 3 (monthFrom/monthTo),
     sync-packages 34 3, sync-retail-products 35 3, sync-staff-schedule 36 3.
*/

DO $$
DECLARE
  old_job text;
  url text := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync';
  j record;
BEGIN
  FOR old_job IN SELECT jobname FROM cron.job WHERE jobname LIKE 'sync-%' AND command LIKE '%mindbody-sync%' LOOP
    PERFORM cron.unschedule(old_job);
  END LOOP;

  FOR j IN SELECT * FROM (VALUES
    ('mb-nightly-clients',          '0 3 * * *',  'nightly', '{"syncType":"clients","scope":"changed"}'),
    ('mb-nightly-appointments',     '3 3 * * *',  'nightly', '{"syncType":"appointments","scope":"recent"}'),
    ('mb-nightly-sales',            '7 3 * * *',  'nightly', '{"syncType":"sales","scope":"recent"}'),
    ('mb-nightly-client-services',  '12 3 * * *', 'nightly', '{"syncType":"client_services","scope":"changed"}'),
    ('mb-weekly-sites',             '0 4 * * 0',  'weekly',  '{"syncType":"sites"}'),
    ('mb-weekly-locations',         '1 4 * * 0',  'weekly',  '{"syncType":"locations"}'),
    ('mb-weekly-staff',             '2 4 * * 0',  'weekly',  '{"syncType":"staff"}'),
    ('mb-weekly-services',          '4 4 * * 0',  'weekly',  '{"syncType":"services"}'),
    ('mb-weekly-staff-services',    '6 4 * * 0',  'weekly',  '{"syncType":"staff_services"}'),
    ('mb-weekly-pricing-options-1', '8 4 * * 0',  'weekly',  '{"syncType":"pricing_options","pageOffset":0,"pageLimit":100}'),
    ('mb-weekly-pricing-options-2', '10 4 * * 0', 'weekly',  '{"syncType":"pricing_options","pageOffset":100,"pageLimit":100}'),
    ('mb-weekly-pricing-options-3', '12 4 * * 0', 'weekly',  '{"syncType":"pricing_options","pageOffset":200,"pageLimit":100}'),
    ('mb-weekly-pricing-links-new', '14 4 * * 0', 'weekly',  '{"syncType":"build_pricing_links","scope":"new"}'),
    ('mb-weekly-packages',          '16 4 * * 0', 'weekly',  '{"syncType":"packages"}'),
    ('mb-weekly-retail-products',   '17 4 * * 0', 'weekly',  '{"syncType":"retail_products"}'),
    ('mb-weekly-staff-schedule',    '18 4 * * 0', 'weekly',  '{"syncType":"staff_schedule"}'),
    ('mb-weekly-clients-full',      '20 4 * * 0', 'weekly',  '{"syncType":"clients"}'),
    ('mb-weekly-appointments-90d',  '24 4 * * 0', 'weekly',  '{"syncType":"appointments","scope":"weekly"}'),
    ('mb-weekly-sales-quarter',     '30 4 * * 0', 'weekly',  '{"syncType":"sales","scope":"quarter"}'),
    ('mb-monthly-pricing-links',    '0 5 1 * *',  'monthly', '{"syncType":"build_pricing_links"}'),
    ('mb-monthly-client-services',  '5 5 1 * *',  'monthly', '{"syncType":"client_services"}'),
    ('mb-monthly-sales-q1',         '12 5 1 * *', 'monthly', '{"syncType":"sales","monthFrom":1,"monthTo":3}'),
    ('mb-monthly-sales-q2',         '15 5 1 * *', 'monthly', '{"syncType":"sales","monthFrom":4,"monthTo":6}'),
    ('mb-monthly-sales-q3',         '18 5 1 * *', 'monthly', '{"syncType":"sales","monthFrom":7,"monthTo":9}'),
    ('mb-monthly-sales-q4',         '21 5 1 * *', 'monthly', '{"syncType":"sales","monthFrom":10,"monthTo":12}')
  ) AS t(name, sched, kind, body) LOOP
    PERFORM cron.schedule(j.name, j.sched, format(
      $cmd$SELECT net.http_post(url:=%L, headers:='{"Content-Type":"application/json"}'::jsonb, body:=%L::jsonb || jsonb_build_object('runType', %L, 'runId', md5(%L || '-' || ((now() AT TIME ZONE 'utc')::date)::text)::uuid)%s, timeout_milliseconds:=150000);$cmd$,
      url, j.body, j.kind, j.kind,
      CASE WHEN j.name LIKE 'mb-monthly-sales-%' THEN ' || jsonb_build_object(''year'', extract(year from (now() AT TIME ZONE ''utc'') - interval ''1 day'')::int)' ELSE '' END
    ));
  END LOOP;
END $$;
