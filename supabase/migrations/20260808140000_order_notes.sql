-- Order comments. Sessions already have a note thread; orders did not. This
-- gives an order the same: a running comment thread anyone can read and add to,
-- for reference alongside the fulfillment stage. Mirrors session_note exactly.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create table if not exists public.order_note (
  note_id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id) on delete cascade,
  author uuid not null references public.profiles(user_id),
  note text not null,
  date timestamptz not null default now()
);
create index if not exists order_note_order_id_idx on public.order_note(order_id);

alter table public.order_note enable row level security;

-- Read: any signed-in user. Insert: only as yourself.
drop policy if exists p_ordnote_r on public.order_note;
create policy p_ordnote_r on public.order_note for select to authenticated using (true);
drop policy if exists p_ordnote_i on public.order_note;
create policy p_ordnote_i on public.order_note for insert to authenticated with check (author = auth.uid());
