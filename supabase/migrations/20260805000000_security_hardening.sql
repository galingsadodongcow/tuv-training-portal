-- ============================================================================
-- Security & RLS hardening
-- ============================================================================
-- Derived from a review of the live "A02 Academy Hub" schema and the Supabase
-- security advisor. Every change here is additive/hardening; none of it drops
-- data or columns.
--
-- STATUS: Applied to project A02 Academy Hub (ruwuqzwtwngpcauzbrqj) on
--         2026-08-05, split across three Supabase migrations; verified after
--         each (policies present, 18 views invoker-scoped, anon locked out of
--         sensitive RPCs, authenticated + service_role paths intact). This file
--         is the consolidated equivalent for re-applying to another environment.
--
-- ⚠️  If re-applying elsewhere: test on a Supabase database branch or staging
--     project first, sign in as each role (sales / operations / business_owner
--     / super_admin) and confirm the app still behaves, then apply to prod.
--
-- What this does NOT change (left deliberately, see PR notes):
--   * fn_current_role / fn_current_sales_id / fn_is_supervisor EXECUTE grants —
--     these are called inside RLS policies; touching their grants risks locking
--     out `authenticated`. They already self-scope to auth.uid() and set
--     search_path, so anon simply gets NULL. Left as-is on purpose.
-- ============================================================================

-- ============================================================================
-- A. RLS functional gaps (these are real bugs, not just advisories)
-- ============================================================================

-- A1. `orders` had no UPDATE policy for operations or business_owner. Result:
--     an operations user running the SAP import (which UPDATEs
--     orders.sap_order_no / payment_status) or a business owner editing an
--     order was DENIED by RLS. order_line already grants operations full write,
--     so this aligns orders with it. (Product decision: both operations and
--     business_owner may edit orders directly.)
create policy p_orders_priv_u on public.orders
  for update to authenticated
  using      (public.fn_current_role() = any (array['operations'::public.user_role, 'business_owner'::public.user_role]))
  with check (public.fn_current_role() = any (array['operations'::public.user_role, 'business_owner'::public.user_role]));

-- A1b. Widen the sales UPDATE policy from "created only" to "created OR
--      assigned", so a rep who picks up a webshop order (assigned via
--      order_assignment but not created_by them) can advance it through
--      fulfillment. Replaces the previous created-only policy.
drop policy if exists p_orders_sales_u on public.orders;
create policy p_orders_sales_u on public.orders
  for update to authenticated
  using (
    public.fn_current_role() = 'sales'::public.user_role
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.order_assignment oa
         where oa.order_id = orders.order_id
           and oa.sales_id = public.fn_current_sales_id()
      )
    )
  );

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
--     NOTE: Supabase grants EXECUTE to anon/authenticated explicitly (not only
--     via PUBLIC), so each `revoke` must name the role, not just PUBLIC.
-- ----------------------------------------------------------------------------
-- App-invoked RPCs -> authenticated only (anon + public removed):
revoke execute on function public.fn_cancel_schedule(uuid, text)              from public, anon;
grant  execute on function public.fn_cancel_schedule(uuid, text)              to authenticated;

revoke execute on function public.fn_close_session(uuid, boolean)             from public, anon;
grant  execute on function public.fn_close_session(uuid, boolean)             to authenticated;

revoke execute on function public.fn_reopen_session(uuid, text)               from public, anon;
grant  execute on function public.fn_reopen_session(uuid, text)               to authenticated;

revoke execute on function public.fn_transfer_line(uuid, uuid, text)          from public, anon;
grant  execute on function public.fn_transfer_line(uuid, uuid, text)          to authenticated;

revoke execute on function public.fn_set_forecast(uuid, numeric, integer)     from public, anon;
grant  execute on function public.fn_set_forecast(uuid, numeric, integer)     to authenticated;

revoke execute on function public.fn_rollover_copy(integer, integer, integer) from public, anon;
grant  execute on function public.fn_rollover_copy(integer, integer, integer) to authenticated;

revoke execute on function public.fn_grant_elearning_access(text)             from public, anon;
grant  execute on function public.fn_grant_elearning_access(text)             to authenticated;

-- Maintenance / cron-only RPCs -> service_role only (called by the edge
-- functions under SUPABASE_SERVICE_ROLE_KEY; no end user should invoke them):
revoke execute on function public.fn_nightly_hygiene()   from public, anon, authenticated;
grant  execute on function public.fn_nightly_hygiene()   to service_role;

revoke execute on function public.fn_weekly_digest()     from public, anon, authenticated;
grant  execute on function public.fn_weekly_digest()     to service_role;

revoke execute on function public.fn_detect_duplicates() from public, anon, authenticated;
grant  execute on function public.fn_detect_duplicates() to service_role;

-- Trigger-handler functions and internal helpers: never called via the REST RPC
-- endpoint. Triggers fire in the table-owner context and internal calls run as
-- the calling definer function's owner, so removing EXECUTE from the api roles
-- does not affect them. Fully revoke to clear them from the exposed API.
revoke execute on function public.fn_capacity_guard()        from public, anon, authenticated;
revoke execute on function public.fn_conflict_guard()        from public, anon, authenticated;
revoke execute on function public.fn_order_totals()          from public, anon, authenticated;
revoke execute on function public.fn_participant_sync()      from public, anon, authenticated;
revoke execute on function public.fn_roster_lock_guard()     from public, anon, authenticated;
revoke execute on function public.fn_schedule_rollup()       from public, anon, authenticated;
revoke execute on function public.fn_venue_capacity_guard()  from public, anon, authenticated;
revoke execute on function public.fn_rollup_schedule(uuid)   from public, anon, authenticated;
revoke execute on function public.trg_assignment_log()       from public, anon, authenticated;
revoke execute on function public.trg_cancel_guard()         from public, anon, authenticated;
revoke execute on function public.trg_orders_rollup()        from public, anon, authenticated;
revoke execute on function public.trg_schedule_price()       from public, anon, authenticated;

-- App-invoked read helpers: remove anon, keep authenticated (the app calls these).
revoke execute on function public.fn_find_conflicts(uuid, uuid, uuid, date, date, jsonb) from public, anon;
revoke execute on function public.fn_session_roster(uuid)    from public, anon;
revoke execute on function public.fn_schedule_days(uuid)     from public, anon;

-- Left intentionally executable by `authenticated` (accepted low risk):
--   * The app RPCs above (cancel/close/transfer/etc.) — signed-in staff must
--     call them; each self-checks the caller's role internally.
--   * fn_current_role / fn_current_sales_id / fn_is_supervisor — load-bearing
--     RLS helpers; they return NULL for anon and are safest left untouched.

-- ============================================================================
-- D. Pin search_path on the 3 functions the advisor flagged as mutable
--    (function_search_path_mutable). The SECURITY DEFINER functions already set
--    it; these are the stragglers.
-- ============================================================================
alter function public.fn_span_days(date, date, jsonb) set search_path = public;
alter function public.fn_stage_stamp()                set search_path = public;
alter function public.fn_country_inherit()            set search_path = public;

-- ============================================================================
-- Post-apply verification (run manually):
--
--   -- policies exist:
--   select tablename, policyname, cmd from pg_policies
--    where policyname in ('p_orders_priv_u','p_orders_sales_u','p_asg_lead_d');
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
