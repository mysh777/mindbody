/*
# Log retention with a daily cleanup

Keeps the database from growing without limit by removing old diagnostic logs every day.

1. Retention rules
   - `api_logs` (detailed Mindbody request log): rows older than 90 days.
   - `mindbody_api_calls` (per-call counter): rows older than 90 days.
   - `api_raw_data` (raw API responses): rows older than 30 days.
   - `sync_logs` (Sync History): rows older than 12 months (by started_at).
   - `cron.job_run_details` (scheduler run history): rows older than 14 days.

2. New function
   - `public.purge_old_logs()` deletes the rows above and returns the counts per table.
     EXECUTE is revoked from public/anon/authenticated; only the scheduler (postgres) runs it.

3. Schedule
   - pg_cron job `purge-old-logs` daily at 02:30 UTC, before the 03:00 Mindbody sync.

4. Not touched
   - reconciliation_baseline, reconciliation_*, obligation_snapshots, overview_monthly_totals,
     _usage_baseline_20261012, and all business data tables.

5. Rollback
   - SELECT cron.unschedule('purge-old-logs'); DROP FUNCTION public.purge_old_logs();
     (Deleted log rows cannot be restored.)
*/

CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  n_logs bigint; n_calls bigint; n_raw bigint; n_sync bigint; n_cron bigint;
BEGIN
  DELETE FROM public.api_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n_logs = ROW_COUNT;
  DELETE FROM public.mindbody_api_calls WHERE called_at < now() - interval '90 days';
  GET DIAGNOSTICS n_calls = ROW_COUNT;
  DELETE FROM public.api_raw_data WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS n_raw = ROW_COUNT;
  DELETE FROM public.sync_logs WHERE started_at < now() - interval '12 months';
  GET DIAGNOSTICS n_sync = ROW_COUNT;
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days';
  GET DIAGNOSTICS n_cron = ROW_COUNT;
  RETURN jsonb_build_object('api_logs', n_logs, 'mindbody_api_calls', n_calls,
    'api_raw_data', n_raw, 'sync_logs', n_sync, 'cron_job_run_details', n_cron);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_logs() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-logs') THEN
    PERFORM cron.unschedule('purge-old-logs');
  END IF;
  PERFORM cron.schedule('purge-old-logs', '30 2 * * *', 'SELECT public.purge_old_logs()');
END $$;
