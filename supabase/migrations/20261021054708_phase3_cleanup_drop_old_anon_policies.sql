/*
# Phase 3 — Cleanup: drop remaining old anon policies

## Purpose
The first three groups created new authenticated policies but some old anon
policies had different names than expected and weren't dropped.
This migration drops all remaining policies that include the 'anon' role.

## What it does
For each table that still has an anon policy, drop that policy.
The new authenticated policies (created in Groups 1-3) are unaffected
because they only target 'authenticated'.
*/

DROP POLICY IF EXISTS "Public read client_services" ON public.client_services;
DROP POLICY IF EXISTS "Public read client_visits" ON public.client_visits;
DROP POLICY IF EXISTS "Anonymous users can read clients" ON public.clients;
DROP POLICY IF EXISTS "Anonymous users can read locations" ON public.locations;
DROP POLICY IF EXISTS "Anyone can read obligation snapshots" ON public.obligation_snapshots;
DROP POLICY IF EXISTS "Anyone can read overview totals" ON public.overview_monthly_totals;
DROP POLICY IF EXISTS "Public read packages" ON public.packages;
DROP POLICY IF EXISTS "Public read payment_types" ON public.payment_types;
DROP POLICY IF EXISTS "Allow public read access to payments" ON public.payments;
DROP POLICY IF EXISTS "Anyone can read pricing options" ON public.pricing_options;
DROP POLICY IF EXISTS "Anonymous users can read products" ON public.products;
DROP POLICY IF EXISTS "anon_select_resources" ON public.resources;
DROP POLICY IF EXISTS "Anyone can read retail products" ON public.retail_products;
DROP POLICY IF EXISTS "Anonymous users can read sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Anonymous users can read sales" ON public.sales;
DROP POLICY IF EXISTS "Public read service_subcategories" ON public.service_subcategories;
DROP POLICY IF EXISTS "Anonymous users can read staff" ON public.staff;
DROP POLICY IF EXISTS "Anon can read staff schedule" ON public.staff_schedule_items;
DROP POLICY IF EXISTS "Anonymous users can read sync_logs" ON public.sync_logs;
DROP POLICY IF EXISTS "Public read transactions" ON public.transactions;
