-- DRAFT — DECISION PENDING (fn_enforce_pax). Do NOT apply until Alan picks a
-- path. This is Option A of two mutually-exclusive drafts; apply exactly one.
--
-- OPTION A — Course-derived caps (keep the trigger authoritative).
--   max_participants and min_participants are ALWAYS derived from the course on
--   every schedule write: max = course.max_pax, else 10 for certification courses
--   or 20 otherwise; min = 8. Per-session caps are intentionally NOT allowed —
--   the course is the single source of truth.
--
--   This migration re-affirms the current live behaviour (it is effectively a
--   no-op restatement) so that choosing Option A is an explicit, recorded change.
--
--   If Option A is chosen, ALSO make the max/min fields read-only in
--   src/screens/SessionForm.tsx and label them "from course" (a separate
--   frontend commit) so the UI reflects that they cannot be overridden.

create or replace function public.fn_enforce_pax()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_cert boolean; v_max int;
begin
  select c.is_certification, c.max_pax into v_cert, v_max from course c where c.course_id = new.course_id;
  -- Course is authoritative: overwrite on every write.
  new.min_participants := 8;
  new.max_participants := coalesce(v_max, case when coalesce(v_cert, false) then 10 else 20 end);
  return new;
end $$;

drop trigger if exists trg_enforce_pax on public.schedule;
create trigger trg_enforce_pax before insert or update on public.schedule
  for each row execute function public.fn_enforce_pax();
