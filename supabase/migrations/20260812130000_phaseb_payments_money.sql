-- ===========================================================================
-- Phase B (second-pass) — 4/6: money model (D3).
--
--  * Payments become IMMUTABLE: never deleted, financial fields frozen once
--    written. A payment lifecycle (Pending -> Confirmed -> Voided) replaces the
--    old hard-DELETE "refund". Recording/confirming = coordinator / operations /
--    business_owner / super_admin. VOID and REFUND = business_owner / super_admin
--    only, each behind a mandatory persisted reason.
--  * New `refund` and `credit_note` objects give audit-grade financial history.
--  * fn_ar_recompute now derives AR from CONFIRMED payments − refunds + applied
--    credit notes (was: sum of all payment rows).
--
-- Idempotent. Trigger functions have EXECUTE revoked from the API roles (they
-- fire on triggers, not as RPCs). Enum CASE is cast to payment_status_t to avoid
-- the text→enum assignment error (42804) noted in CLAUDE.md.
-- ===========================================================================

-- ---- Per-payment lifecycle enum (distinct from order-level payment_status_t) --
do $$ begin
  if not exists (select 1 from pg_type where typname = 'payment_state_t') then
    create type public.payment_state_t as enum ('Pending','Confirmed','Voided');
  end if;
end $$;

-- ---- Payment lifecycle columns (existing rows are historical Confirmed) -----
alter table public.payment add column if not exists status public.payment_state_t not null default 'Confirmed';
alter table public.payment add column if not exists confirmed_by uuid;
alter table public.payment add column if not exists confirmed_at timestamptz;
alter table public.payment add column if not exists voided_by uuid;
alter table public.payment add column if not exists voided_at timestamptz;
alter table public.payment add column if not exists void_reason text;

-- Stamp confirmation provenance on pre-existing rows (before the guard exists).
update public.payment
   set confirmed_at = coalesce(confirmed_at, created_at),
       confirmed_by = coalesce(confirmed_by, created_by)
 where status = 'Confirmed' and confirmed_at is null;

-- ---- Immutability guard: no deletes; freeze financial identity -------------
create or replace function public.fn_payment_immutable_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments are immutable and cannot be deleted; void or refund instead'
      using errcode = '42501';
  end if;

  -- Financial identity is frozen for the life of the row.
  if new.order_id   is distinct from old.order_id
  or new.amount     is distinct from old.amount
  or new.paid_date  is distinct from old.paid_date
  or new.method     is distinct from old.method
  or new.reference  is distinct from old.reference
  or new.created_by is distinct from old.created_by
  or new.created_at is distinct from old.created_at then
    raise exception 'Payment financial fields are immutable (only status/confirmation/void may change)'
      using errcode = '42501';
  end if;

  -- Legal transitions only.
  if new.status is distinct from old.status then
    if not ( (old.status = 'Pending'   and new.status in ('Confirmed','Voided'))
          or (old.status = 'Confirmed' and new.status = 'Voided') ) then
      raise exception 'Illegal payment status transition: % -> %', old.status, new.status
        using errcode = '42501';
    end if;
    if new.status = 'Confirmed' then
      new.confirmed_at := coalesce(new.confirmed_at, now());
      new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
    end if;
    if new.status = 'Voided' then
      if r is null or r not in ('business_owner','super_admin') then
        raise exception 'Only business_owner or super_admin may void a payment' using errcode = '42501';
      end if;
      if coalesce(btrim(new.void_reason),'') = '' then
        raise exception 'A void requires a reason' using errcode = '42501';
      end if;
      new.voided_at := coalesce(new.voided_at, now());
      new.voided_by := coalesce(new.voided_by, auth.uid());
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fn_payment_immutable_guard() from public, anon, authenticated;

drop trigger if exists trg_payment_immutable on public.payment;
create trigger trg_payment_immutable before update or delete on public.payment
  for each row execute function public.fn_payment_immutable_guard();

-- ---- Payment RLS: split the old ALL policy into record / update, no delete --
drop policy if exists p_payment_w on public.payment;
-- p_payment_r (SELECT via fn_can_see_order) is unchanged.
drop policy if exists p_payment_i on public.payment;
create policy p_payment_i on public.payment for insert to authenticated
  with check (fn_current_role() in ('operations','coordinator','business_owner','super_admin')
              and status in ('Pending','Confirmed'));
drop policy if exists p_payment_u on public.payment;
create policy p_payment_u on public.payment for update to authenticated
  using  (fn_current_role() in ('operations','coordinator','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','coordinator','business_owner','super_admin'));
-- No DELETE policy: deletes are denied by RLS and blocked by the guard.

-- ---- Refund object (BO / super_admin only) --------------------------------
create table if not exists public.refund (
  refund_id  uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payment(payment_id),
  order_id   text not null references public.orders(order_id),
  amount     numeric not null check (amount > 0),
  reason     text not null,
  refunded_by uuid,
  created_at timestamptz not null default now()
);
alter table public.refund enable row level security;
drop policy if exists p_refund_r on public.refund;
create policy p_refund_r on public.refund for select to authenticated
  using (fn_can_see_order(order_id));
