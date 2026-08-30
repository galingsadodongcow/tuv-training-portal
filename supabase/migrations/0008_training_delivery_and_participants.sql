-- Training delivery and participant operations.
-- Sessions originate from accepted order lines; participant workflow remains
-- transactional, capacity-aware, auditable, and protected by RLS.

create table academy_v2.sessions (
  id uuid primary key default gen_random_uuid(),
  session_number bigint generated always as identity unique,
  order_id uuid not null references academy_v2.orders(id) on delete restrict,
  order_line_id uuid not null unique references academy_v2.order_lines(id) on delete restrict,
  course_id uuid not null references academy_v2.courses(id) on delete restrict,
  learning_type text not null check (learning_type in ('classroom', 'virtual', 'onsite')),
  trainer_id uuid not null references academy_v2.trainers(id) on delete restrict,
  venue_id uuid not null references academy_v2.venues(id) on delete restrict,
  operations_owner_id uuid not null references academy_v2.profiles(id) on delete restrict,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'in_progress', 'completed', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Manila'
    check (char_length(btrim(timezone)) between 3 and 80),
  capacity integer not null check (capacity > 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  created_by uuid not null references academy_v2.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table academy_v2.participants (
  id uuid primary key default gen_random_uuid(),
  participant_number bigint generated always as identity unique,
  session_id uuid not null references academy_v2.sessions(id) on delete restrict,
  customer_id uuid not null references academy_v2.customers(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  email text check (email is null or (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')),
  phone text check (phone is null or char_length(phone) between 5 and 40),
  employee_reference text check (employee_reference is null or char_length(employee_reference) <= 80),
  status text not null default 'registered'
    check (status in ('registered', 'waitlisted', 'confirmed', 'transferred', 'cancelled', 'completed', 'no_show')),
  attendance_status text not null default 'pending'
    check (attendance_status in ('pending', 'present', 'partial', 'absent')),
  attended_minutes integer check (attended_minutes is null or attended_minutes >= 0),
  assessment_status text not null default 'pending'
    check (assessment_status in ('not_required', 'pending', 'passed', 'failed')),
  assessment_score numeric(5,2) check (assessment_score is null or assessment_score between 0 and 100),
  certificate_status text not null default 'not_eligible'
    check (certificate_status in ('not_eligible', 'eligible', 'issued', 'revoked')),
  certificate_number text unique,
  certificate_issued_at timestamptz,
  certificate_issued_by uuid references academy_v2.profiles(id) on delete restrict,
  certificate_revoked_at timestamptz,
  certificate_revoked_by uuid references academy_v2.profiles(id) on delete restrict,
  certificate_note text check (certificate_note is null or char_length(certificate_note) <= 1000),
  transferred_from_id uuid references academy_v2.participants(id) on delete restrict,
  created_by uuid not null references academy_v2.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, employee_reference),
  check (attendance_status <> 'pending' or attended_minutes is null),
  check (certificate_status not in ('issued', 'revoked') or certificate_number is not null)
);

create sequence academy_v2.certificate_number_seq start 1;

create index sessions_order_id_idx on academy_v2.sessions(order_id);
create index sessions_course_time_idx on academy_v2.sessions(course_id, starts_at);
create index sessions_trainer_time_idx on academy_v2.sessions(trainer_id, starts_at, ends_at)
  where status in ('scheduled', 'open', 'in_progress');
create index sessions_venue_time_idx on academy_v2.sessions(venue_id, starts_at, ends_at)
  where status in ('scheduled', 'open', 'in_progress');
create index sessions_status_time_idx on academy_v2.sessions(status, starts_at);
create index sessions_operations_owner_id_idx on academy_v2.sessions(operations_owner_id);
create index participants_session_status_idx on academy_v2.participants(session_id, status, created_at);
create index participants_customer_id_idx on academy_v2.participants(customer_id);
create index participants_transferred_from_id_idx on academy_v2.participants(transferred_from_id);
create index participants_certificate_issued_by_idx on academy_v2.participants(certificate_issued_by);
create index participants_certificate_revoked_by_idx on academy_v2.participants(certificate_revoked_by);
create index participants_created_by_idx on academy_v2.participants(created_by);
create unique index participants_session_email_key
  on academy_v2.participants(session_id, lower(email)) where email is not null;

create trigger sessions_set_updated_at before update on academy_v2.sessions
for each row execute function academy_v2_private.set_updated_at();
create trigger participants_set_updated_at before update on academy_v2.participants
for each row execute function academy_v2_private.set_updated_at();

create function academy_v2_private.can_view_delivery_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from academy_v2.orders o
    where o.id = p_order_id
      and (
        academy_v2_private.has_role(array['administrator', 'operations', 'manager', 'auditor']::text[])
        or academy_v2_private.can_manage_sales(o.sales_owner_id)
      )
  );
$$;

revoke all on function academy_v2_private.can_view_delivery_order(uuid) from public, anon;
grant execute on function academy_v2_private.can_view_delivery_order(uuid) to authenticated;

create function academy_v2_private.validate_session_plan(
  p_session_id uuid,
  p_order_id uuid,
  p_order_line_id uuid,
  p_course_id uuid,
  p_learning_type text,
  p_trainer_id uuid,
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_row academy_v2.order_lines%rowtype;
  order_row academy_v2.orders%rowtype;
  venue_row academy_v2.venues%rowtype;
begin
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Session end must be after its start' using errcode = '23514';
  end if;
  if p_starts_at < now() - interval '1 hour' then
    raise exception 'A session cannot be scheduled in the past' using errcode = '23514';
  end if;
  if p_capacity is null or p_capacity <= 0 then
    raise exception 'Session capacity must be greater than zero' using errcode = '23514';
  end if;

  select * into order_row from academy_v2.orders where id = p_order_id;
  select * into line_row from academy_v2.order_lines where id = p_order_line_id;
  if order_row.id is null or line_row.id is null or line_row.order_id <> order_row.id then
    raise exception 'The selected order line does not belong to this order' using errcode = '23503';
  end if;
  if order_row.status not in ('with_operations', 'fulfillment') then
    raise exception 'Operations must accept the order before scheduling' using errcode = '23514';
  end if;
  if line_row.course_id <> p_course_id or line_row.learning_type <> p_learning_type then
    raise exception 'Course and delivery type must match the accepted order line' using errcode = '23514';
  end if;
  if p_capacity > line_row.participant_count then
    raise exception 'Session capacity cannot exceed the ordered headcount' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from academy_v2.trainers t
    join academy_v2.trainer_courses tc on tc.trainer_id = t.id
    where t.id = p_trainer_id and t.is_active and tc.course_id = p_course_id and tc.is_active
      and (tc.qualified_until is null or tc.qualified_until >= (p_starts_at at time zone 'Asia/Manila')::date)
  ) then
    raise exception 'Choose an active trainer who is qualified for this course on the session date' using errcode = '23514';
  end if;

  select * into venue_row from academy_v2.venues where id = p_venue_id and is_active;
  if venue_row.id is null then raise exception 'Choose an active venue' using errcode = '23503'; end if;
  if (p_learning_type = 'virtual' and venue_row.venue_type <> 'virtual')
    or (p_learning_type <> 'virtual' and venue_row.venue_type <> 'physical') then
    raise exception 'Venue type does not match the delivery type' using errcode = '23514';
  end if;
  if venue_row.capacity is not null and p_capacity > venue_row.capacity then
    raise exception 'Session capacity exceeds the selected venue capacity' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('academy_v2.session_schedule', 0));
  if exists (
    select 1 from academy_v2.sessions s
    where s.trainer_id = p_trainer_id and s.id is distinct from p_session_id
      and s.status in ('scheduled', 'open', 'in_progress')
      and s.starts_at < p_ends_at and s.ends_at > p_starts_at
  ) then
    raise exception 'Trainer has another session during this time' using errcode = '23P01';
  end if;
  if exists (
    select 1 from academy_v2.sessions s
    where s.venue_id = p_venue_id and s.id is distinct from p_session_id
      and s.status in ('scheduled', 'open', 'in_progress')
      and s.starts_at < p_ends_at and s.ends_at > p_starts_at
  ) then
    raise exception 'Venue has another session during this time' using errcode = '23P01';
  end if;
end;
$$;

revoke all on function academy_v2_private.validate_session_plan(uuid, uuid, uuid, uuid, text, uuid, uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;

create function academy_v2_private.create_session(
  p_order_line_id uuid,
  p_trainer_id uuid,
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  line_row academy_v2.order_lines%rowtype;
  order_row academy_v2.orders%rowtype;
  session_id uuid;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into line_row from academy_v2.order_lines where id = p_order_line_id;
  if line_row.id is null then raise exception 'Order line not found' using errcode = 'P0002'; end if;
  select * into order_row from academy_v2.orders where id = line_row.order_id for update;
  if exists (select 1 from academy_v2.sessions where order_line_id = p_order_line_id) then
    raise exception 'This order line already has a session' using errcode = '23505';
  end if;
  perform academy_v2_private.validate_session_plan(
    null, order_row.id, line_row.id, line_row.course_id, line_row.learning_type,
    p_trainer_id, p_venue_id, p_starts_at, p_ends_at, p_capacity
  );

  insert into academy_v2.sessions(
    order_id, order_line_id, course_id, learning_type, trainer_id, venue_id,
    operations_owner_id, starts_at, ends_at, capacity, notes, created_by
  ) values (
    order_row.id, line_row.id, line_row.course_id, line_row.learning_type, p_trainer_id, p_venue_id,
    coalesce(order_row.operations_owner_id, actor), p_starts_at, p_ends_at, p_capacity,
    nullif(btrim(coalesce(p_notes, '')), ''), actor
  ) returning id into session_id;

  if order_row.status = 'with_operations' then
    update academy_v2.orders set status = 'fulfillment' where id = order_row.id;
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'order.fulfillment_started', 'order', order_row.id::text,
      jsonb_build_object('source', 'session_schedule'));
  end if;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'session.scheduled', 'session', session_id::text,
    jsonb_build_object('order_id', order_row.id, 'order_line_id', line_row.id, 'capacity', p_capacity));
  return session_id;
end;
$$;

create function academy_v2_private.reschedule_session(
  p_session_id uuid,
  p_trainer_id uuid,
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_row academy_v2.sessions%rowtype;
  occupied integer;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  if session_row.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if session_row.status not in ('scheduled', 'open') then
    raise exception 'Only a scheduled or open session can be changed' using errcode = '23514';
  end if;
  select count(*) into occupied from academy_v2.participants
  where session_id = p_session_id and status in ('registered', 'confirmed');
  if p_capacity < occupied then raise exception 'Capacity cannot be lower than confirmed and registered participants' using errcode = '23514'; end if;
  perform academy_v2_private.validate_session_plan(
    session_row.id, session_row.order_id, session_row.order_line_id, session_row.course_id,
    session_row.learning_type, p_trainer_id, p_venue_id, p_starts_at, p_ends_at, p_capacity
  );
  update academy_v2.sessions set trainer_id = p_trainer_id, venue_id = p_venue_id,
    starts_at = p_starts_at, ends_at = p_ends_at, capacity = p_capacity,
    notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_session_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'session.rescheduled', 'session', p_session_id::text,
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at, 'capacity', p_capacity));
end;
$$;

create function academy_v2_private.transition_session(p_session_id uuid, p_action text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_row academy_v2.sessions%rowtype;
  next_status text;
  active_count integer;
  incomplete_count integer;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  if session_row.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;

  if p_action = 'open' and session_row.status = 'scheduled' then next_status := 'open';
  elsif p_action = 'start' and session_row.status in ('scheduled', 'open') then next_status := 'in_progress';
  elsif p_action = 'complete' and session_row.status = 'in_progress' then
    select count(*), count(*) filter (where attendance_status = 'pending' or assessment_status = 'pending')
      into active_count, incomplete_count
    from academy_v2.participants
    where session_id = p_session_id and status not in ('waitlisted', 'cancelled', 'transferred');
    if active_count = 0 then raise exception 'Register at least one participant before completing the session' using errcode = '23514'; end if;
    if incomplete_count > 0 then raise exception 'Record attendance and assessment outcomes for every active participant' using errcode = '23514'; end if;
    next_status := 'completed';
  elsif p_action = 'cancel' and session_row.status in ('scheduled', 'open', 'in_progress') then
    if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'A cancellation reason is required' using errcode = '23514'; end if;
    next_status := 'cancelled';
  else
    raise exception 'The requested session transition is invalid' using errcode = '23514';
  end if;

  update academy_v2.sessions set status = next_status,
    cancellation_reason = case when next_status = 'cancelled' then btrim(p_reason) else cancellation_reason end
  where id = p_session_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
  values (actor, 'session.' || next_status, 'session', p_session_id::text,
    case when next_status = 'cancelled' then btrim(p_reason) else null end,
    jsonb_build_object('status_before', session_row.status));

  if next_status = 'completed' and not exists (
    select 1 from academy_v2.order_lines l
    where l.order_id = session_row.order_id
      and not exists (
        select 1 from academy_v2.sessions s
        where s.order_line_id = l.id and s.status = 'completed'
      )
  ) then
    update academy_v2.orders set status = 'completed' where id = session_row.order_id and status = 'fulfillment';
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'order.completed', 'order', session_row.order_id::text,
      jsonb_build_object('source', 'all_sessions_completed'));
  end if;
  return next_status;
end;
$$;

create function academy_v2_private.promote_waitlist(p_session_id uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_capacity integer;
  occupied integer;
  promoted_id uuid;
begin
  select capacity into session_capacity from academy_v2.sessions where id = p_session_id for update;
  select count(*) into occupied from academy_v2.participants
  where session_id = p_session_id and status in ('registered', 'confirmed');
  if occupied >= session_capacity then return null; end if;
  select id into promoted_id from academy_v2.participants
  where session_id = p_session_id and status = 'waitlisted'
  order by created_at, participant_number limit 1 for update skip locked;
  if promoted_id is not null then
    update academy_v2.participants set status = 'registered' where id = promoted_id;
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (p_actor, 'participant.waitlist_promoted', 'participant', promoted_id::text,
      jsonb_build_object('session_id', p_session_id));
  end if;
  return promoted_id;
end;
$$;

create function academy_v2_private.register_participant(
  p_session_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_employee_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_row academy_v2.sessions%rowtype;
  customer_id uuid;
  occupied integer;
  initial_status text;
  participant_id uuid;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  if session_row.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if session_row.status not in ('scheduled', 'open') then raise exception 'Registration is closed for this session' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_full_name, ''))) < 2 then raise exception 'Participant name is required' using errcode = '23514'; end if;
  select o.customer_id into customer_id from academy_v2.orders o where o.id = session_row.order_id;
  select count(*) into occupied from academy_v2.participants
  where session_id = p_session_id and status in ('registered', 'confirmed');
  initial_status := case when occupied >= session_row.capacity then 'waitlisted' else 'registered' end;
  insert into academy_v2.participants(
    session_id, customer_id, full_name, email, phone, employee_reference, status, created_by
  ) values (
    p_session_id, customer_id, btrim(p_full_name), nullif(lower(btrim(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_employee_reference, '')), ''),
    initial_status, actor
  ) returning id into participant_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'participant.' || initial_status, 'participant', participant_id::text,
    jsonb_build_object('session_id', p_session_id));
  return participant_id;
