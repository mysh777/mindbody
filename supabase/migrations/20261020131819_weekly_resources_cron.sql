/*
# Weekly resources sync

1. Change
   - New pg_cron job `mb-weekly-resources` at Sunday 03:55 UTC (before the 04:00 reference-data batch).
   - Calls mindbody-sync with syncType=resources.

2. Not touched
   - No existing jobs modified. No business data.

3. Rollback
   - SELECT cron.unschedule('mb-weekly-resources');
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mb-weekly-resources') THEN
    PERFORM cron.unschedule('mb-weekly-resources');
  END IF;
  PERFORM cron.schedule('mb-weekly-resources', '55 3 * * 0',
    'SELECT net.http_post(url:=''https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync'', headers:=''{"Content-Type":"application/json"}''::jsonb, body:=''{"syncType":"resources"}''::jsonb || jsonb_build_object(''runType'', ''weekly'', ''runId'', md5(''weekly'' || ''-'' || ((now() AT TIME ZONE ''utc'')::date)::text)::uuid), timeout_milliseconds:=150000);');
END $$;
