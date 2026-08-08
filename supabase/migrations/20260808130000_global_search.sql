-- Global record search. One function the command palette calls to find a record
-- by name across the whole portal: orders, clients, sessions, organizations,
-- courses, and inquiries. Returns a small, capped, unified result set.
--
-- SECURITY DEFINER so the query is simple and consistent. It returns only
-- titles and identifiers that already appear in the lists each role can read;
-- no amounts, notes, or contact detail beyond a name.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create or replace function public.fn_global_search(p_q text)
returns table(kind text, id text, title text, subtitle text)
language sql
stable security definer
set search_path to 'public'
as $$
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
$$;
grant execute on function public.fn_global_search(text) to authenticated;