end;
$$;

create function academy_v2_private.transition_participant(p_participant_id uuid, p_action text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  participant_row academy_v2.participants%rowtype;
  next_status text;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into participant_row from academy_v2.participants where id = p_participant_id for update;
  if participant_row.id is null then raise exception 'Participant not found' using errcode = 'P0002'; end if;
  if p_action = 'confirm' and participant_row.status = 'registered' then next_status := 'confirmed';
  elsif p_action = 'cancel' and participant_row.status in ('registered', 'waitlisted', 'confirmed') then
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'A cancellation reason is required' using errcode = '23514'; end if;
    next_status := 'cancelled';
  else raise exception 'The requested participant transition is invalid' using errcode = '23514';
  end if;
  update academy_v2.participants set status = next_status where id = p_participant_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
  values (actor, 'participant.' || next_status, 'participant', p_participant_id::text,
    case when next_status = 'cancelled' then btrim(p_reason) else null end,
    jsonb_build_object('session_id', participant_row.session_id, 'status_before', participant_row.status));
  if next_status = 'cancelled' and participant_row.status in ('registered', 'confirmed') then
    perform academy_v2_private.promote_waitlist(participant_row.session_id, actor);
  end if;
  return next_status;
end;
$$;

create function academy_v2_private.transfer_participant(p_participant_id uuid, p_target_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  source_row academy_v2.participants%rowtype;
  source_session academy_v2.sessions%rowtype;
  target_session academy_v2.sessions%rowtype;
  occupied integer;
  target_status text;
  new_id uuid;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into source_row from academy_v2.participants where id = p_participant_id for update;
  if source_row.id is null or source_row.status not in ('registered', 'waitlisted', 'confirmed') then
    raise exception 'Only an active registration can be transferred' using errcode = '23514';
  end if;
  select * into source_session from academy_v2.sessions where id = source_row.session_id;
  select * into target_session from academy_v2.sessions where id = p_target_session_id for update;
  if target_session.id is null or target_session.id = source_session.id or target_session.status not in ('scheduled', 'open') then
    raise exception 'Choose another open or scheduled session' using errcode = '23514';
  end if;
  if target_session.course_id <> source_session.course_id then
    raise exception 'Transfers must remain within the same course' using errcode = '23514';
  end if;
  select count(*) into occupied from academy_v2.participants
  where session_id = target_session.id and status in ('registered', 'confirmed');
  target_status := case when occupied >= target_session.capacity then 'waitlisted' else 'registered' end;
  update academy_v2.participants set status = 'transferred' where id = source_row.id;
  insert into academy_v2.participants(
    session_id, customer_id, full_name, email, phone, employee_reference, status, transferred_from_id, created_by
  ) values (
    target_session.id, source_row.customer_id, source_row.full_name, source_row.email, source_row.phone,
    source_row.employee_reference, target_status, source_row.id, actor
  ) returning id into new_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'participant.transferred', 'participant', source_row.id::text,
    jsonb_build_object('from_session_id', source_row.session_id, 'to_session_id', target_session.id,
      'new_participant_id', new_id, 'target_status', target_status));
  if source_row.status in ('registered', 'confirmed') then
    perform academy_v2_private.promote_waitlist(source_row.session_id, actor);
  end if;
  return new_id;
end;
$$;

create function academy_v2_private.record_participant_outcome(
  p_participant_id uuid,
  p_attendance_status text,
  p_attended_minutes integer,
  p_assessment_status text,
  p_assessment_score numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  participant_row academy_v2.participants%rowtype;
  session_row academy_v2.sessions%rowtype;
  next_participant_status text;
  next_certificate_status text;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into participant_row from academy_v2.participants where id = p_participant_id for update;
  if participant_row.id is null or participant_row.status not in ('registered', 'confirmed', 'completed', 'no_show') then
    raise exception 'Participant outcome cannot be recorded in the current status' using errcode = '23514';
  end if;
  select * into session_row from academy_v2.sessions where id = participant_row.session_id;
  if session_row.status not in ('in_progress', 'completed') then
    raise exception 'Start the session before recording participant outcomes' using errcode = '23514';
  end if;
  if p_attendance_status not in ('present', 'partial', 'absent') then raise exception 'Choose a final attendance status' using errcode = '23514'; end if;
  if p_attended_minutes is null or p_attended_minutes < 0 or p_attended_minutes > extract(epoch from (session_row.ends_at - session_row.starts_at)) / 60 then
    raise exception 'Attended minutes must fit within the session duration' using errcode = '23514';
  end if;
  if p_attendance_status = 'absent' and p_attended_minutes <> 0 then raise exception 'Absent participants must have zero attended minutes' using errcode = '23514'; end if;
  if p_assessment_status not in ('not_required', 'passed', 'failed') then raise exception 'Choose a final assessment status' using errcode = '23514'; end if;
  if p_assessment_score is not null and (p_assessment_score < 0 or p_assessment_score > 100) then raise exception 'Assessment score must be between 0 and 100' using errcode = '23514'; end if;
  if p_attendance_status = 'absent' and p_assessment_status = 'passed' then raise exception 'An absent participant cannot pass the assessment' using errcode = '23514'; end if;

  next_participant_status := case when p_attendance_status = 'absent' then 'no_show' else 'completed' end;
  next_certificate_status := case
    when p_attendance_status in ('present', 'partial') and p_assessment_status in ('not_required', 'passed') then 'eligible'
    else 'not_eligible'
  end;
  update academy_v2.participants set status = next_participant_status,
    attendance_status = p_attendance_status, attended_minutes = p_attended_minutes,
    assessment_status = p_assessment_status, assessment_score = p_assessment_score,
    certificate_status = case when certificate_status in ('issued', 'revoked') then certificate_status else next_certificate_status end
  where id = p_participant_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'participant.outcome_recorded', 'participant', p_participant_id::text,
    jsonb_build_object('attendance_status', p_attendance_status, 'assessment_status', p_assessment_status,
      'certificate_status', next_certificate_status));
  return next_certificate_status;
end;
$$;

create function academy_v2_private.issue_certificate(p_participant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  participant_row academy_v2.participants%rowtype;
  session_status text;
  issued_number text;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into participant_row from academy_v2.participants where id = p_participant_id for update;
  select status into session_status from academy_v2.sessions where id = participant_row.session_id;
  if participant_row.id is null or participant_row.certificate_status <> 'eligible' or session_status <> 'completed' then
    raise exception 'Complete the session and eligible participant outcome before issuing a certificate' using errcode = '23514';
  end if;
  issued_number := 'CERT-' || to_char(nextval('academy_v2.certificate_number_seq'::regclass), 'FM000000');
  update academy_v2.participants set certificate_status = 'issued', certificate_number = issued_number,
    certificate_issued_at = now(), certificate_issued_by = actor,
    certificate_revoked_at = null, certificate_revoked_by = null, certificate_note = null
  where id = p_participant_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'participant.certificate_issued', 'participant', p_participant_id::text,
    jsonb_build_object('certificate_number', issued_number));
  return issued_number;
end;
$$;

create function academy_v2_private.revoke_certificate(p_participant_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  participant_row academy_v2.participants%rowtype;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator']::text[]) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into participant_row from academy_v2.participants where id = p_participant_id for update;
  if participant_row.id is null or participant_row.certificate_status <> 'issued' then raise exception 'Only an issued certificate can be revoked' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'A revocation reason is required' using errcode = '23514'; end if;
  update academy_v2.participants set certificate_status = 'revoked', certificate_revoked_at = now(),
    certificate_revoked_by = actor, certificate_note = btrim(p_reason)
  where id = p_participant_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
  values (actor, 'participant.certificate_revoked', 'participant', p_participant_id::text,
    btrim(p_reason), jsonb_build_object('certificate_number', participant_row.certificate_number));
end;
$$;

-- Exposed security-invoker wrappers keep privileged implementations private.
create function academy_v2.create_session(p_order_line_id uuid, p_trainer_id uuid, p_venue_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_capacity integer, p_notes text default null)
returns uuid language sql security invoker set search_path = ''
as $$ select academy_v2_private.create_session(p_order_line_id, p_trainer_id, p_venue_id, p_starts_at, p_ends_at, p_capacity, p_notes); $$;
create function academy_v2.reschedule_session(p_session_id uuid, p_trainer_id uuid, p_venue_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_capacity integer, p_notes text default null)
returns void language sql security invoker set search_path = ''
as $$ select academy_v2_private.reschedule_session(p_session_id, p_trainer_id, p_venue_id, p_starts_at, p_ends_at, p_capacity, p_notes); $$;
create function academy_v2.transition_session(p_session_id uuid, p_action text, p_reason text default null)
returns text language sql security invoker set search_path = ''
as $$ select academy_v2_private.transition_session(p_session_id, p_action, p_reason); $$;
create function academy_v2.register_participant(p_session_id uuid, p_full_name text, p_email text default null, p_phone text default null, p_employee_reference text default null)
returns uuid language sql security invoker set search_path = ''
as $$ select academy_v2_private.register_participant(p_session_id, p_full_name, p_email, p_phone, p_employee_reference); $$;
create function academy_v2.transition_participant(p_participant_id uuid, p_action text, p_reason text default null)
returns text language sql security invoker set search_path = ''
as $$ select academy_v2_private.transition_participant(p_participant_id, p_action, p_reason); $$;
create function academy_v2.transfer_participant(p_participant_id uuid, p_target_session_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select academy_v2_private.transfer_participant(p_participant_id, p_target_session_id); $$;
create function academy_v2.record_participant_outcome(p_participant_id uuid, p_attendance_status text, p_attended_minutes integer, p_assessment_status text, p_assessment_score numeric default null)
returns text language sql security invoker set search_path = ''
as $$ select academy_v2_private.record_participant_outcome(p_participant_id, p_attendance_status, p_attended_minutes, p_assessment_status, p_assessment_score); $$;
create function academy_v2.issue_certificate(p_participant_id uuid)
returns text language sql security invoker set search_path = ''
as $$ select academy_v2_private.issue_certificate(p_participant_id); $$;
create function academy_v2.revoke_certificate(p_participant_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select academy_v2_private.revoke_certificate(p_participant_id, p_reason); $$;

revoke all on function academy_v2_private.create_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) from public, anon;
revoke all on function academy_v2_private.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) from public, anon;
revoke all on function academy_v2_private.transition_session(uuid, text, text) from public, anon;
revoke all on function academy_v2_private.promote_waitlist(uuid, uuid) from public, anon, authenticated;
revoke all on function academy_v2_private.register_participant(uuid, text, text, text, text) from public, anon;
revoke all on function academy_v2_private.transition_participant(uuid, text, text) from public, anon;
revoke all on function academy_v2_private.transfer_participant(uuid, uuid) from public, anon;
revoke all on function academy_v2_private.record_participant_outcome(uuid, text, integer, text, numeric) from public, anon;
revoke all on function academy_v2_private.issue_certificate(uuid) from public, anon;
revoke all on function academy_v2_private.revoke_certificate(uuid, text) from public, anon;
grant execute on function academy_v2_private.create_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) to authenticated;
grant execute on function academy_v2_private.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) to authenticated;
grant execute on function academy_v2_private.transition_session(uuid, text, text) to authenticated;
grant execute on function academy_v2_private.register_participant(uuid, text, text, text, text) to authenticated;
grant execute on function academy_v2_private.transition_participant(uuid, text, text) to authenticated;
grant execute on function academy_v2_private.transfer_participant(uuid, uuid) to authenticated;
grant execute on function academy_v2_private.record_participant_outcome(uuid, text, integer, text, numeric) to authenticated;
grant execute on function academy_v2_private.issue_certificate(uuid) to authenticated;
grant execute on function academy_v2_private.revoke_certificate(uuid, text) to authenticated;

