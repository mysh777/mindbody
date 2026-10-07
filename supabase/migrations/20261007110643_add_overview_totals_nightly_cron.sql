/*
# Nightly Overview totals job

1. What it does
- Schedules the `overview-totals` edge function every night at 03:45, after all sync steps (03:00-03:36).
- The job recomputes the last 3 months of Overview totals (Sales by service, Money received,
  Revenue earned, Staff cost, visits, new clients) and saves them to `overview_monthly_totals`.
- On the 1st of each month it also saves studio obligations as of the previous month's last day
  into `obligation_snapshots`, so month-to-month comparison becomes possible.

2. Notes
- Idempotent: an existing job with the same name is unscheduled first.
- The function runs the work in the background, so the HTTP call returns immediately.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'overview-totals') THEN
    PERFORM cron.unschedule('overview-totals');
  END IF;
END $$;

SELECT cron.schedule(
  'overview-totals',
  '45 3 * * *',
  $$select net.http_post(
    url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/overview-totals',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{"background":true}'::jsonb
  )$$
);