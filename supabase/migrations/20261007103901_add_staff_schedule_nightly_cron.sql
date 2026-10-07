/*
# Nightly sync of staff working hours

1. What changes
- Adds a pg_cron job `sync-staff-schedule` that runs every night at 03:36 UTC.
- It calls the existing `mindbody-sync` edge function with `{"syncType":"staff_schedule"}`,
  the same way every other nightly sync step is called.
- The step loads staff availability / unavailability blocks for last, current and next month
  into `staff_schedule_items` and marks blocks no longer returned by Mindbody as stale.

2. Why
- The owner overview computes staff utilisation (visit hours / working hours) from this table.

3. Notes
- No tables, columns or policies are changed. Re-running this migration replaces the job with the same definition.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-staff-schedule') THEN
    PERFORM cron.unschedule('sync-staff-schedule');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-staff-schedule',
  '36 3 * * *',
  $cmd$SELECT net.http_post(url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"syncType":"staff_schedule"}'::jsonb);$cmd$
);