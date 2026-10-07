/*
# Seed reconciliation references with Mindbody-verified totals

10 rows: sales_total, sales_qty for Jul-Sep 2026 (all locations),
staff_cost for Jul-Aug 2026 by location (Center=1, Alfa=3).
Uses ON CONFLICT to be idempotent.
*/

INSERT INTO reconciliation_references (period, metric, location, value, source, note)
VALUES
  ('2026-07', 'sales_total', 'all', 39596.05, 'mindbody', 'Jul 2026 — verified'),
  ('2026-07', 'sales_qty',   'all', 544,      'mindbody', 'Jul 2026 — verified'),
  ('2026-07', 'staff_cost',  '1',   7451.40,  'mindbody', 'Jul 2026 Center — verified'),
  ('2026-07', 'staff_cost',  '3',   3417.50,  'mindbody', 'Jul 2026 Alfa — verified'),
  ('2026-08', 'sales_total', 'all', 26644.85, 'mindbody', 'Aug 2026 — verified'),
  ('2026-08', 'sales_qty',   'all', 411,      'mindbody', 'Aug 2026 — verified'),
  ('2026-08', 'staff_cost',  '1',   6123.30,  'mindbody', 'Aug 2026 Center — verified'),
  ('2026-08', 'staff_cost',  '3',   3269.50,  'mindbody', 'Aug 2026 Alfa — verified'),
  ('2026-09', 'sales_total', 'all', 18634.75, 'mindbody', 'Sep 2026 — verified'),
  ('2026-09', 'sales_qty',   'all', 306,      'mindbody', 'Sep 2026 — verified')
ON CONFLICT (period, metric, location) DO UPDATE
  SET value = EXCLUDED.value, note = EXCLUDED.note, entered_at = now();
