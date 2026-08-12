-- ===========================================================================
-- Phase B (second-pass) — follow-up: revoke anon/public EXECUTE on the new
-- SECURITY DEFINER functions.
--
-- `create function` (and `drop`+recreate, which reset fn_audit_search's ACL)
-- default EXECUTE to PUBLIC, which PostgREST exposes as anon-callable
-- /rest/v1/rpc endpoints — flagged by the Supabase security advisor (0028).
-- These functions are internally role-gated (anon gets null/false or an error,
-- no data leak), but the repo posture is to revoke anon/public EXECUTE on
-- SECURITY DEFINER functions (see 20260812010000_lock_trigger_fn_execute).
--
-- `authenticated` keeps EXECUTE via the explicit grants in the Phase B
-- migrations, so the RLS policy helpers and the RPCs keep working. Idempotent.
-- ===========================================================================

-- Policy helpers (called from RLS; must stay executable by authenticated).
revoke execute on function public.fn_role_reads_all()    from public, anon;
revoke execute on function public.fn_is_team_lead()      from public, anon;
revoke execute on function public.fn_role_intake_write() from public, anon;

-- RPCs / read helpers (authenticated-only by intent).
revoke execute on function public.fn_order_completeness(text) from public, anon;
revoke execute on function public.fn_audit_search(text, text, text, timestamptz, timestamptz, text, integer) from public, anon;
