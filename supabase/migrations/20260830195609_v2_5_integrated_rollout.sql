-- Academy Portal v2.5 convergence rollout.
--
-- Keeps academy_v2 as the sole application authority while adding the strongest
-- v1 business outcomes: public sellable sessions, date-segment schedules,
-- room/trainer conflict protection, explicit delivery intent, transactional seat
-- reservations, configurable Go/No-Go, named handoff ownership, and traceability.

-- ---------------------------------------------------------------------------
-- Catalogue and resource model
-- ---------------------------------------------------------------------------

alter table academy_v2.courses
  add column default_min_participants integer;

update academy_v2.courses
set default_min_participants = least(default_capacity, 8)
where default_min_participants is null;

alter table academy_v2.courses
  alter column default_min_participants set default 8,
  alter column default_min_participants set not null,
  add constraint courses_minimum_capacity_check
    check (default_min_participants > 0 and default_min_participants <= default_capacity);

create table academy_v2.venue_rooms (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references academy_v2.venues(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  capacity integer not null check (capacity > 0),
  equipment text check (equipment is null or char_length(equipment) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, venue_id)
);

create unique index venue_rooms_venue_name_key
  on academy_v2.venue_rooms(venue_id, lower(btrim(name)));
create index venue_rooms_venue_active_idx
  on academy_v2.venue_rooms(venue_id, is_active);

create table academy_v2.trainer_unavailability (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references academy_v2.trainers(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  is_active boolean not null default true,
  created_by uuid not null references academy_v2.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index trainer_unavailability_lookup_idx
  on academy_v2.trainer_unavailability(trainer_id, starts_at, ends_at)
  where is_active;
create index trainer_unavailability_created_by_idx
  on academy_v2.trainer_unavailability(created_by);

create trigger venue_rooms_set_updated_at before update on academy_v2.venue_rooms
for each row execute function academy_v2_private.set_updated_at();
create trigger trainer_unavailability_set_updated_at before update on academy_v2.trainer_unavailability
for each row execute function academy_v2_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Integrated commercial and delivery model
-- ---------------------------------------------------------------------------

alter table academy_v2.sessions
  alter column order_id drop not null,
  alter column order_line_id drop not null,
  add column offering_type text not null default 'private'
    check (offering_type in ('public', 'private', 'internal')),
  add column publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'closed')),
  add column minimum_participants integer,
  add column go_status text not null default 'pending'
    check (go_status in ('pending', 'go', 'no_go')),
  add column go_decided_by uuid references academy_v2.profiles(id) on delete restrict,
  add column go_decided_at timestamptz,
  add column go_reason text check (go_reason is null or char_length(btrim(go_reason)) between 5 and 1000),
  add column room_id uuid references academy_v2.venue_rooms(id) on delete restrict;

update academy_v2.sessions s
set minimum_participants = least(s.capacity, c.default_min_participants)
from academy_v2.courses c
where c.id = s.course_id and s.minimum_participants is null;

alter table academy_v2.sessions
  alter column minimum_participants set not null,
  add constraint sessions_minimum_capacity_check
    check (minimum_participants > 0 and minimum_participants <= capacity),
  add constraint sessions_go_decision_check check (
    (go_status = 'pending' and go_decided_by is null and go_decided_at is null)
    or (go_status in ('go', 'no_go') and go_decided_by is not null and go_decided_at is not null)
  ),
  add constraint sessions_private_order_check check (
    offering_type <> 'private' or (order_id is not null and order_line_id is not null)
  );

create index sessions_offering_publication_time_idx
  on academy_v2.sessions(offering_type, publication_status, starts_at);
create index sessions_room_time_idx
  on academy_v2.sessions(room_id, starts_at, ends_at)
  where room_id is not null and status in ('scheduled', 'open', 'in_progress');
create index sessions_go_status_time_idx
  on academy_v2.sessions(go_status, starts_at);
create index sessions_go_decided_by_idx on academy_v2.sessions(go_decided_by);

alter table academy_v2.quotation_lines
  add column delivery_intent text not null default 'operations_to_assign'
    check (delivery_intent in ('existing_session', 'private_session', 'operations_to_assign')),
  add column session_id uuid references academy_v2.sessions(id) on delete restrict,
  add constraint quotation_lines_session_intent_check check (
    (delivery_intent = 'existing_session' and session_id is not null)
    or (delivery_intent <> 'existing_session' and session_id is null)
  );

alter table academy_v2.order_lines
  add column delivery_intent text not null default 'operations_to_assign'
    check (delivery_intent in ('existing_session', 'private_session', 'operations_to_assign')),
  add column session_id uuid references academy_v2.sessions(id) on delete restrict,
  add constraint order_lines_session_intent_check check (
    (delivery_intent = 'existing_session' and session_id is not null)
    or (delivery_intent = 'private_session')
    or (delivery_intent = 'operations_to_assign' and session_id is null)
  );

alter table academy_v2.orders
  add column operations_target_id uuid references academy_v2.profiles(id) on delete restrict;

alter table academy_v2.participants
  add column order_line_id uuid references academy_v2.order_lines(id) on delete restrict;

create index quotation_lines_session_id_idx on academy_v2.quotation_lines(session_id);
create index order_lines_session_id_idx on academy_v2.order_lines(session_id);
create index orders_operations_target_id_idx on academy_v2.orders(operations_target_id);
create index participants_order_line_id_idx on academy_v2.participants(order_line_id);

create table academy_v2.session_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references academy_v2.sessions(id) on delete restrict,
  block_number integer not null check (block_number > 0),
  trainer_id uuid not null references academy_v2.trainers(id) on delete restrict,
  venue_id uuid not null references academy_v2.venues(id) on delete restrict,
  room_id uuid references academy_v2.venue_rooms(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, block_number),
  check (ends_at > starts_at)
);

create index session_schedule_blocks_session_time_idx
  on academy_v2.session_schedule_blocks(session_id, starts_at);
create index session_schedule_blocks_trainer_time_idx
  on academy_v2.session_schedule_blocks(trainer_id, starts_at, ends_at);
create index session_schedule_blocks_venue_time_idx
  on academy_v2.session_schedule_blocks(venue_id, starts_at, ends_at);
create index session_schedule_blocks_room_time_idx
  on academy_v2.session_schedule_blocks(room_id, starts_at, ends_at)
  where room_id is not null;

create table academy_v2.session_reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references academy_v2.sessions(id) on delete restrict,
  order_line_id uuid not null references academy_v2.order_lines(id) on delete restrict,
  requested_seats integer not null check (requested_seats > 0),
  confirmed_seats integer not null default 0 check (confirmed_seats >= 0),
  waitlisted_seats integer not null default 0 check (waitlisted_seats >= 0),
  status text not null check (status in ('confirmed', 'partial', 'waitlisted', 'released')),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, order_line_id),
  check (
    (status = 'released' and confirmed_seats = 0 and waitlisted_seats = 0 and released_at is not null)
    or (status <> 'released' and confirmed_seats + waitlisted_seats = requested_seats and released_at is null)
  )
);

create index session_reservations_session_status_idx
  on academy_v2.session_reservations(session_id, status, created_at);
create index session_reservations_order_line_id_idx
  on academy_v2.session_reservations(order_line_id);

create trigger session_schedule_blocks_set_updated_at before update on academy_v2.session_schedule_blocks
for each row execute function academy_v2_private.set_updated_at();
create trigger session_reservations_set_updated_at before update on academy_v2.session_reservations
for each row execute function academy_v2_private.set_updated_at();

-- Existing order-created delivery is private. Preserve the commercial link and
-- convert continuous multi-day envelopes into day segments with the same local
-- start/end times, avoiding false overnight resource conflicts.
update academy_v2.order_lines l
set delivery_intent = 'private_session', session_id = s.id
from academy_v2.sessions s
where s.order_line_id = l.id;

update academy_v2.quotation_lines ql
set delivery_intent = 'private_session'
from academy_v2.orders o
join academy_v2.order_lines ol on ol.order_id = o.id
where o.quotation_id = ql.quotation_id
  and ol.course_id = ql.course_id
  and ol.learning_type = ql.learning_type
  and ol.delivery_intent = 'private_session';

insert into academy_v2.session_schedule_blocks(
  session_id, block_number, trainer_id, venue_id, room_id, starts_at, ends_at
)
select
  s.id,
  row_number() over (partition by s.id order by day_value)::integer,
  s.trainer_id,
  s.venue_id,
  s.room_id,
  ((day_value::date + (s.starts_at at time zone s.timezone)::time) at time zone s.timezone),
  ((day_value::date + (s.ends_at at time zone s.timezone)::time) at time zone s.timezone)
from academy_v2.sessions s
cross join lateral generate_series(
  (s.starts_at at time zone s.timezone)::date,
  (s.ends_at at time zone s.timezone)::date,
  interval '1 day'
) as days(day_value)
where not exists (
  select 1 from academy_v2.session_schedule_blocks b where b.session_id = s.id
);

insert into academy_v2.session_reservations(
  session_id, order_line_id, requested_seats, confirmed_seats, waitlisted_seats, status
)
select
  s.id,
  l.id,
  l.participant_count,
  least(l.participant_count, s.capacity),
  greatest(0, l.participant_count - s.capacity),
  case
    when l.participant_count <= s.capacity then 'confirmed'
    when s.capacity = 0 then 'waitlisted'
    else 'partial'
  end
from academy_v2.sessions s
join academy_v2.order_lines l on l.id = s.order_line_id
where not exists (
  select 1 from academy_v2.session_reservations r
  where r.session_id = s.id and r.order_line_id = l.id
);

update academy_v2.participants p
set order_line_id = s.order_line_id
from academy_v2.sessions s
where s.id = p.session_id and s.order_line_id is not null and p.order_line_id is null;

-- ---------------------------------------------------------------------------
-- Authorization and shared business helpers
-- ---------------------------------------------------------------------------

