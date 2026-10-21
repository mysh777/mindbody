/*
# Phase 3 — Group 2: Clients, visits, and money tables

## Purpose
Remove anonymous access from all client/visit/sales/payment tables.
These are sync-written (service role) and read-only from the app.

## Tables
- clients, client_services, client_visits
- appointments, appointment_addons
- sales, sale_items, payments, transactions
- staff_schedule_items, sync_logs
- overview_monthly_totals, obligation_snapshots

For each table:
1. REVOKE all privileges from anon.
2. DROP existing anon + authenticated policies.
3. CREATE authenticated SELECT policy using is_signed_in().
4. No INSERT/UPDATE/DELETE for authenticated — service role only.
*/

-- clients
DROP POLICY IF EXISTS "Allow anonymous read access to clients" ON public.clients;
DROP POLICY IF EXISTS "authenticated_read_clients" ON public.clients;
REVOKE ALL ON TABLE public.clients FROM anon;
CREATE POLICY "auth_select_clients" ON public.clients FOR SELECT TO authenticated USING (is_signed_in());

-- client_services
DROP POLICY IF EXISTS "Allow anonymous read access to client_services" ON public.client_services;
DROP POLICY IF EXISTS "authenticated_read_client_services" ON public.client_services;
REVOKE ALL ON TABLE public.client_services FROM anon;
CREATE POLICY "auth_select_client_services" ON public.client_services FOR SELECT TO authenticated USING (is_signed_in());

-- client_visits
DROP POLICY IF EXISTS "Allow anonymous read access to client_visits" ON public.client_visits;
DROP POLICY IF EXISTS "authenticated_read_client_visits" ON public.client_visits;
REVOKE ALL ON TABLE public.client_visits FROM anon;
CREATE POLICY "auth_select_client_visits" ON public.client_visits FOR SELECT TO authenticated USING (is_signed_in());

-- appointments
DROP POLICY IF EXISTS "Allow anonymous read access to appointments" ON public.appointments;
DROP POLICY IF EXISTS "authenticated_read_appointments" ON public.appointments;
REVOKE ALL ON TABLE public.appointments FROM anon;
CREATE POLICY "auth_select_appointments" ON public.appointments FOR SELECT TO authenticated USING (is_signed_in());

-- appointment_addons
DROP POLICY IF EXISTS "Allow anonymous read access to appointment_addons" ON public.appointment_addons;
DROP POLICY IF EXISTS "authenticated_read_appointment_addons" ON public.appointment_addons;
REVOKE ALL ON TABLE public.appointment_addons FROM anon;
CREATE POLICY "auth_select_appointment_addons" ON public.appointment_addons FOR SELECT TO authenticated USING (is_signed_in());

-- sales
DROP POLICY IF EXISTS "Allow anonymous read access to sales" ON public.sales;
DROP POLICY IF EXISTS "authenticated_read_sales" ON public.sales;
REVOKE ALL ON TABLE public.sales FROM anon;
CREATE POLICY "auth_select_sales" ON public.sales FOR SELECT TO authenticated USING (is_signed_in());

-- sale_items
DROP POLICY IF EXISTS "Allow anonymous read access to sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "authenticated_read_sale_items" ON public.sale_items;
REVOKE ALL ON TABLE public.sale_items FROM anon;
CREATE POLICY "auth_select_sale_items" ON public.sale_items FOR SELECT TO authenticated USING (is_signed_in());

-- payments
DROP POLICY IF EXISTS "Allow anonymous read access to payments" ON public.payments;
DROP POLICY IF EXISTS "authenticated_read_payments" ON public.payments;
REVOKE ALL ON TABLE public.payments FROM anon;
CREATE POLICY "auth_select_payments" ON public.payments FOR SELECT TO authenticated USING (is_signed_in());

-- transactions
DROP POLICY IF EXISTS "Allow anonymous read access to transactions" ON public.transactions;
DROP POLICY IF EXISTS "authenticated_read_transactions" ON public.transactions;
REVOKE ALL ON TABLE public.transactions FROM anon;
CREATE POLICY "auth_select_transactions" ON public.transactions FOR SELECT TO authenticated USING (is_signed_in());

-- staff_schedule_items
DROP POLICY IF EXISTS "Allow anonymous read access to staff_schedule_items" ON public.staff_schedule_items;
DROP POLICY IF EXISTS "authenticated_read_staff_schedule_items" ON public.staff_schedule_items;
REVOKE ALL ON TABLE public.staff_schedule_items FROM anon;
CREATE POLICY "auth_select_staff_schedule_items" ON public.staff_schedule_items FOR SELECT TO authenticated USING (is_signed_in());

-- sync_logs
DROP POLICY IF EXISTS "Allow anonymous read access to sync_logs" ON public.sync_logs;
DROP POLICY IF EXISTS "authenticated_read_sync_logs" ON public.sync_logs;
REVOKE ALL ON TABLE public.sync_logs FROM anon;
CREATE POLICY "auth_select_sync_logs" ON public.sync_logs FOR SELECT TO authenticated USING (is_signed_in());

-- overview_monthly_totals
DROP POLICY IF EXISTS "Allow anonymous read access to overview_monthly_totals" ON public.overview_monthly_totals;
DROP POLICY IF EXISTS "authenticated_read_overview_monthly_totals" ON public.overview_monthly_totals;
REVOKE ALL ON TABLE public.overview_monthly_totals FROM anon;
CREATE POLICY "auth_select_overview_monthly_totals" ON public.overview_monthly_totals FOR SELECT TO authenticated USING (is_signed_in());

-- obligation_snapshots
DROP POLICY IF EXISTS "Allow anonymous read access to obligation_snapshots" ON public.obligation_snapshots;
DROP POLICY IF EXISTS "authenticated_read_obligation_snapshots" ON public.obligation_snapshots;
REVOKE ALL ON TABLE public.obligation_snapshots FROM anon;
CREATE POLICY "auth_select_obligation_snapshots" ON public.obligation_snapshots FOR SELECT TO authenticated USING (is_signed_in());