revoke all on function academy_v2.create_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) from public, anon;
revoke all on function academy_v2.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) from public, anon;
revoke all on function academy_v2.transition_session(uuid, text, text) from public, anon;
revoke all on function academy_v2.register_participant(uuid, text, text, text, text) from public, anon;
revoke all on function academy_v2.transition_participant(uuid, text, text) from public, anon;
revoke all on function academy_v2.transfer_participant(uuid, uuid) from public, anon;
revoke all on function academy_v2.record_participant_outcome(uuid, text, integer, text, numeric) from public, anon;
revoke all on function academy_v2.issue_certificate(uuid) from public, anon;
revoke all on function academy_v2.revoke_certificate(uuid, text) from public, anon;
grant execute on function academy_v2.create_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) to authenticated;
grant execute on function academy_v2.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) to authenticated;
grant execute on function academy_v2.transition_session(uuid, text, text) to authenticated;
grant execute on function academy_v2.register_participant(uuid, text, text, text, text) to authenticated;
grant execute on function academy_v2.transition_participant(uuid, text, text) to authenticated;
grant execute on function academy_v2.transfer_participant(uuid, uuid) to authenticated;
grant execute on function academy_v2.record_participant_outcome(uuid, text, integer, text, numeric) to authenticated;
grant execute on function academy_v2.issue_certificate(uuid) to authenticated;
grant execute on function academy_v2.revoke_certificate(uuid, text) to authenticated;

