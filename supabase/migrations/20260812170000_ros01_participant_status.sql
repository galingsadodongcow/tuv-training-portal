-- ===========================================================================
-- ROS01 — participant lifecycle status for soft-delete + transfer.
--
-- Adds participant.status ('Active' | 'Removed' | 'Transferred') so a participant
-- is never physically deleted (which destroyed attendance/assessment/certificate
-- history). Removal is a soft flag; transfer moves the person to another
-- session's roster. The session roster and health signals ignore 'Removed'.
--
-- Idempotent. Booked-seat counts derive from order_line.seats, not participant
-- rows, so status does not affect fill counts or go/no-go.
-- ===========================================================================

alter table public.participant add column if not exists status text not null default 'Active';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'participant_status_chk') then
    alter table public.participant
      add constraint participant_status_chk check (status in ('Active','Removed','Transferred'));
  end if;
end $$;

-- Soft-delete: keep the row + its history, flag it Removed. Ops/coordinator/admin.
create or replace function public.fn_remove_participant(p_participant uuid, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if r is null or r not in ('operations','coordinator','super_admin') then
    raise exception 'Only operations, coordinator or super_admin may remove a participant' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', coalesce('removed: ' || p_reason, 'removed'), true);
  update participant set status = 'Removed' where participant_id = p_participant;
  if not found then raise exception 'Participant % not found', p_participant using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.fn_remove_participant(uuid, text) from public, anon;
grant execute on function public.fn_remove_participant(uuid, text) to authenticated;

-- Transfer: move the participant onto another session's roster (must be visible
-- and not soft-deleted). Ops/coordinator/admin.
create or replace function public.fn_transfer_participant(p_participant uuid, p_new_schedule uuid, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if r is null or r not in ('operations','coordinator','super_admin') then
    raise exception 'Only operations, coordinator or super_admin may transfer a participant' using errcode = '42501';
  end if;
  if not exists (select 1 from schedule where schedule_id = p_new_schedule and deleted_at is null) then
    raise exception 'Target session not found' using errcode = 'P0002';
  end if;
  perform set_config('app.audit_reason', coalesce('transferred: ' || p_reason, 'transferred'), true);
  update participant set schedule_id = p_new_schedule, status = 'Active' where participant_id = p_participant;
  if not found then raise exception 'Participant % not found', p_participant using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.fn_transfer_participant(uuid, uuid, text) from public, anon;
grant execute on function public.fn_transfer_participant(uuid, uuid, text) to authenticated;

-- Roster hides soft-removed participants (return type unchanged).
create or replace function public.fn_session_roster(p_schedule uuid)
returns table(participant_id uuid, full_name text, email text, position_title text, company text,
              order_id text, channel channel_t, seats integer, payment_status payment_status_t,
              attendance_status text, cert_number text, cert_issued_date date, cert_expiry_date date,
              score numeric, result text)
language sql stable security definer set search_path to 'public' as $$
  select p.participant_id, p.full_name, p.email, p.position_title,
         cl.company, o.order_id, o.channel, l.seats, o.payment_status,
         p.attendance_status, p.cert_number, p.cert_issued_date, p.cert_expiry_date,
         p.score, p.result
    from participant p
    join order_line l on l.line_id = p.line_id
    join orders o on o.order_id = l.order_id
    left join client cl on cl.client_id = o.client_id
   where p.schedule_id = p_schedule and l.line_status <> 'Cancelled'
     and coalesce(p.status, 'Active') <> 'Removed'
   order by cl.company nulls last, p.full_name;
$$;
