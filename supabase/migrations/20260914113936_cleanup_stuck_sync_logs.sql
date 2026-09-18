/*
# Cleanup stuck sync_logs records

1. Modified Tables
   - `sync_logs`: Updates 34 records stuck in 'started' status with NULL completed_at

2. Changes
   - Sets status to 'timeout' for all sync_logs entries that have been in 'started'
     status for more than 1 hour (indicating the edge function was killed by the
     Deno runtime before it could write a terminal status).
   - Sets completed_at to started_at + 150 seconds (Pro-tier runtime limit).
   - Sets error_message explaining the cause.

3. Important Notes
   - This is a one-time data cleanup, not a schema change.
   - Idempotent: re-running has no effect (no rows will match after first run).
   - Rollback: restore status='started', completed_at=NULL, error_message=NULL
     for the specific IDs listed in DB_DIAGNOSTIC_REPORT.md.
*/

UPDATE sync_logs
SET status = 'timeout',
    completed_at = started_at + interval '150 seconds',
    error_message = 'Marked as timeout during cleanup - edge function exceeded Pro-tier 150s runtime limit'
WHERE status = 'started'
  AND started_at < now() - interval '1 hour';