revoke all on table academy_v2.sessions, academy_v2.participants from anon, authenticated;
grant select on table academy_v2.sessions, academy_v2.participants to authenticated;

alter table academy_v2.sessions enable row level security;
alter table academy_v2.sessions force row level security;
alter table academy_v2.participants enable row level security;
alter table academy_v2.participants force row level security;

create policy sessions_scoped_read on academy_v2.sessions
for select to authenticated
using ((select academy_v2_private.can_view_delivery_order(order_id)));

create policy participants_scoped_read on academy_v2.participants
for select to authenticated
using (
  exists (
    select 1 from academy_v2.sessions s
    where s.id = participants.session_id
      and (select academy_v2_private.can_view_delivery_order(s.order_id))
  )
);

-- One active sample session makes each role-aware screen useful immediately.
with source as (
  select l.id as order_line_id, o.id as order_id, o.customer_id, o.operations_owner_id,
    l.course_id, l.learning_type
  from academy_v2.order_lines l
  join academy_v2.orders o on o.id = l.order_id
  join academy_v2.courses c on c.id = l.course_id
  where o.order_number = 3 and c.code = 'ISO-9001-IA'
), resource as (
  select s.*, t.id as trainer_id, v.id as venue_id
  from source s
  join academy_v2.trainers t on t.name = 'Alex Rivera — Sample Trainer'
  join academy_v2.venues v on v.name = 'Customer Site — Sample'
)
insert into academy_v2.sessions(
  order_id, order_line_id, course_id, learning_type, trainer_id, venue_id,
  operations_owner_id, status, starts_at, ends_at, capacity, notes, created_by
)
select order_id, order_line_id, course_id, learning_type, trainer_id, venue_id,
  operations_owner_id, 'open',
  (current_date + 8 + time '09:00') at time zone 'Asia/Manila',
  (current_date + 9 + time '17:00') at time zone 'Asia/Manila',
  5, 'Sample two-day onsite delivery. Capacity is intentionally limited to demonstrate the waitlist.',
  operations_owner_id
