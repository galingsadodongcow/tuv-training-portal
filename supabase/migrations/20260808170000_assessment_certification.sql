-- Assessment and certification. A certificate can now depend on a passed
-- assessment, carries a validity period and an expiry date, and can be
-- verified by its number. Courses say whether they assess and for how long the
-- certificate is valid.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

alter table public.course add column if not exists has_assessment boolean not null default false;
alter table public.course add column if not exists pass_mark numeric;
alter table public.course add column if not exists cert_validity_months integer;

alter table public.participant add column if not exists score numeric;
alter table public.participant add column if not exists result text not null default 'Pending';   -- Pending, Pass, Fail
alter table public.participant add column if not exists assessed_date date;
alter table public.participant add column if not exists cert_expiry_date date;

-- Issue one certificate. Requires the participant attended, and if the course
-- assesses, that they passed. Stamps an expiry from the course validity.
create or replace function public.fn_issue_certificate(p_participant uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_status text; v_existing text; v_result text; v_sched uuid; v_course uuid;
        v_assess boolean; v_months int; v_num text;
begin
  if coalesce(fn_current_role() in ('operations', 'super_admin'), false) is not true then
    raise exception 'Only operations can issue certificates.';
  end if;
  select attendance_status, cert_number, result, schedule_id
    into v_status, v_existing, v_result, v_sched
    from participant where participant_id = p_participant;
  if not found then raise exception 'Participant not found.'; end if;
  if v_existing is not null then return v_existing; end if;
  if v_status is distinct from 'Attended' then
    raise exception 'A certificate goes only to someone marked Attended.';
  end if;
  select s.course_id into v_course from schedule s where s.schedule_id = v_sched;
  select c.has_assessment, c.cert_validity_months into v_assess, v_months from course c where c.course_id = v_course;
  if coalesce(v_assess, false) and coalesce(v_result, 'Pending') <> 'Pass' then
    raise exception 'This course is assessed. Mark the result as Pass before issuing.';
  end if;
  v_num := 'TRA-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('certificate_seq')::text, 6, '0');
  update participant set cert_number = v_num, cert_issued_date = current_date,
    cert_expiry_date = case when v_months is not null then (current_date + (v_months || ' months')::interval)::date else null end
  where participant_id = p_participant;
  return v_num;
end $$;

-- Bulk issue to every eligible attendee on a session.
create or replace function public.fn_issue_certificates_for_session(p_schedule uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count integer := 0; v_assess boolean; v_months int; r record;
begin
  if coalesce(fn_current_role() in ('operations', 'super_admin'), false) is not true then
    raise exception 'Only operations can issue certificates.';
  end if;
  select c.has_assessment, c.cert_validity_months into v_assess, v_months
    from schedule s join course c on c.course_id = s.course_id where s.schedule_id = p_schedule;
  for r in
    select participant_id, result from participant
    where schedule_id = p_schedule and attendance_status = 'Attended' and cert_number is null
  loop
    if coalesce(v_assess, false) and coalesce(r.result, 'Pending') <> 'Pass' then continue; end if;
    update participant
      set cert_number = 'TRA-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('certificate_seq')::text, 6, '0'),
          cert_issued_date = current_date,
          cert_expiry_date = case when v_months is not null then (current_date + (v_months || ' months')::interval)::date else null end
      where participant_id = r.participant_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Extend the roster read with the assessment and expiry fields.
drop function if exists public.fn_session_roster(uuid);
create function public.fn_session_roster(p_schedule uuid)
 returns table(participant_id uuid, full_name text, email text, position_title text,
               company text, order_id text, channel channel_t, seats integer,
               payment_status payment_status_t, attendance_status text,
               cert_number text, cert_issued_date date, cert_expiry_date date,
               score numeric, result text)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select p.participant_id, p.full_name, p.email, p.position_title,
         cl.company, o.order_id, o.channel, l.seats, o.payment_status,
         p.attendance_status, p.cert_number, p.cert_issued_date, p.cert_expiry_date,
         p.score, p.result
    from participant p
    join order_line l on l.line_id = p.line_id
    join orders o on o.order_id = l.order_id
    left join client cl on cl.client_id = o.client_id
   where p.schedule_id = p_schedule and l.line_status <> 'Cancelled'
   order by cl.company nulls last, p.full_name;
$$;

-- Certificates expiring within four months (or already expired).
create or replace view public.v_cert_expiring as
  select p.participant_id, p.full_name, p.email, p.cert_number, p.cert_issued_date, p.cert_expiry_date,
         co.course_name, (p.cert_expiry_date - current_date) as days_left
    from participant p
    join schedule s on s.schedule_id = p.schedule_id
    join course co on co.course_id = s.course_id
   where p.cert_number is not null and p.cert_expiry_date is not null
     and p.cert_expiry_date <= current_date + 120
   order by p.cert_expiry_date;

-- Verify a certificate by its number.
create or replace function public.fn_verify_certificate(p_cert text)
returns table(full_name text, course_name text, cert_issued_date date, cert_expiry_date date, valid boolean)
language sql
stable security definer
set search_path to 'public'
as $$
  select p.full_name, co.course_name, p.cert_issued_date, p.cert_expiry_date,
         (p.cert_expiry_date is null or p.cert_expiry_date >= current_date)
    from participant p
    join schedule s on s.schedule_id = p.schedule_id
    join course co on co.course_id = s.course_id
   where p.cert_number = btrim(p_cert);
$$;
grant execute on function public.fn_verify_certificate(text) to authenticated;
