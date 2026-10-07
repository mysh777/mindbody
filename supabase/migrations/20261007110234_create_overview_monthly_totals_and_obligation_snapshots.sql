/*
# Stored monthly totals for the Overview and month-end obligation snapshots

1. New Tables
- `overview_monthly_totals`: one row per month and location ('all', '1' Center, '3' Alfa).
  - `month` (text, 'YYYY-MM'), `location` (text) - composite primary key
  - `metrics` (jsonb): Sales by service, Money received (+ breakdown by payment type), Revenue earned,
    Staff cost, Gross margin, visits, average per visit, new clients
  - `categories` (jsonb): Sales by service per category
  - `tariffs` (jsonb): Sales by service per pricing option
  - `computed_at` (timestamptz): when the nightly job computed the row
- `obligation_snapshots`: studio obligations (prepaid, not yet used visits) as of the last day of a month.
  - `as_of_date` (date, primary key), `total`, `paid_part`, `catalog_part` (numeric),
    `remaining_visits`, `clients`, `active_packages` (integer), `computed_at` (timestamptz)

2. How they are filled
- A nightly job (edge function `overview-totals`) recomputes the last 3 months with the same
  functions the reports use and upserts them, so corrections made in Mindbody are picked up.
- On the 1st of a month the same job stores obligations as of the previous month's last day.

3. Security
- RLS enabled on both tables.
- Read access for anon/authenticated: the dashboard has no sign-in and these are studio-wide figures.
- No insert/update/delete policies: only the server job (service role) writes.
*/

CREATE TABLE IF NOT EXISTS overview_monthly_totals (
  month text NOT NULL,
  location text NOT NULL,
  metrics jsonb NOT NULL,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  tariffs jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, location)
);

CREATE TABLE IF NOT EXISTS obligation_snapshots (
  as_of_date date PRIMARY KEY,
  total numeric NOT NULL,
  paid_part numeric NOT NULL DEFAULT 0,
  catalog_part numeric NOT NULL DEFAULT 0,
  remaining_visits integer NOT NULL DEFAULT 0,
  clients integer NOT NULL DEFAULT 0,
  active_packages integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE overview_monthly_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read overview totals" ON overview_monthly_totals;
CREATE POLICY "Anyone can read overview totals" ON overview_monthly_totals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read obligation snapshots" ON obligation_snapshots;
CREATE POLICY "Anyone can read obligation snapshots" ON obligation_snapshots FOR SELECT
  TO anon, authenticated USING (true);