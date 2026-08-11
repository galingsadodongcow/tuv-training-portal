-- Lock down the two SECURITY DEFINER read RPCs (fn_global_search, fn_org_summary).
--
-- Both were `language sql ... security definer` with NO internal role check —
-- their only guard was the EXECUTE grant. That is brittle: a stray
-- `grant execute ... to public` (or the default PUBLIC execute that Postgres
-- gives every new function) re-opens them to anon, and because they bypass RLS
-- (definer rights) an anonymous caller could read order/client/session/org names
-- across the whole tenant. This migration closes that in depth:
--
--   1. Convert each to plpgsql with an internal gate: a caller with no role
--      (`fn_current_role() is null`, i.e. anon / no JWT) is rejected before any
--      row is read. Defense that does not depend on grants staying correct.
--   2. REVOKE EXECUTE from anon and PUBLIC, then GRANT only to authenticated.
--      Belt and suspenders with (1).
--
-- Behaviour for a signed-in user is unchanged (same columns, same order, same
-- caps). Idempotent; safe to re-apply.

-- 1. Global record search — gate + revoke/grant ------------------------------
create or replace function public.fn_global_search(p_q text)
returns table(kind text, id text, title text, subtitle text)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  -- Internal guard: only a signed-in user with a role may search.
  if fn_current_role() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  return query
  with q as (select '%' || btrim(p_q) || '%' as pat)
  select * from (
    (select 'order'::text, o.order_id, coalesce(c.company, c.name, o.order_id),
            o.fulfillment_stage::text
       from orders o left join client c on c.client_id = o.client_id, q
      where o.order_id ilike q.pat or c.company ilike q.pat or c.name ilike q.pat
      order by o.order_date desc limit 6)
    union all
    (select 'client'::text, c.client_id::text, coalesce(c.company, c.name), c.email
       from client c, q
      where c.company ilike q.pat or c.name ilike q.pat or c.email ilike q.pat
      order by c.company nulls last limit 6)
    union all
    (select 'session'::text, s.schedule_id::text, co.course_name,
            to_char(s.start_date, 'YYYY-MM-DD') || ' · ' || s.status::text
       from schedule s join course co on co.course_id = s.course_id, q
      where co.course_name ilike q.pat
      order by s.start_date desc limit 6)
    union all
    (select 'organization'::text, og.org_id::text, og.name, og.industry
       from organization og, q
      where og.name ilike q.pat
      order by og.name limit 6)
    union all
    (select 'course'::text, co.course_id::text, co.course_name, co.training_type::text
       from course co, q
      where co.course_name ilike q.pat and co.active
      order by co.course_name limit 6)
    union all
    (select 'inquiry'::text, iq.inquiry_id::text, iq.company, iq.status::text
       from inquiry iq, q
      where iq.company ilike q.pat
      order by iq.inquiry_date desc limit 6)
  ) hits;
end;
$$;

revoke execute on function public.fn_global_search(text) from public, anon;
grant execute on function public.fn_global_search(text) to authenticated;

-- 2. Organization roll-up — gate + revoke/grant -----------------------------
create or replace function public.fn_org_summary()
returns table(org_id uuid, name text, industry text, country country_t,
              client_count bigint, order_count bigint, seat_count bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if fn_current_role() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- NOTE: this is plpgsql, so the RETURNS TABLE columns (org_id, name, …) are
  -- in-scope variables. Every reference to client.org_id in the sub-selects is
  -- table-qualified (alias `cl`) so it can never bind to the OUT variable.
  return query
  select o.org_id, o.name, o.industry, o.country,
    (select count(*) from client c where c.org_id = o.org_id),
    (select count(*) from orders ord
       where ord.client_id in (select cl.client_id from client cl where cl.org_id = o.org_id)),
    (select coalesce(sum(ord.total_seats), 0) from orders ord
       where ord.client_id in (select cl.client_id from client cl where cl.org_id = o.org_id))
  from organization o
  order by o.name;
end;
$$;

revoke execute on function public.fn_org_summary() from public, anon;
grant execute on function public.fn_org_summary() to authenticated;
