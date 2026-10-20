/*
# Update cron jobs to include X-Cron-Secret header

## Purpose
Phase 2 protects edge functions with verify_jwt=true. Cron jobs call
edge functions via net.http_post but don't have a user JWT. This migration
updates all 27 cron jobs that call edge functions to include an
`X-Cron-Secret` header, whose value is read from the `_cron_secret` table.

## What changes
- All cron jobs with `net.http_post` calls get their `headers` parameter
  updated from a static JSON string to a dynamic expression that includes
  both `Content-Type` and `X-Cron-Secret` (read from `_cron_secret`).

## How it works
Each cron job's `headers` parameter changes from:
  headers:='{"Content-Type":"application/json"}'::jsonb
to:
  headers:=jsonb_build_object('Content-Type','application/json','X-Cron-Secret',(SELECT secret FROM _cron_secret WHERE id=1))

The edge functions check for this header and compare it against the value
in `_cron_secret`. If it matches, the request is authorized.

## Security
- `_cron_secret` is RLS-locked with no policies — only service_role / postgres can read
- pg_cron runs as postgres, so it can read the secret
- The secret is a random UUID, not derivable from any existing key

## Rollback
To revert, each cron job's headers parameter would need to be changed back to
the static JSON string. The original commands were:
  headers:='{"Content-Type":"application/json"}'::jsonb
*/

-- Build the new headers expression that all jobs will use
-- We use a DO block to iterate over all cron jobs and update their commands

DO $$
DECLARE
  job_record RECORD;
  new_command TEXT;
  old_headers TEXT;
  new_headers TEXT;
BEGIN
  old_headers := '''{"Content-Type":"application/json"}'':jsonb';
  new_headers := 'jsonb_build_object(''Content-Type'',''application/json'',''X-Cron-Secret'',(SELECT secret FROM _cron_secret WHERE id=1))';

  FOR job_record IN
    SELECT jobid, command FROM cron.job WHERE command LIKE '%net.http_post%'
  LOOP
    -- Replace the static headers with the dynamic expression
    new_command := replace(job_record.command, old_headers, new_headers);

    IF new_command != job_record.command THEN
      -- Update the job command
      UPDATE cron.job SET command = new_command WHERE jobid = job_record.jobid;
      RAISE NOTICE 'Updated cron job %: %', job_record.jobid, split_part(job_record.command, '''', 4);
    ELSE
      RAISE NOTICE 'No header match found for cron job %', job_record.jobid;
    END IF;
  END LOOP;
END $$;