create or replace function academy_v2_private.can_view_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from academy_v2.sessions s
    where s.id = p_session_id
      and (
        (
          s.offering_type = 'public'
          and s.publication_status in ('published', 'closed')
          and academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[])
        )
        or (
          s.offering_type = 'internal'
          and academy_v2_private.has_role(array['administrator', 'operations', 'manager', 'auditor']::text[])
        )
        or exists (
          select 1
          from academy_v2.quotation_lines ql
          join academy_v2.quotations q on q.id = ql.quotation_id
          where ql.session_id = s.id
            and academy_v2_private.can_manage_sales(q.owner_id)
        )
        or exists (
          select 1
          from academy_v2.session_reservations r
          join academy_v2.order_lines l on l.id = r.order_line_id
          where r.session_id = s.id
            and academy_v2_private.can_view_delivery_order(l.order_id)
        )
        or (s.order_id is not null and academy_v2_private.can_view_delivery_order(s.order_id))
        or academy_v2_private.has_role(array['administrator', 'operations']::text[])
      )
  );
$$;

create or replace function academy_v2_private.session_confirmed_seats(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(r.confirmed_seats)::integer
      from academy_v2.session_reservations r
      where r.session_id = p_session_id and r.status <> 'released'
    ), 0)
    + coalesce((
      select count(*)::integer
      from academy_v2.participants p
      where p.session_id = p_session_id
        and p.order_line_id is null
        and p.status in ('registered', 'confirmed')
    ), 0);
$$;

create or replace function academy_v2_private.session_waitlisted_seats(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(r.waitlisted_seats)::integer
      from academy_v2.session_reservations r
      where r.session_id = p_session_id and r.status <> 'released'
    ), 0)
    + coalesce((
      select count(*)::integer
      from academy_v2.participants p
      where p.session_id = p_session_id
        and p.order_line_id is null
        and p.status = 'waitlisted'
    ), 0);
$$;

revoke all on function academy_v2_private.can_view_session(uuid) from public, anon;
revoke all on function academy_v2_private.session_confirmed_seats(uuid) from public, anon, authenticated;
revoke all on function academy_v2_private.session_waitlisted_seats(uuid) from public, anon, authenticated;
grant execute on function academy_v2_private.can_view_session(uuid) to authenticated;

create or replace function academy_v2_private.validate_commercial_session_selection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_session academy_v2.sessions%rowtype;
begin
  if new.delivery_intent = 'existing_session' then
    select * into selected_session from academy_v2.sessions where id = new.session_id;
    if selected_session.id is null
      or selected_session.offering_type <> 'public'
      or selected_session.publication_status <> 'published'
      or selected_session.status not in ('scheduled', 'open') then
      raise exception 'Choose a published public session that is open for sale' using errcode = '23514';
    end if;
    if selected_session.course_id <> new.course_id or selected_session.learning_type <> new.learning_type then
      raise exception 'Selected session must match the quoted course and delivery type' using errcode = '23514';
    end if;
  elsif new.delivery_intent = 'private_session' and new.session_id is not null then
    if tg_table_name = 'quotation_lines' then
      raise exception 'A quotation cannot select a private session before Operations schedules it' using errcode = '23514';
    end if;
    select * into selected_session from academy_v2.sessions where id = new.session_id;
    if selected_session.id is null or selected_session.offering_type <> 'private'
      or selected_session.course_id <> new.course_id
      or selected_session.learning_type <> new.learning_type then
      raise exception 'Private session must match the ordered course and delivery type' using errcode = '23514';
    end if;
  elsif new.session_id is not null then
    raise exception 'Only an existing-session line may select a session' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function academy_v2_private.validate_commercial_session_selection() from public, anon, authenticated;

create trigger quotation_lines_validate_session before insert or update of delivery_intent, session_id, course_id, learning_type
on academy_v2.quotation_lines for each row
execute function academy_v2_private.validate_commercial_session_selection();
create trigger order_lines_validate_session before insert or update of delivery_intent, session_id, course_id, learning_type
on academy_v2.order_lines for each row
execute function academy_v2_private.validate_commercial_session_selection();

create or replace function academy_v2_private.validate_schedule_block(
  p_session_id uuid,
  p_block_id uuid,
  p_course_id uuid,
  p_learning_type text,
  p_trainer_id uuid,
  p_venue_id uuid,
  p_room_id uuid,
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
  venue_row academy_v2.venues%rowtype;
  room_row academy_v2.venue_rooms%rowtype;
begin
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Schedule block end must be after its start' using errcode = '23514';
  end if;
  if p_starts_at < now() - interval '1 hour' then
    raise exception 'A schedule block cannot be created in the past' using errcode = '23514';
  end if;
  if p_capacity is null or p_capacity <= 0 then
    raise exception 'Session capacity must be greater than zero' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from academy_v2.trainers t
    join academy_v2.trainer_courses tc on tc.trainer_id = t.id
    where t.id = p_trainer_id
      and t.is_active
      and tc.course_id = p_course_id
      and tc.is_active
      and (tc.qualified_until is null or tc.qualified_until >= (p_starts_at at time zone 'Asia/Manila')::date)
  ) then
    raise exception 'Choose an active trainer who is qualified for this course on the schedule date' using errcode = '23514';
  end if;

  if exists (
    select 1 from academy_v2.trainer_unavailability u
    where u.trainer_id = p_trainer_id and u.is_active
      and u.starts_at < p_ends_at and u.ends_at > p_starts_at
  ) then
    raise exception 'Trainer is marked unavailable during this schedule block' using errcode = '23P01';
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

  if p_room_id is not null then
    select * into room_row from academy_v2.venue_rooms where id = p_room_id and is_active;
    if room_row.id is null or room_row.venue_id <> p_venue_id then
      raise exception 'Choose an active room in the selected venue' using errcode = '23514';
    end if;
    if p_capacity > room_row.capacity then
      raise exception 'Session capacity exceeds the selected room capacity' using errcode = '23514';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('academy_v2.schedule_blocks', 0));

  if exists (
    select 1
    from academy_v2.session_schedule_blocks b
    join academy_v2.sessions s on s.id = b.session_id
    where b.trainer_id = p_trainer_id
      and b.id is distinct from p_block_id
      and b.session_id is distinct from p_session_id
      and s.status in ('scheduled', 'open', 'in_progress')
      and b.starts_at < p_ends_at and b.ends_at > p_starts_at
  ) then
    raise exception 'Trainer has another schedule block during this time' using errcode = '23P01';
  end if;

  if exists (
    select 1
    from academy_v2.session_schedule_blocks b
    join academy_v2.sessions s on s.id = b.session_id
    where b.venue_id = p_venue_id
      and b.id is distinct from p_block_id
      and b.session_id is distinct from p_session_id
      and s.status in ('scheduled', 'open', 'in_progress')
      and b.starts_at < p_ends_at and b.ends_at > p_starts_at
      and (
        (p_room_id is not null and b.room_id = p_room_id)
        or p_room_id is null
        or b.room_id is null
      )
  ) then
    raise exception 'Venue or room has another schedule block during this time' using errcode = '23P01';
  end if;
end;
$$;

revoke all on function academy_v2_private.validate_schedule_block(uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, integer)
from public, anon, authenticated;

create or replace function academy_v2_private.refresh_session_envelope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_session uuid;
begin
  affected_session := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  update academy_v2.sessions s
  set starts_at = envelope.first_start,
      ends_at = envelope.last_end,
      trainer_id = envelope.first_trainer,
      venue_id = envelope.first_venue,
      room_id = envelope.first_room
  from (
    select
      min(b.starts_at) as first_start,
      max(b.ends_at) as last_end,
      (array_agg(b.trainer_id order by b.starts_at))[1] as first_trainer,
      (array_agg(b.venue_id order by b.starts_at))[1] as first_venue,
      (array_agg(b.room_id order by b.starts_at))[1] as first_room
    from academy_v2.session_schedule_blocks b
    where b.session_id = affected_session
  ) envelope
  where s.id = affected_session and envelope.first_start is not null;
  return coalesce(new, old);
end;
$$;

revoke all on function academy_v2_private.refresh_session_envelope() from public, anon, authenticated;

create trigger session_schedule_blocks_refresh_envelope
after insert or update or delete on academy_v2.session_schedule_blocks
for each row execute function academy_v2_private.refresh_session_envelope();

create or replace function academy_v2_private.allocate_session_reservation(
  p_session_id uuid,
  p_order_line_id uuid,
  p_requested_seats integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row academy_v2.sessions%rowtype;
  line_row academy_v2.order_lines%rowtype;
  existing_row academy_v2.session_reservations%rowtype;
  direct_occupied integer;
  other_reserved integer;
  total_requested integer;
  available integer;
  confirmed integer;
  waiting integer;
  reservation_id uuid;
begin
  if p_requested_seats is null or p_requested_seats <= 0 then
    raise exception 'Reserved seats must be greater than zero' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('academy_v2.session_capacity.' || p_session_id::text, 0));
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  select * into line_row from academy_v2.order_lines where id = p_order_line_id for update;
  if session_row.id is null or line_row.id is null then
    raise exception 'Session or order line was not found' using errcode = '23503';
  end if;
  if session_row.course_id <> line_row.course_id or session_row.learning_type <> line_row.learning_type then
    raise exception 'Reservation course and delivery type must match the session' using errcode = '23514';
  end if;
  if session_row.status not in ('scheduled', 'open') then
    raise exception 'This session is no longer accepting reservations' using errcode = '23514';
  end if;

  select * into existing_row
  from academy_v2.session_reservations
  where session_id = p_session_id and order_line_id = p_order_line_id
  for update;

  total_requested := p_requested_seats + case when existing_row.id is null or existing_row.status = 'released' then 0 else existing_row.requested_seats end;

  select count(*)::integer into direct_occupied
  from academy_v2.participants p
  where p.session_id = p_session_id
    and p.order_line_id is null
    and p.status in ('registered', 'confirmed');

  select coalesce(sum(r.confirmed_seats), 0)::integer into other_reserved
  from academy_v2.session_reservations r
  where r.session_id = p_session_id
    and r.order_line_id <> p_order_line_id
    and r.status <> 'released';

  available := greatest(0, session_row.capacity - direct_occupied - other_reserved);
  confirmed := least(total_requested, available);
  waiting := total_requested - confirmed;

  insert into academy_v2.session_reservations(
    session_id, order_line_id, requested_seats, confirmed_seats, waitlisted_seats, status, released_at
  ) values (
    p_session_id,
    p_order_line_id,
    total_requested,
    confirmed,
    waiting,
    case when confirmed = total_requested then 'confirmed' when confirmed = 0 then 'waitlisted' else 'partial' end,
    null
  )
  on conflict (session_id, order_line_id) do update
  set requested_seats = excluded.requested_seats,
      confirmed_seats = excluded.confirmed_seats,
      waitlisted_seats = excluded.waitlisted_seats,
      status = excluded.status,
      released_at = null
  returning id into reservation_id;

  return reservation_id;
