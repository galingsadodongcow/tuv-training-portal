-- Accounts receivable. Real invoices and payments behind an order, so the
-- payment status and the collection clock are driven by recorded money, not by
-- a date heuristic.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create table if not exists public.invoice (
  invoice_id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id) on delete cascade,
  invoice_number text,
  issue_date date not null default current_date,
  due_date date,
  amount numeric(14,2) not null default 0,
  status text not null default 'Sent',           -- Draft, Sent, Paid, Void
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists invoice_order_idx on public.invoice(order_id);

create table if not exists public.payment (
  payment_id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id) on delete cascade,
  paid_date date not null default current_date,
  amount numeric(14,2) not null default 0,
  method text,                                    -- Bank transfer, Credit card, Cheque, Cash
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists payment_order_idx on public.payment(order_id);

alter table public.invoice enable row level security;
alter table public.payment enable row level security;

-- Read for any signed-in role. Manage for operations, business owner, super admin.
drop policy if exists p_invoice_r on public.invoice;
create policy p_invoice_r on public.invoice for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_invoice_w on public.invoice;
create policy p_invoice_w on public.invoice for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));

drop policy if exists p_payment_r on public.payment;
create policy p_payment_r on public.payment for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_payment_w on public.payment;
create policy p_payment_w on public.payment for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));

-- Recompute the order's payment status from the sum of payments.
create or replace function public.fn_ar_recompute(p_order text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_total numeric; v_paid numeric;
begin
  select total_amount into v_total from orders where order_id = p_order;
  select coalesce(sum(amount), 0) into v_paid from payment where order_id = p_order;
  update orders set payment_status =
    (case when coalesce(v_total,0) > 0 and v_paid >= v_total then 'Paid'
         when v_paid > 0 then 'Partial'
         else 'Unpaid' end)::payment_status_t
  where order_id = p_order;
end $$;

create or replace function public.fn_payment_touch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform fn_ar_recompute(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end $$;
drop trigger if exists trg_payment_touch on public.payment;
create trigger trg_payment_touch after insert or update or delete on public.payment
  for each row execute function public.fn_payment_touch();

-- Per-order receivable position for the order page and the aging report.
create or replace view public.v_order_ar as
  select o.order_id, o.order_date, o.total_amount, o.payment_status, o.order_status,
         cl.company, cl.name as client_name,
         coalesce((select sum(i.amount) from invoice i where i.order_id = o.order_id and i.status <> 'Void'), 0) as invoiced,
         coalesce((select sum(p.amount) from payment p where p.order_id = o.order_id), 0) as paid,
         o.total_amount - coalesce((select sum(p.amount) from payment p where p.order_id = o.order_id), 0) as balance,
         (select min(i.due_date) from invoice i where i.order_id = o.order_id and i.status <> 'Void') as due_date
    from orders o
    left join client cl on cl.client_id = o.client_id;
