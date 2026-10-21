/*
# Phase 3 — Group 1: is_signed_in() helper + reference data tables

## Purpose
Close the database to anonymous access. First of three groups.

## Changes

### New function: is_signed_in()
- Returns true when auth.uid() is not null.
- All RLS policies use this, so roles can be added later in one place.

### Reference data tables (read-only from the app, written by sync):
- sites, locations, staff, service_categories, service_subcategories,
  session_types, staff_session_types, pricing_options, pricing_option_session_types,
  products, retail_products, packages, payment_types, sale_categories,
  resources, client_complete_info_snapshots

For each table:
1. REVOKE all privileges from anon.
2. DROP existing anon + authenticated policies.
3. CREATE authenticated SELECT policy using is_signed_in().
4. No INSERT/UPDATE/DELETE policies — sync-written (service role only).

### _cron_secret: revoke anon privileges (was accidentally granted).
*/

-- ============================================================
-- Helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_signed_in()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.is_signed_in() TO authenticated;

-- ============================================================
-- Reference data tables — read-only for authenticated
-- ============================================================

-- sites
DROP POLICY IF EXISTS "Allow anonymous read access to sites" ON public.sites;
DROP POLICY IF EXISTS "authenticated_read_sites" ON public.sites;
REVOKE ALL ON TABLE public.sites FROM anon;
CREATE POLICY "auth_select_sites" ON public.sites FOR SELECT TO authenticated USING (is_signed_in());

-- locations
DROP POLICY IF EXISTS "Allow anonymous read access to locations" ON public.locations;
DROP POLICY IF EXISTS "authenticated_read_locations" ON public.locations;
REVOKE ALL ON TABLE public.locations FROM anon;
CREATE POLICY "auth_select_locations" ON public.locations FOR SELECT TO authenticated USING (is_signed_in());

-- staff
DROP POLICY IF EXISTS "Allow anonymous read access to staff" ON public.staff;
DROP POLICY IF EXISTS "authenticated_read_staff" ON public.staff;
REVOKE ALL ON TABLE public.staff FROM anon;
CREATE POLICY "auth_select_staff" ON public.staff FOR SELECT TO authenticated USING (is_signed_in());

-- service_categories
DROP POLICY IF EXISTS "Allow anonymous read access to service_categories" ON public.service_categories;
DROP POLICY IF EXISTS "authenticated_read_service_categories" ON public.service_categories;
REVOKE ALL ON TABLE public.service_categories FROM anon;
CREATE POLICY "auth_select_service_categories" ON public.service_categories FOR SELECT TO authenticated USING (is_signed_in());

-- service_subcategories
DROP POLICY IF EXISTS "Allow anonymous read access to service_subcategories" ON public.service_subcategories;
DROP POLICY IF EXISTS "authenticated_read_service_subcategories" ON public.service_subcategories;
REVOKE ALL ON TABLE public.service_subcategories FROM anon;
CREATE POLICY "auth_select_service_subcategories" ON public.service_subcategories FOR SELECT TO authenticated USING (is_signed_in());

-- session_types
DROP POLICY IF EXISTS "Allow anonymous read access to session_types" ON public.session_types;
DROP POLICY IF EXISTS "authenticated_read_session_types" ON public.session_types;
REVOKE ALL ON TABLE public.session_types FROM anon;
CREATE POLICY "auth_select_session_types" ON public.session_types FOR SELECT TO authenticated USING (is_signed_in());

-- staff_session_types
DROP POLICY IF EXISTS "Allow anonymous read access to staff_session_types" ON public.staff_session_types;
DROP POLICY IF EXISTS "authenticated_read_staff_session_types" ON public.staff_session_types;
REVOKE ALL ON TABLE public.staff_session_types FROM anon;
CREATE POLICY "auth_select_staff_session_types" ON public.staff_session_types FOR SELECT TO authenticated USING (is_signed_in());