end;
$$;

create or replace function academy_v2_private.rebalance_session_reservations(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_capacity integer;
  direct_occupied integer;
  current_reserved integer;
  available integer;
  reservation_row academy_v2.session_reservations%rowtype;
  promote_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('academy_v2.session_capacity.' || p_session_id::text, 0));
  select capacity into session_capacity from academy_v2.sessions where id = p_session_id for update;
  if session_capacity is null then return; end if;

  select count(*)::integer into direct_occupied
  from academy_v2.participants p
  where p.session_id = p_session_id
    and p.order_line_id is null
    and p.status in ('registered', 'confirmed');

  select coalesce(sum(confirmed_seats), 0)::integer into current_reserved
  from academy_v2.session_reservations
  where session_id = p_session_id and status <> 'released';
  available := greatest(0, session_capacity - direct_occupied - current_reserved);

  for reservation_row in
    select * from academy_v2.session_reservations
    where session_id = p_session_id and status <> 'released' and waitlisted_seats > 0
    order by created_at, id
    for update
  loop
    exit when available <= 0;
    promote_count := least(available, reservation_row.waitlisted_seats);
    update academy_v2.session_reservations
    set confirmed_seats = confirmed_seats + promote_count,
        waitlisted_seats = waitlisted_seats - promote_count,
        status = case
          when waitlisted_seats - promote_count = 0 then 'confirmed'
          when confirmed_seats + promote_count = 0 then 'waitlisted'
          else 'partial'
        end
    where id = reservation_row.id;
    available := available - promote_count;
  end loop;
end;
$$;

