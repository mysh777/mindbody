/*
# Add recurring cleanup for stuck sync_logs

## Overview
Adds a pg_cron job that runs every 30 minutes to mark stale sync_logs as timed out.
This handles the case where the edge function runtime is killed before it can write
a terminal status (the 140s in-app timeout guard races with the 150s platform kill).

## Scheduled Job
- Name: cleanup-stuck-sync-logs
- Schedule: every 30 minutes
- Action: UPDATE sync_logs SET status='timeout' WHERE status='started' AND older than 10 minutes

## Important Notes
1. The 10-minute threshold is generous: no sync should legitimately run longer than 150 seconds.
   The slack avoids marking a sync that just started.
2. Idempotent: re-running this migration drops and re-creates the job.
3. This replaces the one-time cleanup migration (20260914113936) with a permanent solution.
*/

-- Remove any previous version (idempotent)
SELECT cron.unschedule('cleanup-stuck-sync-logs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stuck-sync-logs');

SELECT cron.schedule(
  'cleanup-stuck-sync-logs',
  '*/30 * * * *',
  $$
  UPDATE sync_logs
  SET status = 'timeout',
      completed_at = started_at + interval '150 seconds',
      error_message = 'Auto-cleanup: edge function exceeded runtime limit (pg_cron guard)'
  WHERE status = 'started'
    AND started_at < now() - interval '10 minutes';
  $$
);
