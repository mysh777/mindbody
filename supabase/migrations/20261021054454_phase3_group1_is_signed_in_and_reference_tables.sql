/*
# Phase 3 — Group 1: is_signed_in() helper + reference data tables

## Purpose
Close the database to anonymous access. This is the first of three groups.

## Changes

### New function: is_signed_in()
- A simple helper that returns true when auth.uid() is not null.
- All RLS policies will use this, so roles can be added later in one place.
- SECURITY DEFINER is NOT needed — it just wraps auth.uid().

### Reference data tables (read-only from the app, written by sync/service role):
- sites, locations, staff, service_categories, service_subcategories,
  session_types, staff_session_types, pricing_options, pricing_option_session_types,
  products, retail_products, packages, payment_types, sale_categories,
  resources, client_complete_info_snapshots

For each of these tables:
1. REVOKE all privileges from anon.
2. DROP existing anon policies.
3. Keep authenticated SELECT policy (recreated with is_signed_in()).
4. No INSERT/UPDATE/DELETE policies for authenticated — these are sync-written (service role only).

### Service-role-only tables — remove anon grants:
- _cron_secret: revoke anon privileges (was accidentally granted).

## Security
- All reference tables: anon loses all access.
- authenticated can SELECT where is_signed_in().
- No user writes to reference data — only the service role (sync) writes.
*/