revoke all on function academy_v2_private.allocate_session_reservation(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function academy_v2_private.rebalance_session_reservations(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Session creation, schedule blocks, publication, and Go/No-Go
-- ---------------------------------------------------------------------------

create or replace function academy_v2_private.create_catalogue_session(
  p_offering_type text,
  p_course_id uuid,
  p_learning_type text,
  p_trainer_id uuid,
  p_venue_id uuid,
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_minimum_participants integer,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  course_row academy_v2.courses%rowtype;
  session_id uuid;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  if p_offering_type not in ('public', 'internal') then
    raise exception 'Catalogue sessions must be public or internal' using errcode = '23514';
  end if;
  select * into course_row from academy_v2.courses where id = p_course_id and is_active;
  if course_row.id is null then raise exception 'Choose an active course' using errcode = '23503'; end if;
  if p_minimum_participants is null or p_minimum_participants <= 0 or p_minimum_participants > p_capacity then
    raise exception 'Minimum participants must be between one and capacity' using errcode = '23514';
  end if;
  perform academy_v2_private.validate_schedule_block(
    null, null, p_course_id, p_learning_type, p_trainer_id, p_venue_id, p_room_id,
    p_starts_at, p_ends_at, p_capacity
  );

  insert into academy_v2.sessions(
    order_id, order_line_id, course_id, learning_type, trainer_id, venue_id, room_id,
    operations_owner_id, status, starts_at, ends_at, capacity, minimum_participants,
    offering_type, publication_status, go_status, notes, created_by
  ) values (
    null, null, p_course_id, p_learning_type, p_trainer_id, p_venue_id, p_room_id,
    actor, 'scheduled', p_starts_at, p_ends_at, p_capacity, p_minimum_participants,
    p_offering_type, 'draft', 'pending', nullif(btrim(coalesce(p_notes, '')), ''), actor
  ) returning id into session_id;

  insert into academy_v2.session_schedule_blocks(
    session_id, block_number, trainer_id, venue_id, room_id, starts_at, ends_at
  ) values (session_id, 1, p_trainer_id, p_venue_id, p_room_id, p_starts_at, p_ends_at);

  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'session.catalogue_created', 'session', session_id::text,
    jsonb_build_object('offering_type', p_offering_type, 'capacity', p_capacity, 'minimum_participants', p_minimum_participants));
  return session_id;
end;
$$;

create or replace function academy_v2_private.add_session_schedule_block(
  p_session_id uuid,
  p_trainer_id uuid,
  p_venue_id uuid,
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_row academy_v2.sessions%rowtype;
  next_number integer;
  block_id uuid;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  if session_row.id is null or session_row.status not in ('scheduled', 'open') then
    raise exception 'Only a scheduled or open session can receive schedule blocks' using errcode = '23514';
  end if;
  perform academy_v2_private.validate_schedule_block(
    null, null, session_row.course_id, session_row.learning_type,
    p_trainer_id, p_venue_id, p_room_id, p_starts_at, p_ends_at, session_row.capacity
  );
  select coalesce(max(block_number), 0) + 1 into next_number
  from academy_v2.session_schedule_blocks where session_id = p_session_id;
  insert into academy_v2.session_schedule_blocks(
    session_id, block_number, trainer_id, venue_id, room_id, starts_at, ends_at
  ) values (p_session_id, next_number, p_trainer_id, p_venue_id, p_room_id, p_starts_at, p_ends_at)
  returning id into block_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'session.schedule_block_added', 'session', p_session_id::text,
    jsonb_build_object('block_id', block_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  return block_id;
end;
$$;

create or replace function academy_v2_private.remove_session_schedule_block(
  p_session_id uuid,
  p_block_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_status text;
  block_count integer;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select status into session_status from academy_v2.sessions where id = p_session_id for update;
  if session_status not in ('scheduled', 'open') then
    raise exception 'Only a scheduled or open session can change schedule blocks' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A schedule change reason is required' using errcode = '23514';
  end if;
  select count(*)::integer into block_count from academy_v2.session_schedule_blocks where session_id = p_session_id;
  if block_count <= 1 then raise exception 'A session must retain at least one schedule block' using errcode = '23514'; end if;
  delete from academy_v2.session_schedule_blocks where id = p_block_id and session_id = p_session_id;
  if not found then raise exception 'Schedule block not found' using errcode = 'P0002'; end if;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
  values (actor, 'session.schedule_block_removed', 'session', p_session_id::text, btrim(p_reason),
    jsonb_build_object('block_id', p_block_id));
end;
$$;

create or replace function academy_v2_private.publish_session(p_session_id uuid, p_publish boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_row academy_v2.sessions%rowtype;
  next_status text;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  if session_row.id is null or session_row.offering_type <> 'public' or session_row.status not in ('scheduled', 'open') then
    raise exception 'Only an active public session can be published or withdrawn' using errcode = '23514';
  end if;
  if p_publish and not exists (select 1 from academy_v2.session_schedule_blocks where session_id = p_session_id) then
    raise exception 'Add at least one schedule block before publishing' using errcode = '23514';
  end if;
  next_status := case when p_publish then 'published' else 'draft' end;
  update academy_v2.sessions set publication_status = next_status where id = p_session_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'session.' || next_status, 'session', p_session_id::text, '{}'::jsonb);
  return next_status;
end;
$$;

create or replace function academy_v2_private.decide_session_go_no_go(
  p_session_id uuid,
  p_decision text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_row academy_v2.sessions%rowtype;
  confirmed_count integer;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  if p_decision not in ('go', 'no_go') then raise exception 'Choose Go or No-Go' using errcode = '23514'; end if;
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  if session_row.id is null or session_row.status not in ('scheduled', 'open') then
    raise exception 'Only a scheduled or open session can receive a Go/No-Go decision' using errcode = '23514';
  end if;
  if not exists (select 1 from academy_v2.session_schedule_blocks where session_id = p_session_id) then
    raise exception 'A complete schedule is required before Go/No-Go' using errcode = '23514';
  end if;
  confirmed_count := academy_v2_private.session_confirmed_seats(p_session_id);
  if p_decision = 'go' and confirmed_count < session_row.minimum_participants then
    raise exception 'Confirmed seats have not reached the configurable minimum participant threshold' using errcode = '23514';
  end if;
  if p_decision = 'no_go' and char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A No-Go reason is required' using errcode = '23514';
  end if;
  update academy_v2.sessions
  set go_status = p_decision,
      go_decided_by = actor,
      go_decided_at = now(),
      go_reason = case when p_decision = 'no_go' then btrim(p_reason) else null end
  where id = p_session_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
  values (actor, 'session.' || p_decision, 'session', p_session_id::text,
    case when p_decision = 'no_go' then btrim(p_reason) else null end,
    jsonb_build_object('confirmed_seats', confirmed_count, 'minimum_participants', session_row.minimum_participants));
  return p_decision;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reservation-aware named participant operations
-- ---------------------------------------------------------------------------

create or replace function academy_v2_private.promote_waitlist(p_session_id uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  promoted_id uuid;
  reserved_candidate_id uuid;
  reserved_order_line_id uuid;
  reserved_confirmed_seats integer;
  active_for_line integer;
  direct_occupied integer;
  session_capacity integer;
  reserved_seats integer;
begin
  select p.id, p.order_line_id, r.confirmed_seats
  into reserved_candidate_id, reserved_order_line_id, reserved_confirmed_seats
  from academy_v2.participants p
  join academy_v2.session_reservations r
    on r.session_id = p.session_id and r.order_line_id = p.order_line_id and r.status <> 'released'
  where p.session_id = p_session_id and p.status = 'waitlisted' and p.order_line_id is not null
  order by p.created_at, p.participant_number
  limit 1
  for update of p skip locked;

  if reserved_candidate_id is not null then
    select count(*)::integer into active_for_line
    from academy_v2.participants
    where session_id = p_session_id
      and order_line_id = reserved_order_line_id
      and status in ('registered', 'confirmed');
    if active_for_line < reserved_confirmed_seats then
      promoted_id := reserved_candidate_id;
    end if;
  end if;

  if promoted_id is null then
    select capacity into session_capacity from academy_v2.sessions where id = p_session_id for update;
    select coalesce(sum(confirmed_seats), 0)::integer into reserved_seats
    from academy_v2.session_reservations
    where session_id = p_session_id and status <> 'released';
    select count(*)::integer into direct_occupied
    from academy_v2.participants
    where session_id = p_session_id and order_line_id is null and status in ('registered', 'confirmed');
    if reserved_seats + direct_occupied < session_capacity then
      select id into promoted_id
      from academy_v2.participants
      where session_id = p_session_id and order_line_id is null and status = 'waitlisted'
      order by created_at, participant_number
      limit 1 for update skip locked;
    end if;
  end if;

  if promoted_id is not null then
    update academy_v2.participants set status = 'registered' where id = promoted_id;
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (p_actor, 'participant.waitlist_promoted', 'participant', promoted_id::text,
      jsonb_build_object('session_id', p_session_id));
  end if;
  return promoted_id;
end;
$$;

create or replace function academy_v2_private.register_participant_v2(
  p_session_id uuid,
  p_customer_id uuid,
  p_order_line_id uuid,
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
  reservation_row academy_v2.session_reservations%rowtype;
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

  if p_order_line_id is not null then
    select * into reservation_row
    from academy_v2.session_reservations
    where session_id = p_session_id and order_line_id = p_order_line_id and status <> 'released'
    for update;
    if reservation_row.id is null then
      raise exception 'Choose a valid commercial seat reservation for this session' using errcode = '23514';
    end if;
    select o.customer_id into customer_id
    from academy_v2.order_lines l join academy_v2.orders o on o.id = l.order_id
    where l.id = p_order_line_id;
    select count(*)::integer into occupied
    from academy_v2.participants
    where session_id = p_session_id and order_line_id = p_order_line_id
      and status in ('registered', 'confirmed');
    initial_status := case when occupied < reservation_row.confirmed_seats then 'registered' else 'waitlisted' end;
  else
    customer_id := p_customer_id;
    if customer_id is null or not exists (select 1 from academy_v2.customers where id = customer_id and status = 'active') then
      raise exception 'Choose an active customer for an unreserved public registration' using errcode = '23514';
    end if;
    occupied := academy_v2_private.session_confirmed_seats(p_session_id);
    initial_status := case when occupied < session_row.capacity then 'registered' else 'waitlisted' end;
  end if;

  insert into academy_v2.participants(
    session_id, customer_id, order_line_id, full_name, email, phone, employee_reference, status, created_by
  ) values (
    p_session_id, customer_id, p_order_line_id, btrim(p_full_name),
    nullif(lower(btrim(coalesce(p_email, ''))), ''), nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_employee_reference, '')), ''), initial_status, actor
  ) returning id into participant_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'participant.' || initial_status, 'participant', participant_id::text,
    jsonb_build_object('session_id', p_session_id, 'order_line_id', p_order_line_id));
  return participant_id;
end;
$$;

create or replace function academy_v2_private.register_participant(
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
  linked_order_line uuid;
  linked_customer uuid;
begin
  select s.order_line_id, o.customer_id into linked_order_line, linked_customer
  from academy_v2.sessions s
  left join academy_v2.orders o on o.id = s.order_id
  where s.id = p_session_id;
  return academy_v2_private.register_participant_v2(
    p_session_id, linked_customer, linked_order_line, p_full_name, p_email, p_phone, p_employee_reference
  );
end;
$$;

create or replace function academy_v2_private.transfer_participant(p_participant_id uuid, p_target_session_id uuid)
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
  source_reservation academy_v2.session_reservations%rowtype;
  target_reservation academy_v2.session_reservations%rowtype;
  occupied integer;
  target_status text;
  new_id uuid;
  new_requested integer;
  new_confirmed integer;
  new_waitlisted integer;
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

  if source_row.order_line_id is not null then
    select * into source_reservation
    from academy_v2.session_reservations
    where session_id = source_row.session_id and order_line_id = source_row.order_line_id and status <> 'released'
    for update;
    if source_reservation.id is null then raise exception 'Source reservation was not found' using errcode = '23514'; end if;

    new_requested := source_reservation.requested_seats - 1;
    new_confirmed := source_reservation.confirmed_seats - case when source_row.status in ('registered', 'confirmed') then 1 else 0 end;
    new_waitlisted := source_reservation.waitlisted_seats - case when source_row.status = 'waitlisted' then 1 else 0 end;
    if new_requested <= 0 then
      update academy_v2.session_reservations
      set requested_seats = 1, confirmed_seats = 0, waitlisted_seats = 0, status = 'released', released_at = now()
      where id = source_reservation.id;
    else
      update academy_v2.session_reservations
      set requested_seats = new_requested,
          confirmed_seats = new_confirmed,
          waitlisted_seats = new_waitlisted,
          status = case when new_waitlisted = 0 then 'confirmed' when new_confirmed = 0 then 'waitlisted' else 'partial' end
      where id = source_reservation.id;
    end if;

    perform academy_v2_private.allocate_session_reservation(p_target_session_id, source_row.order_line_id, 1);
    select * into target_reservation
    from academy_v2.session_reservations
    where session_id = p_target_session_id and order_line_id = source_row.order_line_id;
    select count(*)::integer into occupied
    from academy_v2.participants
    where session_id = p_target_session_id and order_line_id = source_row.order_line_id
      and status in ('registered', 'confirmed');
    target_status := case when occupied < target_reservation.confirmed_seats then 'registered' else 'waitlisted' end;
  else
    occupied := academy_v2_private.session_confirmed_seats(p_target_session_id);
    target_status := case when occupied < target_session.capacity then 'registered' else 'waitlisted' end;
  end if;

  update academy_v2.participants set status = 'transferred' where id = source_row.id;
  insert into academy_v2.participants(
    session_id, customer_id, order_line_id, full_name, email, phone, employee_reference,
    status, transferred_from_id, created_by
  ) values (
    target_session.id, source_row.customer_id, source_row.order_line_id, source_row.full_name,
    source_row.email, source_row.phone, source_row.employee_reference, target_status, source_row.id, actor
  ) returning id into new_id;
  perform academy_v2_private.rebalance_session_reservations(source_row.session_id);
  perform academy_v2_private.promote_waitlist(source_row.session_id, actor);
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'participant.transferred', 'participant', source_row.id::text,
    jsonb_build_object('from_session_id', source_row.session_id, 'to_session_id', target_session.id,
      'new_participant_id', new_id, 'target_status', target_status, 'order_line_id', source_row.order_line_id));
  return new_id;
end;
$$;

revoke all on function academy_v2_private.register_participant_v2(uuid, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function academy_v2_private.register_participant_v2(uuid, uuid, uuid, text, text, text, text) to authenticated;

create function academy_v2.register_participant_v2(
  p_session_id uuid, p_customer_id uuid, p_order_line_id uuid, p_full_name text,
  p_email text default null, p_phone text default null, p_employee_reference text default null
)
returns uuid language sql security invoker set search_path = ''
as $$ select academy_v2_private.register_participant_v2(p_session_id, p_customer_id, p_order_line_id, p_full_name, p_email, p_phone, p_employee_reference); $$;

revoke all on function academy_v2.register_participant_v2(uuid, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function academy_v2.register_participant_v2(uuid, uuid, uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Commercial selection, ownership, atomic conversion, and cancellation
-- ---------------------------------------------------------------------------

create or replace function academy_v2_private.convert_quotation_to_order(p_quotation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  quotation_row academy_v2.quotations%rowtype;
  quote_line record;
  created_order_id uuid;
  created_line_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into quotation_row from academy_v2.quotations where id = p_quotation_id for update;
  if not found or not academy_v2_private.can_manage_sales(quotation_row.owner_id) then
    raise exception 'Quotation not found or access denied' using errcode = '42501';
  end if;
  if quotation_row.status <> 'accepted' then
    raise exception 'Accept the quotation before creating an order' using errcode = '23514';
  end if;
  select o.id into created_order_id from academy_v2.orders o where o.quotation_id = p_quotation_id;
  if created_order_id is not null then return created_order_id; end if;

  insert into academy_v2.orders(quotation_id, inquiry_id, customer_id, contact_id, sales_owner_id)
  values (quotation_row.id, quotation_row.inquiry_id, quotation_row.customer_id, quotation_row.contact_id, quotation_row.owner_id)
  returning id into created_order_id;

  for quote_line in
    select * from academy_v2.quotation_lines where quotation_id = p_quotation_id order by created_at, id
  loop
    insert into academy_v2.order_lines(
      order_id, course_id, learning_type, participant_count, unit_price, currency,
      delivery_intent, session_id
    ) values (
      created_order_id, quote_line.course_id, quote_line.learning_type, quote_line.participant_count,
      round(quote_line.unit_price * (1 - quotation_row.discount_percent / 100), 2), quote_line.currency,
      quote_line.delivery_intent, quote_line.session_id
    ) returning id into created_line_id;

    if quote_line.delivery_intent = 'existing_session' then
      perform academy_v2_private.allocate_session_reservation(
        quote_line.session_id, created_line_id, quote_line.participant_count
      );
    end if;
  end loop;

  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'order.created_from_quotation', 'order', created_order_id::text,
    jsonb_build_object('quotation_id', p_quotation_id, 'reservation_aware', true));
  return created_order_id;
end;
$$;

create or replace function academy_v2_private.prepare_order_v2(
  p_order_id uuid,
  p_requested_start_date date,
  p_delivery_notes text,
  p_operations_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row academy_v2.orders%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into order_row from academy_v2.orders where id = p_order_id for update;
  if not found or not academy_v2_private.can_manage_sales(order_row.sales_owner_id) then
    raise exception 'Order not found or access denied' using errcode = '42501';
  end if;
  if order_row.status not in ('draft', 'returned') then
    raise exception 'This order can no longer be prepared by Sales' using errcode = '23514';
  end if;
  if p_requested_start_date is null or p_requested_start_date < current_date then
    raise exception 'Requested start date must be today or later' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_delivery_notes, ''))) < 10 then
    raise exception 'Delivery notes must contain at least 10 characters' using errcode = '23514';
  end if;
  if not exists (
    select 1 from academy_v2.profiles p
    where p.id = p_operations_target_id and p.is_active and p.role in ('administrator', 'operations')
  ) then
    raise exception 'Choose an active Operations owner for the handoff' using errcode = '23514';
  end if;
  update academy_v2.orders
  set requested_start_date = p_requested_start_date,
      delivery_notes = btrim(p_delivery_notes),
      operations_target_id = p_operations_target_id
  where id = p_order_id;
end;
$$;

create or replace function academy_v2_private.transition_order(
  p_order_id uuid,
  p_action text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row academy_v2.orders%rowtype;
  actor uuid := (select auth.uid());
  actor_is_operations boolean;
  next_status text;
  affected_session uuid;
  promoted_participant uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into order_row from academy_v2.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  actor_is_operations := academy_v2_private.has_role(array['administrator', 'operations']::text[]);

  if p_action = 'send' then
    if not academy_v2_private.can_manage_sales(order_row.sales_owner_id) then raise exception 'Order access denied' using errcode = '42501'; end if;
    if order_row.status not in ('draft', 'returned') then raise exception 'Only a draft or returned order can be sent' using errcode = '23514'; end if;
    if order_row.contact_id is null or order_row.requested_start_date is null
      or order_row.operations_target_id is null
      or char_length(btrim(coalesce(order_row.delivery_notes, ''))) < 10 then
      raise exception 'Customer contact, requested date, delivery notes, and target Operations owner are required' using errcode = '23514';
    end if;
    if not exists (select 1 from academy_v2.order_lines l where l.order_id = p_order_id) then
      raise exception 'At least one order line is required' using errcode = '23514';
    end if;
    if exists (
      select 1 from academy_v2.order_lines l
      where l.order_id = p_order_id
        and l.delivery_intent = 'existing_session'
        and not exists (
          select 1 from academy_v2.session_reservations r
          where r.order_line_id = l.id and r.session_id = l.session_id and r.status <> 'released'
        )
    ) then
      raise exception 'Every existing-session line must have an active seat reservation' using errcode = '23514';
    end if;
    update academy_v2.orders
    set status = 'pending_operations', handoff_sent_at = now(), reviewed_at = null,
        operations_owner_id = null, operations_note = null
    where id = p_order_id;
    next_status := 'pending_operations';
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'order.sent_to_operations', 'order', p_order_id::text,
      jsonb_build_object('operations_target_id', order_row.operations_target_id));
  elsif p_action = 'accept' then
    if not actor_is_operations then raise exception 'Operations access required' using errcode = '42501'; end if;
    if order_row.status <> 'pending_operations' then raise exception 'This order is not pending Operations review' using errcode = '23514'; end if;
    if order_row.operations_target_id is not null and order_row.operations_target_id <> actor
      and not academy_v2_private.has_role(array['administrator']::text[]) then
      raise exception 'This handoff is assigned to another Operations owner' using errcode = '42501';
    end if;
    update academy_v2.orders
    set status = 'with_operations', operations_owner_id = actor, operations_note = null, reviewed_at = now()
    where id = p_order_id;
    next_status := 'with_operations';
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'order.handoff_accepted', 'order', p_order_id::text,
      jsonb_build_object('target_id', order_row.operations_target_id));
  elsif p_action = 'return' then
    if not actor_is_operations then raise exception 'Operations access required' using errcode = '42501'; end if;
    if order_row.status <> 'pending_operations' then raise exception 'This order is not pending Operations review' using errcode = '23514'; end if;
    if order_row.operations_target_id is not null and order_row.operations_target_id <> actor
      and not academy_v2_private.has_role(array['administrator']::text[]) then
      raise exception 'This handoff is assigned to another Operations owner' using errcode = '42501';
    end if;
    if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'A correction reason is required' using errcode = '23514'; end if;
    update academy_v2.orders
    set status = 'returned', operations_owner_id = null, operations_note = btrim(p_reason), reviewed_at = now()
    where id = p_order_id;
    next_status := 'returned';
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
    values (actor, 'order.handoff_returned', 'order', p_order_id::text, btrim(p_reason), '{}'::jsonb);
  elsif p_action in ('start', 'complete') then
    if not actor_is_operations then raise exception 'Operations access required' using errcode = '42501'; end if;
    if p_action = 'start' and order_row.status = 'with_operations' then
      next_status := 'fulfillment';
      update academy_v2.orders set status = next_status where id = p_order_id;
      insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'order.fulfillment_started', 'order', p_order_id::text, '{}'::jsonb);
    elsif p_action = 'complete' and order_row.status = 'fulfillment' then
      next_status := 'completed';
      update academy_v2.orders set status = next_status where id = p_order_id;
      insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'order.completed', 'order', p_order_id::text, '{}'::jsonb);
    else
      raise exception 'The requested order transition is invalid' using errcode = '23514';
    end if;
  elsif p_action = 'cancel' then
    if not (
      academy_v2_private.can_manage_sales(order_row.sales_owner_id)
      or actor_is_operations
    ) then raise exception 'Order cancellation access denied' using errcode = '42501'; end if;
    if order_row.status in ('completed', 'cancelled') then raise exception 'This order can no longer be cancelled' using errcode = '23514'; end if;
    if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'A cancellation reason is required' using errcode = '23514'; end if;
    update academy_v2.orders set status = 'cancelled', operations_note = btrim(p_reason) where id = p_order_id;
    for affected_session in
      select distinct r.session_id
      from academy_v2.session_reservations r
      join academy_v2.order_lines l on l.id = r.order_line_id
      where l.order_id = p_order_id and r.status <> 'released'
    loop
      update academy_v2.participants p
      set status = 'cancelled'
      from academy_v2.order_lines l
      where p.order_line_id = l.id
        and l.order_id = p_order_id
        and p.session_id = affected_session
        and p.status in ('registered', 'confirmed', 'waitlisted');
      update academy_v2.session_reservations r
      set confirmed_seats = 0, waitlisted_seats = 0, status = 'released', released_at = now()
      from academy_v2.order_lines l
      where r.order_line_id = l.id and l.order_id = p_order_id and r.session_id = affected_session;
      perform academy_v2_private.rebalance_session_reservations(affected_session);
      loop
        promoted_participant := academy_v2_private.promote_waitlist(affected_session, actor);
        exit when promoted_participant is null;
      end loop;
    end loop;
    next_status := 'cancelled';
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
    values (actor, 'order.cancelled', 'order', p_order_id::text, btrim(p_reason),
      jsonb_build_object('reservations_released', true));
  else
    raise exception 'Unsupported order action' using errcode = '22023';
  end if;
  return next_status;
end;
$$;

revoke all on function academy_v2_private.prepare_order_v2(uuid, date, text, uuid) from public, anon;
grant execute on function academy_v2_private.prepare_order_v2(uuid, date, text, uuid) to authenticated;

create function academy_v2.prepare_order_v2(
  p_order_id uuid, p_requested_start_date date, p_delivery_notes text, p_operations_target_id uuid
)
returns void language sql security invoker set search_path = ''
as $$ select academy_v2_private.prepare_order_v2(p_order_id, p_requested_start_date, p_delivery_notes, p_operations_target_id); $$;

revoke all on function academy_v2.prepare_order_v2(uuid, date, text, uuid) from public, anon;
grant execute on function academy_v2.prepare_order_v2(uuid, date, text, uuid) to authenticated;

-- Existing pending sample handoffs receive an explicit target so they remain
-- actionable after the stronger ownership rule is activated.
update academy_v2.orders o
set operations_target_id = target.id
from lateral (
  select p.id from academy_v2.profiles p
  where p.is_active and p.role = 'operations'
  order by p.created_at, p.id limit 1
) target
where o.status = 'pending_operations' and o.operations_target_id is null;

-- ---------------------------------------------------------------------------
-- Role-aware reads, explicit grants, and immutable audit coverage
-- ---------------------------------------------------------------------------

drop policy if exists sessions_scoped_read on academy_v2.sessions;
create policy sessions_scoped_read on academy_v2.sessions
for select to authenticated
using ((select academy_v2_private.can_view_session(id)));

drop policy if exists participants_scoped_read on academy_v2.participants;
create policy participants_scoped_read on academy_v2.participants
for select to authenticated
using ((select academy_v2_private.can_view_session(session_id)));

revoke all on table academy_v2.venue_rooms, academy_v2.trainer_unavailability,
  academy_v2.session_schedule_blocks, academy_v2.session_reservations
  from anon, authenticated;

grant select on table academy_v2.venue_rooms, academy_v2.trainer_unavailability,
  academy_v2.session_schedule_blocks, academy_v2.session_reservations
  to authenticated;
grant insert, update on table academy_v2.venue_rooms, academy_v2.trainer_unavailability
  to authenticated;

alter table academy_v2.venue_rooms enable row level security;
alter table academy_v2.venue_rooms force row level security;
alter table academy_v2.trainer_unavailability enable row level security;
alter table academy_v2.trainer_unavailability force row level security;
alter table academy_v2.session_schedule_blocks enable row level security;
alter table academy_v2.session_schedule_blocks force row level security;
alter table academy_v2.session_reservations enable row level security;
alter table academy_v2.session_reservations force row level security;

create policy venue_rooms_active_read on academy_v2.venue_rooms
for select to authenticated
using (
  (select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[]))
  and (is_active or (select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
);
create policy venue_rooms_write on academy_v2.venue_rooms
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));
create policy venue_rooms_update on academy_v2.venue_rooms
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));

