/*
# Add Money received references (Mindbody-verified)

1. Data
  - Two rows in `reconciliation_references`, metric `money_received`, all locations:
    - 2026-07: 43194.67
    - 2026-09: 20570.89
  - Source: Mindbody Sales, Accounting Basis = Cash, all locations, all payment
    methods, all categories; reference = Grand total + Deposits section.
2. Security
  - No changes.
3. Notes
  1. Idempotent via ON CONFLICT on (period, metric, location).
*/

INSERT INTO reconciliation_references (period, metric, location, value, source, note)
VALUES
  ('2026-07', 'money_received', 'all', 43194.67, 'mindbody', 'Jul 2026 — Sales Cash basis, Grand total + Deposits'),
  ('2026-09', 'money_received', 'all', 20570.89, 'mindbody', 'Sep 2026 — Sales Cash basis, Grand total + Deposits')
ON CONFLICT (period, metric, location) DO UPDATE
  SET value = EXCLUDED.value, note = EXCLUDED.note, entered_at = now();