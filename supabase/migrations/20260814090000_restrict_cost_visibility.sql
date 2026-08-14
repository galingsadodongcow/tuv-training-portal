-- Restrict commercial cost and margin to the roles that are meant to see it.
-- Closes audit finding P0-1 (docs/qa-exhaustive/00-executive-summary.md).
--
-- The defect: the Profitability tab is gated in the UI, but that gate was
-- cosmetic. Simulating the sales account against production, a rep could read
-- all 161 rows of v_session_pnl — ₱31.09M revenue, ₱21.9M margin — and every
-- trainer's daily_rate (effectively individual compensation data), because:
--   * v_session_pnl is security_invoker but every input row is world-readable
--     to authenticated users (schedule via p_sched_r `using (true)`, trainer and
--     venue via trainer_read/venue_read), and
--   * trainer.daily_rate / venue.day_rate are ordinary columns on those tables.
--
-- Why column privileges alone cannot fix it: every application role shares the
-- single Postgres role `authenticated` (the app-level role lives in
-- profiles.role), so GRANT/REVOKE cannot distinguish sales from operations.
-- Only a SECURITY DEFINER function can read the app role and decide. Hence the
-- two-part fix below.
--
-- Audience: the same set the Analytics screen already uses for its reporting
-- tabs (`REPORT` in src/screens/Analytics.tsx) — super_admin, operations,
-- business_owner, management, auditor. Note this is deliberately NARROWER than
-- fn_role_reads_all(), which also includes coordinator: a coordinator does
-- order intake and has no reason to see margin.
--
-- Revenue is intentionally NOT masked. schedule.price and booked_participants
-- are already visible to every role on the calendar, so session revenue is
-- derivable anyway; masking it here would be security theatre while breaking
-- legitimate screens. The sensitive part is cost and therefore margin.
--
-- Idempotent.

-- ── Who may see cost ─────────────────────────────────────────────────────────
create or replace function public.fn_cost_visible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.fn_current_role() in
    ('super_admin','operations','business_owner','management','auditor');
$function$;

revoke all on function public.fn_cost_visible() from public, anon;
grant execute on function public.fn_cost_visible() to authenticated;

-- ── Privileged cost readers ──────────────────────────────────────────────────
-- These do the reading of the rate columns on behalf of the view, so the view
-- itself can stay SECURITY INVOKER (the repo convention — see
-- 20260811010000_security_invoker_views). They return NULL, not 0, to a role
-- that may not see cost: 0 would read as "this session cost nothing".
create or replace function public.fn_schedule_trainer_cost(p_schedule uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select case when public.fn_cost_visible() then
    (coalesce(t.daily_rate, 0)
      + coalesce((select sum(tr.daily_rate)
                    from public.session_trainer st
                    join public.trainer tr on tr.trainer_id = st.trainer_id
                   where st.schedule_id = s.schedule_id), 0)
    ) * coalesce(s.duration_days, 1)::numeric
  end
  from public.schedule s
  left join public.trainer t on t.trainer_id = s.trainer_id
  where s.schedule_id = p_schedule;
$function$;

create or replace function public.fn_schedule_venue_cost(p_schedule uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select case when public.fn_cost_visible() then
    coalesce(v.day_rate, 0) * coalesce(s.duration_days, 1)::numeric
  end
  from public.schedule s
  left join public.venue v on v.venue_id = s.venue_id
  where s.schedule_id = p_schedule;
$function$;

revoke all on function public.fn_schedule_trainer_cost(uuid) from public, anon;
revoke all on function public.fn_schedule_venue_cost(uuid)   from public, anon;
grant execute on function public.fn_schedule_trainer_cost(uuid) to authenticated;
grant execute on function public.fn_schedule_venue_cost(uuid)   to authenticated;

-- ── The view, rebuilt to mask cost for everyone else ─────────────────────────
-- Same columns and same shape as before, so no consumer needs to change. For a
-- role without cost visibility, trainer_cost / venue_cost / material_cost come
-- back NULL, and total_cost and margin fall out as NULL through the arithmetic.
create or replace view public.v_session_pnl
with (security_invoker = true) as
select
  x.schedule_id,
  x.course_name,
  x.start_date,
  x.status,
  x.country,
  x.days,
  x.revenue,
  x.trainer_cost,
  x.venue_cost,
  x.material_cost,
  x.trainer_cost + x.venue_cost + x.material_cost as total_cost,
  x.revenue - (x.trainer_cost + x.venue_cost + x.material_cost) as margin
from (
  select
    s.schedule_id,
    co.course_name,
    s.start_date,
    s.status,
    s.country,
    coalesce(s.duration_days, 1) as days,
    coalesce(s.actual_revenue, s.booked_participants::numeric * s.price, 0::numeric) as revenue,
    public.fn_schedule_trainer_cost(s.schedule_id) as trainer_cost,
    public.fn_schedule_venue_cost(s.schedule_id)   as venue_cost,
    case when public.fn_cost_visible() then coalesce(s.material_cost, 0::numeric) end as material_cost
  from public.schedule s
  join public.course co on co.course_id = s.course_id
) x;

-- ── Close the direct read of the rate columns ────────────────────────────────
-- A table-level SELECT grant implies every column, and a single column cannot
-- be carved out of it — the grant has to be replaced with an explicit column
-- list. INSERT/UPDATE are untouched, so operations can still set rates from the
-- Resources screen (which writes them and never displays them).
revoke select on public.trainer from authenticated;
grant select (trainer_id, name, code, email, phone, trainer_type,
              active, notes, created_at, country)
  on public.trainer to authenticated;

revoke select on public.venue from authenticated;
grant select (venue_id, name, address, city, capacity, venue_type,
              active, created_at, country)
  on public.venue to authenticated;