-- pricing_options
DROP POLICY IF EXISTS "Allow anonymous read access to pricing_options" ON public.pricing_options;
DROP POLICY IF EXISTS "authenticated_read_pricing_options" ON public.pricing_options;
REVOKE ALL ON TABLE public.pricing_options FROM anon;
CREATE POLICY "auth_select_pricing_options" ON public.pricing_options FOR SELECT TO authenticated USING (is_signed_in());

-- pricing_option_session_types
DROP POLICY IF EXISTS "Allow anonymous read access to pricing_option_session_types" ON public.pricing_option_session_types;
DROP POLICY IF EXISTS "authenticated_read_pricing_option_session_types" ON public.pricing_option_session_types;
REVOKE ALL ON TABLE public.pricing_option_session_types FROM anon;
CREATE POLICY "auth_select_pricing_option_session_types" ON public.pricing_option_session_types FOR SELECT TO authenticated USING (is_signed_in());

-- products
DROP POLICY IF EXISTS "Allow anonymous read access to products" ON public.products;
DROP POLICY IF EXISTS "authenticated_read_products" ON public.products;
REVOKE ALL ON TABLE public.products FROM anon;
CREATE POLICY "auth_select_products" ON public.products FOR SELECT TO authenticated USING (is_signed_in());

-- retail_products
DROP POLICY IF EXISTS "Allow anonymous read access to retail_products" ON public.retail_products;
DROP POLICY IF EXISTS "authenticated_read_retail_products" ON public.retail_products;
REVOKE ALL ON TABLE public.retail_products FROM anon;
CREATE POLICY "auth_select_retail_products" ON public.retail_products FOR SELECT TO authenticated USING (is_signed_in());

-- packages
DROP POLICY IF EXISTS "Allow anonymous read access to packages" ON public.packages;
DROP POLICY IF EXISTS "authenticated_read_packages" ON public.packages;
REVOKE ALL ON TABLE public.packages FROM anon;
CREATE POLICY "auth_select_packages" ON public.packages FOR SELECT TO authenticated USING (is_signed_in());

-- payment_types
DROP POLICY IF EXISTS "Allow anonymous read access to payment_types" ON public.payment_types;
DROP POLICY IF EXISTS "authenticated_read_payment_types" ON public.payment_types;
REVOKE ALL ON TABLE public.payment_types FROM anon;
CREATE POLICY "auth_select_payment_types" ON public.payment_types FOR SELECT TO authenticated USING (is_signed_in());

-- sale_categories
DROP POLICY IF EXISTS "Allow anonymous read access to sale_categories" ON public.sale_categories;
DROP POLICY IF EXISTS "authenticated_read_sale_categories" ON public.sale_categories;
REVOKE ALL ON TABLE public.sale_categories FROM anon;
CREATE POLICY "auth_select_sale_categories" ON public.sale_categories FOR SELECT TO authenticated USING (is_signed_in());

-- resources
DROP POLICY IF EXISTS "Allow anonymous read access to resources" ON public.resources;
DROP POLICY IF EXISTS "authenticated_read_resources" ON public.resources;
REVOKE ALL ON TABLE public.resources FROM anon;
CREATE POLICY "auth_select_resources" ON public.resources FOR SELECT TO authenticated USING (is_signed_in());

-- client_complete_info_snapshots
DROP POLICY IF EXISTS "Public read client_complete_info_snapshots" ON public.client_complete_info_snapshots;
DROP POLICY IF EXISTS "authenticated_read_client_complete_info_snapshots" ON public.client_complete_info_snapshots;
REVOKE ALL ON TABLE public.client_complete_info_snapshots FROM anon;
CREATE POLICY "auth_select_client_complete_info_snapshots" ON public.client_complete_info_snapshots FOR SELECT TO authenticated USING (is_signed_in());

-- ============================================================
-- _cron_secret — revoke anon (was accidentally granted)
-- ============================================================
REVOKE ALL ON TABLE public._cron_secret FROM anon;
