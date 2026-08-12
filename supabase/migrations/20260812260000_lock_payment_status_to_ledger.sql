-- ===========================================================================
-- #127 — Reconcile payment_status with the AR ledger.
--
-- payment_status is derived correctly by fn_ar_recompute (net confirmed
-- payments − refunds + applied credits, vs the order total) whenever a payment
-- or refund changes. But payment_status is a directly-editable column, so a
-- manual UPDATE (the OrderDetail payment select) could set it to disagree with
-- the ledger — e.g. "Paid" with an outstanding balance.
--
-- This adds a narrow BEFORE UPDATE trigger that re-derives payment_status from
-- the ledger *only when an update tries to change it*, so it can never drift by
-- hand; and it normalizes every existing order to its ledger value. Validated in
-- a rollback transaction against live data before applying (0 Paid-with-balance
-- afterwards). Idempotent.
-- ===========================================================================

create or replace function public.fn_orders_lock_payment_status()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_total numeric; v_net numeric;
begin
  -- Only act when the update changes payment_status; otherwise leave the row
  -- untouched (a stage/SAP edit must not trigger a recompute).
  if new.payment_status is distinct from old.payment_status then
    v_total := coalesce(new.total_amount, 0);
    v_net := coalesce((select sum(amount) from payment where order_id = new.order_id and status = 'Confirmed'), 0)
           - coalesce((select sum(amount) from refund where order_id = new.order_id), 0)
           + coalesce((select sum(amount) from credit_note where applied_to_order = new.order_id and status = 'Applied'), 0);
    -- Same derivation as fn_ar_recompute — the value is the ledger's, not the caller's.
    new.payment_status := (case
        when v_net <= 0 then 'Unpaid'
        when v_net >= v_total then 'Paid'
        else 'Partial' end)::payment_status_t;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_lock_payment_status on public.orders;
create trigger trg_orders_lock_payment_status
  before update on public.orders
  for each row execute function public.fn_orders_lock_payment_status();

-- Normalize every existing order to its ledger value (fixes any current drift,
-- e.g. the one order reading Paid with a balance).
select public.fn_ar_recompute(order_id) from public.orders;
