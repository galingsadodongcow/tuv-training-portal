-- ============================================================================
-- Security & RLS hardening
-- ============================================================================
-- Derived from a review of the live "A02 Academy Hub" schema and the Supabase
-- security advisor. Every change here is additive/hardening; none of it drops
-- data or columns.
--
-- ⚠️  REVIEW AND TEST BEFORE APPLYING TO PRODUCTION.
--     Recommended path: apply on a Supabase database branch (or a staging
--     project) first, sign in as each role (sales / operations / business_owner
--     / super_admin), and confirm the app still behaves, THEN apply to prod via
--     `supabase db push` or the SQL editor. The whole file runs in one
--     transaction, so a failure rolls everything back.
--
-- What this does NOT change (left deliberately, see PR notes):
--   * fn_current_role / fn_current_sales_id / fn_is_supervisor EXECUTE grants —
--     these are called inside RLS policies; touching their grants risks locking
--     out `authenticated`. They already self-scope to auth.uid() and set
--     search_path, so anon simply gets NULL. Left as-is on purpose.
--   * The judgment-call policies (should business_owner edit orders? should
--     sales edit orders they're *assigned* but did not create?) — flagged in
--     the PR for a product decision rather than silently encoded here.
-- ============================================================================

begin;

-- ============================================================================
-- A. RLS functional gaps (these are real bugs, not just advisories)
-- ============================================================================

-- A1. `orders` had no UPDATE policy for operations. Result: an operations user
--     running the SAP import (which UPDATEs orders.sap_order_no / payment_status)
--     or editing an order's fulfillment stage was DENIED by RLS. order_line
--     already grants operations full write, so this aligns orders with it.
create policy p_orders_ops_u on public.orders
  for update to authenticated
  using      (public.fn_current_role() = 'operations'::public.user_role)
  with check (public.fn_current_role() = 'operations'::public.user_role);

-- A2. `order_assignment` had no DELETE policy except super_admin. Business
--     owners and sales supervisors could insert/update an assignment but not
--     remove one, so "Unassign" could never work. Mirror the existing lead
--     insert/update policy.
create policy p_asg_lead_d on public.order_assignment
  for delete to authenticated
  using (
    public.fn_current_role() = 'business_owner'::public.user_role
    or (public.fn_current_role() = 'sales'::public.user_role and public.fn_is_supervisor())
  );

-- ============================================================================
-- B. Views run with the CALLER's permissions (respect RLS), not the definer's.
--    Advisor: security_definer_view (ERROR) on all 18 reporting views.
--    Safe here: none of these views read the row-restricted tables (profiles,
--    import_exception); they only read tables that every signed-in staff member
--    can already SELECT, so results are unchanged. PG15+ feature.
-- ============================================================================
alter view public.v_at_risk_schedules        set (security_invoker = true);
alter view public.v_cancel_readiness          set (security_invoker = true);
alter view public.v_digest_at_risk            set (security_invoker = true);
alter view public.v_digest_elearning_waiting  set (security_invoker = true);
alter view public.v_digest_roster_gaps        set (security_invoker = true);
alter view public.v_digest_stalled_orders     set (security_invoker = true);
alter view public.v_digest_unstaffed          set (security_invoker = true);
alter view public.v_elearning_pending_access  set (security_invoker = true);
alter view public.v_forecast_vs_actual        set (security_invoker = true);
alter view public.v_fulfillment_queue         set (security_invoker = true);
alter view public.v_open_duplicates           set (security_invoker = true);
alter view public.v_order_fact                set (security_invoker = true);
alter view public.v_schedule_channel_pax      set (security_invoker = true);
alter view public.v_session_close_check       set (security_invoker = true);
alter view public.v_session_roster_gap        set (security_invoker = true);
alter view public.v_trainer_load              set (security_invoker = true);
alter view public.v_unstaffed_sessions        set (security_invoker = true);
alter view public.v_venue_calendar            set (security_invoker = true);

-- ============================================================================
-- C. Lock down EXECUTE on state-mutating SECURITY DEFINER RPCs.
--    Advisor: anon/public can execute these. Because the anon key ships in the
--    frontend bundle, anyone could POST to /rest/v1/rpc/<fn>. Each function
--    already checks the caller's role internally and raises on failure, so this
--    is defense-in-depth: revoke the default PUBLIC grant (which is what exposes
--    anon) and re-grant only to the roles that actually call each function.
-- ----------------------------------------------------------------------------
-- App-invoked RPCs -> authenticated only:
revoke execute on function public.fn_cancel_schedule(uuid, text)            from public;
grant  execute on function public.fn_cancel_schedule(uuid, text)            to authenticated;

revoke execute on function public.fn_close_session(uuid, boolean)           from public;
grant  execute on function public.fn_close_session(uuid, boolean)           to authenticated;

revoke execute on function public.fn_reopen_session(uuid, text)             from public;
grant  execute on function public.fn_reopen_session(uuid, text)             to authenticated;

revoke execute on function public.fn_transfer_line(uuid, uuid, text)        from public;
grant  execute on function public.fn_transfer_line(uuid, uuid, text)        to authenticated;

revoke execute on function public.fn_set_forecast(uuid, numeric, integer)   from public;
grant  execute on function public.fn_set_forecast(uuid, numeric, integer)   to authenticated;

revoke execute on function public.fn_rollover_copy(integer, integer, integer) from public;
grant  execute on function public.fn_rollover_copy(integer, integer, integer) to authenticated;

revoke execute on function public.fn_grant_elearning_access(text)           from public;
grant  execute on function public.fn_grant_elearning_access(text)           to authenticated;

-- Maintenance / cron-only RPCs -> service_role only (called by the edge
-- functions under SUPABASE_SERVICE_ROLE_KEY; no end user should invoke them):
revoke execute on function public.fn_nightly_hygiene()  from public;
grant  execute on function public.fn_nightly_hygiene()  to service_role;

revoke execute on function public.fn_weekly_digest()    from public;
grant  execute on function public.fn_weekly_digest()    to service_role;

revoke execute on function public.fn_detect_duplicates() from public;
grant  execute on function public.fn_detect_duplicates() to service_role;

-- ============================================================================
-- D. Pin search_path on the 3 functions the advisor flagged as mutable
--    (function_search_path_mutable). The SECURITY DEFINER functions already set
--    it; these are the stragglers.
-- ============================================================================
alter function public.fn_span_days(date, date, jsonb) set search_path = public;
alter function public.fn_stage_stamp()                set search_path = public;
alter function public.fn_country_inherit()            set search_path = public;

commit;

-- ============================================================================
-- Post-apply verification (run manually, not part of the transaction):
--
--   -- policies exist:
--   select tablename, policyname, cmd from pg_policies
--    where policyname in ('p_orders_ops_u','p_asg_lead_d');
--
--   -- views now invoker-scoped:
--   select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind='v'
--      and 'security_invoker=true' = any(c.reloptions);
--
--   -- anon can no longer execute a sensitive RPC (expect false):
--   select has_function_privilege('anon','public.fn_close_session(uuid,boolean)','execute');
--
-- Also: enable "Leaked password protection" in Dashboard > Authentication >
-- Providers (advisor: auth_leaked_password_protection) — a settings toggle,
-- not SQL.
-- ============================================================================
