/*
# Add page_load_metrics to the daily log cleanup

1. Change
   - `public.purge_old_logs()` now also deletes `page_load_metrics` rows older than 90 days,
     the same retention as the Mindbody request log. All other rules are unchanged:
     api_logs / mindbody_api_calls 90 days, api_raw_data 30 days, sync_logs 12 months,
     cron.job_run_details 14 days.
   - The existing daily schedule (`purge-old-logs`, 02:30 UTC) is reused; nothing new is scheduled.

2. Security
   - EXECUTE stays revoked from public/anon/authenticated.

3. Not touched
   - Reconciliation baselines, snapshots, overview totals and all business data.

4. Rollback
   - Re-create the previous function body without the page_load_metrics DELETE.
*/

CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  n_logs bigint; n_calls bigint; n_raw bigint; n_sync bigint; n_cron bigint; n_metrics bigint;
BEGIN
  DELETE FROM public.api_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n_logs = ROW_COUNT;
  DELETE FROM public.mindbody_api_calls WHERE called_at < now() - interval '90 days';
  GET DIAGNOSTICS n_calls = ROW_COUNT;
  DELETE FROM public.api_raw_data WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS n_raw = ROW_COUNT;
  DELETE FROM public.sync_logs WHERE started_at < now() - interval '12 months';
  GET DIAGNOSTICS n_sync = ROW_COUNT;
  DELETE FROM public.page_load_metrics WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n_metrics = ROW_COUNT;
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days';
  GET DIAGNOSTICS n_cron = ROW_COUNT;
  RETURN jsonb_build_object('api_logs', n_logs, 'mindbody_api_calls', n_calls,
    'api_raw_data', n_raw, 'sync_logs', n_sync, 'page_load_metrics', n_metrics,
    'cron_job_run_details', n_cron);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_logs() FROM PUBLIC, anon, authenticated;
