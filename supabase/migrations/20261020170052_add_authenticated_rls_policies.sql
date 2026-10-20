/*
# Add authenticated RLS policies to mirror existing anon policies

## Purpose
After adding sign-in (Phase 1), queries from the browser now run as the
`authenticated` role instead of `anon`. Many tables only had RLS policies
scoped to `anon`, so signed-in users saw "No data in selected period" on
every page. This migration adds `authenticated` policies that mirror the
existing `anon` ones — same access level, same `USING (true)` predicate.

## What changes
- 15 read-only tables (sync-written, app only reads): add `authenticated SELECT`
- 1 app-writable table (`staff_appointment_rates`): add `authenticated` SELECT/INSERT/UPDATE/DELETE

## Tables affected (read-only — SELECT only)
1. appointment_addons
2. appointments
3. client_complete_info_snapshots
4. client_services
5. client_visits
6. packages
7. payment_types
8. payments
9. pricing_option_session_types
10. sale_categories
11. service_categories
12. service_subcategories
13. session_types
14. staff_session_types
15. transactions

## Tables affected (app-writable — full CRUD)
16. staff_appointment_rates (SELECT + INSERT + UPDATE + DELETE)

## Security
- Existing `anon` policies are NOT touched — they remain as-is.
- New `authenticated` policies use `USING (true)` matching the existing `anon` pattern.
- These will be tightened in Phase 3 when `anon` access is removed.

## Functions
- `get_pricing_options_with_categories`: already has EXECUTE for authenticated — no change.
- `mindbody_call_stats`: already has EXECUTE for authenticated — no change.
- `purge_old_logs`: service-role only — no change.

## Rollback
To undo this migration, drop the 16 "authenticated_*" policies listed below.
Each policy name is unique and prefixed with "authenticated_" for easy identification.

```sql
-- Rollback: drop all authenticated_ policies added by this migration
DROP POLICY IF EXISTS "authenticated_read_appointment_addons" ON appointment_addons;
DROP POLICY IF EXISTS "authenticated_read_appointments" ON appointments;
DROP POLICY IF EXISTS "authenticated_read_client_complete_info_snapshots" ON client_complete_info_snapshots;
DROP POLICY IF EXISTS "authenticated_read_client_services" ON client_services;
DROP POLICY IF EXISTS "authenticated_read_client_visits" ON client_visits;
DROP POLICY IF EXISTS "authenticated_read_packages" ON packages;
DROP POLICY IF EXISTS "authenticated_read_payment_types" ON payment_types;
DROP POLICY IF EXISTS "authenticated_read_payments" ON payments;
DROP POLICY IF EXISTS "authenticated_read_pricing_option_session_types" ON pricing_option_session_types;
DROP POLICY IF EXISTS "authenticated_read_sale_categories" ON sale_categories;
DROP POLICY IF EXISTS "authenticated_read_service_categories" ON service_categories;
DROP POLICY IF EXISTS "authenticated_read_service_subcategories" ON service_subcategories;
DROP POLICY IF EXISTS "authenticated_read_session_types" ON session_types;
DROP POLICY IF EXISTS "authenticated_read_staff_session_types" ON staff_session_types;
DROP POLICY IF EXISTS "authenticated_read_transactions" ON transactions;
DROP POLICY IF EXISTS "authenticated_select_staff_appointment_rates" ON staff_appointment_rates;
DROP POLICY IF EXISTS "authenticated_insert_staff_appointment_rates" ON staff_appointment_rates;
DROP POLICY IF EXISTS "authenticated_update_staff_appointment_rates" ON staff_appointment_rates;
DROP POLICY IF EXISTS "authenticated_delete_staff_appointment_rates" ON staff_appointment_rates;
```
*/

-- ── Read-only tables: add authenticated SELECT ──

DROP POLICY IF EXISTS "authenticated_read_appointment_addons" ON appointment_addons;
CREATE POLICY "authenticated_read_appointment_addons" ON appointment_addons
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_appointments" ON appointments;
CREATE POLICY "authenticated_read_appointments" ON appointments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_client_complete_info_snapshots" ON client_complete_info_snapshots;
CREATE POLICY "authenticated_read_client_complete_info_snapshots" ON client_complete_info_snapshots
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_client_services" ON client_services;
CREATE POLICY "authenticated_read_client_services" ON client_services
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_client_visits" ON client_visits;
CREATE POLICY "authenticated_read_client_visits" ON client_visits
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_packages" ON packages;
CREATE POLICY "authenticated_read_packages" ON packages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_payment_types" ON payment_types;
CREATE POLICY "authenticated_read_payment_types" ON payment_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_payments" ON payments;
CREATE POLICY "authenticated_read_payments" ON payments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_pricing_option_session_types" ON pricing_option_session_types;
CREATE POLICY "authenticated_read_pricing_option_session_types" ON pricing_option_session_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_sale_categories" ON sale_categories;
CREATE POLICY "authenticated_read_sale_categories" ON sale_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_service_categories" ON service_categories;
CREATE POLICY "authenticated_read_service_categories" ON service_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_service_subcategories" ON service_subcategories;
CREATE POLICY "authenticated_read_service_subcategories" ON service_subcategories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_session_types" ON session_types;
CREATE POLICY "authenticated_read_session_types" ON session_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_staff_session_types" ON staff_session_types;
CREATE POLICY "authenticated_read_staff_session_types" ON staff_session_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_transactions" ON transactions;
CREATE POLICY "authenticated_read_transactions" ON transactions
  FOR SELECT TO authenticated USING (true);

-- ── App-writable table: add authenticated CRUD (mirrors existing anon policies) ──

DROP POLICY IF EXISTS "authenticated_select_staff_appointment_rates" ON staff_appointment_rates;
CREATE POLICY "authenticated_select_staff_appointment_rates" ON staff_appointment_rates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_staff_appointment_rates" ON staff_appointment_rates;
CREATE POLICY "authenticated_insert_staff_appointment_rates" ON staff_appointment_rates
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_staff_appointment_rates" ON staff_appointment_rates;
CREATE POLICY "authenticated_update_staff_appointment_rates" ON staff_appointment_rates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_staff_appointment_rates" ON staff_appointment_rates;
CREATE POLICY "authenticated_delete_staff_appointment_rates" ON staff_appointment_rates
  FOR DELETE TO authenticated USING (true);
