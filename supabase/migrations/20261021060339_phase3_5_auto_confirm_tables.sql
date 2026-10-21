/*
# Phase 3.5 — Reconciliation auto-confirm tables

## New tables
### reconciliation_auto_confirm_log
### notification_settings

## Security
- RLS enabled, authenticated CRUD.
*/

CREATE TABLE IF NOT EXISTS public.reconciliation_auto_confirm_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  check_type text NOT NULL,
  check_key text NOT NULL,
  original_expected numeric,
  actual_value numeric,
  diff numeric,
  explanation text NOT NULL,
  fifo_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_auto_confirm_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reconciliation_auto_confirm_log FROM anon;
CREATE POLICY "auth_select_auto_confirm_log" ON public.reconciliation_auto_confirm_log
  FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_auto_confirm_log" ON public.reconciliation_auto_confirm_log
  FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_delete_auto_confirm_log" ON public.reconciliation_auto_confirm_log
  FOR DELETE TO authenticated USING (is_signed_in());

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id integer PRIMARY KEY DEFAULT 1,
  email_recipients text NOT NULL DEFAULT '',
  notify_red_reconciliation boolean NOT NULL DEFAULT true,
  notify_sync_errors boolean NOT NULL DEFAULT true,
  notify_data_issues boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_settings FROM anon;
CREATE POLICY "auth_select_notification_settings" ON public.notification_settings
  FOR SELECT TO authenticated USING (is_signed_in());
CREATE POLICY "auth_insert_notification_settings" ON public.notification_settings
  FOR INSERT TO authenticated WITH CHECK (is_signed_in());
CREATE POLICY "auth_update_notification_settings" ON public.notification_settings
  FOR UPDATE TO authenticated USING (is_signed_in()) WITH CHECK (is_signed_in());

-- Seed default settings row
INSERT INTO public.notification_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