drop policy if exists p_refund_w on public.refund;
create policy p_refund_w on public.refund for all to authenticated
  using  (fn_current_role() in ('business_owner','super_admin'))
  with check (fn_current_role() in ('business_owner','super_admin'));

create or replace function public.fn_refund_touch()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin perform fn_ar_recompute(coalesce(new.order_id, old.order_id)); return coalesce(new, old); end $$;
revoke execute on function public.fn_refund_touch() from public, anon, authenticated;
drop trigger if exists trg_refund_touch on public.refund;
create trigger trg_refund_touch after insert or update or delete on public.refund
  for each row execute function public.fn_refund_touch();

-- ---- Credit note object (BO / super_admin write; read-all + order-visible) --
create table if not exists public.credit_note (
  credit_id uuid primary key default gen_random_uuid(),
  org_id    uuid references public.organization(org_id),
  order_id  text references public.orders(order_id),
  amount    numeric not null check (amount > 0),
  reason    text not null,
  status    text not null default 'Open',      -- Open | Applied | Cancelled
  applied_to_order text references public.orders(order_id),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.credit_note enable row level security;
drop policy if exists p_credit_r on public.credit_note;
create policy p_credit_r on public.credit_note for select to authenticated
  using (fn_role_reads_all()
         or (order_id is not null and fn_can_see_order(order_id))
         or (applied_to_order is not null and fn_can_see_order(applied_to_order)));
drop policy if exists p_credit_w on public.credit_note;
create policy p_credit_w on public.credit_note for all to authenticated
  using  (fn_current_role() in ('business_owner','super_admin'))
  with check (fn_current_role() in ('business_owner','super_admin'));

create or replace function public.fn_credit_touch()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.applied_to_order, old.applied_to_order) is not null then
    perform fn_ar_recompute(coalesce(new.applied_to_order, old.applied_to_order));
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.fn_credit_touch() from public, anon, authenticated;
drop trigger if exists trg_credit_touch on public.credit_note;
create trigger trg_credit_touch after insert or update or delete on public.credit_note
  for each row execute function public.fn_credit_touch();

-- ---- AR now nets confirmed payments − refunds + applied credits ------------
create or replace function public.fn_ar_recompute(p_order text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_total numeric; v_paid numeric; v_refunded numeric; v_credit numeric; v_net numeric;
begin
  select coalesce(total_amount,0) into v_total from orders where order_id = p_order;
  select coalesce(sum(amount),0) into v_paid
    from payment where order_id = p_order and status = 'Confirmed';
  select coalesce(sum(amount),0) into v_refunded
    from refund where order_id = p_order;
  select coalesce(sum(amount),0) into v_credit
    from credit_note where applied_to_order = p_order and status = 'Applied';
  v_net := v_paid - v_refunded + v_credit;
  update orders
     set payment_status = (case
           when v_net <= 0 then 'Unpaid'
           when v_net >= v_total then 'Paid'
           else 'Partial' end)::payment_status_t
   where order_id = p_order;
end $$;

-- ---- Sensitive-action RPCs (server-enforced authority) --------------------
create or replace function public.fn_void_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text; v_order text;
begin
  if r is null or r not in ('business_owner','super_admin') then
    raise exception 'Only business_owner or super_admin may void a payment' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'A void requires a reason'; end if;
  update payment set status = 'Voided', void_reason = p_reason,
                     voided_by = auth.uid(), voided_at = now()
   where payment_id = p_payment returning order_id into v_order;
  if v_order is null then raise exception 'Payment % not found', p_payment; end if;
  -- AR is recomputed by trg_payment_touch on the update above.
end $$;
revoke execute on function public.fn_void_payment(uuid, text) from public, anon;
grant execute on function public.fn_void_payment(uuid, text) to authenticated;

create or replace function public.fn_refund_payment(p_payment uuid, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text; v_order text; v_amt numeric; v_id uuid;
begin
  if r is null or r not in ('business_owner','super_admin') then
    raise exception 'Only business_owner or super_admin may refund' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'A refund requires a reason'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Refund amount must be positive'; end if;
  select order_id, amount into v_order, v_amt from payment
    where payment_id = p_payment and status = 'Confirmed';
  if v_order is null then raise exception 'Confirmed payment % not found', p_payment; end if;
  if p_amount > v_amt then raise exception 'Refund exceeds the payment amount'; end if;
  insert into refund (payment_id, order_id, amount, reason, refunded_by)
    values (p_payment, v_order, p_amount, p_reason, auth.uid())
    returning refund_id into v_id;
  return v_id;  -- AR recomputed by trg_refund_touch.
end $$;
revoke execute on function public.fn_refund_payment(uuid, numeric, text) from public, anon;
grant execute on function public.fn_refund_payment(uuid, numeric, text) to authenticated;

grant select, insert, update, delete on public.refund, public.credit_note to authenticated;
