/*
# Create cron auth secret table

## Purpose
Phase 2 protects edge functions from unauthenticated access. Cron jobs
call edge functions via net.http_post but don't have a user JWT. Instead,
they use a shared secret stored in this table.

## What changes
- New table `_cron_secret` with a single row containing a random UUID secret
- RLS enabled, no policies — only service_role / postgres (which bypasses RLS) can read
- Cron jobs will read the secret and pass it as `X-Cron-Secret` header
- Edge functions check for either a valid user JWT or this secret

## Security
- RLS enabled with NO policies → table is locked (anon and authenticated get nothing)
- Only the `service_role` key (used by edge functions) and `postgres` (used by pg_cron) can read
- The secret is a random UUID, not derived from any existing key

## Rollback
```sql
DROP TABLE IF EXISTS _cron_secret;
```
*/

CREATE TABLE IF NOT EXISTS _cron_secret (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE _cron_secret ENABLE ROW LEVEL SECURITY;

INSERT INTO _cron_secret (id, secret) VALUES (1, gen_random_uuid()::text)
ON CONFLICT (id) DO NOTHING;
