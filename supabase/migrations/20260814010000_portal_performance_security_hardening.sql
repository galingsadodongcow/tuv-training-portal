-- Portal performance and security hardening.
-- The indexes match the application's hot filters/joins. The dashboard RPC
-- returns role/RLS-scoped aggregates so opening the dashboard does not download
-- thousands of source rows merely to count them in the browser.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_orders_active_date
  on public.orders (order_date desc) where deleted_at is null;
create index if not exists idx_orders_active_stage_age
  on public.orders (fulfillment_stage, stage_changed_at) where deleted_at is null;
create index if not exists idx_orders_active_client
  on public.orders (client_id) where deleted_at is null;
create index if not exists idx_order_assignment_sales
  on public.order_assignment (sales_id, order_id);
create index if not exists idx_order_line_schedule_status
  on public.order_line (schedule_id, line_status);
create index if not exists idx_participant_schedule
  on public.participant (schedule_id);
create index if not exists idx_inquiry_sales_status
  on public.inquiry (sales_id, status);
create index if not exists idx_approval_pending_created
  on public.approval (created_at desc) where decision = 'Pending';
create index if not exists idx_duplicate_open
  on public.duplicate_candidate (candidate_id) where status = 'Open';
create index if not exists idx_audit_changed
  on public.audit_log (changed_at desc);
create index if not exists idx_notification_unread_recipient
  on public.notification (recipient_id, created_at desc) where is_read = false;
create index if not exists idx_task_open_assignee_due
  on public.task (assigned_to, due_date, created_at desc)
  where status in ('open', 'in_progress', 'blocked');

-- Leading-wildcard searches need trigram indexes; B-tree indexes cannot serve
-- the portal's contains searches.
create index if not exists idx_client_company_trgm
  on public.client using gin (lower(company) extensions.gin_trgm_ops)
  where deleted_at is null;
create index if not exists idx_client_name_trgm
  on public.client using gin (lower(name) extensions.gin_trgm_ops)
  where deleted_at is null;
create index if not exists idx_client_email_trgm
  on public.client using gin (lower(email) extensions.gin_trgm_ops)
  where deleted_at is null;
create index if not exists idx_orders_order_id_trgm
  on public.orders using gin (lower(order_id) extensions.gin_trgm_ops)
  where deleted_at is null;
create index if not exists idx_orders_sap_trgm
  on public.orders using gin (lower(sap_order_no) extensions.gin_trgm_ops)
  where deleted_at is null and sap_order_no is not null;