create policy trainer_unavailability_read on academy_v2.trainer_unavailability
for select to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations', 'manager', 'auditor']::text[])));
create policy trainer_unavailability_write on academy_v2.trainer_unavailability
for insert to authenticated
with check (
  (select academy_v2_private.has_role(array['administrator', 'operations']::text[]))
  and created_by = (select auth.uid())
);
create policy trainer_unavailability_update on academy_v2.trainer_unavailability
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));

create policy session_schedule_blocks_scoped_read on academy_v2.session_schedule_blocks
for select to authenticated
using ((select academy_v2_private.can_view_session(session_id)));
create policy session_reservations_scoped_read on academy_v2.session_reservations
for select to authenticated
using ((select academy_v2_private.can_view_session(session_id)));

create or replace function academy_v2_private.audit_new_resource_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_id uuid := coalesce(new.id, old.id);
begin
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    lower(tg_table_name) || '.' || lower(tg_op),
    lower(tg_table_name),
    changed_id::text,
    jsonb_build_object('operation', tg_op)
  );
  return coalesce(new, old);
end;
$$;

revoke all on function academy_v2_private.audit_new_resource_change() from public, anon, authenticated;
create trigger venue_rooms_audit after insert or update on academy_v2.venue_rooms
for each row execute function academy_v2_private.audit_new_resource_change();
create trigger trainer_unavailability_audit after insert or update on academy_v2.trainer_unavailability
for each row execute function academy_v2_private.audit_new_resource_change();