from resource
where operations_owner_id is not null
on conflict (order_line_id) do nothing;

with seeded_session as (
  select s.id, o.customer_id, s.created_by
  from academy_v2.sessions s join academy_v2.orders o on o.id = s.order_id
  join academy_v2.order_lines l on l.id = s.order_line_id
  where o.order_number = 3
), sample(full_name, email, employee_reference, status, ordinal) as (
  values
    ('Maria Santos — Sample', 'maria.santos@example.com', 'ACME-001', 'confirmed', 1),
    ('Jose Reyes — Sample', 'jose.reyes@example.com', 'ACME-002', 'confirmed', 2),
    ('Ana Cruz — Sample', 'ana.cruz@example.com', 'ACME-003', 'confirmed', 3),
    ('Paolo Lim — Sample', 'paolo.lim@example.com', 'ACME-004', 'confirmed', 4),
    ('Liza Tan — Sample', 'liza.tan@example.com', 'ACME-005', 'registered', 5),
    ('Marco Diaz — Sample', 'marco.diaz@example.com', 'ACME-006', 'waitlisted', 6)
)
insert into academy_v2.participants(session_id, customer_id, full_name, email, employee_reference, status, created_by, created_at)
select ss.id, ss.customer_id, sample.full_name, sample.email, sample.employee_reference, sample.status,
  ss.created_by, now() + (sample.ordinal || ' seconds')::interval
from seeded_session ss cross join sample
on conflict do nothing;

insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
select s.created_by, 'session.sample_seeded', 'session', s.id::text,
  jsonb_build_object('participants', 6, 'purpose', 'training delivery demonstration')
from academy_v2.sessions s join academy_v2.orders o on o.id = s.order_id
where o.order_number = 3
  and not exists (
    select 1 from academy_v2.audit_events a
    where a.action = 'session.sample_seeded' and a.entity_id = s.id::text
  );

comment on table academy_v2.sessions is 'Scheduled delivery created from an accepted commercial order line';
comment on table academy_v2.participants is 'Participant registration, attendance, assessment, transfer, waitlist, and certificate state';
