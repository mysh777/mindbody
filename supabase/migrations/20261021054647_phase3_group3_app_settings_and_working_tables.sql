/*
# Phase 3 — Group 3: App settings & working tables (read + write) + functions

## Purpose
Remove anonymous access from tables the app reads AND writes.
These tables need authenticated SELECT, INSERT, UPDATE, DELETE.

## Tables with full CRUD (app writes):
- booking_refresh_state, booking_settings, client_lists, client_list_members,
  client_segment_settings, sleeping_client_settings, staff_appointment_rates,
  reconciliation_baseline, reconciliation_cases, reconciliation_references, reconciliation_status

## Table with INSERT only:
- page_load_metrics

## Service-role-only tables — ensure no anon grants:
- mindbody_api_calls, mindbody_token_cache, _perf_query_snapshots, _usage_baseline_20261012

## Database functions — revoke EXECUTE from anon:
- get_pricing_options_with_categories()
- mindbody_call_stats(integer)
- purge_old_logs()
*/

-- booking_refresh_state
DROP POLICY IF EXISTS "insert_refresh_state" ON public.booking_refresh_state;
DROP POLICY IF EXISTS "read_refresh_state" ON public.booking_refresh_state;
DROP POLICY IF EXISTS "update_refresh_state" ON public.booking_refresh_state;
REVOKE ALL ON TABLE public.booking_refresh_state FROM anon;
CREATE POLICY "auth_select_booking_refresh_state" ON public.booking_refresh_state FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_booking_refresh_state" ON public.booking_refresh_state FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_booking_refresh_state" ON public.booking_refresh_state FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());

-- booking_settings
DROP POLICY IF EXISTS "anon_insert_booking_settings" ON public.booking_settings;
DROP POLICY IF EXISTS "anon_select_booking_settings" ON public.booking_settings;
DROP POLICY IF EXISTS "anon_update_booking_settings" ON public.booking_settings;
REVOKE ALL ON TABLE public.booking_settings FROM anon;
CREATE POLICY "auth_select_booking_settings" ON public.booking_settings FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_booking_settings" ON public.booking_settings FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_booking_settings" ON public.booking_settings FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());

-- client_lists
DROP POLICY IF EXISTS "anon_delete_client_lists" ON public.client_lists;
DROP POLICY IF EXISTS "anon_insert_client_lists" ON public.client_lists;
DROP POLICY IF EXISTS "anon_select_client_lists" ON public.client_lists;
DROP POLICY IF EXISTS "anon_update_client_lists" ON public.client_lists;
REVOKE ALL ON TABLE public.client_lists FROM anon;
CREATE POLICY "auth_select_client_lists" ON public.client_lists FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_client_lists" ON public.client_lists FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_client_lists" ON public.client_lists FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_client_lists" ON public.client_lists FOR DELETE TO authenticated USING (is_signed_in());

-- client_list_members
DROP POLICY IF EXISTS "anon_delete_client_list_members" ON public.client_list_members;
DROP POLICY IF EXISTS "anon_insert_client_list_members" ON public.client_list_members;
DROP POLICY IF EXISTS "anon_select_client_list_members" ON public.client_list_members;
DROP POLICY IF EXISTS "anon_update_client_list_members" ON public.client_list_members;
REVOKE ALL ON TABLE public.client_list_members FROM anon;
CREATE POLICY "auth_select_client_list_members" ON public.client_list_members FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_client_list_members" ON public.client_list_members FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_client_list_members" ON public.client_list_members FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_client_list_members" ON public.client_list_members FOR DELETE TO authenticated USING (is_signed_in());

-- client_segment_settings
DROP POLICY IF EXISTS "anon_delete_segment_settings" ON public.client_segment_settings;
DROP POLICY IF EXISTS "anon_insert_segment_settings" ON public.client_segment_settings;
DROP POLICY IF EXISTS "anon_select_segment_settings" ON public.client_segment_settings;
DROP POLICY IF EXISTS "anon_update_segment_settings" ON public.client_segment_settings;
REVOKE ALL ON TABLE public.client_segment_settings FROM anon;
CREATE POLICY "auth_select_segment_settings" ON public.client_segment_settings FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_segment_settings" ON public.client_segment_settings FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_segment_settings" ON public.client_segment_settings FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_segment_settings" ON public.client_segment_settings FOR DELETE TO authenticated USING (is_signed_in());

-- sleeping_client_settings
DROP POLICY IF EXISTS "anon_delete_sleeping_settings" ON public.sleeping_client_settings;
DROP POLICY IF EXISTS "anon_insert_sleeping_settings" ON public.sleeping_client_settings;
DROP POLICY IF EXISTS "anon_select_sleeping_settings" ON public.sleeping_client_settings;
DROP POLICY IF EXISTS "anon_update_sleeping_settings" ON public.sleeping_client_settings;
REVOKE ALL ON TABLE public.sleeping_client_settings FROM anon;
CREATE POLICY "auth_select_sleeping_client_settings" ON public.sleeping_client_settings FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_sleeping_client_settings" ON public.sleeping_client_settings FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_sleeping_client_settings" ON public.sleeping_client_settings FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_sleeping_client_settings" ON public.sleeping_client_settings FOR DELETE TO authenticated USING (is_signed_in());

