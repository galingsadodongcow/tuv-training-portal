-- CRM depth. Multiple contacts per client, richer inquiry fields, and a
-- Closed Lost stage with a reason.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.
-- Note: the ALTER TYPE runs on its own; keep it as the first statement.

alter type inquiry_status_t add value if not exists 'Closed Lost';

create table if not exists public.contact (
  contact_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.client(client_id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contact_client_idx on public.contact(client_id);

alter table public.contact enable row level security;
drop policy if exists p_contact_r on public.contact;
create policy p_contact_r on public.contact for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_contact_w on public.contact;
create policy p_contact_w on public.contact for all to authenticated
  using (fn_current_role() in ('super_admin','sales')) with check (fn_current_role() in ('super_admin','sales'));

-- Richer inquiry fields.
alter table public.inquiry add column if not exists est_value numeric;
alter table public.inquiry add column if not exists probability integer;
alter table public.inquiry add column if not exists expected_close date;
alter table public.inquiry add column if not exists source text;
alter table public.inquiry add column if not exists lost_reason text;

-- Make sure the client interaction log is readable and writable.
alter table public.client_interaction enable row level security;
drop policy if exists p_ci_r on public.client_interaction;
create policy p_ci_r on public.client_interaction for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_ci_w on public.client_interaction;
create policy p_ci_w on public.client_interaction for all to authenticated
  using (fn_current_role() in ('super_admin','sales')) with check (fn_current_role() in ('super_admin','sales'));
