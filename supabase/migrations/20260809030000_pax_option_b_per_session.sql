-- fn_enforce_pax — PER-SESSION CAPS (chosen path; supersedes the course-derived
-- draft, which has been removed). The earlier Option A draft is gone; this file
-- is the single source of truth for the trigger.
--
--   The trigger stops overwriting max_participants on every write. It fills a
--   default ONLY when the value is not supplied, so operations can set a
--   per-session cap (e.g. a smaller room, a pilot cohort) and it sticks. The
--   physical ceiling is enforced by the venue capacity guard, not by this
--   trigger. min_participants keeps an 8 default when unset but no longer forces
--   8 onto an explicit value.
--
--   Trade-off: the "max is always the course max" invariant is gone; a session
--   can carry its own cap. The venue guard remains the hard ceiling. The
--   max/min fields in src/screens/SessionForm.tsx stay editable (they already
--   are), which matches this behaviour — no frontend change required.
--
--   Idempotent (create or replace + drop/create trigger); safe to re-apply.

create or replace function public.fn_enforce_pax()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_cert boolean; v_max int;
begin
  select c.is_certification, c.max_pax into v_cert, v_max from course c where c.course_id = new.course_id;
  -- Default only when the caller did not supply a value; never overwrite an
  -- explicit per-session cap.
  if new.max_participants is null or new.max_participants = 0 then
    new.max_participants := coalesce(v_max, case when coalesce(v_cert, false) then 10 else 20 end);
  end if;
  if new.min_participants is null or new.min_participants = 0 then
    new.min_participants := 8;
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_pax on public.schedule;
create trigger trg_enforce_pax before insert or update on public.schedule
  for each row execute function public.fn_enforce_pax();
