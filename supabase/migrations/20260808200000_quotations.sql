-- Quotations. A formal quote with line items, a discount, and a validity date,
-- that a salesperson can send and then turn into an order.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create sequence if not exists public.quote_seq;
-- The anon key runs as authenticated; without USAGE on the sequence, inserting a
-- quote (whose quote_number default calls nextval) fails with "permission denied
-- for sequence quote_seq".
grant usage, select on sequence public.quote_seq to authenticated;

create table if not exists public.quote (
  quote_id uuid primary key default gen_random_uuid(),
  quote_number text not null default ('QUO-' || lpad(nextval('public.quote_seq')::text, 5, '0')),
  client_id uuid references public.client(client_id) on delete set null,
  inquiry_id uuid,
  sales_id uuid,
  status text not null default 'Draft',        -- Draft, Sent, Accepted, Declined, Expired
  valid_until date,
  discount_pct numeric not null default 0,
  note text,
  converted_order_id text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists quote_client_idx on public.quote(client_id);

create table if not exists public.quote_line (
  line_id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quote(quote_id) on delete cascade,
  course_id uuid,
  modality modality_t not null default 'Face-to-face',
  seats integer not null default 1,
  unit_price numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists quote_line_quote_idx on public.quote_line(quote_id);

alter table public.quote enable row level security;
alter table public.quote_line enable row level security;

-- Read for any signed-in role. Manage for super admin and sales.
drop policy if exists p_quote_r on public.quote;
create policy p_quote_r on public.quote for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_quote_w on public.quote;
create policy p_quote_w on public.quote for all to authenticated
  using (fn_current_role() in ('super_admin','sales')) with check (fn_current_role() in ('super_admin','sales'));

drop policy if exists p_quote_line_r on public.quote_line;
create policy p_quote_line_r on public.quote_line for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_quote_line_w on public.quote_line;
create policy p_quote_line_w on public.quote_line for all to authenticated
  using (fn_current_role() in ('super_admin','sales')) with check (fn_current_role() in ('super_admin','sales'));

-- Quote totals for the list and the detail header.
create or replace view public.v_quote_total as
  select q.quote_id,
         coalesce((select sum(l.seats * l.unit_price) from quote_line l where l.quote_id = q.quote_id), 0) as subtotal,
         q.discount_pct,
         round(coalesce((select sum(l.seats * l.unit_price) from quote_line l where l.quote_id = q.quote_id), 0) * (1 - q.discount_pct / 100.0), 2) as total
    from quote q;
