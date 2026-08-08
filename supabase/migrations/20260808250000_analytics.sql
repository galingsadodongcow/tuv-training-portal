-- Analytics. A conversion funnel across inquiries, quotes, and orders.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create or replace function public.fn_funnel()
returns table(inquiries bigint, open_inq bigint, won bigint, lost bigint,
              quotes bigint, quotes_accepted bigint, orders_total bigint)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    (select count(*) from inquiry),
    (select count(*) from inquiry where status in ('Received','Responded','RFQ or P Sent','Awaiting Feedback')),
    (select count(*) from inquiry where status = 'Closed Won'),
    (select count(*) from inquiry where status::text = 'Closed Lost'),
    (select count(*) from quote),
    (select count(*) from quote where status = 'Accepted'),
    (select count(*) from orders where order_status <> 'Cancelled');
$$;
grant execute on function public.fn_funnel() to authenticated;

-- Forecast against actual, per session. Forecast is a full room at the session
-- price; actual is what the roster has booked (or the recorded revenue).
create or replace view public.v_forecast_vs_actual as
  select s.schedule_id,
         co.course_name,
         s.start_date,
         s.status,
         coalesce(s.max_participants, 0) as capacity,
         coalesce(s.booked_participants, 0) as booked,
         coalesce(s.max_participants, 0) * coalesce(s.price, 0) as forecast_revenue,
         coalesce(s.actual_revenue, s.booked_participants * s.price, 0) as actual_revenue
    from schedule s
    join course co on co.course_id = s.course_id;
