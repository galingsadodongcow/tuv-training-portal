-- Waitlist automation and a configurable SLA engine.
--
-- 1. When seats free up on a session, the oldest waitlisted bookings that fit
--    are promoted to a seat automatically, and their owner is notified.
-- 2. A per-stage SLA policy drives a breach view and an escalation function.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- ---- Waitlist auto-promotion ----
create or replace function public.fn_waitlist_autopromote()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_sid uuid; v_max int; v_taken int; v_free int; r record; v_uid uuid;
begin
  if tg_op = 'DELETE' then
    v_sid := old.schedule_id;
  elsif tg_op = 'UPDATE' then
    if old.line_status in ('New','Confirmed','Completed')
       and (new.line_status not in ('New','Confirmed','Completed') or new.seats < old.seats) then
      v_sid := coalesce(new.schedule_id, old.schedule_id);
    else
      return coalesce(new, old);   -- not a seat-freeing change (and avoids recursion on promote)
    end if;
  else
    return coalesce(new, old);
  end if;
  if v_sid is null then return coalesce(new, old); end if;

  select max_participants into v_max from schedule where schedule_id = v_sid;
  if v_max is null then return coalesce(new, old); end if;
  select coalesce(sum(seats), 0) into v_taken from order_line
    where schedule_id = v_sid and line_status in ('New','Confirmed','Completed');
  v_free := v_max - v_taken;

  for r in
    select line_id, order_id, seats from order_line
    where schedule_id = v_sid and line_status = 'Waitlist' order by created_at
  loop
    exit when v_free <= 0;
    if r.seats <= v_free then
      update order_line set line_status = 'New' where line_id = r.line_id;
      v_free := v_free - r.seats;
      select coalesce(
        (select p.user_id from profiles p join order_assignment oa on oa.sales_id = p.sales_id where oa.order_id = r.order_id limit 1),
        (select created_by from orders where order_id = r.order_id)
      ) into v_uid;
      if v_uid is not null then
        insert into notification(recipient_id, kind, title, body, entity_type, entity_id, actor_id)
        values (v_uid, 'system', 'Waitlist promoted',
                'A waitlisted booking on order ' || r.order_id || ' moved to a seat.', 'order', r.order_id, auth.uid());
      end if;
    end if;
  end loop;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_waitlist_autopromote on public.order_line;
create trigger trg_waitlist_autopromote after update or delete on public.order_line
  for each row execute function public.fn_waitlist_autopromote();

-- ---- SLA engine ----
create table if not exists public.sla_policy (
  stage text primary key,
  max_days integer not null,
  active boolean not null default true
);
insert into public.sla_policy (stage, max_days) values
  ('New', 3), ('In Communication', 5), ('For Order Creation', 3), ('Endorsed to Ops', 5), ('No Feedback', 7)
on conflict (stage) do nothing;

alter table public.sla_policy enable row level security;
drop policy if exists p_sla_r on public.sla_policy;
create policy p_sla_r on public.sla_policy for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_sla_w on public.sla_policy;
create policy p_sla_w on public.sla_policy for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

create or replace view public.v_sla_breach as
  select q.order_id, q.company, q.fulfillment_stage, q.owner, q.total_amount,
         q.days_in_stage, p.max_days, (q.days_in_stage - p.max_days) as days_over
    from v_fulfillment_queue q
    join sla_policy p on p.stage = q.fulfillment_stage::text and p.active
   where q.days_in_stage > p.max_days
   order by (q.days_in_stage - p.max_days) desc;

-- Notify order owners of SLA breaches, de-duplicated over three days. For the
-- nightly job or an on-demand run.
create or replace function public.fn_notify_sla_breaches()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count int := 0; r record; v_uid uuid;
begin
  for r in select order_id, fulfillment_stage, days_over from v_sla_breach loop
    select p.user_id into v_uid from profiles p
      join order_assignment oa on oa.sales_id = p.sales_id where oa.order_id = r.order_id limit 1;
    if v_uid is null then continue; end if;
    if exists (select 1 from notification n where n.recipient_id = v_uid and n.entity_type = 'order'
                 and n.entity_id = r.order_id and n.kind = 'sla' and n.created_at > now() - interval '3 days') then
      continue;
    end if;
    insert into notification(recipient_id, kind, title, body, entity_type, entity_id)
      values (v_uid, 'sla', 'SLA breach on order ' || r.order_id,
              'Order ' || r.order_id || ' is ' || r.days_over || ' day(s) over the ' || r.fulfillment_stage || ' target.', 'order', r.order_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
grant execute on function public.fn_notify_sla_breaches() to authenticated;
