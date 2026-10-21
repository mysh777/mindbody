/*
# Nightly reconciliation notification cron

Runs the reconciliation-nightly edge function every night at 03:20 UTC.
Sends email alerts for red reconciliation, sync errors, and data issues.
*/
SELECT cron.schedule(
  'nightly-reconciliation-notifications',
  '20 3 * * *',
  $$select net.http_post(
    url:='https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/reconciliation-nightly',
    headers:=jsonb_build_object('Content-Type','application/json','X-Cron-Secret',(SELECT secret FROM _cron_secret WHERE id=1)),
    body:='{}'::jsonb
  )$$
);
