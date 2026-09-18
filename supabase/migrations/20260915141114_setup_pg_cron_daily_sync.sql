/*
# Set up pg_cron + pg_net for automatic daily sync

## Overview
Installs pg_cron and pg_net extensions, then creates a scheduled job
that calls the daily-sync edge function every day at 03:00 UTC.

## Extensions
- pg_cron (v1.6.4): PostgreSQL-native job scheduler
- pg_net (v0.20.0): async HTTP requests from SQL

## Scheduled Job
- Name: daily-mindbody-sync
- Schedule: 03:00 UTC daily
- Action: POST to daily-sync edge function (verify_jwt=false, no auth needed)

## Security Notes
- daily-sync has verify_jwt=false, so no Authorization header is needed
  for the cron call. The function itself uses SUPABASE_SERVICE_ROLE_KEY
  internally (from its environment) to call mindbody-sync.
- The SUPABASE_URL (https://zwahnnfwcaqmcsnlqqtg.supabase.co) is public
  information (exposed in the frontend .env as VITE_SUPABASE_URL), so
  embedding it in the cron job body is not a secret leak.
- The cron schema is NOT exposed via PostgREST/Data API, so the job
  definition is not readable by anon/authenticated roles through the API.
*/

-- 1. Install extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Remove any previous version of this job (idempotent)
SELECT cron.unschedule('daily-mindbody-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-mindbody-sync');

-- 3. Schedule the daily sync at 03:00 UTC
SELECT cron.schedule(
  'daily-mindbody-sync',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/daily-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