-- Recreate the role-aware roster listing for orderless public/internal sessions
-- and include the commercial allocation key without exposing contact details to
-- oversight roles.
drop function academy_v2.list_participants();
drop function academy_v2_private.list_participants();

create function academy_v2_private.list_participants()
returns table (
  id uuid,
  participant_number bigint,
  session_id uuid,
  customer_id uuid,
  order_line_id uuid,
  full_name text,
  email text,
  phone text,
  employee_reference text,
  status text,
  attendance_status text,
  attended_minutes integer,
  assessment_status text,
  assessment_score numeric,
  certificate_status text,
  certificate_number text,
  certificate_issued_at timestamptz,
  certificate_note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.participant_number,
    p.session_id,
    p.customer_id,
    p.order_line_id,
    p.full_name,
    case when academy_v2_private.has_role(array['administrator', 'operations']::text[])
      or academy_v2_private.can_manage_sales(coalesce(reservation_order.sales_owner_id, session_order.sales_owner_id))
      then p.email else null end,
    case when academy_v2_private.has_role(array['administrator', 'operations']::text[])
      or academy_v2_private.can_manage_sales(coalesce(reservation_order.sales_owner_id, session_order.sales_owner_id))
      then p.phone else null end,
    case when academy_v2_private.has_role(array['administrator', 'operations']::text[])
      or academy_v2_private.can_manage_sales(coalesce(reservation_order.sales_owner_id, session_order.sales_owner_id))
      then p.employee_reference else null end,
    p.status,
    p.attendance_status,
    p.attended_minutes,
    p.assessment_status,
    p.assessment_score,
    p.certificate_status,
    p.certificate_number,
    p.certificate_issued_at,
    case when academy_v2_private.has_role(array['administrator', 'operations']::text[])
      or academy_v2_private.can_manage_sales(coalesce(reservation_order.sales_owner_id, session_order.sales_owner_id))
      then p.certificate_note else null end,
    p.created_at
  from academy_v2.participants p
  join academy_v2.sessions s on s.id = p.session_id
  left join academy_v2.orders session_order on session_order.id = s.order_id
  left join academy_v2.order_lines reservation_line on reservation_line.id = p.order_line_id
  left join academy_v2.orders reservation_order on reservation_order.id = reservation_line.order_id
  where academy_v2_private.can_view_session(s.id);
$$;

create function academy_v2.list_participants()
returns table (
  id uuid,
  participant_number bigint,
  session_id uuid,
  customer_id uuid,
  order_line_id uuid,
  full_name text,
  email text,
  phone text,
  employee_reference text,
  status text,
  attendance_status text,
  attended_minutes integer,
  assessment_status text,
  assessment_score numeric,
  certificate_status text,
  certificate_number text,
  certificate_issued_at timestamptz,
  certificate_note text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from academy_v2_private.list_participants(); $$;

revoke all on function academy_v2_private.list_participants() from public, anon;
grant execute on function academy_v2_private.list_participants() to authenticated;
revoke all on function academy_v2.list_participants() from public, anon;
grant execute on function academy_v2.list_participants() to authenticated;

-- ---------------------------------------------------------------------------
-- Safe v1-derived demonstration data
-- ---------------------------------------------------------------------------

update academy_v2.courses
set default_min_participants = case
  when code in ('ESG-FOUND') then least(default_capacity, 10)
  else least(default_capacity, 8)
end
where code in ('ISO-9001-LA', 'ISO-9001-IA', 'ISO-14001-IA', 'ISO-45001-LA', 'HACCP-L3', 'ESG-FOUND', 'TOT-PRO');

insert into academy_v2.venue_rooms(venue_id, name, capacity, equipment)
select v.id, seed.room_name, least(v.capacity, seed.capacity), seed.equipment
from (values
  ('Makati Training Room A — Sample', 'Room A', 24, 'Projector, whiteboard, hybrid camera'),
  ('Cebu Training Room — Sample', 'Main Classroom', 20, 'Projector and training laptops'),
  ('Customer Site — Sample', 'Assigned customer room', 50, 'Equipment confirmed per engagement')
) as seed(venue_name, room_name, capacity, equipment)
join academy_v2.venues v on v.name = seed.venue_name and v.venue_type = 'physical'
where not exists (
  select 1 from academy_v2.venue_rooms r
  where r.venue_id = v.id and lower(r.name) = lower(seed.room_name)
);

do $$
declare
  actor uuid;
  customer_id uuid;
  iso_course uuid;
  haccp_course uuid;
  esg_course uuid;
  alex uuid;
  diana uuid;
  bianca uuid;
  makati uuid;
  cebu uuid;
  teams uuid;
  makati_room uuid;
  cebu_room uuid;
  iso_session uuid;
  haccp_session uuid;
  esg_session uuid;
begin
  select p.id into actor
  from academy_v2.profiles p join auth.users u on u.id = p.id
  where lower(u.email) = 'alanclifford.filart@tuv.com';
  select id into customer_id from academy_v2.customers where name = 'Acme Manufacturing — Sample';
  select id into iso_course from academy_v2.courses where code = 'ISO-9001-IA';
  select id into haccp_course from academy_v2.courses where code = 'HACCP-L3';
  select id into esg_course from academy_v2.courses where code = 'ESG-FOUND';
  select id into alex from academy_v2.trainers where name = 'Alex Rivera — Sample Trainer';
  select id into diana from academy_v2.trainers where name = 'Diana Lim — Sample Trainer';
  select id into bianca from academy_v2.trainers where name = 'Bianca Cruz — Sample Trainer';
  select id into makati from academy_v2.venues where name = 'Makati Training Room A — Sample';
  select id into cebu from academy_v2.venues where name = 'Cebu Training Room — Sample';
  select id into teams from academy_v2.venues where name = 'Microsoft Teams Classroom — Sample';
  select id into makati_room from academy_v2.venue_rooms where venue_id = makati and name = 'Room A';
  select id into cebu_room from academy_v2.venue_rooms where venue_id = cebu and name = 'Main Classroom';

  if actor is null or customer_id is null or iso_course is null or haccp_course is null or esg_course is null
    or alex is null or diana is null or bianca is null or makati is null or cebu is null or teams is null then
    raise exception 'Required safe sample records are missing';
  end if;

  select id into iso_session from academy_v2.sessions where notes = '[v2.5 sample] Public ISO 9001 intake ready to run.';
  if iso_session is null then
    insert into academy_v2.sessions(
      course_id, learning_type, trainer_id, venue_id, room_id, operations_owner_id,
      status, starts_at, ends_at, capacity, minimum_participants, offering_type,
      publication_status, go_status, go_decided_by, go_decided_at, notes, created_by
    ) values (
      iso_course, 'classroom', alex, makati, makati_room, actor, 'open',
      (current_date + 21 + time '09:00') at time zone 'Asia/Manila',
      (current_date + 21 + time '17:00') at time zone 'Asia/Manila',
      20, 8, 'public', 'published', 'go', actor, now(),
      '[v2.5 sample] Public ISO 9001 intake ready to run.', actor
    ) returning id into iso_session;
    insert into academy_v2.session_schedule_blocks(
      session_id, block_number, trainer_id, venue_id, room_id, starts_at, ends_at
    ) values (
      iso_session, 1, alex, makati, makati_room,
      (current_date + 21 + time '09:00') at time zone 'Asia/Manila',
      (current_date + 21 + time '17:00') at time zone 'Asia/Manila'
    );
    insert into academy_v2.participants(
      session_id, customer_id, full_name, email, employee_reference, status, created_by, created_at
    )
    select iso_session, customer_id,
      'Public Participant ' || lpad(n::text, 2, '0') || ' — Sample',
      'public-participant-' || lpad(n::text, 2, '0') || '@academy-sample.test',
      'PUB-' || lpad(n::text, 3, '0'), 'confirmed', actor, now() + (n || ' seconds')::interval
    from generate_series(1, 8) n;
  end if;

  select id into haccp_session from academy_v2.sessions where notes = '[v2.5 sample] Two-block public HACCP intake awaiting Go/No-Go.';
  if haccp_session is null then
    insert into academy_v2.sessions(
      course_id, learning_type, trainer_id, venue_id, room_id, operations_owner_id,
      status, starts_at, ends_at, capacity, minimum_participants, offering_type,
      publication_status, go_status, notes, created_by
    ) values (
      haccp_course, 'classroom', diana, cebu, cebu_room, actor, 'scheduled',
      (current_date + 35 + time '09:00') at time zone 'Asia/Manila',
      (current_date + 36 + time '17:00') at time zone 'Asia/Manila',
      20, 8, 'public', 'published', 'pending',
      '[v2.5 sample] Two-block public HACCP intake awaiting Go/No-Go.', actor
    ) returning id into haccp_session;
    insert into academy_v2.session_schedule_blocks(
      session_id, block_number, trainer_id, venue_id, room_id, starts_at, ends_at
    ) values
      (haccp_session, 1, diana, cebu, cebu_room,
        (current_date + 35 + time '09:00') at time zone 'Asia/Manila',
        (current_date + 35 + time '17:00') at time zone 'Asia/Manila'),
      (haccp_session, 2, diana, cebu, cebu_room,
        (current_date + 36 + time '09:00') at time zone 'Asia/Manila',
        (current_date + 36 + time '17:00') at time zone 'Asia/Manila');
    insert into academy_v2.participants(
      session_id, customer_id, full_name, email, employee_reference, status, created_by, created_at
    )
    select haccp_session, customer_id,
      'HACCP Participant ' || lpad(n::text, 2, '0') || ' — Sample',
      'haccp-participant-' || lpad(n::text, 2, '0') || '@academy-sample.test',
      'HACCP-' || lpad(n::text, 3, '0'), 'registered', actor, now() + (n || ' seconds')::interval
    from generate_series(1, 4) n;
  end if;

  select id into esg_session from academy_v2.sessions where notes = '[v2.5 sample] Virtual public ESG session available for quotation selection.';
  if esg_session is null then
    insert into academy_v2.sessions(
      course_id, learning_type, trainer_id, venue_id, operations_owner_id,
      status, starts_at, ends_at, capacity, minimum_participants, offering_type,
      publication_status, go_status, notes, created_by
    ) values (
      esg_course, 'virtual', bianca, teams, actor, 'scheduled',
      (current_date + 14 + time '09:00') at time zone 'Asia/Manila',
      (current_date + 14 + time '17:00') at time zone 'Asia/Manila',
      30, 10, 'public', 'published', 'pending',
      '[v2.5 sample] Virtual public ESG session available for quotation selection.', actor
    ) returning id into esg_session;
    insert into academy_v2.session_schedule_blocks(
      session_id, block_number, trainer_id, venue_id, starts_at, ends_at
    ) values (
      esg_session, 1, bianca, teams,
      (current_date + 14 + time '09:00') at time zone 'Asia/Manila',
      (current_date + 14 + time '17:00') at time zone 'Asia/Manila'
    );
  end if;

  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
  select actor, 'demo.v2_5_rollout_seeded', 'demo_seed', 'v2_5_integrated_rollout',
    'Use non-personal v1 catalogue patterns to demonstrate integrated public scheduling',
    jsonb_build_object('public_sessions', 3, 'sample_only', true)
  where not exists (
    select 1 from academy_v2.audit_events
    where action = 'demo.v2_5_rollout_seeded' and entity_id = 'v2_5_integrated_rollout'
  );
end;
$$;

comment on column academy_v2.courses.default_min_participants is 'Configurable course default; v1 used eight universally, v2.5 allows per-course and per-session overrides';
comment on table academy_v2.venue_rooms is 'Bookable rooms within a physical venue';
comment on table academy_v2.trainer_unavailability is 'Explicit trainer availability exceptions used by transactional conflict checks';
comment on table academy_v2.session_schedule_blocks is 'Date-segment schedule for multi-day and split-day delivery';
comment on table academy_v2.session_reservations is 'Transactional commercial seat blocks; named participants consume rather than duplicate reserved capacity';
comment on column academy_v2.sessions.offering_type is 'Public sellable inventory, private ordered delivery, or internal academy delivery';
comment on column academy_v2.sessions.go_status is 'Explicit operational Go/No-Go decision required before named registration opens or delivery starts';
comment on column academy_v2.orders.operations_target_id is 'Named Operations recipient selected before Sales endorses the handoff';

revoke all on function academy_v2_private.create_catalogue_session(text, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text) from public, anon;
revoke all on function academy_v2_private.add_session_schedule_block(uuid, uuid, uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke all on function academy_v2_private.remove_session_schedule_block(uuid, uuid, text) from public, anon;
revoke all on function academy_v2_private.publish_session(uuid, boolean) from public, anon;
revoke all on function academy_v2_private.decide_session_go_no_go(uuid, text, text) from public, anon;
grant execute on function academy_v2_private.create_catalogue_session(text, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text) to authenticated;
grant execute on function academy_v2_private.add_session_schedule_block(uuid, uuid, uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function academy_v2_private.remove_session_schedule_block(uuid, uuid, text) to authenticated;
grant execute on function academy_v2_private.publish_session(uuid, boolean) to authenticated;
grant execute on function academy_v2_private.decide_session_go_no_go(uuid, text, text) to authenticated;

create function academy_v2.create_catalogue_session(
  p_offering_type text, p_course_id uuid, p_learning_type text, p_trainer_id uuid,
  p_venue_id uuid, p_room_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_capacity integer, p_minimum_participants integer, p_notes text default null
)
returns uuid language sql security invoker set search_path = ''
as $$ select academy_v2_private.create_catalogue_session(p_offering_type, p_course_id, p_learning_type, p_trainer_id, p_venue_id, p_room_id, p_starts_at, p_ends_at, p_capacity, p_minimum_participants, p_notes); $$;
create function academy_v2.add_session_schedule_block(
  p_session_id uuid, p_trainer_id uuid, p_venue_id uuid, p_room_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid language sql security invoker set search_path = ''
as $$ select academy_v2_private.add_session_schedule_block(p_session_id, p_trainer_id, p_venue_id, p_room_id, p_starts_at, p_ends_at); $$;
create function academy_v2.remove_session_schedule_block(p_session_id uuid, p_block_id uuid, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select academy_v2_private.remove_session_schedule_block(p_session_id, p_block_id, p_reason); $$;
create function academy_v2.publish_session(p_session_id uuid, p_publish boolean)
returns text language sql security invoker set search_path = ''
as $$ select academy_v2_private.publish_session(p_session_id, p_publish); $$;
create function academy_v2.decide_session_go_no_go(p_session_id uuid, p_decision text, p_reason text default null)
returns text language sql security invoker set search_path = ''
as $$ select academy_v2_private.decide_session_go_no_go(p_session_id, p_decision, p_reason); $$;

revoke all on function academy_v2.create_catalogue_session(text, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text) from public, anon;
revoke all on function academy_v2.add_session_schedule_block(uuid, uuid, uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke all on function academy_v2.remove_session_schedule_block(uuid, uuid, text) from public, anon;
revoke all on function academy_v2.publish_session(uuid, boolean) from public, anon;
revoke all on function academy_v2.decide_session_go_no_go(uuid, text, text) from public, anon;
grant execute on function academy_v2.create_catalogue_session(text, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text) to authenticated;
grant execute on function academy_v2.add_session_schedule_block(uuid, uuid, uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function academy_v2.remove_session_schedule_block(uuid, uuid, text) to authenticated;
grant execute on function academy_v2.publish_session(uuid, boolean) to authenticated;
grant execute on function academy_v2.decide_session_go_no_go(uuid, text, text) to authenticated;

-- Preserve the original private-session RPC while routing conflict checks through
-- schedule blocks and adding a room-aware replacement for the user interface.
create or replace function academy_v2_private.validate_session_plan(
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
  existing_room uuid;
begin
  select * into order_row from academy_v2.orders where id = p_order_id;
  select * into line_row from academy_v2.order_lines where id = p_order_line_id;
  if order_row.id is null or line_row.id is null or line_row.order_id <> order_row.id then
    raise exception 'The selected order line does not belong to this order' using errcode = '23503';
  end if;
  if order_row.status not in ('with_operations', 'fulfillment') then
    raise exception 'Operations must accept the order before scheduling' using errcode = '23514';
  end if;
  if line_row.delivery_intent = 'existing_session' then
    raise exception 'This order line already reserves an existing public session' using errcode = '23514';
  end if;
  if line_row.course_id <> p_course_id or line_row.learning_type <> p_learning_type then
    raise exception 'Course and delivery type must match the accepted order line' using errcode = '23514';
  end if;
  if p_capacity is null or p_capacity <= 0 or p_capacity > line_row.participant_count then
    raise exception 'Private-session capacity must be positive and cannot exceed ordered headcount' using errcode = '23514';
  end if;
  select room_id into existing_room from academy_v2.sessions where id = p_session_id;
  perform academy_v2_private.validate_schedule_block(
    p_session_id, null, p_course_id, p_learning_type, p_trainer_id, p_venue_id,
    existing_room, p_starts_at, p_ends_at, p_capacity
  );
end;
$$;

create or replace function academy_v2_private.create_session(
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
  course_min integer;
  created_session_id uuid;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into line_row from academy_v2.order_lines where id = p_order_line_id for update;
  if line_row.id is null then raise exception 'Order line not found' using errcode = 'P0002'; end if;
  select * into order_row from academy_v2.orders where id = line_row.order_id for update;
  if exists (select 1 from academy_v2.sessions where order_line_id = p_order_line_id) then
    raise exception 'This order line already has a private session' using errcode = '23505';
  end if;
  perform academy_v2_private.validate_session_plan(
    null, order_row.id, line_row.id, line_row.course_id, line_row.learning_type,
    p_trainer_id, p_venue_id, p_starts_at, p_ends_at, p_capacity
  );
  select default_min_participants into course_min from academy_v2.courses where id = line_row.course_id;

  insert into academy_v2.sessions(
    order_id, order_line_id, course_id, learning_type, trainer_id, venue_id,
    operations_owner_id, starts_at, ends_at, capacity, minimum_participants,
    offering_type, publication_status, go_status, notes, created_by
  ) values (
    order_row.id, line_row.id, line_row.course_id, line_row.learning_type, p_trainer_id, p_venue_id,
    coalesce(order_row.operations_owner_id, actor), p_starts_at, p_ends_at, p_capacity,
    least(p_capacity, course_min), 'private', 'draft', 'pending',
    nullif(btrim(coalesce(p_notes, '')), ''), actor
  ) returning id into created_session_id;

  insert into academy_v2.session_schedule_blocks(
    session_id, block_number, trainer_id, venue_id, starts_at, ends_at
  ) values (created_session_id, 1, p_trainer_id, p_venue_id, p_starts_at, p_ends_at);

  update academy_v2.order_lines
  set delivery_intent = 'private_session', session_id = created_session_id
  where id = line_row.id;
  perform academy_v2_private.allocate_session_reservation(created_session_id, line_row.id, line_row.participant_count);

  if order_row.status = 'with_operations' then
    update academy_v2.orders set status = 'fulfillment' where id = order_row.id;
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'order.fulfillment_started', 'order', order_row.id::text,
      jsonb_build_object('source', 'private_session_schedule'));
  end if;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'session.scheduled', 'session', created_session_id::text,
    jsonb_build_object('order_id', order_row.id, 'order_line_id', line_row.id, 'capacity', p_capacity));
  return created_session_id;
end;
$$;

create or replace function academy_v2_private.reschedule_session_v2(
  p_session_id uuid,
  p_trainer_id uuid,
  p_venue_id uuid,
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_minimum_participants integer,
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
  occupied := academy_v2_private.session_confirmed_seats(p_session_id);
  if p_capacity < occupied then raise exception 'Capacity cannot be lower than confirmed reservations and registrations' using errcode = '23514'; end if;
  if p_minimum_participants is null or p_minimum_participants <= 0 or p_minimum_participants > p_capacity then
    raise exception 'Minimum participants must be between one and capacity' using errcode = '23514';
  end if;
  if session_row.offering_type = 'private' then
    perform academy_v2_private.validate_session_plan(
      session_row.id, session_row.order_id, session_row.order_line_id, session_row.course_id,
      session_row.learning_type, p_trainer_id, p_venue_id, p_starts_at, p_ends_at, p_capacity
    );
  else
    perform academy_v2_private.validate_schedule_block(
      session_row.id, null, session_row.course_id, session_row.learning_type,
      p_trainer_id, p_venue_id, p_room_id, p_starts_at, p_ends_at, p_capacity
    );
  end if;

  delete from academy_v2.session_schedule_blocks where session_id = p_session_id;
  update academy_v2.sessions
  set trainer_id = p_trainer_id,
      venue_id = p_venue_id,
      room_id = p_room_id,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      capacity = p_capacity,
      minimum_participants = p_minimum_participants,
      go_status = 'pending',
      go_decided_by = null,
      go_decided_at = null,
      go_reason = null,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_session_id;
  insert into academy_v2.session_schedule_blocks(
    session_id, block_number, trainer_id, venue_id, room_id, starts_at, ends_at
  ) values (p_session_id, 1, p_trainer_id, p_venue_id, p_room_id, p_starts_at, p_ends_at);
  perform academy_v2_private.rebalance_session_reservations(p_session_id);
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (actor, 'session.rescheduled', 'session', p_session_id::text,
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at, 'capacity', p_capacity,
      'minimum_participants', p_minimum_participants, 'go_reset', true));
end;
$$;

create or replace function academy_v2_private.reschedule_session(
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
  current_room uuid;
  current_minimum integer;
begin
  select room_id, minimum_participants into current_room, current_minimum
  from academy_v2.sessions where id = p_session_id;
  perform academy_v2_private.reschedule_session_v2(
    p_session_id, p_trainer_id, p_venue_id, current_room, p_starts_at, p_ends_at,
    p_capacity, least(current_minimum, p_capacity), p_notes
  );
end;
$$;

revoke all on function academy_v2_private.reschedule_session_v2(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text) from public, anon;
grant execute on function academy_v2_private.reschedule_session_v2(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text) to authenticated;

create function academy_v2.reschedule_session_v2(
  p_session_id uuid, p_trainer_id uuid, p_venue_id uuid, p_room_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_capacity integer,
  p_minimum_participants integer, p_notes text default null
)
returns void language sql security invoker set search_path = ''
as $$ select academy_v2_private.reschedule_session_v2(p_session_id, p_trainer_id, p_venue_id, p_room_id, p_starts_at, p_ends_at, p_capacity, p_minimum_participants, p_notes); $$;

revoke all on function academy_v2.reschedule_session_v2(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text) from public, anon;
grant execute on function academy_v2.reschedule_session_v2(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text) to authenticated;

create or replace function academy_v2_private.transition_session(p_session_id uuid, p_action text, p_reason text default null)
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
  related_order_id uuid;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  if session_row.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;

  if p_action = 'open' and session_row.status = 'scheduled' then
    if session_row.go_status <> 'go' then raise exception 'Record a Go decision before opening named registration' using errcode = '23514'; end if;
    if session_row.offering_type = 'public' and session_row.publication_status <> 'published' then
      raise exception 'Publish the public session before opening named registration' using errcode = '23514';
    end if;
    next_status := 'open';
  elsif p_action = 'start' and session_row.status in ('scheduled', 'open') then
    if session_row.go_status <> 'go' then raise exception 'Record a Go decision before starting the session' using errcode = '23514'; end if;
    next_status := 'in_progress';
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

  update academy_v2.sessions
  set status = next_status,
      publication_status = case when next_status in ('completed', 'cancelled') then 'closed' else publication_status end,
      cancellation_reason = case when next_status = 'cancelled' then btrim(p_reason) else cancellation_reason end
  where id = p_session_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
  values (actor, 'session.' || next_status, 'session', p_session_id::text,
    case when next_status = 'cancelled' then btrim(p_reason) else null end,
    jsonb_build_object('status_before', session_row.status));

  if next_status = 'completed' then
    for related_order_id in
      select distinct l.order_id
      from academy_v2.order_lines l
      where l.session_id = p_session_id
      union
      select session_row.order_id
      where session_row.order_id is not null
    loop
      if not exists (
        select 1
        from academy_v2.order_lines l
        where l.order_id = related_order_id
          and (
            (
              l.delivery_intent = 'existing_session'
              and not exists (
                select 1 from academy_v2.sessions s
                where s.id = l.session_id and s.status = 'completed'
              )
            )
            or (
              l.delivery_intent <> 'existing_session'
              and not exists (
                select 1 from academy_v2.sessions s
                where s.order_line_id = l.id and s.status = 'completed'
              )
            )
          )
      ) then
        update academy_v2.orders set status = 'completed'
        where id = related_order_id and status in ('with_operations', 'fulfillment');
        if found then
          insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
          values (actor, 'order.completed', 'order', related_order_id::text,
            jsonb_build_object('source', 'all_linked_sessions_completed'));
        end if;
      end if;
    end loop;
  end if;
  return next_status;
end;
$$;

-- A No-Go is a final operational decision: close and cancel the session in the
-- same transaction so sellable inventory cannot remain active accidentally.
create or replace function academy_v2_private.decide_session_go_no_go(
  p_session_id uuid,
  p_decision text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_row academy_v2.sessions%rowtype;
  confirmed_count integer;
begin
  if actor is null or not academy_v2_private.has_role(array['administrator', 'operations']::text[]) then
    raise exception 'Operations access required' using errcode = '42501';
  end if;
  if p_decision not in ('go', 'no_go') then raise exception 'Choose Go or No-Go' using errcode = '23514'; end if;
  select * into session_row from academy_v2.sessions where id = p_session_id for update;
  if session_row.id is null or session_row.status not in ('scheduled', 'open') then
    raise exception 'Only a scheduled or open session can receive a Go/No-Go decision' using errcode = '23514';
  end if;
  if not exists (select 1 from academy_v2.session_schedule_blocks where session_id = p_session_id) then
    raise exception 'A complete schedule is required before Go/No-Go' using errcode = '23514';
  end if;
  confirmed_count := academy_v2_private.session_confirmed_seats(p_session_id);
  if p_decision = 'go' and confirmed_count < session_row.minimum_participants then
    raise exception 'Confirmed seats have not reached the configurable minimum participant threshold' using errcode = '23514';
  end if;
  if p_decision = 'no_go' and char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A No-Go reason is required' using errcode = '23514';
  end if;
  update academy_v2.sessions
  set go_status = p_decision,
      go_decided_by = actor,
      go_decided_at = now(),
      go_reason = case when p_decision = 'no_go' then btrim(p_reason) else null end,
      status = case when p_decision = 'no_go' then 'cancelled' else status end,
      publication_status = case when p_decision = 'no_go' then 'closed' else publication_status end,
      cancellation_reason = case when p_decision = 'no_go' then btrim(p_reason) else cancellation_reason end
  where id = p_session_id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
  values (actor, 'session.' || p_decision, 'session', p_session_id::text,
    case when p_decision = 'no_go' then btrim(p_reason) else null end,
    jsonb_build_object('confirmed_seats', confirmed_count, 'minimum_participants', session_row.minimum_participants));
  return p_decision;
end;
$$;