create or replace function public.fn_dashboard_metrics(
  p_year integer default extract(year from current_date)::integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
with me as (
  select
    (select p.sales_id from public.profiles p where p.user_id = (select auth.uid())) as sales_id,
    (select s.code from public.profiles p join public.salesperson s on s.sales_id = p.sales_id
      where p.user_id = (select auth.uid())) as sales_code
),
queue as (
  select q.* from public.v_fulfillment_queue q
),
live_orders as (
  select o.* from public.orders o
  where extract(year from o.order_date)::integer = p_year
    and o.deleted_at is null
),
month_series as (
  select m, to_char(make_date(p_year, m, 1), 'Mon') as label
  from generate_series(1, 12) m
),
month_revenue as (
  select ms.m, ms.label,
    coalesce(sum(o.total_amount) filter (
      where o.order_status::text in ('New', 'Confirmed', 'Completed')
        and extract(month from o.order_date)::integer = ms.m
    ), 0) as revenue
  from month_series ms left join live_orders o on true
  group by ms.m, ms.label
),
channel_revenue as (
  select o.channel::text as name, coalesce(sum(o.total_amount), 0) as value
  from live_orders o
  where o.order_status::text in ('New', 'Confirmed', 'Completed')
  group by o.channel
),
pipeline as (
  select i.* from public.inquiry i
  where i.status::text in ('Received', 'Responded', 'RFQ or P Sent', 'Awaiting Feedback')
),
closed_pipeline as (
  select
    count(*) filter (where i.status::text = 'Closed Won') as won,
    count(*) filter (where i.status::text = 'Closed Lost') as lost
  from public.inquiry i
)
select jsonb_build_object(
  'queue', jsonb_build_object(
    'unassigned', (select count(*) from queue where owner_code is null),
    'mine', (select count(*) from queue, me where owner_code = me.sales_code),
    'my_stalled', (select count(*) from queue, me where owner_code = me.sales_code and days_in_stage > 14 and fulfillment_stage::text not in ('SAP Created','Cancelled','No Feedback')),
    'my_overdue', (select count(*) from queue, me where owner_code = me.sales_code and payment_status::text <> 'Paid' and age_days > 30),
    'stalled', (select count(*) from queue where days_in_stage > 14 and fulfillment_stage::text not in ('SAP Created','Cancelled','No Feedback')),
    'overdue', (select count(*) from queue where payment_status::text <> 'Paid' and age_days > 30),
    'paid_unendorsed', (select count(*) from queue where payment_status::text = 'Paid' and fulfillment_stage::text in ('New','In Communication','For Order Creation')),
    'no_feedback', (select count(*) from queue where fulfillment_stage::text = 'No Feedback'),
    'awaiting_endorsement', (select count(*) from queue where fulfillment_stage::text in ('For Order Creation','Endorsed to Ops'))
  ),
  'sessions', jsonb_build_object(
    'needs_attention', (select count(*) from public.v_session_health h where h.health in ('Needs Attention','At Risk','Blocked')),
    'unstaffed_near', (select count(*) from public.v_unstaffed_sessions u where u.days_out <= 21)
  ),
  'pending_approvals', (select count(*) from public.approval a where a.decision::text = 'Pending'),
  'duplicate_candidates', (select count(*) from public.duplicate_candidate d where d.status::text = 'Open'),
  'sla_breaches', (select count(*) from public.v_sla_breach),
  'certs_expiring', (select count(*) from public.v_cert_expiring),
  'receivables', jsonb_build_object(
    'outstanding', (select coalesce(sum(ar.balance), 0) from public.v_order_ar ar where ar.balance > 0),
    'overdue_count', (select count(*) from public.v_order_ar ar where ar.balance > 0 and ar.due_date < current_date),
    'over_60', (select coalesce(sum(ar.balance), 0) from public.v_order_ar ar where ar.balance > 0 and current_date - ar.due_date > 60)
  ),
  'pipeline', jsonb_build_object(
    'value', (select coalesce(sum(p.est_value), 0) from pipeline p),
    'mine_value', (select coalesce(sum(p.est_value), 0) from pipeline p, me where p.sales_id = me.sales_id),
    'won', (select won from closed_pipeline),
    'lost', (select lost from closed_pipeline)
  ),
  'revenue', jsonb_build_object(
    'booked', (select coalesce(sum(o.total_amount), 0) from live_orders o where o.order_status::text in ('New','Confirmed','Completed')),
    'forecast', (select coalesce(sum(s.forecast_revenue), 0) from public.schedule s join public.calendar_year y on y.year_id = s.year_id where y.year = p_year and s.deleted_at is null),
    'delivered', (select coalesce(sum(s.actual_revenue), 0) from public.schedule s join public.calendar_year y on y.year_id = s.year_id where y.year = p_year and s.deleted_at is null and s.status::text = 'Completed'),
    'delivered_pax', (select coalesce(sum(s.actual_participants), 0) from public.schedule s join public.calendar_year y on y.year_id = s.year_id where y.year = p_year and s.deleted_at is null and s.status::text = 'Completed'),
    'cancelled', (select count(*) from live_orders o where o.order_status::text = 'Cancelled'),
    'total_orders', (select count(*) from live_orders),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', label, 'revenue', revenue) order by m), '[]'::jsonb) from month_revenue),
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) order by value desc), '[]'::jsonb) from channel_revenue)
  ),
  'governance', jsonb_build_object(
    'changes_today', (select count(*) from public.audit_log a where a.changed_at >= current_date),
    'deletes_week', (select count(*) from public.audit_log a where a.action = 'DELETE' and a.changed_at >= now() - interval '7 days'),
    'role_changes', (select count(*) from public.audit_log a where a.table_name = 'profiles'),
    'high_risk', (select count(*) from public.audit_log a where a.table_name in ('payment','refund','credit_note','discount_rule','course_fee'))
  )
);
$function$;

revoke all on function public.fn_dashboard_metrics(integer) from public, anon;
grant execute on function public.fn_dashboard_metrics(integer) to authenticated;
