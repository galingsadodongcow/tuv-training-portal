-- ===========================================================================
-- SV01 — server-persisted saved views.
--
-- A per-user, per-surface saved filter/sort/column set, so a view survives
-- across devices and sessions. `config` is opaque jsonb owned by the client.
-- Personal views belong to their owner; a super_admin may publish role-default
-- views (owner_id null, shared_role set) that everyone in that role can read.
--
-- Idempotent; RLS enabled.
-- ===========================================================================

create table if not exists public.saved_view (
  view_id     uuid primary key default gen_random_uuid(),
  owner_id    uuid references public.profiles(user_id) on delete cascade,
  surface     text not null,                        -- 'orders','worklist','my_work',...
  name        text not null,
  config      jsonb not null default '{}'::jsonb,   -- {filters, sort, columns}
  is_default  boolean not null default false,
  shared_role public.user_role,                     -- non-null => a role-wide default
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- At most one personal default per (owner, surface).
create unique index if not exists saved_view_owner_default_uq
  on public.saved_view (owner_id, surface) where is_default and owner_id is not null;
-- At most one shared default per (role, surface).
create unique index if not exists saved_view_shared_default_uq
  on public.saved_view (shared_role, surface) where is_default and shared_role is not null;

alter table public.saved_view enable row level security;

-- Read: your own views, plus any role-default published for your role.
drop policy if exists p_savedview_r on public.saved_view;
create policy p_savedview_r on public.saved_view for select to authenticated
  using (owner_id = auth.uid()
         or (shared_role is not null and shared_role = fn_current_role()));

-- Write your own personal views (never a shared one through this policy).
drop policy if exists p_savedview_own on public.saved_view;
create policy p_savedview_own on public.saved_view for all to authenticated
  using (owner_id = auth.uid() and shared_role is null)
  with check (owner_id = auth.uid() and shared_role is null);

-- Super admin manages the published role-default views.
drop policy if exists p_savedview_shared on public.saved_view;
create policy p_savedview_shared on public.saved_view for all to authenticated
  using (fn_current_role() = 'super_admin')
  with check (fn_current_role() = 'super_admin');

grant select, insert, update, delete on public.saved_view to authenticated;

drop trigger if exists trg_savedview_touch on public.saved_view;
create trigger trg_savedview_touch before update on public.saved_view
  for each row execute function public.fn_touch_updated_at();
