-- Event-driven notifications. Fire a notification at the moment of the action,
-- so a handoff reaches the right person immediately instead of waiting for the
-- nightly job (which stays as a backstop). The app already reads notifications
-- on Home, so no UI change is needed.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor. Each trigger
-- is defensive: it skips when there is no recipient, and never notifies the
-- person who performed the action.

-- 1. An order assigned to a salesperson -> notify that salesperson.
create or replace function public.fn_notify_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user uuid;
begin
  if tg_op = 'UPDATE' and new.sales_id is not distinct from old.sales_id then
    return new;
  end if;
  select user_id into v_user from profiles where sales_id = new.sales_id limit 1;
  if v_user is not null and v_user is distinct from auth.uid() then
    insert into notification (recipient_id, kind, title, body, entity_type, entity_id, actor_id)
    values (v_user, 'assignment', 'Order assigned to you',
            'Order ' || new.order_id || ' is now yours.', 'order', new.order_id, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_assignment on public.order_assignment;
create trigger trg_notify_assignment after insert or update on public.order_assignment
  for each row execute function public.fn_notify_assignment();

-- 2. An order endorsed to operations -> notify every operations user.
create or replace function public.fn_notify_endorsed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.fulfillment_stage = 'Endorsed to Ops'
     and new.fulfillment_stage is distinct from old.fulfillment_stage then
    insert into notification (recipient_id, kind, title, body, entity_type, entity_id, actor_id)
    select p.user_id, 'system', 'Order endorsed to ops',
           'Order ' || new.order_id || ' needs order creation.', 'order', new.order_id, auth.uid()
    from profiles p
    where p.role = 'operations' and p.user_id is distinct from auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_endorsed on public.orders;
create trigger trg_notify_endorsed after update on public.orders
  for each row execute function public.fn_notify_endorsed();

-- 3. An approval decided -> notify whoever requested it.
create or replace function public.fn_notify_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.decision in ('Approved', 'Rejected')
     and new.decision is distinct from old.decision
     and new.requested_by is not null
     and new.requested_by is distinct from auth.uid() then
    insert into notification (recipient_id, kind, title, body, entity_type, entity_id, actor_id)
    values (new.requested_by, 'approval', 'Your request was ' || new.decision,
            coalesce(new.object_type::text, 'Request') || coalesce(' · ' || new.note, ''),
            'approval', new.approval_id::text, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_decision on public.approval;
create trigger trg_notify_decision after update on public.approval
  for each row execute function public.fn_notify_decision();