-- staff_appointment_rates
DROP POLICY IF EXISTS "Allow anon delete staff_appointment_rates" ON public.staff_appointment_rates;
DROP POLICY IF EXISTS "Allow anon insert staff_appointment_rates" ON public.staff_appointment_rates;
DROP POLICY IF EXISTS "Allow anon read staff_appointment_rates" ON public.staff_appointment_rates;
DROP POLICY IF EXISTS "Allow anon update staff_appointment_rates" ON public.staff_appointment_rates;
DROP POLICY IF EXISTS "authenticated_delete_staff_appointment_rates" ON public.staff_appointment_rates;
DROP POLICY IF EXISTS "authenticated_insert_staff_appointment_rates" ON public.staff_appointment_rates;
DROP POLICY IF EXISTS "authenticated_select_staff_appointment_rates" ON public.staff_appointment_rates;
DROP POLICY IF EXISTS "authenticated_update_staff_appointment_rates" ON public.staff_appointment_rates;
REVOKE ALL ON TABLE public.staff_appointment_rates FROM anon;
CREATE POLICY "auth_select_staff_appointment_rates" ON public.staff_appointment_rates FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_staff_appointment_rates" ON public.staff_appointment_rates FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_staff_appointment_rates" ON public.staff_appointment_rates FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_staff_appointment_rates" ON public.staff_appointment_rates FOR DELETE TO authenticated USING (is_signed_in());

-- page_load_metrics (insert only)
DROP POLICY IF EXISTS "app_can_record_page_timings" ON public.page_load_metrics;
REVOKE ALL ON TABLE public.page_load_metrics FROM anon;
CREATE POLICY "auth_insert_page_load_metrics" ON public.page_load_metrics FOR INSERT TO authenticated WITH CHECK (is_signed_in());

-- reconciliation_baseline
DROP POLICY IF EXISTS "recon_base_delete" ON public.reconciliation_baseline;
DROP POLICY IF EXISTS "recon_base_insert" ON public.reconciliation_baseline;
DROP POLICY IF EXISTS "recon_base_select" ON public.reconciliation_baseline;
DROP POLICY IF EXISTS "recon_base_update" ON public.reconciliation_baseline;
REVOKE ALL ON TABLE public.reconciliation_baseline FROM anon;
CREATE POLICY "auth_select_reconciliation_baseline" ON public.reconciliation_baseline FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_reconciliation_baseline" ON public.reconciliation_baseline FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_reconciliation_baseline" ON public.reconciliation_baseline FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_reconciliation_baseline" ON public.reconciliation_baseline FOR DELETE TO authenticated USING (is_signed_in());

-- reconciliation_cases
DROP POLICY IF EXISTS "recon_cases_delete" ON public.reconciliation_cases;
DROP POLICY IF EXISTS "recon_cases_insert" ON public.reconciliation_cases;
DROP POLICY IF EXISTS "recon_cases_select" ON public.reconciliation_cases;
DROP POLICY IF EXISTS "recon_cases_update" ON public.reconciliation_cases;
REVOKE ALL ON TABLE public.reconciliation_cases FROM anon;
CREATE POLICY "auth_select_reconciliation_cases" ON public.reconciliation_cases FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_reconciliation_cases" ON public.reconciliation_cases FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_reconciliation_cases" ON public.reconciliation_cases FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_reconciliation_cases" ON public.reconciliation_cases FOR DELETE TO authenticated USING (is_signed_in());

-- reconciliation_references
DROP POLICY IF EXISTS "recon_ref_delete" ON public.reconciliation_references;
DROP POLICY IF EXISTS "recon_ref_insert" ON public.reconciliation_references;
DROP POLICY IF EXISTS "recon_ref_select" ON public.reconciliation_references;
DROP POLICY IF EXISTS "recon_ref_update" ON public.reconciliation_references;
REVOKE ALL ON TABLE public.reconciliation_references FROM anon;
CREATE POLICY "auth_select_reconciliation_references" ON public.reconciliation_references FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_reconciliation_references" ON public.reconciliation_references FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_reconciliation_references" ON public.reconciliation_references FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_reconciliation_references" ON public.reconciliation_references FOR DELETE TO authenticated USING (is_signed_in());

-- reconciliation_status
DROP POLICY IF EXISTS "anon_delete_recon_status" ON public.reconciliation_status;
DROP POLICY IF EXISTS "anon_insert_recon_status" ON public.reconciliation_status;
DROP POLICY IF EXISTS "anon_select_recon_status" ON public.reconciliation_status;
DROP POLICY IF EXISTS "anon_update_recon_status" ON public.reconciliation_status;
REVOKE ALL ON TABLE public.reconciliation_status FROM anon;
CREATE POLICY "auth_select_reconciliation_status" ON public.reconciliation_status FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_reconciliation_status" ON public.reconciliation_status FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_reconciliation_status" ON public.reconciliation_status FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_reconciliation_status" ON public.reconciliation_status FOR DELETE TO authenticated USING (is_signed_in());

-- ============================================================
-- Service-role-only tables — ensure no anon grants
-- ============================================================
REVOKE ALL ON TABLE public.mindbody_api_calls FROM anon;
REVOKE ALL ON TABLE public.mindbody_token_cache FROM anon;
REVOKE ALL ON TABLE public._perf_query_snapshots FROM anon;
REVOKE ALL ON TABLE public._usage_baseline_20261012 FROM anon;

-- ============================================================
-- Database functions — revoke EXECUTE from anon, keep for authenticated
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.get_pricing_options_with_categories() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mindbody_call_stats(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_old_logs() FROM anon;

GRANT EXECUTE ON FUNCTION public.get_pricing_options_with_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mindbody_call_stats(integer) TO authenticated;
