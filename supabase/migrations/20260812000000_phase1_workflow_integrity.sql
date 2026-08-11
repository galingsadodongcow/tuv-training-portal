-- ===========================================================================
-- Phase 1 — workflow integrity & correctness (from the UX review, P0 items).
--
--   1. Enforce the order fulfillment-stage state machine in the DB (the legal
--      graph lived only in the UI; a bulk op / direct write could set any stage).
--   2. Block adding the same participant (email) to a session twice.
--   3. Wire fn_queue_reminders into nightly hygiene (it was coded but never
--      called) and auto-expire lapsed quotes.
--   4. fn_merge_orders(keep, dup, reason) — actually reconcile a duplicate
--      order (cancel it + its lines so seats/revenue stop double-counting) and
--      close the duplicate_candidate. The Duplicates screen "merge" previously
--      only flagged the row.
--   5. v_session_health — one computed health level per session (the signal
--      was scattered across Go/No-Go strings, v_cancel_readiness, v_sla_breach).
--
-- All idempotent. Validated against the live schema in a rolled-back
-- transaction before applying. Uses ::text comparisons on enums so a label
-- rename can never turn a guard into a hard error.
-- ===========================================================================

-- 1. Order fulfillment-stage state machine ----------------------------------
-- Forward moves along the pipeline are allowed; Cancelled and No Feedback may
-- be set from anywhere; reopening to New is allowed from anywhere; and once in
-- No Feedback / Cancelled a record may move on. Backward regressions within the
-- pipeline (e.g. SAP Created -> In Communication) and un-cancelling to a
-- non-New stage are blocked. System context (no JWT) and super_admin bypass, so
-- background jobs (fn_nightly_hygiene) and admins are never blocked.
create or replace function public.fn_stage_pos(p text)
returns int language sql immutable set search_path to 'public' as $$
  select case p
    when 'New' then 1
    when 'In Communication' then 2
    when 'For Order Creation' then 3
    when 'Endorsed to Ops' then 4
    when 'SAP Created' then 5
    else 0 end;   -- No Feedback / Cancelled are off the linear pipeline
$$;

create or replace function public.fn_orders_stage_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r text; oldp int; newp int;
begin
  if new.fulfillment_stage is distinct from old.fulfillment_stage then
    r := fn_current_role()::text;
    -- bypass for system/background (no role) and super_admin
    if r is not null and r <> 'super_admin' then
      oldp := fn_stage_pos(old.fulfillment_stage::text);
      newp := fn_stage_pos(new.fulfillment_stage::text);
      if not (
            new.fulfillment_stage::text in ('Cancelled','No Feedback','New')  -- cancel / flag / reopen
         or old.fulfillment_stage::text in ('Cancelled','No Feedback')        -- move on from terminal-ish
         or (newp > oldp and newp > 0 and oldp > 0)                           -- forward along the pipeline
      ) then
        raise exception 'Illegal stage change: % -> %',
          old.fulfillment_stage, new.fulfillment_stage using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_stage_guard on public.orders;
create trigger trg_orders_stage_guard
  before update on public.orders
  for each row execute function public.fn_orders_stage_guard();

-- 2. Participant duplicate-add guard (grandfathers existing data) -------------
create or replace function public.fn_participant_dedup_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.email is not null and btrim(new.email) <> '' and new.schedule_id is not null then
    if exists (
      select 1 from participant p
       where p.schedule_id = new.schedule_id
         and lower(p.email) = lower(new.email)
    ) then
      raise exception 'A participant with email % is already on this session', new.email
        using errcode = '23505';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_participant_dedup_guard on public.participant;
create trigger trg_participant_dedup_guard
  before insert on public.participant
  for each row execute function public.fn_participant_dedup_guard();

-- 3. Nightly hygiene: add reminders + quote auto-expire ----------------------
create or replace function public.fn_nightly_hygiene()
returns table(action text, affected integer)
language plpgsql security definer set search_path to 'public' as $function$
declare n1 int; n2 int; n3 int; n4 int;
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

  -- Auto-expire quotes past their validity that were never converted.
  update quote set status = 'Expired'
   where status = 'Sent'
     and valid_until is not null and valid_until < current_date
     and converted_order_id is null;
  get diagnostics n4 = row_count;

  -- Queue session + payment reminders into comms_log. Guarded so a reminder
  -- failure can never abort nightly hygiene. (fn_queue_reminders only writes to
  -- the comms_log queue; nothing sends unless the send-comms function runs.)
  begin
    perform fn_queue_reminders();
  exception when others then null;
  end;

  return query
    select 'sessions closed'::text, n1
    union all select 'sessions running', n2
    union all select 'orders flagged no feedback', n3
    union all select 'quotes expired', n4;

  return query select * from public.fn_generate_worklist_tasks();
