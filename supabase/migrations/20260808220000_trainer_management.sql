-- Trainer management for operations: availability (blackout dates) enforced when
-- assigning a trainer, co-trainers on a session, and competency policies.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create table if not exists public.trainer_availability (
  avail_id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer(trainer_id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists trainer_avail_idx on public.trainer_availability(trainer_id, start_date);

create table if not exists public.session_trainer (
  schedule_id uuid not null references public.schedule(schedule_id) on delete cascade,
  trainer_id uuid not null references public.trainer(trainer_id) on delete cascade,
  role text not null default 'Assistant',   -- Lead, Assistant
  primary key (schedule_id, trainer_id)
);

alter table public.trainer_availability enable row level security;
alter table public.session_trainer enable row level security;
alter table public.trainer_course enable row level security;

drop policy if exists p_avail_r on public.trainer_availability;
create policy p_avail_r on public.trainer_availability for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_avail_w on public.trainer_availability;
create policy p_avail_w on public.trainer_availability for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

drop policy if exists p_strainer_r on public.session_trainer;
create policy p_strainer_r on public.session_trainer for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_strainer_w on public.session_trainer;
create policy p_strainer_w on public.session_trainer for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

drop policy if exists p_tcourse_r on public.trainer_course;
create policy p_tcourse_r on public.trainer_course for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_tcourse_w on public.trainer_course;
create policy p_tcourse_w on public.trainer_course for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

-- Block assigning a trainer to a session that overlaps their blackout.
create or replace function public.fn_trainer_blackout_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_name text;
begin
  if new.trainer_id is null then return new; end if;
  if exists (
    select 1 from trainer_availability a
    where a.trainer_id = new.trainer_id
      and a.start_date <= new.end_date and a.end_date >= new.start_date
  ) then
    select name into v_name from trainer where trainer_id = new.trainer_id;
    raise exception 'Trainer % is on blackout for these dates.', coalesce(v_name, 'selected');
  end if;
  return new;
end $$;
drop trigger if exists trg_trainer_blackout on public.schedule;
create trigger trg_trainer_blackout before insert or update of trainer_id, start_date, end_date on public.schedule
  for each row execute function public.fn_trainer_blackout_guard();
