-- Close the AR control gap: a sales user could change orders.payment_status
-- and orders.sap_order_no on any order they can update (their own / team),
-- because the row-level p_orders_sales_u policy is column-unrestricted. RLS
-- cannot express "sales may update the row but not these two columns", so this
-- adds a BEFORE UPDATE trigger that forbids a sales caller from changing either
-- field. Operations / business_owner / super_admin are unaffected.
--
-- Payment status and the SAP reference are AR/finance-controlled; a rep must not
-- be able to self-mark an order Paid. The UI also hides these fields from sales
-- (OrderDetail), but this trigger is the authoritative guard.
--
-- Idempotent; safe to re-apply.

create or replace function public.fn_guard_orders_sales_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if fn_current_role() = 'sales' then
    if new.payment_status is distinct from old.payment_status then
      raise exception 'sales role may not change payment_status'
        using errcode = '42501';
    end if;
    if new.sap_order_no is distinct from old.sap_order_no then
      raise exception 'sales role may not change sap_order_no'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_orders_sales_fields on public.orders;
create trigger trg_guard_orders_sales_fields
  before update on public.orders
  for each row execute function public.fn_guard_orders_sales_fields();
