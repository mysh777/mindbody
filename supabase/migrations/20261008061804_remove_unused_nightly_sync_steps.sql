/*
# Remove unused nightly sync steps

1. Changes
- Unschedules three nightly cron jobs that are no longer needed:
  - `sync-programs` (03:03): service categories are already refreshed by the `sync-services` step at 03:04.
  - `sync-transactions` (03:31): the Transactions page was removed; sales data comes from the sales steps.
  - `sync-client-visits` (03:33): Mindbody returns no rows for this step.
- The nightly schedule goes from 22 to 19 data steps (plus overview-totals and the stuck-log cleanup).

2. Security
- No table, policy or privilege changes.

3. Notes
- No data is deleted; existing rows in transactions and client_visits remain.
- Idempotent: each unschedule runs only if the job still exists.
*/

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['sync-programs','sync-transactions','sync-client-visits'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;