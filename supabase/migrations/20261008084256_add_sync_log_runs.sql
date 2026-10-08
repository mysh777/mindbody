/*
# Group sync log entries into runs

1. Modified Tables
- `sync_logs`
  - `run_id` (uuid, nullable): shared by every step that belongs to one run
    (one nightly sync, one Quick Sync press, one full sync, or one manual step).
  - `run_type` (text, nullable): `nightly`, `quick`, `full`, `manual` or `maintenance`.
  - Index on `run_id` for grouping.
  - Old rows keep NULL in both columns; the Sync History page groups them by time.

2. Scheduled jobs
- Every nightly `mindbody-sync` step and the nightly `overview-totals` job now also send
  `runType = nightly` and `runId = md5('nightly-' || UTC date)::uuid`, so all steps of one
  night share one id. Schedule times, job names and step parameters are unchanged.

3. Security
- No policy changes. `sync_logs` keeps its existing read-only access for the app.

4. Notes
- Idempotent: columns use IF NOT EXISTS; jobs already carrying runType are skipped.
*/

ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS run_id uuid;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS run_type text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sync_logs_run_type_check') THEN
    ALTER TABLE public.sync_logs ADD CONSTRAINT sync_logs_run_type_check
      CHECK (run_type IS NULL OR run_type IN ('nightly', 'quick', 'full', 'manual', 'maintenance'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sync_logs_run_id ON public.sync_logs (run_id);

DO $$
DECLARE
  j record;
  run_expr text := $x$ || jsonb_build_object('runType', 'nightly', 'runId', md5('nightly-' || ((now() AT TIME ZONE 'utc')::date)::text)::uuid)$x$;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE command NOT LIKE '%runType%'
      AND (command LIKE '%/functions/v1/mindbody-sync%' OR command LIKE '%/functions/v1/overview-totals%')
  LOOP
    IF j.command LIKE '%/functions/v1/mindbody-sync%' THEN
      PERFORM cron.alter_job(j.jobid, command := replace(j.command, $q$}'::jsonb);$q$, $q$}'::jsonb$q$ || run_expr || ');'));
    ELSE
      PERFORM cron.alter_job(j.jobid, command := replace(j.command, $q${"background":true}'::jsonb$q$, $q${"background":true}'::jsonb$q$ || run_expr));
    END IF;
  END LOOP;
END $$;