end $function$;

-- 4. fn_merge_orders — reconcile a duplicate order ---------------------------
create or replace function public.fn_merge_orders(p_keep text, p_dup text, p_reason text default null)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare r text;
begin
  r := fn_current_role()::text;
  if r is null or r not in ('operations','super_admin') then
    raise exception 'Only operations or super admin may merge orders' using errcode = '42501';
  end if;
  if p_keep is null or p_dup is null or p_keep = p_dup then
    raise exception 'Pick two different orders to merge';
  end if;
  if not exists (select 1 from orders where order_id = p_keep) then
    raise exception 'Surviving order % not found', p_keep;
  end if;
  if not exists (select 1 from orders where order_id = p_dup) then
    raise exception 'Duplicate order % not found', p_dup;
  end if;
  if not (fn_can_see_order(p_keep) and fn_can_see_order(p_dup)) then
    raise exception 'Not allowed to merge these orders' using errcode = '42501';
  end if;

  -- Cancel the duplicate's live lines so seats/revenue stop double-counting.
  -- The order_line rollup + totals triggers recompute session fill and order
  -- totals automatically; the audit triggers record the change.
  update order_line
     set line_status = 'Cancelled'
   where order_id = p_dup and line_status not in ('Cancelled');

  -- Cancel the duplicate order itself.
  update orders
     set order_status = 'Cancelled',
         fulfillment_stage = 'Cancelled'
   where order_id = p_dup;

  -- Close any duplicate_candidate rows pairing these two.
  update duplicate_candidate
     set status = 'Merged', resolved_by = auth.uid(), resolved_date = now()
   where status <> 'Merged'
     and ((order_id_a = p_keep and order_id_b = p_dup)
       or (order_id_a = p_dup and order_id_b = p_keep));

  return p_keep;
end $$;

revoke execute on function public.fn_merge_orders(text, text, text) from public, anon;
grant execute on function public.fn_merge_orders(text, text, text) to authenticated;

-- 5. v_session_health — one computed health level per session ----------------
-- Levels: Healthy / Needs Attention / At Risk / Blocked (terminal sessions carry
-- their own status). security_invoker so it respects the caller's RLS on schedule.
create or replace view public.v_session_health
with (security_invoker = true) as
with sig as (
  select
    s.schedule_id,
    s.status::text                                  as status,
    s.go_status::text                               as go_status,
    s.start_date,
    (s.start_date - current_date)                   as days_until,
    s.trainer_id, s.venue_id, s.modality::text      as modality,
    coalesce(s.booked_participants, 0)              as booked,
    coalesce(s.max_participants, 0)                 as max_p,
    (select count(*) from participant p
       where p.schedule_id = s.schedule_id
         and coalesce(btrim(p.full_name),'') <> '') as names_captured,
    (select coalesce(sum(ol.seats),0) from order_line ol
       where ol.schedule_id = s.schedule_id
         and ol.line_status::text not in ('Cancelled','Waitlist')) as seats_sold,
    exists (
      select 1 from order_line ol join orders o on o.order_id = ol.order_id
       where ol.schedule_id = s.schedule_id
         and ol.line_status::text not in ('Cancelled','Waitlist')
         and o.payment_status::text <> 'Paid'
         and o.order_status::text <> 'Cancelled'
    )                                               as has_unpaid
  from schedule s
  where s.deleted_at is null
)
select schedule_id, status, go_status, start_date, days_until,
  (names_captured < seats_sold)                     as roster_gap,
  has_unpaid,
  -- Health escalates with proximity: staffing/payment/roster gaps are normal far
  -- out and only matter as the date nears. "Needs Attention" is reserved for the
  -- structural planning concerns (below minimum / at capacity) so the signal
  -- stays meaningful instead of flagging every future session.
  case
    when status in ('Completed','Cancelled') then status
    when (trainer_id is null or (venue_id is null and modality = 'Face-to-face'))
         and days_until <= 14 then 'Blocked'
    when go_status = 'No-Go' and days_until <= 0 then 'Blocked'
    when go_status = 'No-Go' and days_until <= 7 then 'At Risk'
    when ((trainer_id is null or (venue_id is null and modality = 'Face-to-face')) and days_until <= 30)
         or (has_unpaid and days_until <= 7)
         or (names_captured < seats_sold and days_until <= 3) then 'At Risk'
    when go_status = 'No-Go' or (max_p > 0 and booked >= max_p) then 'Needs Attention'
    else 'Healthy'
  end                                               as health
from sig;

grant select on public.v_session_health to authenticated;
