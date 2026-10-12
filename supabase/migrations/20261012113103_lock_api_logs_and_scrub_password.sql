/*
# Erase stored Mindbody password and make API logs server-only

1. Data clean-up
- `api_logs.request_body`: the Mindbody staff password stored by old login
  requests is replaced with "[redacted]". A full search of every table found
  the password only there (6 rows). Nothing else in the rows is changed.

2. Security changes
- `api_logs`, `api_raw_data`, `mindbody_api_calls` become server-only:
  public read policies are removed and the anon/authenticated roles lose all
  table privileges. The sync engine (service role) keeps writing as before.
  The app has no sign-in yet, so nobody but the server can read these tables.

3. New function
- `mindbody_call_stats(p_days int)`: returns only aggregated counts
  (day, step, run_type, calls) of Mindbody requests so Admin → Sync History
  can show the usage counter without exposing the raw log. SECURITY DEFINER
  with a fixed search_path; read-only.

4. Rollback
- Re-grant SELECT on the three tables to anon and recreate the dropped read
  policies. The erased password cannot (and should not) be restored.
*/

UPDATE api_logs
SET request_body = jsonb_set(request_body, '{Password}', '"[redacted]"')
WHERE request_body ? 'Password' AND request_body->>'Password' <> '[redacted]';

DROP POLICY IF EXISTS "Allow read access to all users" ON api_logs;
DROP POLICY IF EXISTS "Anonymous users can read api_logs" ON api_logs;
DROP POLICY IF EXISTS "Allow anonymous read access to api_raw_data" ON api_raw_data;
DROP POLICY IF EXISTS "read_mindbody_api_calls" ON mindbody_api_calls;

REVOKE ALL ON api_logs FROM anon, authenticated;
REVOKE ALL ON api_raw_data FROM anon, authenticated;
REVOKE ALL ON mindbody_api_calls FROM anon, authenticated;

CREATE OR REPLACE FUNCTION mindbody_call_stats(p_days int DEFAULT 62)
RETURNS TABLE (day date, step text, run_type text, calls bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (called_at AT TIME ZONE 'utc')::date AS day,
         coalesce(step, 'unknown') AS step,
         coalesce(run_type, 'manual') AS run_type,
         count(*) AS calls
  FROM mindbody_api_calls
  WHERE called_at >= now() - make_interval(days => least(greatest(p_days, 1), 400))
  GROUP BY 1, 2, 3
  ORDER BY 1 DESC, 4 DESC;
$$;

REVOKE ALL ON FUNCTION mindbody_call_stats(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mindbody_call_stats(int) TO anon, authenticated;
