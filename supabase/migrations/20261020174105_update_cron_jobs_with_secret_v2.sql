/*
# Update cron jobs to include X-Cron-Secret header (fix)

## Purpose
The previous migration failed to match the exact string format in cron.job.command.
This version uses regexp_replace to handle the escaped quote patterns.

## What changes
- All cron jobs with net.http_post get headers updated to include X-Cron-Secret
- The old pattern: headers:='{"Content-Type":"application/json"}'::jsonb (with various quoting)
- The new pattern uses jsonb_build_object with the secret from _cron_secret

## Rollback
Revert each cron job's headers parameter back to:
  headers:='{"Content-Type":"application/json"}'::jsonb
*/

DO $$
DECLARE
  job_record RECORD;
  new_command TEXT;
BEGIN
  FOR job_record IN
    SELECT jobid, command FROM cron.job WHERE command LIKE '%net.http_post%'
  LOOP
    -- Replace any variant of headers:='{"Content-Type":"application/json"}'::jsonb
    -- The backslashes in the stored command vary, so use regex
    new_command := regexp_replace(
      job_record.command,
      'headers\s*:=\s*''\{[\s]*\\"Content-Type\\"[\s]*:[\s]*\\"application/json\\"[\s]*\}''\s*::\s*jsonb',
      'headers:=jsonb_build_object(''Content-Type'',''application/json'',''X-Cron-Secret'',(SELECT secret FROM _cron_secret WHERE id=1))',
      'i'
    );

    IF new_command != job_record.command THEN
      UPDATE cron.job SET command = new_command WHERE jobid = job_record.jobid;
      RAISE NOTICE 'Updated cron job %', job_record.jobid;
    ELSE
      -- Try a simpler pattern without backslashes (some jobs may store differently)
      new_command := regexp_replace(
        job_record.command,
        'headers\s*:=\s*''\{''Content-Type'':''application/json''\}''\s*::\s*jsonb',
        'headers:=jsonb_build_object(''Content-Type'',''application/json'',''X-Cron-Secret'',(SELECT secret FROM _cron_secret WHERE id=1))',
        'i'
      );
      IF new_command != job_record.command THEN
        UPDATE cron.job SET command = new_command WHERE jobid = job_record.jobid;
        RAISE NOTICE 'Updated cron job % (alt pattern)', job_record.jobid;
      ELSE
        RAISE NOTICE 'No match for cron job %: %', job_record.jobid, left(job_record.command, 200);
      END IF;
    END IF;
  END LOOP;
END $$;
