-- ===========================================================================
-- SRCH01 — global search: rank upcoming sessions first (#136).
--
-- fn_global_search ordered session hits by start_date DESC, which surfaced past
-- runs ahead of the upcoming ones a searcher almost always wants. This recreates
-- the function with the session block ordered upcoming-first (start_date >= today
-- soonest-first), then past runs most-recent-first. Every other block is
-- unchanged. (Order search already matches customer company/name.) Idempotent.
-- ===========================================================================

create or replace function public.fn_global_search(p_q text)
 returns table(kind text, id text, title text, subtitle text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
begin
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
    (select 'client'::text, c.client_id::text, coalesce(c.company, c.name),
            coalesce(c.email, c.phone)
       from client c, q
      where c.company ilike q.pat or c.name ilike q.pat
         or c.email ilike q.pat or c.phone ilike q.pat
      order by c.company nulls last limit 6)
    union all
    (select 'participant'::text, p.order_id, p.full_name,
            coalesce(cl.company, p.email, p.order_id)
       from participant p
       join orders o on o.order_id = p.order_id
       left join client cl on cl.client_id = o.client_id, q
      where (p.full_name ilike q.pat or p.email ilike q.pat)
        and coalesce(p.status, 'Active') <> 'Removed'
      order by p.full_name limit 6)
    union all
    -- Upcoming sessions first (soonest-first), then past runs (most-recent first).
    (select 'session'::text, s.schedule_id::text, co.course_name,
            to_char(s.start_date, 'YYYY-MM-DD') || ' · ' || s.status::text
       from schedule s join course co on co.course_id = s.course_id, q
      where co.course_name ilike q.pat
      order by (s.start_date >= current_date) desc,
               case when s.start_date >= current_date then s.start_date end asc nulls last,
               s.start_date desc
      limit 6)
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
      where iq.company ilike q.pat or iq.email ilike q.pat
      order by iq.inquiry_date desc limit 6)
  ) hits;
end;
$function$;
