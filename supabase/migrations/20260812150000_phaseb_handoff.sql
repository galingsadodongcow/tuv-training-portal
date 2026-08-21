-- ===========================================================================
-- Phase B (second-pass) — 6/6: the Sales/Coordinator -> Operations handoff
-- transaction (H01 completeness gate, H02 Accept/Return, RET01 universal
-- return-for-correction).
--
--  * fn_order_completeness(order) — the D2 required-field contract as data:
--    HARD blocks (matched client, >=1 line, session-for-scheduled-lines, a fee,
--    a reference) and WARN items (deposit unpaid). Reusable by UI + endorse.
--  * fn_endorse_order — coordinator/operations/sales/super_admin; refuses unless
--    complete (super_admin may override with a reason). Moves the order to
--    'Endorsed to Ops' and opens an order_handoff row.
--  * fn_accept_endorsement — operations/super_admin accept; the two-sided close.
--  * fn_return_for_correction — anyone downstream may bounce it back WITH a
--    reason; regresses the stage to 'For Order Creation'.
--
-- The stage guard (fn_orders_stage_guard) is taught a single controlled bypass
-- (a txn-local GUC set only by fn_return_for_correction) so a legitimate return
-- can regress the pipeline without opening backward moves generally.
-- Idempotent throughout.
-- ===========================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'handoff_status_t') then
    create type public.handoff_status_t as enum ('Endorsed','Accepted','Returned');
  end if;
end $$;

create table if not exists public.order_handoff (
  handoff_id   uuid primary key default gen_random_uuid(),
  order_id     text not null unique references public.orders(order_id),
  status       public.handoff_status_t not null default 'Endorsed',
  endorsed_by  uuid, endorsed_at timestamptz,
  accepted_by  uuid, accepted_at timestamptz,
  returned_by  uuid, returned_at timestamptz, return_reason text,
  completeness jsonb,
  updated_at   timestamptz not null default now()
);
alter table public.order_handoff enable row level security;
drop policy if exists p_handoff_r on public.order_handoff;
create policy p_handoff_r on public.order_handoff for select to authenticated
  using (fn_can_see_order(order_id));
-- Direct writes are super_admin-only; the normal path is the RPCs below
-- (SECURITY DEFINER), which enforce their own role gates.
drop policy if exists p_handoff_w on public.order_handoff;
create policy p_handoff_w on public.order_handoff for all to authenticated
  using (fn_current_role() = 'super_admin') with check (fn_current_role() = 'super_admin');
grant select, insert, update, delete on public.order_handoff to authenticated;

