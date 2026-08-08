-- Enforce the participant policy in the database, so it holds no matter how a
-- schedule is written: minimum 8 for every course, maximum 20 for professional
-- trainings and 10 for IRCA courses. IRCA courses are identified by name
-- (matching 'IRCA' or 'Lead Auditor').
--
-- Idempotent and safe to paste whole into the Supabase SQL editor. It backfills
-- existing schedules once, then installs a trigger that keeps every future
-- insert and update in line. The app locks the same values in its form, so the
-- two agree.

-- 1. Backfill existing schedules to the policy.
update schedule s set
  min_participants = 8,
  max_participants = case
    when exists (
      select 1 from course c
      where c.course_id = s.course_id
        and (c.course_name ilike '%IRCA%' or c.course_name ilike '%Lead Auditor%')
    ) then 10 else 20 end;

-- 2. Enforce on every write.
create or replace function public.fn_enforce_pax()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_irca boolean;
begin
  select (c.course_name ilike '%IRCA%' or c.course_name ilike '%Lead Auditor%')
    into v_irca
    from course c
   where c.course_id = new.course_id;
  new.min_participants := 8;
  new.max_participants := case when coalesce(v_irca, false) then 10 else 20 end;
  return new;
end $$;

drop trigger if exists trg_enforce_pax on public.schedule;
create trigger trg_enforce_pax before insert or update on public.schedule
  for each row execute function public.fn_enforce_pax();
