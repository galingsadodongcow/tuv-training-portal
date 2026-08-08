-- Course-level participant policy and a single source of truth for fill counts.
--
-- 1. Replaces name matching ('IRCA' / 'Lead Auditor') with real course
--    attributes: is_certification caps a course at 10 seats, and max_pax lets
--    operations override the cap for any course. Minimum stays 8.
-- 2. Unifies booked_participants: the orders trigger and the order_line trigger
--    now compute the same number (sum of live order_line seats), so the fill
--    count can no longer drift between the two.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

alter table public.course add column if not exists is_certification boolean not null default false;
alter table public.course add column if not exists max_pax integer;

-- Backfill: courses currently identified as IRCA or Lead Auditor become certification.
update public.course
   set is_certification = true
 where is_certification = false
   and (course_name ilike '%IRCA%' or course_name ilike '%Lead Auditor%');

-- Enforce pax from the course attributes, not the name.
create or replace function public.fn_enforce_pax()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_cert boolean; v_max int;
begin
  select c.is_certification, c.max_pax into v_cert, v_max from course c where c.course_id = new.course_id;
  new.min_participants := 8;
  new.max_participants := coalesce(v_max, case when coalesce(v_cert, false) then 10 else 20 end);
  return new;
end $$;
drop trigger if exists trg_enforce_pax on public.schedule;
create trigger trg_enforce_pax before insert or update on public.schedule
  for each row execute function public.fn_enforce_pax();

-- Bring existing schedules in line with the course attributes.
update schedule s set
  min_participants = 8,
  max_participants = coalesce(
    (select c.max_pax from course c where c.course_id = s.course_id),
    case when (select c.is_certification from course c where c.course_id = s.course_id) then 10 else 20 end);

-- Single source of truth for booked participants: sum of live order_line seats.
-- Called by both the order-line roll-up trigger and the orders roll-up trigger.
create or replace function public.fn_rollup_schedule(p_schedule uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update schedule s set booked_participants = coalesce((
    select sum(l.seats) from order_line l
    where l.schedule_id = p_schedule and l.line_status in ('New','Confirmed','Completed')
  ), 0) where s.schedule_id = p_schedule;
  update schedule s set
    go_status = (case when s.booked_participants >= s.min_participants and s.min_participants > 0
                      then 'Go' else 'No-Go' end)::go_status_t
  where s.schedule_id = p_schedule;
end $$;