-- ---- Completeness contract (D2) as data ------------------------------------
create or replace function public.fn_order_completeness(p_order text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  o record; v_lines int; v_unscheduled int; v_fee numeric; hard jsonb := '[]'::jsonb; warn jsonb := '[]'::jsonb;
begin
  if not fn_can_see_order(p_order) then
    raise exception 'Not allowed to view this order' using errcode = '42501';
  end if;
  select * into o from orders where order_id = p_order;
  if not found then raise exception 'Order % not found', p_order; end if;

  if o.client_id is null then hard := hard || to_jsonb('Matched customer required (order has no client)'::text); end if;

  select count(*) into v_lines from order_line
    where order_id = p_order and line_status::text <> 'Cancelled';
  if v_lines = 0 then hard := hard || to_jsonb('At least one active order line required'::text); end if;

  -- Scheduled (non e-learning) lines must be tied to a session.
  select count(*) into v_unscheduled from order_line
    where order_id = p_order and line_status::text <> 'Cancelled'
      and modality::text <> 'E-learning' and schedule_id is null;
  if v_unscheduled > 0 then
    hard := hard || to_jsonb((v_unscheduled || ' scheduled line(s) have no session assigned')::text);
  end if;

  v_fee := coalesce(o.total_amount, 0) + coalesce(o.amount_php, 0)
           + coalesce((select sum(amount_php) from order_line where order_id = p_order), 0);
  if v_fee <= 0 then hard := hard || to_jsonb('A fee is required'::text); end if;

  if coalesce(btrim(o.order_id), '') = '' then
    hard := hard || to_jsonb('A reference is required'::text);
  end if;

  -- Warning: deposit unpaid at endorsement (advisory, not blocking).
  if o.payment_status::text = 'Unpaid' then
    warn := warn || to_jsonb('Deposit/payment not yet recorded'::text);
  end if;

  return jsonb_build_object('ok', jsonb_array_length(hard) = 0, 'hard', hard, 'warn', warn);
end $$;
grant execute on function public.fn_order_completeness(text) to authenticated;

-- ---- Endorse (H01 gate) ----------------------------------------------------
create or replace function public.fn_endorse_order(p_order text, p_override_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text; v_check jsonb; v_is_admin boolean;
begin
  if r is null or r not in ('coordinator','operations','sales','super_admin') then
    raise exception 'Your role may not endorse orders' using errcode = '42501';
  end if;
  if not fn_can_see_order(p_order) then
    raise exception 'Not allowed to act on this order' using errcode = '42501';
  end if;

  v_check := fn_order_completeness(p_order);
  v_is_admin := (r = 'super_admin');
  if not (v_check->>'ok')::boolean then
    if not (v_is_admin and coalesce(btrim(p_override_reason),'') <> '') then
      raise exception 'Order is not complete: %', (v_check->'hard')::text using errcode = '42501';
    end if;
    perform set_config('app.audit_reason', 'endorse override: '||p_override_reason, true);
  end if;

  update orders set fulfillment_stage = 'Endorsed to Ops' where order_id = p_order;

  insert into order_handoff (order_id, status, endorsed_by, endorsed_at, completeness, updated_at)
    values (p_order, 'Endorsed', auth.uid(), now(), v_check, now())
  on conflict (order_id) do update
    set status = 'Endorsed', endorsed_by = auth.uid(), endorsed_at = now(),
        returned_by = null, returned_at = null, return_reason = null,
        completeness = excluded.completeness, updated_at = now();
  return v_check;
end $$;
revoke execute on function public.fn_endorse_order(text, text) from public, anon;
grant execute on function public.fn_endorse_order(text, text) to authenticated;

-- ---- Accept (H02 two-sided close) ------------------------------------------
create or replace function public.fn_accept_endorsement(p_order text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if r is null or r not in ('operations','super_admin') then
    raise exception 'Only operations or super_admin may accept an endorsement' using errcode = '42501';
  end if;
  update order_handoff
     set status = 'Accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
   where order_id = p_order and status = 'Endorsed';
  if not found then
    raise exception 'No pending endorsement to accept for order %', p_order using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.fn_accept_endorsement(text) from public, anon;
grant execute on function public.fn_accept_endorsement(text) to authenticated;

-- ---- Return for correction (H02 / RET01) -----------------------------------
create or replace function public.fn_return_for_correction(p_order text, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if r is null or r not in ('operations','coordinator','business_owner','super_admin') then
    raise exception 'Your role may not return an order for correction' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason),'') = '' then
    raise exception 'A return requires a reason' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', 'returned: '||p_reason, true);
  -- Controlled, single-purpose bypass of the forward-only stage guard.
  perform set_config('app.allow_stage_regression', 'on', true);
  update orders set fulfillment_stage = 'For Order Creation'
   where order_id = p_order and fulfillment_stage::text <> 'For Order Creation';
  perform set_config('app.allow_stage_regression', 'off', true);

  insert into order_handoff (order_id, status, returned_by, returned_at, return_reason, updated_at)
    values (p_order, 'Returned', auth.uid(), now(), p_reason, now())
  on conflict (order_id) do update
    set status = 'Returned', returned_by = auth.uid(), returned_at = now(),
        return_reason = p_reason, updated_at = now();
end $$;
revoke execute on function public.fn_return_for_correction(text, text) from public, anon;
grant execute on function public.fn_return_for_correction(text, text) to authenticated;

-- ---- Teach the stage guard one controlled regression bypass ----------------
create or replace function public.fn_orders_stage_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r text; oldp int; newp int;
begin
  if new.fulfillment_stage is distinct from old.fulfillment_stage then
    r := fn_current_role()::text;
    if r is not null and r <> 'super_admin'
       and coalesce(current_setting('app.allow_stage_regression', true), 'off') <> 'on' then
      oldp := fn_stage_pos(old.fulfillment_stage::text);
      newp := fn_stage_pos(new.fulfillment_stage::text);
      if not (
            new.fulfillment_stage::text in ('Cancelled','No Feedback','New')
         or old.fulfillment_stage::text in ('Cancelled','No Feedback')
         or (newp > oldp and newp > 0 and oldp > 0)
      ) then
        raise exception 'Illegal stage change: % -> %',
          old.fulfillment_stage, new.fulfillment_stage using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fn_orders_stage_guard() from public, anon, authenticated;
