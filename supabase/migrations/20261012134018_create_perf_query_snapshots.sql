/*
# Private snapshots of query statistics (performance work)

1. New table `_perf_query_snapshots`
   - `taken_at` (timestamptz) – when the snapshot was taken
   - `label` (text) – e.g. 'before', 'after'
   - `queryid` (bigint), `query` (text), `calls` (bigint), `total_ms` (numeric)
   - Copies of pg_stat_statements rows so request counts can be compared before/after a change.
2. Security
   - RLS enabled with no policies; access revoked from anon and authenticated. Only the server/admin tooling reads it.
3. Rollback
   - DROP TABLE _perf_query_snapshots; (contains only statistics copies, no business data)
*/
CREATE TABLE IF NOT EXISTS _perf_query_snapshots (
  id bigserial PRIMARY KEY,
  taken_at timestamptz NOT NULL DEFAULT now(),
  label text NOT NULL,
  queryid bigint,
  query text,
  calls bigint,
  total_ms numeric
);
ALTER TABLE _perf_query_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON _perf_query_snapshots FROM anon, authenticated;
