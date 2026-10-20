/*
# Update cron jobs to include X-Cron-Secret header (v3)

## Purpose
Phase 2 protects edge functions with verify_jwt=true. Cron jobs need
to include X-Cron-Secret header to authenticate. Previous attempts failed
because cron.job is not directly updatable — must use cron.alter_job().

## What changes
- All 27 cron jobs that call edge functions via net.http_post get their
  headers updated to include X-Cron-Secret with the secret from _cron_secret.
- Uses cron.alter_job(job_id, schedule, command, ...) to update each job.

## Rollback
Each job's command would need to be reverted to use:
  headers:='{"Content-Type":"application/json"}'::jsonb
instead of the jsonb_build_object with X-Cron-Secret.
*/

DO $$
DECLARE
  job_record RECORD;
  new_command TEXT;
  old_pattern TEXT;
  new_expr TEXT;
BEGIN
  -- The actual stored text uses: headers:='{"Content-Type":"application/json"}'::jsonb
  -- In PL/pgSQL string, doubled single quotes produce literal single quotes
  old_pattern := 'headers:=''{"Content-Type":"application/json"}''::jsonb';
  new_expr := 'headers:=jsonb_build_object(''Content-Type'',''application/json'',''X-Cron-Secret'',(SELECT secret FROM _cron_secret WHERE id=1))';

  FOR job_record IN
    SELECT jobid, command FROM cron.job WHERE command LIKE '%net.http_post%'
  LOOP
    new_command := replace(job_record.command, old_pattern, new_expr);

    IF new_command != job_record.command THEN
      PERFORM cron.alter_job(job_record.jobid, NULL, new_command, NULL, NULL, NULL);
      RAISE NOTICE 'Updated cron job %', job_record.jobid;
    ELSE
      RAISE NOTICE 'No match for cron job %', job_record.jobid;
    END IF;
  END LOOP;
END $$;
