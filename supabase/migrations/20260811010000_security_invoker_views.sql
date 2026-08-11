-- Supabase Security Advisor 0010_security_definer_view (ERROR).
--
-- Four program-era reporting views were created WITHOUT security_invoker, so
-- Postgres runs their underlying queries with the view OWNER's rights and the
-- OWNER's RLS — bypassing the querying user's row-level security. On a portal
-- where RLS is the only real access control, that is a data-exposure hole: a
-- sales user selecting from these views could see rows their own RLS would deny.
--
--   flagged: v_cert_expiring, v_quote_total, v_session_feedback, v_trainer_quality
--
-- The earlier hardening passes (20260805000000, 20260808290000) already flipped
-- the pre-program views and four other program views (v_order_ar, v_session_pnl,
-- v_session_forecast, v_country_revenue); these four were added afterwards and
-- were missed. Flip them — and defensively re-assert the rest of the program
-- views — to security_invoker so each view enforces the CALLER's RLS. These are
-- read-only aggregates over the same tables the app already reads directly, so
-- invoker-scoping simply makes view access consistent with direct access.
--
-- Idempotent (IF EXISTS + setting an already-set option is a no-op); safe to
-- re-apply and safe if a view is not present on a given database.

-- The four the advisor flagged.
alter view if exists public.v_cert_expiring    set (security_invoker = true);
alter view if exists public.v_quote_total      set (security_invoker = true);
alter view if exists public.v_session_feedback set (security_invoker = true);
alter view if exists public.v_trainer_quality  set (security_invoker = true);

-- Defensive re-assertion for the remaining program views (no-ops where already
-- set) so the whole class stays closed against future drift.
alter view if exists public.v_sla_breach       set (security_invoker = true);
alter view if exists public.v_order_ar         set (security_invoker = true);
alter view if exists public.v_session_pnl      set (security_invoker = true);
alter view if exists public.v_session_forecast set (security_invoker = true);
alter view if exists public.v_country_revenue  set (security_invoker = true);
