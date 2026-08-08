-- Attendance and certificates. Attendance already lives on participant
-- (attendance_status). This adds certificate issuance: a serial certificate
-- number and an issue date, stamped only for people who actually attended.
--
-- Certificates are issued by operations (and super_admin). The number is
-- generated server-side from a sequence so it is unique and consistently
-- formatted: TRA-<year>-<six digits>, e.g. TRA-2026-000042.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- A gapless-enough global counter. Certificate numbers must be unique; a
-- sequence guarantees that without row locking.
create sequence if not exists public.certificate_seq;

-- Issue one certificate. Returns the number (existing one if already issued,
-- so the call is safe to repeat). Refuses anyone who did not attend.
create or replace function public.fn_issue_certificate(p_participant uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
  v_existing text;
  v_num text;
begin
  if coalesce(fn_current_role() in ('operations', 'super_admin'), false) is not true then
    raise exception 'Only operations can issue certificates.';
  end if;
  select attendance_status, cert_number into v_status, v_existing
    from participant where participant_id = p_participant;
  if not found then raise exception 'Participant not found.'; end if;
  if v_existing is not null then return v_existing; end if;
  if v_status is distinct from 'Attended' then
    raise exception 'A certificate goes only to someone marked Attended.';
  end if;
  v_num := 'TRA-' || to_char(current_date, 'YYYY') || '-' ||
           lpad(nextval('certificate_seq')::text, 6, '0');
  update participant set cert_number = v_num, cert_issued_date = current_date
    where participant_id = p_participant;
  return v_num;
end $$;

-- Issue certificates to every attendee on a session who does not have one yet.
-- Returns how many were issued. This is the one-click path after a session runs.
create or replace function public.fn_issue_certificates_for_session(p_schedule uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer := 0;
  r record;
begin
  if coalesce(fn_current_role() in ('operations', 'super_admin'), false) is not true then
    raise exception 'Only operations can issue certificates.';
  end if;
  for r in
    select participant_id from participant
    where schedule_id = p_schedule
      and attendance_status = 'Attended'
      and cert_number is null
  loop
    update participant
      set cert_number = 'TRA-' || to_char(current_date, 'YYYY') || '-' ||
                        lpad(nextval('certificate_seq')::text, 6, '0'),
          cert_issued_date = current_date
      where participant_id = r.participant_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Extend the roster read to carry the issue date too. Changing the return
-- shape needs a drop first, so recreate it whole.
drop function if exists public.fn_session_roster(uuid);
create function public.fn_session_roster(p_schedule uuid)
 returns table(participant_id uuid, full_name text, email text, position_title text,
               company text, order_id text, channel channel_t, seats integer,
               payment_status payment_status_t, attendance_status text,
               cert_number text, cert_issued_date date)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select p.participant_id, p.full_name, p.email, p.position_title,
         cl.company, o.order_id, o.channel, l.seats, o.payment_status,
         p.attendance_status, p.cert_number, p.cert_issued_date
    from participant p
    join order_line l on l.line_id = p.line_id
    join orders o on o.order_id = l.order_id
    left join client cl on cl.client_id = o.client_id
   where p.schedule_id = p_schedule and l.line_status <> 'Cancelled'
   order by cl.company nulls last, p.full_name;
$$;
