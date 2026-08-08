-- Step 3 follow-on: escalation and SLA rules (review items 89, 90, 91).
-- Generates task and notification rows from aging conditions, hooked into the
-- nightly job. Idempotent: dedup_key guards stop duplicate tasks, and a cleanup
-- pass closes system tasks once their condition clears. Safe to paste whole into
-- the Supabase SQL editor (no begin/commit, no enum additions).

create or replace function public.fn_generate_worklist_tasks()
returns table(action text, affected integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare c_stalled int := 0; c_collections int := 0; c_appr int := 0; c_exc int := 0; c_closed int := 0;
begin
  -- 1. Stalled order -> individual task for the order owner.
  insert into task (title, detail, entity_type, entity_id, assigned_to, status, priority, source, reason, dedup_key)
  select
    'Stalled order ' || o.order_id,
    'Order has sat in stage ' || o.fulfillment_stage || ' since ' || to_char(o.stage_changed_at, 'Mon DD'),
    'order', o.order_id, p.user_id, 'open', 'high', 'system',
    'In stage ' || o.fulfillment_stage || ' over 14 days',
    'stalled_order:' || o.order_id
  from orders o
  join order_assignment oa on oa.order_id = o.order_id
  join profiles p on p.sales_id = oa.sales_id
  where o.fulfillment_stage not in ('SAP Created', 'Cancelled', 'No Feedback')
    and o.order_status <> 'Cancelled'
    and o.stage_changed_at < now() - interval '14 days'
    and not exists (
      select 1 from task t
      where t.dedup_key = 'stalled_order:' || o.order_id
        and t.status in ('open', 'in_progress', 'blocked')
    );
  get diagnostics c_stalled = row_count;

  -- 2a. Overdue collections -> refresh the count on an owner's open summary task.
  update task t set
    detail = 'You have ' || s.cnt || ' orders unpaid over 30 days',
    reason = s.cnt || ' overdue collections',
    updated_at = now()
  from (
    select p.user_id as uid, count(*) as cnt
    from orders o
    join order_assignment oa on oa.order_id = o.order_id
    join profiles p on p.sales_id = oa.sales_id
    where o.payment_status in ('Unpaid', 'Partial')
      and o.order_status <> 'Cancelled'
      and o.order_date < current_date - 30
    group by p.user_id
  ) s
  where t.dedup_key = 'collections_summary:' || s.uid
    and t.status in ('open', 'in_progress', 'blocked');

  -- 2b. Overdue collections -> create one summary task per owner who lacks one.
  insert into task (title, detail, entity_type, entity_id, assigned_to, status, priority, source, reason, dedup_key)
  select 'Chase overdue collections', 'You have ' || s.cnt || ' orders unpaid over 30 days',
         'order', null, s.uid, 'open', 'normal', 'system',
         s.cnt || ' overdue collections', 'collections_summary:' || s.uid
  from (
    select p.user_id as uid, count(*) as cnt
    from orders o
    join order_assignment oa on oa.order_id = o.order_id
    join profiles p on p.sales_id = oa.sales_id
    where o.payment_status in ('Unpaid', 'Partial')
      and o.order_status <> 'Cancelled'
      and o.order_date < current_date - 30
    group by p.user_id
  ) s
  where not exists (
    select 1 from task t
    where t.dedup_key = 'collections_summary:' || s.uid
      and t.status in ('open', 'in_progress', 'blocked')
  );
  get diagnostics c_collections = row_count;

  -- 3. Aging pending approval -> notify each decider once (until read).
  insert into notification (recipient_id, kind, title, body, entity_type, entity_id)
  select p.user_id, 'approval', 'Approval waiting',
         a.object_type::text || coalesce(' · ' || a.note, ''),
         'approval', a.approval_id::text
  from approval a
  cross join profiles p
  where a.decision = 'Pending'
    and a.created_at < now() - interval '3 days'
    and p.role in ('business_owner', 'super_admin')
    and not exists (
      select 1 from notification n
      where n.recipient_id = p.user_id
        and n.entity_type = 'approval'
        and n.entity_id = a.approval_id::text
        and n.is_read = false
    );
  get diagnostics c_appr = row_count;

  -- 4. Unresolved import exception -> notify each super admin once (until read).
  insert into notification (recipient_id, kind, title, body, entity_type, entity_id)
  select p.user_id, 'system', 'Import exception',
         coalesce(e.reason, 'Import problem'),
         'import_exception', e.exception_id::text
  from import_exception e
  cross join profiles p
  where e.resolved = false
    and p.role = 'super_admin'
    and not exists (
      select 1 from notification n
      where n.recipient_id = p.user_id
        and n.entity_type = 'import_exception'
        and n.entity_id = e.exception_id::text
        and n.is_read = false
    );
  get diagnostics c_exc = row_count;

  -- 5a. Auto-resolve stalled-order tasks whose order is no longer stalled.
  update task t set status = 'done', completed_at = now(), reason = coalesce(t.reason, '') || ' (auto-resolved)'
  where t.source = 'system' and t.status in ('open', 'in_progress', 'blocked')
    and t.dedup_key like 'stalled_order:%'
    and not exists (
      select 1 from orders o
      where o.order_id = t.entity_id
        and o.fulfillment_stage not in ('SAP Created', 'Cancelled', 'No Feedback')
        and o.order_status <> 'Cancelled'
        and o.stage_changed_at < now() - interval '14 days'
    );
  get diagnostics c_closed = row_count;

  -- 5b. Auto-resolve collection summaries for owners now at zero overdue.
  update task t set status = 'done', completed_at = now(), reason = coalesce(t.reason, '') || ' (auto-resolved)'
  where t.source = 'system' and t.status in ('open', 'in_progress', 'blocked')
    and t.dedup_key like 'collections_summary:%'
    and not exists (
      select 1
      from orders o
      join order_assignment oa on oa.order_id = o.order_id
      join profiles p on p.sales_id = oa.sales_id
      where 'collections_summary:' || p.user_id = t.dedup_key
        and o.payment_status in ('Unpaid', 'Partial')
        and o.order_status <> 'Cancelled'
        and o.order_date < current_date - 30
    );

  return query
    select 'stalled tasks created'::text, c_stalled
    union all select 'collection tasks created', c_collections
    union all select 'approval notices', c_appr
    union all select 'exception notices', c_exc
    union all select 'system tasks auto-resolved', c_closed;
end $$;

revoke execute on function public.fn_generate_worklist_tasks() from public, anon, authenticated;
grant execute on function public.fn_generate_worklist_tasks() to service_role;

-- Hook the generator into the nightly job. Body is the original plus one call.
create or replace function public.fn_nightly_hygiene()
returns table(action text, affected integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare n1 int; n2 int; n3 int;
begin
  update schedule set status = 'Completed'
   where status in ('Tentative', 'Confirmed')
     and end_date < current_date - 1;
  get diagnostics n1 = row_count;

  update schedule set status = 'Running'
   where status = 'Confirmed'
     and start_date <= current_date and end_date >= current_date;
  get diagnostics n2 = row_count;

  update orders set fulfillment_stage = 'No Feedback'
   where fulfillment_stage in ('New', 'In Communication')
     and stage_changed_at < now() - interval '30 days'
     and order_status <> 'Cancelled';
  get diagnostics n3 = row_count;

  return query
    select 'sessions closed'::text, n1
    union all select 'sessions running', n2
    union all select 'orders flagged no feedback', n3;

  -- Escalation and SLA rows generated after the status upkeep above.
  return query select * from public.fn_generate_worklist_tasks();
end $$;
