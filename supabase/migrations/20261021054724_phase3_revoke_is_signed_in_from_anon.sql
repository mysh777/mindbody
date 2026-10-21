/*
# Phase 3 — Revoke EXECUTE on is_signed_in() from anon

The helper function is_signed_in() was created with default EXECUTE grants
which include anon. Revoke it — anon should not call any database functions.
*/

REVOKE EXECUTE ON FUNCTION public.is_signed_in() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_signed_in() FROM public;
GRANT EXECUTE ON FUNCTION public.is_signed_in() TO authenticated;
