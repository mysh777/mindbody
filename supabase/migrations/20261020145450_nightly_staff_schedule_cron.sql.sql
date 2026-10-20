/*
# Add nightly staff schedule sync + change weekly to 4-week scope

1. Changes
- New nightly cron job `mb-nightly-staff-schedule` at 03:10 UTC:
  calls mindbody-sync with syncType=staff_schedule, scope=nightly.
  This syncs staff availabilities/unavailabilities for today + 7 days ahead,
  every night, so the Booking calendar always has current schedule data.
- Updates the existing weekly staff_schedule job to pass scope=weekly
  (4 weeks ahead instead of the previous 3-month default window).

2. Request cost analysis
   Studio has ~25 staff with mindbody_id > 0.
   scheduleitems endpoint: batches of 10 staff, 1 page (100 limit) per batch.
   - Nightly (7-day window): ceil(25/10) = 3 requests/night × 30 nights = 90/month
   - Weekly (28-day window): ceil(25/10) = 3 requests/week × 4.3 weeks = ~13/month
   - refresh-today (2-day window): ceil(25/10) = 3 requests per click
   Previous: weekly only with 3-month window = 3 requests/week = ~13/month
   Net increase: ~90 requests/month (nightly) - the weekly already existed.
   This keeps total projected monthly calls well under 3000.

3. Security
- No table, policy, or privilege changes.

4. Rollback
- SELECT cron.unschedule('mb-nightly-staff-schedule');
- Remove "scope":"weekly" from the weekly job body if needed.
*/

-- Add nightly staff schedule (7-day window)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mb-nightly-staff-schedule') THEN
    PERFORM cron.schedule(
      'mb-nightly-staff-schedule',
      '10 3 * * *',
      format(
        $cmd$SELECT net.http_post(url:=%L, headers:='{"Content-Type":"application/json"}'::jsonb, body:='{"syncType":"staff_schedule","scope":"nightly"}'::jsonb || jsonb_build_object('runType', 'nightly', 'runId', md5('nightly' || '-' || ((now() AT TIME ZONE 'utc')::date)::text)::uuid), timeout_milliseconds:=150000);$cmd$,
        'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync'
      )
    );
  END IF;
END $$;

-- Update weekly staff_schedule to use scope=weekly (4 weeks instead of 3 months)
DO $$
DECLARE
  old_body text;
BEGIN
  SELECT command INTO old_body FROM cron.job WHERE jobname = 'mb-weekly-staff-schedule';
  IF old_body IS NOT NULL AND old_body NOT LIKE '%scope%' THEN
    PERFORM cron.unschedule('mb-weekly-staff-schedule');
    PERFORM cron.schedule(
      'mb-weekly-staff-schedule',
      '18 4 * * 0',
      format(
        $cmd$SELECT net.http_post(url:=%L, headers:='{"Content-Type":"application/json"}'::jsonb, body:='{"syncType":"staff_schedule","scope":"weekly"}'::jsonb || jsonb_build_object('runType', 'weekly', 'runId', md5('weekly' || '-' || ((now() AT TIME ZONE 'utc')::date)::text)::uuid), timeout_milliseconds:=150000);$cmd$,
        'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync'
      )
    );
  END IF;
END $$;
