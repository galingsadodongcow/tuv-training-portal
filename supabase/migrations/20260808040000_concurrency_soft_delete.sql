-- Optimistic concurrency and soft delete for the operational records.
-- Adds updated_at (kept current by a trigger) so the app can detect a record
-- that changed under it, and deleted_at so records are archived, not destroyed.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor. No enum
-- changes, no begin/commit needed. The app already tolerates these columns
-- being absent, so applying this is non-breaking either way.

-- Shared trigger: stamp updated_at on every row update.
create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- orders --------------------------------------------------------------------
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists deleted_at timestamptz;
drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.fn_touch_updated_at();

-- schedule ------------------------------------------------------------------
alter table public.schedule add column if not exists updated_at timestamptz not null default now();
alter table public.schedule add column if not exists deleted_at timestamptz;
drop trigger if exists trg_schedule_touch on public.schedule;
create trigger trg_schedule_touch before update on public.schedule
  for each row execute function public.fn_touch_updated_at();

-- client --------------------------------------------------------------------
alter table public.client add column if not exists updated_at timestamptz not null default now();
alter table public.client add column if not exists deleted_at timestamptz;
drop trigger if exists trg_client_touch on public.client;
create trigger trg_client_touch before update on public.client
  for each row execute function public.fn_touch_updated_at();

-- Notes
-- 1. Optimistic concurrency: the app reads updated_at with a record and, on
--    save, updates ... where updated_at = <the value it read>. If no row
--    matches, someone else changed the record first and the app asks the user
--    to reload rather than overwrite.
-- 2. Soft delete: the app sets deleted_at instead of deleting, and filters
--    deleted_at is not null out of its lists. order_assignment already carries
--    its own updated_at and trigger, so it is left as is.
