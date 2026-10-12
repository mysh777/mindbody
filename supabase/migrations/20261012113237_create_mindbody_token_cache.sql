/*
# Shared Mindbody login token

1. New Tables
- `mindbody_token_cache` (single row, id = 1)
  - `token` (text) – Mindbody staff access token
  - `issued_at` (timestamptz) – when it was issued
  Lets all sync steps of a night reuse one login instead of logging in once
  per step (each login is a billed API call).

2. Security
- RLS enabled with NO policies and all privileges revoked from anon and
  authenticated: only the sync engine (service role) can read or write it.

3. Rollback
- Revert the edge function; the table can then be dropped.
*/

CREATE TABLE IF NOT EXISTS mindbody_token_cache (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mindbody_token_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindbody_token_cache FROM anon, authenticated;
