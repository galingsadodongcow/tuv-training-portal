-- ===================================================================
-- Schema dump for public schema (A02 Academy Hub)
-- Generated 2026-08-05 12:34:19.305121+00
-- Sections: 1 ENUMs, 2 Tables/PK/FK, 3 Functions, 4 Views, 5 Triggers, 6 RLS Policies
-- ===================================================================

-- ===== SECTION 1: ENUM TYPES =====
create type access_status_t as enum ('Not Granted', 'Granted');
create type approval_decision_t as enum ('Pending', 'Approved', 'Rejected');
create type approval_object_t as enum ('Forecast sign-off', 'Schedule cancellation');
create type channel_t as enum ('Webshop', 'Inside Sales', 'Field Sales', 'In-house Request');
create type collection_t as enum ('Pending', 'Partial', 'Collected');
create type country_t as enum ('PH', 'ID');
create type dup_status_t as enum ('Open', 'Merged', 'Dismissed');
create type engagement_t as enum ('Engaged', 'Closed', 'Lost');
create type fulfillment_stage_t as enum ('New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback', 'Cancelled');
create type go_status_t as enum ('Go', 'No-Go');
create type inquiry_status_t as enum ('Received', 'Responded', 'RFQ or P Sent', 'Awaiting Feedback', 'Closed Won');
create type modality_t as enum ('Live Online Training', 'Face-to-face', 'E-learning');
create type offering_t as enum ('Public', 'In-house');
create type order_status_t as enum ('New', 'Confirmed', 'Cancelled', 'Completed', 'Waitlist');
create type payment_status_t as enum ('Unpaid', 'Partial', 'Paid');
create type schedule_status_t as enum ('Tentative', 'Confirmed', 'Running', 'Completed', 'Cancelled');
create type training_type_t as enum ('PersCert', 'Professional');
create type user_role as enum ('super_admin', 'operations', 'business_owner', 'sales');
create type went_live_t as enum ('Not Yet', 'Yes', 'Cancelled', 'Reschedule');
create type year_mode_t as enum ('Rebuild', 'Copy');
create type year_status_t as enum ('Active', 'Archived');

-- ===== SECTION 2: TABLES (columns, primary keys, foreign keys) =====
-- reconstructed (best-effort) from information_schema
create table approval (
    approval_id uuid not null default gen_random_uuid(),
    object_type approval_object_t not null,
    schedule_id uuid,
    quarter text,
    requested_by uuid,
    decided_by uuid,
    decision approval_decision_t not null default 'Pending'::approval_decision_t,
    decision_date date,
    note text,
    created_at timestamp with time zone not null default now(),
    primary key (approval_id)
);

-- reconstructed (best-effort) from information_schema
create table assignment_log (
    log_id uuid not null default gen_random_uuid(),
    order_id text not null,
    sales_id uuid not null,
    action text not null,
    at timestamp with time zone not null default now(),
    primary key (log_id)
);

-- reconstructed (best-effort) from information_schema
create table attribution (
    attribution_id uuid not null default gen_random_uuid(),
    schedule_id uuid not null,
    sales_id uuid not null,
    clients_brought integer not null,
    date_recorded date not null default CURRENT_DATE,
    primary key (attribution_id)
);

-- reconstructed (best-effort) from information_schema
create table calendar_year (
    year_id uuid not null default gen_random_uuid(),
    year integer not null,
    mode year_mode_t not null,
    status year_status_t not null default 'Active'::year_status_t,
    created_date date not null default CURRENT_DATE,
    primary key (year_id)
);

-- reconstructed (best-effort) from information_schema
create table client (
    client_id uuid not null default gen_random_uuid(),
    name text not null,
    company text,
    contact text,
    email text,
    phone text,
    industry text,
    owner_sales_id uuid,
    notes text,
    created_date date not null default CURRENT_DATE,
    custom_fields jsonb not null default '{}'::jsonb,
    country country_t not null default 'PH'::country_t,
    primary key (client_id)
);

-- reconstructed (best-effort) from information_schema
create table client_interaction (
    interaction_id uuid not null default gen_random_uuid(),
    client_id uuid not null,
    sales_id uuid not null,
    date date not null default CURRENT_DATE,
    note text not null,
    primary key (interaction_id)
);

-- reconstructed (best-effort) from information_schema
create table conversion_rate (
    rate_id uuid not null default gen_random_uuid(),
    month date not null,
    rate_php_eur numeric(10,4) not null,
    set_by uuid,
    set_date date not null default CURRENT_DATE,
    primary key (rate_id)
);

-- reconstructed (best-effort) from information_schema
create table course (
    course_id uuid not null default gen_random_uuid(),
    course_name text not null,
    standard text,
    category text,
    training_type training_type_t not null,
    active boolean not null default true,
    url text,
    country country_t not null default 'PH'::country_t,
    primary key (course_id)
);

-- reconstructed (best-effort) from information_schema
create table course_fee (
    fee_id uuid not null default gen_random_uuid(),
    course_id uuid not null,
    modality modality_t not null,
    fee_php numeric(12,2) not null,
    effective_date date not null default CURRENT_DATE,
    primary key (fee_id)
);

-- reconstructed (best-effort) from information_schema
create table duplicate_candidate (
    candidate_id uuid not null default gen_random_uuid(),
    order_id_a text not null,
    order_id_b text not null,
    match_basis text not null,
    status dup_status_t not null default 'Open'::dup_status_t,
    resolved_by uuid,
    resolved_date date,
    primary key (candidate_id)
);

-- reconstructed (best-effort) from information_schema
create table import_exception (
    exception_id uuid not null default gen_random_uuid(),
    source text not null,
    reason text not null,
    raw jsonb not null,
    resolved boolean not null default false,
    created_at timestamp with time zone not null default now(),
    primary key (exception_id)
);

-- reconstructed (best-effort) from information_schema
create table inquiry (
    inquiry_id uuid not null default gen_random_uuid(),
    inquiry_date date not null default CURRENT_DATE,
    sales_id uuid not null,
    course_id uuid,
    company text,
    contact text,
    email text,
    phone text,
    offering_type offering_t not null default 'Public'::offering_t,
    pax integer,
    status inquiry_status_t not null default 'Received'::inquiry_status_t,
    converted_order_id text,
    primary key (inquiry_id)
);

-- reconstructed (best-effort) from information_schema
create table normalization_lookup (
    field text not null,
    raw_value text not null,
    canonical_value text not null,
    primary key (field, raw_value)
);

-- reconstructed (best-effort) from information_schema
create table order_assignment (
    order_id text not null,
    sales_id uuid not null,
    assigned_date date not null default CURRENT_DATE,
    engagement_status engagement_t,
    collection_status collection_t not null default 'Pending'::collection_t,
    reassigned_from uuid,
    updated_at timestamp with time zone not null default now(),
    primary key (order_id)
);

-- reconstructed (best-effort) from information_schema
create table order_disposition (
    disposition_id uuid not null default gen_random_uuid(),
    order_id text not null,
    schedule_id uuid,
    action text not null,
    target_schedule_id uuid,
    note text,
    decided_by uuid,
    created_at timestamp with time zone not null default now(),
    primary key (disposition_id)
);

-- reconstructed (best-effort) from information_schema
create table order_line (
    line_id uuid not null default gen_random_uuid(),
    order_id text not null,
    line_no integer not null default 1,
    course_id uuid,
    schedule_id uuid,
    modality modality_t not null,
    seats integer not null default 1,
    amount_php numeric(14,2) not null default 0,
    went_live went_live_t not null default 'Not Yet'::went_live_t,
    access_status access_status_t,
    access_granted_date date,
    line_status order_status_t not null default 'New'::order_status_t,
    created_at timestamp with time zone not null default now(),
    primary key (line_id)
);

-- reconstructed (best-effort) from information_schema
create table orders (
    order_id text not null,
    sap_order_no text,
    order_date date not null,
    channel channel_t not null,
    created_by uuid,
    webshop_product_id uuid,
    schedule_id uuid,
    client_id uuid,
    went_live went_live_t not null default 'Not Yet'::went_live_t,
    modality modality_t not null,
    seats integer not null default 1,
    amount_php numeric(14,2) not null default 0,
    amount_eur numeric(14,2),
    payment_status payment_status_t not null default 'Unpaid'::payment_status_t,
    order_status order_status_t not null default 'New'::order_status_t,
    course_id uuid,
    access_status access_status_t,
    access_granted_date date,
    created_at timestamp with time zone not null default now(),
    fulfillment_stage fulfillment_stage_t not null default 'New'::fulfillment_stage_t,
    stage_changed_at timestamp with time zone not null default now(),
    total_seats integer not null default 0,
    total_amount numeric(14,2) not null default 0,
    country country_t not null default 'PH'::country_t,
    currency text not null default 'PHP'::text,
    primary key (order_id)
);

-- reconstructed (best-effort) from information_schema
create table participant (
    participant_id uuid not null default gen_random_uuid(),
    order_id text not null,
    schedule_id uuid,
    full_name text not null,
    email text,
    position_title text,
    attendance_status text not null default 'Registered'::text,
    cert_number text,
    cert_issued_date date,
    created_by uuid,
    created_at timestamp with time zone not null default now(),
    line_id uuid,
    primary key (participant_id)
);

-- reconstructed (best-effort) from information_schema
create table profiles (
    user_id uuid not null,
    full_name text not null,
    role user_role not null,
    sales_id uuid,
    created_at timestamp with time zone not null default now(),
    primary key (user_id)
);

-- reconstructed (best-effort) from information_schema
create table salesperson (
    sales_id uuid not null default gen_random_uuid(),
    name text not null,
    code text,
    team text,
    region text,
    is_supervisor boolean not null default false,
    active boolean not null default true,
    primary key (sales_id)
);

-- reconstructed (best-effort) from information_schema
create table schedule (
    schedule_id uuid not null default gen_random_uuid(),
    course_id uuid not null,
    year_id uuid not null,
    month text,
    start_date date not null,
    end_date date not null,
    modality modality_t not null,
    private_run boolean not null default false,
    price numeric(12,2),
    forecast_revenue numeric(14,2),
    forecast_participants integer,
    forecast_by uuid,
    min_participants integer not null default 0,
    booked_participants integer not null default 0,
    status schedule_status_t not null default 'Tentative'::schedule_status_t,
    go_status go_status_t not null default 'No-Go'::go_status_t,
    operations_owner uuid,
    sales_owner uuid,
    actual_participants integer,
    actual_revenue numeric(14,2),
    duration_days integer,
    webshop_product_id uuid,
    date_segments jsonb,
    max_participants integer,
    roster_locked boolean not null default false,
    closed_at timestamp with time zone,
    closed_by uuid,
    trainer_id uuid,
    venue_id uuid,
    country country_t not null default 'PH'::country_t,
    primary key (schedule_id)
);

-- reconstructed (best-effort) from information_schema
create table schema_migrations (
    version text not null,
    applied_at timestamp with time zone not null default now(),
    note text,
    primary key (version)
);

-- reconstructed (best-effort) from information_schema
create table session_note (
    note_id uuid not null default gen_random_uuid(),
    schedule_id uuid not null,
    author uuid not null,
    date timestamp with time zone not null default now(),
    note text not null,
    primary key (note_id)
);

-- reconstructed (best-effort) from information_schema
create table staging_calendar (
    created_in_webshop text,
    status text,
    month text,
    date_text text,
    time_text text,
    course_title text,
    fee_a text,
    fee_b text,
    min_pax text,
    sales text,
    marketing text,
    remarks text,
    sales_forecast text,
    actual_pax text,
    actual_sales text,
    days text,
    webshop_link text,
    loaded_at timestamp with time zone not null default now()
);

-- reconstructed (best-effort) from information_schema
create table staging_order_booking (
    wb_order_id text,
    year integer,
    month text,
    order_date text,
    assigned_to text,
    status text,
    sap_order_no text,
    company_name text,
    point_person text,
    email text,
    phone text,
    address text,
    training_name text,
    training_date text,
    modality text,
    no_of_pax text,
    order_amt text,
    went_live text,
    comments text,
    loaded_at timestamp with time zone not null default now()
);

-- reconstructed (best-effort) from information_schema
create table trainer (
    trainer_id uuid not null default gen_random_uuid(),
    name text not null,
    code text,
    email text,
    phone text,
    trainer_type text not null default 'Internal'::text,
    daily_rate numeric(12,2),
    active boolean not null default true,
    notes text,
    created_at timestamp with time zone not null default now(),
    country country_t not null default 'PH'::country_t,
    primary key (trainer_id)
);

-- reconstructed (best-effort) from information_schema
create table trainer_course (
    trainer_id uuid not null,
    course_id uuid not null,
    primary key (trainer_id, course_id)
);

-- reconstructed (best-effort) from information_schema
create table venue (
    venue_id uuid not null default gen_random_uuid(),
    name text not null,
    address text,
    city text,
    capacity integer,
    venue_type text not null default 'Training Room'::text,
    day_rate numeric(12,2),
    active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    country country_t not null default 'PH'::country_t,
    primary key (venue_id)
);

-- reconstructed (best-effort) from information_schema
create table webshop_product (
    product_id uuid not null default gen_random_uuid(),
    course_id uuid not null,
    modality modality_t not null,
    url text not null,
    primary key (product_id)
);

-- foreign keys
alter table approval add constraint approval_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(user_id);
alter table approval add constraint approval_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(user_id);
alter table approval add constraint approval_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedule(schedule_id);
alter table assignment_log add constraint assignment_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id);
alter table assignment_log add constraint assignment_log_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES salesperson(sales_id);
alter table attribution add constraint attribution_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES salesperson(sales_id);
alter table attribution add constraint attribution_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedule(schedule_id);
alter table client add constraint client_owner_sales_id_fkey FOREIGN KEY (owner_sales_id) REFERENCES salesperson(sales_id);
alter table client_interaction add constraint client_interaction_client_id_fkey FOREIGN KEY (client_id) REFERENCES client(client_id);
alter table client_interaction add constraint client_interaction_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES salesperson(sales_id);
alter table conversion_rate add constraint conversion_rate_set_by_fkey FOREIGN KEY (set_by) REFERENCES profiles(user_id);
alter table course_fee add constraint course_fee_course_id_fkey FOREIGN KEY (course_id) REFERENCES course(course_id);
alter table duplicate_candidate add constraint duplicate_candidate_order_id_a_fkey FOREIGN KEY (order_id_a) REFERENCES orders(order_id);
alter table duplicate_candidate add constraint duplicate_candidate_order_id_b_fkey FOREIGN KEY (order_id_b) REFERENCES orders(order_id);
alter table duplicate_candidate add constraint duplicate_candidate_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES salesperson(sales_id);
alter table inquiry add constraint inquiry_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES orders(order_id);
alter table inquiry add constraint inquiry_course_id_fkey FOREIGN KEY (course_id) REFERENCES course(course_id);
alter table inquiry add constraint inquiry_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES salesperson(sales_id);
alter table order_assignment add constraint order_assignment_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id);
alter table order_assignment add constraint order_assignment_reassigned_from_fkey FOREIGN KEY (reassigned_from) REFERENCES salesperson(sales_id);
alter table order_assignment add constraint order_assignment_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES salesperson(sales_id);
alter table order_disposition add constraint order_disposition_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;
alter table order_disposition add constraint order_disposition_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedule(schedule_id);
alter table order_disposition add constraint order_disposition_target_schedule_id_fkey FOREIGN KEY (target_schedule_id) REFERENCES schedule(schedule_id);
alter table order_line add constraint order_line_course_id_fkey FOREIGN KEY (course_id) REFERENCES course(course_id);
alter table order_line add constraint order_line_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;
alter table order_line add constraint order_line_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedule(schedule_id);
alter table orders add constraint orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES client(client_id);
alter table orders add constraint orders_course_id_fkey FOREIGN KEY (course_id) REFERENCES course(course_id);
alter table orders add constraint orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(user_id);
alter table orders add constraint orders_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedule(schedule_id);
alter table orders add constraint orders_webshop_product_id_fkey FOREIGN KEY (webshop_product_id) REFERENCES webshop_product(product_id);
alter table participant add constraint participant_line_id_fkey FOREIGN KEY (line_id) REFERENCES order_line(line_id) ON DELETE CASCADE;
alter table participant add constraint participant_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;
alter table participant add constraint participant_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedule(schedule_id);
alter table profiles add constraint profiles_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES salesperson(sales_id);
alter table schedule add constraint fk_schedule_product FOREIGN KEY (webshop_product_id) REFERENCES webshop_product(product_id);
alter table schedule add constraint schedule_course_id_fkey FOREIGN KEY (course_id) REFERENCES course(course_id);
alter table schedule add constraint schedule_forecast_by_fkey FOREIGN KEY (forecast_by) REFERENCES profiles(user_id);
alter table schedule add constraint schedule_operations_owner_fkey FOREIGN KEY (operations_owner) REFERENCES profiles(user_id);
alter table schedule add constraint schedule_sales_owner_fkey FOREIGN KEY (sales_owner) REFERENCES salesperson(sales_id);
alter table schedule add constraint schedule_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer(trainer_id);
alter table schedule add constraint schedule_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venue(venue_id);
alter table schedule add constraint schedule_year_id_fkey FOREIGN KEY (year_id) REFERENCES calendar_year(year_id);
alter table session_note add constraint session_note_author_fkey FOREIGN KEY (author) REFERENCES profiles(user_id);
alter table session_note add constraint session_note_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedule(schedule_id);
alter table trainer_course add constraint trainer_course_course_id_fkey FOREIGN KEY (course_id) REFERENCES course(course_id) ON DELETE CASCADE;
alter table trainer_course add constraint trainer_course_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer(trainer_id) ON DELETE CASCADE;
alter table webshop_product add constraint webshop_product_course_id_fkey FOREIGN KEY (course_id) REFERENCES course(course_id);

-- ===== SECTION 3: FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.fn_cancel_schedule(p_schedule uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(out_order_id text, out_company text, out_seats integer, out_action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role user_role; v_pending int; v_total int; r record;
begin
  select role into v_role from profiles where user_id = auth.uid();
  if v_role not in ('operations','super_admin') then
    raise exception 'Only operations or the super admin can cancel a session';
  end if;
  if not exists (select 1 from approval a where a.object_type='Schedule cancellation'
                  and a.schedule_id=p_schedule and a.decision='Approved') then
    raise exception 'No approved cancellation for this session. The business owner decides first.';
  end if;

  select count(*) filter (where cr.action is null), count(*) into v_pending, v_total
    from v_cancel_readiness cr where cr.schedule_id = p_schedule;
  if v_pending > 0 then
    raise exception '% of % booking(s) have no disposition. Set transfer, refund, or credit on each before cancelling.',
      v_pending, v_total;
  end if;

  for r in select cr.line_id, cr.target_schedule_id from v_cancel_readiness cr
            where cr.schedule_id = p_schedule and cr.action = 'Transfer' and cr.target_schedule_id is not null
  loop
    perform fn_transfer_line(r.line_id, r.target_schedule_id, coalesce('Session cancelled. '||p_reason,'Session cancelled.'));
  end loop;

  update order_line l set line_status='Cancelled', went_live='Cancelled'
    from v_cancel_readiness cr
   where cr.line_id = l.line_id and cr.schedule_id = p_schedule
     and cr.action in ('Refund','Credit','No Action');

  update participant p set attendance_status='Transferred' where p.schedule_id = p_schedule;
  update schedule set status='Cancelled' where schedule_id = p_schedule;

  insert into session_note (schedule_id, author, note)
  values (p_schedule, auth.uid(), format('Session cancelled. %s booking(s) dispositioned. %s', v_total, coalesce(p_reason,'')));

  return query
    select d.order_id::text, cl.company::text, o.total_seats, d.action::text
      from order_disposition d
      join orders o on o.order_id = d.order_id
      left join client cl on cl.client_id = o.client_id
     where d.schedule_id = p_schedule;
end $function$


CREATE OR REPLACE FUNCTION public.fn_capacity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_max int; v_taken int; v_name text;
begin
  if new.schedule_id is null or new.line_status in ('Cancelled','Waitlist') then return new; end if;
  select s.max_participants, c.course_name into v_max, v_name
    from schedule s join course c on c.course_id = s.course_id
   where s.schedule_id = new.schedule_id;
  if v_max is null then return new; end if;
  select coalesce(sum(l.seats), 0) into v_taken
    from order_line l
   where l.schedule_id = new.schedule_id
     and l.line_status in ('New','Confirmed','Completed')
     and (tg_op = 'INSERT' or l.line_id <> new.line_id);
  if v_taken + new.seats > v_max then
    raise exception 'Session is full: % of % seats taken on %. Waitlist this line or pick another session.',
      v_taken, v_max, v_name;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.fn_close_session(p_schedule uuid, p_force boolean DEFAULT false)
 RETURNS TABLE(attended integer, revenue numeric, unpaid integer, warning text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role user_role; v_status schedule_status_t;
  v_attended int; v_seats int; v_rev numeric; v_unpaid int; v_unmarked int; v_warn text;
begin
  select role into v_role from profiles where user_id = auth.uid();
  if v_role not in ('operations','super_admin') then
    raise exception 'Only operations or the super admin can close a session';
  end if;
  select status into v_status from schedule where schedule_id = p_schedule;
  if not found then raise exception 'Session not found'; end if;
  if v_status = 'Cancelled' then raise exception 'A cancelled session cannot be closed'; end if;
  if v_status = 'Completed' then raise exception 'This session is already closed'; end if;

  select seats_sold, revenue_booked, unpaid_orders, attendance_unmarked
    into v_seats, v_rev, v_unpaid, v_unmarked
    from v_session_close_check where schedule_id = p_schedule;

  if v_unmarked > 0 and not p_force then
    raise exception '% participant(s) still marked Registered. Mark attendance first, or close with force.', v_unmarked;
  end if;

  select count(*) into v_attended from participant
   where schedule_id = p_schedule and attendance_status = 'Attended';
  if (select count(*) from participant where schedule_id = p_schedule) = 0 then
    v_attended := v_seats;
    v_warn := 'No roster captured. Actual participants taken from seats sold.';
  end if;

  update schedule set status='Completed', actual_participants=v_attended, actual_revenue=v_rev,
         roster_locked=true, closed_at=now(), closed_by=auth.uid()
   where schedule_id = p_schedule;

  update order_line set line_status='Completed', went_live='Yes'
   where schedule_id = p_schedule and line_status in ('New','Confirmed');

  update order_assignment oa set collection_status='Pending'
   from order_line l join orders o on o.order_id = l.order_id
   where oa.order_id = o.order_id and l.schedule_id = p_schedule
     and o.payment_status <> 'Paid' and oa.collection_status is null;

  insert into session_note (schedule_id, author, note)
  values (p_schedule, auth.uid(),
    format('Session closed. %s attended, %s recorded, %s line(s) awaiting collection.%s',
      v_attended, to_char(v_rev,'FM999,999,999.00'), v_unpaid, case when v_warn is null then '' else ' '||v_warn end));

  return query select v_attended, v_rev, v_unpaid, v_warn;
end $function$


CREATE OR REPLACE FUNCTION public.fn_conflict_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_type text; v_other text; v_day date; v_role user_role;
begin
  if new.status in ('Cancelled','Completed') then return new; end if;
  if new.trainer_id is null and new.venue_id is null then return new; end if;

  select conflict_type, course_name, clash_day
    into v_type, v_other, v_day
    from fn_find_conflicts(new.schedule_id, new.trainer_id, new.venue_id,
                           new.start_date, new.end_date, new.date_segments)
   limit 1;

  if v_type is not null then
    raise exception '% already booked on % for "%". Pick another % or change the dates.',
      v_type, to_char(v_day, 'DD Mon YYYY'), v_other, lower(v_type);
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.fn_country_inherit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.country is null then
    select country into new.country from course where course_id = new.course_id;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.fn_current_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select role from profiles where user_id = auth.uid() $function$


CREATE OR REPLACE FUNCTION public.fn_current_sales_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select sales_id from profiles where user_id = auth.uid() $function$


CREATE OR REPLACE FUNCTION public.fn_detect_duplicates()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int;
begin
  insert into duplicate_candidate (order_id_a, order_id_b, match_basis)
  select a.order_id, b.order_id,
         case when ca.email is not null and ca.email = cb.email then 'email'
              else 'company + schedule' end
  from orders a
  join client ca on ca.client_id = a.client_id
  join orders b on b.channel = 'Webshop'
   and b.order_id <> a.order_id
  join client cb on cb.client_id = b.client_id
  where a.channel in ('Inside Sales','Field Sales')
    and (
      (ca.email is not null and ca.email = cb.email)
      or (ca.company is not null and ca.company = cb.company
          and a.schedule_id is not null and a.schedule_id = b.schedule_id)
    )
  on conflict (order_id_a, order_id_b) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $function$


CREATE OR REPLACE FUNCTION public.fn_find_conflicts(p_schedule uuid, p_trainer uuid, p_venue uuid, p_start date, p_end date, p_segments jsonb)
 RETURNS TABLE(conflict_type text, other_schedule uuid, course_name text, clash_day date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (select d from fn_span_days(p_start, p_end, p_segments) d)
  select 'Trainer'::text, s.schedule_id, c.course_name, m.d
    from schedule s
    join course c on c.course_id = s.course_id
    join mine m on m.d in (select fn_schedule_days(s.schedule_id))
   where p_trainer is not null and s.trainer_id = p_trainer
     and s.status not in ('Cancelled','Completed')
     and (p_schedule is null or s.schedule_id <> p_schedule)
  union all
  select 'Venue'::text, s.schedule_id, c.course_name, m.d
    from schedule s
    join course c on c.course_id = s.course_id
    join mine m on m.d in (select fn_schedule_days(s.schedule_id))
   where p_venue is not null and s.venue_id = p_venue
     and s.status not in ('Cancelled','Completed')
     and (p_schedule is null or s.schedule_id <> p_schedule)
   order by 4, 1;
$function$


CREATE OR REPLACE FUNCTION public.fn_grant_elearning_access(p_order text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(fn_current_role() in ('operations','super_admin'), false) is not true then
    raise exception 'access granting is limited to operations';
  end if;
  update orders set access_status = 'Granted', access_granted_date = current_date
  where order_id = p_order and modality = 'E-learning';
end $function$


CREATE OR REPLACE FUNCTION public.fn_is_supervisor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select is_supervisor from salesperson
                    where sales_id = fn_current_sales_id()), false) $function$


CREATE OR REPLACE FUNCTION public.fn_nightly_hygiene()
 RETURNS TABLE(action text, affected integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n1 int; n2 int; n3 int;
begin
  -- sessions whose last training day has passed move to Running/Completed
  update schedule set status = 'Completed'
   where status in ('Tentative','Confirmed')
     and end_date < current_date - 1;
  get diagnostics n1 = row_count;

  update schedule set status = 'Running'
   where status = 'Confirmed'
     and start_date <= current_date and end_date >= current_date;
  get diagnostics n2 = row_count;

  -- orders quiet for 30 days in an early stage get flagged, not deleted
  update orders set fulfillment_stage = 'No Feedback'
   where fulfillment_stage in ('New','In Communication')
     and stage_changed_at < now() - interval '30 days'
     and order_status <> 'Cancelled';
  get diagnostics n3 = row_count;

  return query
    select 'sessions closed'::text, n1
    union all select 'sessions running', n2
    union all select 'orders flagged no feedback', n3;
end $function$


CREATE OR REPLACE FUNCTION public.fn_order_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order text;
begin
  v_order := coalesce(new.order_id, old.order_id);
  update orders o set
    total_seats  = coalesce((select sum(seats) from order_line l
                              where l.order_id = v_order and l.line_status <> 'Cancelled'), 0),
    total_amount = coalesce((select sum(amount_php) from order_line l
                              where l.order_id = v_order and l.line_status <> 'Cancelled'), 0)
  where o.order_id = v_order;
  return coalesce(new, old);
end $function$


CREATE OR REPLACE FUNCTION public.fn_participant_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.line_id is not null and new.schedule_id is null then
    select schedule_id into new.schedule_id from order_line where line_id = new.line_id;
  elsif new.schedule_id is null then
    select schedule_id into new.schedule_id from order_line
     where order_id = new.order_id order by line_no limit 1;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.fn_reopen_session(p_schedule uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (select role from profiles where user_id = auth.uid()) is distinct from 'super_admin' then
    raise exception 'Only the super admin can reopen a closed session';
  end if;
  update schedule set status = 'Confirmed', roster_locked = false, closed_at = null, closed_by = null
   where schedule_id = p_schedule and status = 'Completed';
  insert into session_note (schedule_id, author, note)
  values (p_schedule, auth.uid(), format('Session reopened. %s', coalesce(p_reason, '')));
end $function$


CREATE OR REPLACE FUNCTION public.fn_rollover_copy(p_from_year integer, p_to_year integer, p_shift_days integer DEFAULT 364)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_from uuid; v_to uuid; v_count int;
begin
  if coalesce(fn_current_role() in ('operations','super_admin'), false) is not true then
    raise exception 'rollover is limited to operations and the super admin';
  end if;
  select year_id into v_from from calendar_year where year = p_from_year;
  insert into calendar_year (year, mode) values (p_to_year, 'Copy')
  on conflict (year) do update set mode = 'Copy'
  returning year_id into v_to;
  insert into schedule (course_id, year_id, month, start_date, end_date, modality,
                        private_run, min_participants, status, operations_owner, sales_owner)
  select course_id, v_to, month, start_date + p_shift_days, end_date + p_shift_days,
         modality, private_run, min_participants, 'Tentative', operations_owner, sales_owner
  from schedule where year_id = v_from and status <> 'Cancelled';
  get diagnostics v_count = row_count;
  update calendar_year set status = 'Archived' where year_id = v_from;
  return v_count;
end $function$


CREATE OR REPLACE FUNCTION public.fn_rollup_schedule(p_schedule uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update schedule s set
    booked_participants = coalesce((
      select sum(o.seats) from orders o
      where o.schedule_id = p_schedule and o.order_status in ('New','Confirmed','Completed')
    ), 0)
  where s.schedule_id = p_schedule;
  update schedule s set
    go_status = case when s.booked_participants >= s.min_participants and s.min_participants > 0
                     then 'Go'::go_status_t else 'No-Go'::go_status_t end
  where s.schedule_id = p_schedule;
end $function$


CREATE OR REPLACE FUNCTION public.fn_roster_lock_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_locked boolean; v_role user_role;
begin
  select roster_locked into v_locked from schedule
   where schedule_id = coalesce(new.schedule_id, old.schedule_id);
  if coalesce(v_locked, false) then
    select role into v_role from profiles where user_id = auth.uid();
    if v_role is distinct from 'super_admin' then
      raise exception 'This session is closed and its roster is locked. Ask the super admin to reopen it.';
    end if;
  end if;
  return coalesce(new, old);
end $function$


CREATE OR REPLACE FUNCTION public.fn_schedule_days(p_schedule uuid)
 RETURNS SETOF date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d::date
    from schedule s
    cross join lateral (
      select case
        when s.date_segments is null or jsonb_array_length(s.date_segments) = 0
          then array(select generate_series(s.start_date, s.end_date, interval '1 day')::date)
        else array(
          select generate_series((seg->>'start')::date, (seg->>'end')::date, interval '1 day')::date
            from jsonb_array_elements(s.date_segments) seg
        )
      end as days
    ) x
    cross join lateral unnest(x.days) d
   where s.schedule_id = p_schedule;
$function$


CREATE OR REPLACE FUNCTION public.fn_schedule_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ids uuid[]; v_id uuid;
begin
  v_ids := array_remove(array[new.schedule_id, old.schedule_id], null);
  foreach v_id in array v_ids loop
    update schedule s set
      booked_participants = coalesce((
        select sum(l.seats) from order_line l
         where l.schedule_id = v_id and l.line_status in ('New','Confirmed','Completed')
      ), 0)
    where s.schedule_id = v_id;
    update schedule s set
      go_status = (case when s.booked_participants >= s.min_participants then 'Go' else 'No-Go' end)::go_status_t
    where s.schedule_id = v_id;
  end loop;
  return coalesce(new, old);
end $function$


CREATE OR REPLACE FUNCTION public.fn_session_roster(p_schedule uuid)
 RETURNS TABLE(participant_id uuid, full_name text, email text, position_title text, company text, order_id text, channel channel_t, seats integer, payment_status payment_status_t, attendance_status text, cert_number text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.participant_id, p.full_name, p.email, p.position_title,
         cl.company, o.order_id, o.channel, l.seats, o.payment_status,
         p.attendance_status, p.cert_number
    from participant p
    join order_line l on l.line_id = p.line_id
    join orders o on o.order_id = l.order_id
    left join client cl on cl.client_id = o.client_id
   where p.schedule_id = p_schedule and l.line_status <> 'Cancelled'
   order by cl.company nulls last, p.full_name;
$function$


CREATE OR REPLACE FUNCTION public.fn_set_forecast(p_schedule uuid, p_revenue numeric, p_pax integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(fn_current_role() in ('business_owner','super_admin'), false) is not true then
    raise exception 'forecast setting is limited to the business owner';
  end if;
  update schedule set forecast_revenue = p_revenue,
                      forecast_participants = p_pax,
                      forecast_by = auth.uid()
  where schedule_id = p_schedule;
end $function$


CREATE OR REPLACE FUNCTION public.fn_span_days(p_start date, p_end date, p_segments jsonb)
 RETURNS SETOF date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select d::date from (
    select case
      when p_segments is null or jsonb_array_length(p_segments) = 0
        then array(select generate_series(p_start, p_end, interval '1 day')::date)
      else array(
        select generate_series((seg->>'start')::date, (seg->>'end')::date, interval '1 day')::date
          from jsonb_array_elements(p_segments) seg
      )
    end as days
  ) x cross join lateral unnest(x.days) d;
$function$


CREATE OR REPLACE FUNCTION public.fn_stage_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.fulfillment_stage is distinct from old.fulfillment_stage then
    new.stage_changed_at := now();
  end if;
  -- entering a real SAP number advances the stage on its own
  if new.sap_order_no is distinct from old.sap_order_no
     and new.sap_order_no ~ '^[0-9]{4,}$'
     and new.fulfillment_stage <> 'SAP Created' then
    new.fulfillment_stage := 'SAP Created';
    new.stage_changed_at := now();
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.fn_transfer_line(p_line uuid, p_new_schedule uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role user_role; v_old uuid; v_seats int; v_order text;
  v_max int; v_taken int; v_oldname text; v_newname text;
begin
  select role into v_role from profiles where user_id = auth.uid();
  if v_role is null then raise exception 'Not allowed to transfer'; end if;

  select schedule_id, seats, order_id into v_old, v_seats, v_order from order_line where line_id = p_line;
  if v_order is null then raise exception 'Order line not found'; end if;
  if v_old = p_new_schedule then raise exception 'This line is already on that session'; end if;

  if (select status from schedule where schedule_id = p_new_schedule) not in ('Tentative','Confirmed') then
    raise exception 'Target session is not open for bookings';
  end if;
  select max_participants into v_max from schedule where schedule_id = p_new_schedule;
  if v_max is not null then
    select coalesce(sum(seats),0) into v_taken from order_line
     where schedule_id = p_new_schedule and line_status in ('New','Confirmed','Completed');
    if v_taken + v_seats > v_max then
      raise exception 'Target session has % of % seats taken, needs % more', v_taken, v_max, v_seats;
    end if;
  end if;

  update order_line set schedule_id = p_new_schedule, went_live = 'Reschedule' where line_id = p_line;
  update participant set schedule_id = p_new_schedule where line_id = p_line;

  select c.course_name into v_oldname from schedule s join course c on c.course_id=s.course_id where s.schedule_id=v_old;
  select c.course_name into v_newname from schedule s join course c on c.course_id=s.course_id where s.schedule_id=p_new_schedule;
  if v_old is not null then
    insert into session_note (schedule_id, author, note)
    values (v_old, auth.uid(), format('Order %s (%s seats) transferred out to %s. %s', v_order, v_seats, coalesce(v_newname,'another session'), coalesce(p_reason,'')));
  end if;
  insert into session_note (schedule_id, author, note)
  values (p_new_schedule, auth.uid(), format('Order %s (%s seats) transferred in from %s. %s', v_order, v_seats, coalesce(v_oldname,'no session'), coalesce(p_reason,'')));
end $function$


CREATE OR REPLACE FUNCTION public.fn_venue_capacity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cap int; v_name text;
begin
  if new.venue_id is null or new.max_participants is null then return new; end if;
  select capacity, name into v_cap, v_name from venue where venue_id = new.venue_id;
  if v_cap is not null and new.max_participants > v_cap then
    raise exception 'Maximum pax (%) exceeds % capacity of %.', new.max_participants, v_name, v_cap;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.fn_weekly_digest()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'generated_at', now(),
    'at_risk', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from v_digest_at_risk a),
    'stalled_orders', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from v_digest_stalled_orders s),
    'roster_gaps', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from v_digest_roster_gaps r),
    'elearning_waiting', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from v_digest_elearning_waiting e),
    'unstaffed', (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) from v_digest_unstaffed u),
    'totals', jsonb_build_object(
      'at_risk', (select count(*) from v_digest_at_risk),
      'stalled', (select count(*) from v_digest_stalled_orders),
      'roster_gaps', (select count(*) from v_digest_roster_gaps),
      'elearning_waiting', (select count(*) from v_digest_elearning_waiting),
      'unstaffed', (select count(*) from v_digest_unstaffed)
    )
  );
$function$


CREATE OR REPLACE FUNCTION public.trg_assignment_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into assignment_log (order_id, sales_id, action)
  values (new.order_id, new.sales_id, case when tg_op = 'INSERT' then 'assigned' else 'reassigned' end);
  if tg_op = 'UPDATE' and old.sales_id is distinct from new.sales_id then
    new.reassigned_from := old.sales_id;
  end if;
  new.updated_at := now();
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.trg_cancel_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'Cancelled' and old.status is distinct from 'Cancelled' then
    if not exists (
      select 1 from approval a
      where a.object_type = 'Schedule cancellation'
        and a.schedule_id = new.schedule_id
        and a.decision = 'Approved'
    ) then
      raise exception 'AP-04: schedule % has no approved cancellation', new.schedule_id;
    end if;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.trg_orders_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op in ('INSERT','UPDATE') and new.schedule_id is not null then
    perform fn_rollup_schedule(new.schedule_id);
  end if;
  if tg_op in ('UPDATE','DELETE') and old.schedule_id is not null
     and (tg_op = 'DELETE' or old.schedule_id is distinct from new.schedule_id) then
    perform fn_rollup_schedule(old.schedule_id);
  end if;
  return coalesce(new, old);
end $function$


CREATE OR REPLACE FUNCTION public.trg_schedule_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.price is null then
    select fee_php into new.price from course_fee
    where course_id = new.course_id and modality = new.modality
      and effective_date <= new.start_date
    order by effective_date desc limit 1;
  end if;
  new.duration_days := coalesce(new.duration_days, (new.end_date - new.start_date) + 1);
  return new;
end $function$


-- ===== SECTION 4: VIEWS =====
create or replace view v_at_risk_schedules as
 SELECT s.schedule_id,
    c.course_name,
    s.start_date,
    s.modality,
    s.status,
    s.min_participants,
    s.booked_participants,
    s.start_date - CURRENT_DATE AS days_to_start,
    s.booked_participants < s.min_participants AND (s.start_date - CURRENT_DATE) <= 14 AND (s.status = ANY (ARRAY['Tentative'::schedule_status_t, 'Confirmed'::schedule_status_t])) AS at_risk
   FROM schedule s
     JOIN course c ON c.course_id = s.course_id
  WHERE s.status = ANY (ARRAY['Tentative'::schedule_status_t, 'Confirmed'::schedule_status_t]);

create or replace view v_cancel_readiness as
 SELECT l.schedule_id,
    l.line_id,
    l.order_id,
    l.seats,
    l.amount_php,
    o.payment_status,
    cl.company,
    d.action,
    d.target_schedule_id
   FROM order_line l
     JOIN orders o ON o.order_id = l.order_id
     LEFT JOIN client cl ON cl.client_id = o.client_id
     LEFT JOIN LATERAL ( SELECT x.action,
            x.target_schedule_id
           FROM order_disposition x
          WHERE x.order_id = l.order_id AND x.schedule_id = l.schedule_id
          ORDER BY x.created_at DESC
         LIMIT 1) d ON true
  WHERE l.line_status <> ALL (ARRAY['Cancelled'::order_status_t, 'Completed'::order_status_t]);

create or replace view v_digest_at_risk as
 SELECT s.schedule_id,
    c.course_name,
    s.start_date,
    s.modality,
    s.country,
    s.booked_participants,
    s.min_participants,
    s.min_participants - s.booked_participants AS seats_needed,
    s.start_date - CURRENT_DATE AS days_out
   FROM schedule s
     JOIN course c ON c.course_id = s.course_id
  WHERE (s.status = ANY (ARRAY['Tentative'::schedule_status_t, 'Confirmed'::schedule_status_t])) AND s.start_date >= CURRENT_DATE AND s.start_date <= (CURRENT_DATE + 21) AND s.booked_participants < s.min_participants
  ORDER BY s.start_date;

create or replace view v_digest_elearning_waiting as
 SELECT l.line_id,
    o.order_id,
    cl.company,
    c.course_name,
    o.order_date,
    CURRENT_DATE - o.order_date AS days_waiting
   FROM order_line l
     JOIN orders o ON o.order_id = l.order_id
     LEFT JOIN client cl ON cl.client_id = o.client_id
     LEFT JOIN course c ON c.course_id = l.course_id
  WHERE l.modality = 'E-learning'::modality_t AND COALESCE(l.access_status::text, 'Pending'::text) <> 'Granted'::text AND o.payment_status = 'Paid'::payment_status_t
  ORDER BY o.order_date;

create or replace view v_digest_roster_gaps as
 SELECT s.schedule_id,
    c.course_name,
    s.start_date,
    g.seats_sold,
    g.names_captured,
    g.seats_sold - g.names_captured AS missing
   FROM schedule s
     JOIN course c ON c.course_id = s.course_id
     JOIN v_session_roster_gap g ON g.schedule_id = s.schedule_id
  WHERE (s.status = ANY (ARRAY['Tentative'::schedule_status_t, 'Confirmed'::schedule_status_t])) AND s.start_date >= CURRENT_DATE AND s.start_date <= (CURRENT_DATE + 14) AND g.seats_sold > g.names_captured
  ORDER BY s.start_date;

create or replace view v_digest_stalled_orders as
 SELECT order_id,
    company,
    fulfillment_stage,
    owner,
    total_amount,
    age_days,
    days_in_stage
   FROM v_fulfillment_queue q
  WHERE days_in_stage > 14 AND fulfillment_stage <> 'SAP Created'::fulfillment_stage_t
  ORDER BY days_in_stage DESC;

create or replace view v_digest_unstaffed as
 SELECT schedule_id,
    course_name,
    start_date,
    days_out
   FROM v_unstaffed_sessions u
  WHERE days_out <= 21
  ORDER BY days_out;

create or replace view v_elearning_pending_access as
 SELECT order_id,
    order_date,
    client_id,
    course_id,
    payment_status
   FROM orders o
  WHERE modality = 'E-learning'::modality_t AND payment_status = 'Paid'::payment_status_t AND COALESCE(access_status, 'Not Granted'::access_status_t) = 'Not Granted'::access_status_t;

create or replace view v_forecast_vs_actual as
 SELECT s.schedule_id,
    c.course_name,
    c.training_type,
    s.modality,
    s.start_date,
    cy.year,
    s.forecast_revenue,
    s.forecast_participants,
    s.booked_participants,
    COALESCE(booked.rev, 0::numeric) AS booked_revenue,
    s.actual_participants,
    s.actual_revenue
   FROM schedule s
     JOIN course c ON c.course_id = s.course_id
     JOIN calendar_year cy ON cy.year_id = s.year_id
     LEFT JOIN LATERAL ( SELECT sum(o.amount_php) AS rev
           FROM orders o
          WHERE o.schedule_id = s.schedule_id AND (o.order_status = ANY (ARRAY['New'::order_status_t, 'Confirmed'::order_status_t, 'Completed'::order_status_t]))) booked ON true;

create or replace view v_fulfillment_queue as
 SELECT o.order_id,
    o.order_date,
    o.channel,
    o.fulfillment_stage,
    o.sap_order_no,
    o.payment_status,
    o.total_seats,
    o.total_amount,
    CURRENT_DATE - o.order_date AS age_days,
    CURRENT_DATE - o.stage_changed_at::date AS days_in_stage,
    cl.company,
    cl.name AS contact,
    cl.email,
    sp.name AS owner,
    sp.code AS owner_code,
    ( SELECT count(*) AS count
           FROM order_line l
          WHERE l.order_id = o.order_id) AS lines
   FROM orders o
     LEFT JOIN client cl ON cl.client_id = o.client_id
     LEFT JOIN order_assignment oa ON oa.order_id = o.order_id
     LEFT JOIN salesperson sp ON sp.sales_id = oa.sales_id
  WHERE o.order_status <> 'Cancelled'::order_status_t AND o.fulfillment_stage <> 'Cancelled'::fulfillment_stage_t;

create or replace view v_open_duplicates as
 SELECT d.candidate_id,
    d.order_id_a,
    d.order_id_b,
    d.match_basis,
    d.status,
    d.resolved_by,
    d.resolved_date,
    oa.sales_id AS assigned_sales_id
   FROM duplicate_candidate d
     LEFT JOIN order_assignment oa ON oa.order_id = d.order_id_a
  WHERE d.status = 'Open'::dup_status_t;

create or replace view v_order_fact as
 SELECT o.order_id,
    o.order_date,
    date_trunc('month'::text, o.order_date::timestamp with time zone)::date AS order_month,
    o.channel,
    o.modality,
    o.seats,
    o.amount_php,
    o.amount_php / NULLIF(cr.rate_php_eur, 0::numeric) AS amount_eur_calc,
    o.payment_status,
    o.order_status,
    co.course_id,
    co.course_name,
    co.category,
    co.training_type,
    s.schedule_id,
    s.start_date,
    cy.year,
    oa.sales_id,
    sp.name AS sales_name
   FROM orders o
     LEFT JOIN schedule s ON s.schedule_id = o.schedule_id
     LEFT JOIN calendar_year cy ON cy.year_id = s.year_id
     LEFT JOIN course co ON co.course_id = COALESCE(o.course_id, s.course_id)
     LEFT JOIN order_assignment oa ON oa.order_id = o.order_id
     LEFT JOIN salesperson sp ON sp.sales_id = oa.sales_id
     LEFT JOIN conversion_rate cr ON cr.month = date_trunc('month'::text, o.order_date::timestamp with time zone)::date;

create or replace view v_schedule_channel_pax as
 SELECT l.schedule_id,
    o.channel,
    sum(l.seats) AS pax
   FROM order_line l
     JOIN orders o ON o.order_id = l.order_id
  WHERE l.line_status = ANY (ARRAY['New'::order_status_t, 'Confirmed'::order_status_t, 'Completed'::order_status_t])
  GROUP BY l.schedule_id, o.channel;

create or replace view v_session_close_check as
 SELECT s.schedule_id,
    s.status,
    COALESCE(sum(l.seats) FILTER (WHERE l.line_status = ANY (ARRAY['New'::order_status_t, 'Confirmed'::order_status_t, 'Completed'::order_status_t])), 0::bigint) AS seats_sold,
    COALESCE(sum(l.amount_php) FILTER (WHERE l.line_status = ANY (ARRAY['New'::order_status_t, 'Confirmed'::order_status_t, 'Completed'::order_status_t])), 0::numeric) AS revenue_booked,
    count(l.line_id) FILTER (WHERE (l.line_status = ANY (ARRAY['New'::order_status_t, 'Confirmed'::order_status_t])) AND o.payment_status <> 'Paid'::payment_status_t) AS unpaid_orders,
    COALESCE(sum(l.amount_php) FILTER (WHERE (l.line_status = ANY (ARRAY['New'::order_status_t, 'Confirmed'::order_status_t])) AND o.payment_status <> 'Paid'::payment_status_t), 0::numeric) AS amount_uncollected,
    ( SELECT count(*) AS count
           FROM participant p
          WHERE p.schedule_id = s.schedule_id) AS names_captured,
    ( SELECT count(*) AS count
           FROM participant p
          WHERE p.schedule_id = s.schedule_id AND p.attendance_status = 'Registered'::text) AS attendance_unmarked
   FROM schedule s
     LEFT JOIN order_line l ON l.schedule_id = s.schedule_id
     LEFT JOIN orders o ON o.order_id = l.order_id
  GROUP BY s.schedule_id, s.status;

create or replace view v_session_roster_gap as
 SELECT s.schedule_id,
    COALESCE(sum(o.seats), 0::bigint) AS seats_sold,
    ( SELECT count(*) AS count
           FROM participant p
             JOIN orders po ON po.order_id = p.order_id
          WHERE p.schedule_id = s.schedule_id AND po.order_status <> 'Cancelled'::order_status_t) AS names_captured
   FROM schedule s
     LEFT JOIN orders o ON o.schedule_id = s.schedule_id AND (o.order_status = ANY (ARRAY['New'::order_status_t, 'Confirmed'::order_status_t, 'Completed'::order_status_t]))
  GROUP BY s.schedule_id;

create or replace view v_trainer_load as
 SELECT t.trainer_id,
    t.name,
    t.code,
    t.trainer_type,
    count(s.schedule_id) FILTER (WHERE s.status <> 'Cancelled'::schedule_status_t) AS sessions,
    COALESCE(sum(s.duration_days) FILTER (WHERE s.status <> 'Cancelled'::schedule_status_t), 0::bigint) AS training_days,
    count(s.schedule_id) FILTER (WHERE s.status = 'Completed'::schedule_status_t) AS delivered,
    min(s.start_date) FILTER (WHERE s.start_date >= CURRENT_DATE AND s.status <> 'Cancelled'::schedule_status_t) AS next_session
   FROM trainer t
     LEFT JOIN schedule s ON s.trainer_id = t.trainer_id
  WHERE t.active
  GROUP BY t.trainer_id, t.name, t.code, t.trainer_type;

create or replace view v_unstaffed_sessions as
 SELECT s.schedule_id,
    s.start_date,
    s.status,
    s.modality,
    c.course_name,
    s.start_date - CURRENT_DATE AS days_out
   FROM schedule s
     JOIN course c ON c.course_id = s.course_id
  WHERE (s.status = ANY (ARRAY['Tentative'::schedule_status_t, 'Confirmed'::schedule_status_t])) AND s.trainer_id IS NULL AND s.start_date >= CURRENT_DATE;

create or replace view v_venue_calendar as
 SELECT v.venue_id,
    v.name AS venue_name,
    v.capacity,
    v.city,
    s.schedule_id,
    s.start_date,
    s.end_date,
    s.date_segments,
    s.status,
    s.booked_participants,
    s.max_participants,
    c.course_name
   FROM venue v
     JOIN schedule s ON s.venue_id = v.venue_id
     JOIN course c ON c.course_id = s.course_id
  WHERE s.status <> 'Cancelled'::schedule_status_t;


-- ===== SECTION 5: TRIGGERS =====
CREATE TRIGGER t_assignment_log BEFORE INSERT OR UPDATE OF sales_id ON public.order_assignment FOR EACH ROW EXECUTE FUNCTION trg_assignment_log();
CREATE TRIGGER trg_capacity_guard_line BEFORE INSERT OR UPDATE OF seats, schedule_id, line_status ON public.order_line FOR EACH ROW EXECUTE FUNCTION fn_capacity_guard();
CREATE TRIGGER trg_order_totals AFTER INSERT OR DELETE OR UPDATE ON public.order_line FOR EACH ROW EXECUTE FUNCTION fn_order_totals();
CREATE TRIGGER trg_schedule_rollup_line AFTER INSERT OR DELETE OR UPDATE ON public.order_line FOR EACH ROW EXECUTE FUNCTION fn_schedule_rollup();
CREATE TRIGGER t_orders_rollup AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION trg_orders_rollup();
CREATE TRIGGER trg_stage_stamp BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION fn_stage_stamp();
CREATE TRIGGER trg_participant_sync BEFORE INSERT ON public.participant FOR EACH ROW EXECUTE FUNCTION fn_participant_sync();
CREATE TRIGGER trg_roster_lock BEFORE INSERT OR DELETE OR UPDATE ON public.participant FOR EACH ROW EXECUTE FUNCTION fn_roster_lock_guard();
CREATE TRIGGER t_cancel_guard BEFORE UPDATE ON public.schedule FOR EACH ROW EXECUTE FUNCTION trg_cancel_guard();
CREATE TRIGGER t_schedule_price BEFORE INSERT ON public.schedule FOR EACH ROW EXECUTE FUNCTION trg_schedule_price();
CREATE TRIGGER trg_conflict_guard BEFORE INSERT OR UPDATE OF trainer_id, venue_id, start_date, end_date, date_segments, status ON public.schedule FOR EACH ROW EXECUTE FUNCTION fn_conflict_guard();
CREATE TRIGGER trg_country_inherit BEFORE INSERT ON public.schedule FOR EACH ROW EXECUTE FUNCTION fn_country_inherit();
CREATE TRIGGER trg_venue_capacity BEFORE INSERT OR UPDATE OF venue_id, max_participants ON public.schedule FOR EACH ROW EXECUTE FUNCTION fn_venue_capacity_guard();

-- ===== SECTION 6: RLS POLICIES =====
create policy p_appr_i on approval for insert to authenticated
  with check ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'business_owner'::user_role, 'super_admin'::user_role])));
create policy p_appr_r on approval for select to authenticated
  using (true);
create policy p_appr_u on approval for update to authenticated
  using ((fn_current_role() = ANY (ARRAY['business_owner'::user_role, 'super_admin'::user_role])));
create policy p_alog_r on assignment_log for select to authenticated
  using (true);
create policy p_attr_r on attribution for select to authenticated
  using (true);
create policy p_attr_w on attribution for all to authenticated
  using (((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id()))))
  with check (((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id()))));
create policy p_year_r on calendar_year for select to authenticated
  using (true);
create policy p_year_w on calendar_year for all to authenticated
  using ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy p_client_i on client for insert to authenticated
  with check (((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (owner_sales_id = fn_current_sales_id()))));
create policy p_client_r on client for select to authenticated
  using (true);
create policy p_client_u on client for update to authenticated
  using (((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (owner_sales_id = fn_current_sales_id()))));
create policy p_ci_r on client_interaction for select to authenticated
  using (true);
create policy p_ci_w on client_interaction for insert to authenticated
  with check (((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id()))));
create policy p_rate_r on conversion_rate for select to authenticated
  using (true);
create policy p_rate_w on conversion_rate for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_course_r on course for select to authenticated
  using (true);
create policy p_course_w on course for all to authenticated
  using ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy p_fee_r on course_fee for select to authenticated
  using (true);
create policy p_fee_w on course_fee for all to authenticated
  using ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy p_dup_admin on duplicate_candidate for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_dup_r on duplicate_candidate for select to authenticated
  using (true);
create policy p_dup_sales_u on duplicate_candidate for update to authenticated
  using (((fn_current_role() = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM order_assignment oa
  WHERE ((oa.order_id = duplicate_candidate.order_id_a) AND (oa.sales_id = fn_current_sales_id()))))));
create policy p_exc_r on import_exception for select to authenticated
  using ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy p_exc_w on import_exception for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_inq_rw on inquiry for all to authenticated
  using (((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id()))))
  with check (((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id()))));
create policy p_norm_r on normalization_lookup for select to authenticated
  using (true);
create policy p_norm_w on normalization_lookup for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_asg_admin on order_assignment for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_asg_lead_i on order_assignment for insert to authenticated
  with check (((fn_current_role() = 'business_owner'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND fn_is_supervisor())));
create policy p_asg_lead_u on order_assignment for update to authenticated
  using (((fn_current_role() = 'business_owner'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND fn_is_supervisor())));
create policy p_asg_r on order_assignment for select to authenticated
  using (true);
create policy p_asg_sales_i on order_assignment for insert to authenticated
  with check (((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id())));
create policy p_asg_sales_u on order_assignment for update to authenticated
  using (((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id())));
create policy disposition_read on order_disposition for select to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL));
create policy disposition_write on order_disposition for all to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy order_line_read on order_line for select to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL));
create policy order_line_write_priv on order_line for all to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy order_line_write_sales on order_line for all to authenticated
  using (((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM order_assignment oa
  WHERE ((oa.order_id = order_line.order_id) AND (oa.sales_id = ( SELECT profiles.sales_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))))))
  with check (((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.order_id = order_line.order_id) AND (o.channel = ANY (ARRAY['Inside Sales'::channel_t, 'Field Sales'::channel_t, 'In-house Request'::channel_t])))))));
create policy p_orders_admin on orders for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_orders_r on orders for select to authenticated
  using (true);
create policy p_orders_sales_i on orders for insert to authenticated
  with check (((fn_current_role() = 'sales'::user_role) AND (channel = ANY (ARRAY['Inside Sales'::channel_t, 'Field Sales'::channel_t])) AND (created_by = auth.uid())));
create policy p_orders_sales_u on orders for update to authenticated
  using (((fn_current_role() = 'sales'::user_role) AND (created_by = auth.uid())));
create policy participant_read on participant for select to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL));
create policy participant_write_ops on participant for all to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy participant_write_sales on participant for all to authenticated
  using (((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM order_assignment oa
  WHERE ((oa.order_id = participant.order_id) AND (oa.sales_id = ( SELECT profiles.sales_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))))))
  with check (((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM order_assignment oa
  WHERE ((oa.order_id = participant.order_id) AND (oa.sales_id = ( SELECT profiles.sales_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid()))))))));
create policy p_profiles_admin on profiles for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_profiles_self on profiles for select to authenticated
  using (((user_id = auth.uid()) OR (fn_current_role() = 'super_admin'::user_role)));
create policy p_sales_r on salesperson for select to authenticated
  using (true);
create policy p_sales_w on salesperson for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_sched_r on schedule for select to authenticated
  using (true);
create policy p_sched_w on schedule for all to authenticated
  using ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy p_note_i on session_note for insert to authenticated
  with check ((author = auth.uid()));
create policy p_note_r on session_note for select to authenticated
  using (true);
create policy p_stg2 on staging_calendar for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy p_stg1 on staging_order_booking for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));
create policy trainer_read on trainer for select to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL));
create policy trainer_write on trainer for all to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy trainer_course_read on trainer_course for select to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL));
create policy trainer_course_write on trainer_course for all to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy venue_read on venue for select to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL));
create policy venue_write on venue for all to authenticated
  using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])))
  with check ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role])));
create policy p_product_r on webshop_product for select to authenticated
  using (true);
create policy p_product_w on webshop_product for all to authenticated
  using ((fn_current_role() = 'super_admin'::user_role))
  with check ((fn_current_role() = 'super_admin'::user_role));

-- ===== SECTION 6b: RLS POLICIES (readable reference) =====
/*
table approval | policy p_appr_i | cmd INSERT | roles {authenticated}
    CHECK: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'business_owner'::user_role, 'super_admin'::user_role]))
table approval | policy p_appr_r | cmd SELECT | roles {authenticated}
    USING: true
table approval | policy p_appr_u | cmd UPDATE | roles {authenticated}
    USING: (fn_current_role() = ANY (ARRAY['business_owner'::user_role, 'super_admin'::user_role]))
table assignment_log | policy p_alog_r | cmd SELECT | roles {authenticated}
    USING: true
table attribution | policy p_attr_r | cmd SELECT | roles {authenticated}
    USING: true
table attribution | policy p_attr_w | cmd ALL | roles {authenticated}
    USING: ((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id())))
    CHECK: ((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id())))
table calendar_year | policy p_year_r | cmd SELECT | roles {authenticated}
    USING: true
table calendar_year | policy p_year_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table client | policy p_client_i | cmd INSERT | roles {authenticated}
    CHECK: ((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (owner_sales_id = fn_current_sales_id())))
table client | policy p_client_r | cmd SELECT | roles {authenticated}
    USING: true
table client | policy p_client_u | cmd UPDATE | roles {authenticated}
    USING: ((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (owner_sales_id = fn_current_sales_id())))
table client_interaction | policy p_ci_r | cmd SELECT | roles {authenticated}
    USING: true
table client_interaction | policy p_ci_w | cmd INSERT | roles {authenticated}
    CHECK: ((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id())))
table conversion_rate | policy p_rate_r | cmd SELECT | roles {authenticated}
    USING: true
table conversion_rate | policy p_rate_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table course | policy p_course_r | cmd SELECT | roles {authenticated}
    USING: true
table course | policy p_course_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table course_fee | policy p_fee_r | cmd SELECT | roles {authenticated}
    USING: true
table course_fee | policy p_fee_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table duplicate_candidate | policy p_dup_admin | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table duplicate_candidate | policy p_dup_r | cmd SELECT | roles {authenticated}
    USING: true
table duplicate_candidate | policy p_dup_sales_u | cmd UPDATE | roles {authenticated}
    USING: ((fn_current_role() = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM order_assignment oa
  WHERE ((oa.order_id = duplicate_candidate.order_id_a) AND (oa.sales_id = fn_current_sales_id())))))
table import_exception | policy p_exc_r | cmd SELECT | roles {authenticated}
    USING: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table import_exception | policy p_exc_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table inquiry | policy p_inq_rw | cmd ALL | roles {authenticated}
    USING: ((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id())))
    CHECK: ((fn_current_role() = 'super_admin'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id())))
table normalization_lookup | policy p_norm_r | cmd SELECT | roles {authenticated}
    USING: true
table normalization_lookup | policy p_norm_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table order_assignment | policy p_asg_admin | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table order_assignment | policy p_asg_lead_i | cmd INSERT | roles {authenticated}
    CHECK: ((fn_current_role() = 'business_owner'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND fn_is_supervisor()))
table order_assignment | policy p_asg_lead_u | cmd UPDATE | roles {authenticated}
    USING: ((fn_current_role() = 'business_owner'::user_role) OR ((fn_current_role() = 'sales'::user_role) AND fn_is_supervisor()))
table order_assignment | policy p_asg_r | cmd SELECT | roles {authenticated}
    USING: true
table order_assignment | policy p_asg_sales_i | cmd INSERT | roles {authenticated}
    CHECK: ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id()))
table order_assignment | policy p_asg_sales_u | cmd UPDATE | roles {authenticated}
    USING: ((fn_current_role() = 'sales'::user_role) AND (sales_id = fn_current_sales_id()))
table order_disposition | policy disposition_read | cmd SELECT | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL)
table order_disposition | policy disposition_write | cmd ALL | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table order_line | policy order_line_read | cmd SELECT | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL)
table order_line | policy order_line_write_priv | cmd ALL | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table order_line | policy order_line_write_sales | cmd ALL | roles {authenticated}
    USING: ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM order_assignment oa
  WHERE ((oa.order_id = order_line.order_id) AND (oa.sales_id = ( SELECT profiles.sales_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())))))))
    CHECK: ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.order_id = order_line.order_id) AND (o.channel = ANY (ARRAY['Inside Sales'::channel_t, 'Field Sales'::channel_t, 'In-house Request'::channel_t]))))))
table orders | policy p_orders_admin | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table orders | policy p_orders_r | cmd SELECT | roles {authenticated}
    USING: true
table orders | policy p_orders_sales_i | cmd INSERT | roles {authenticated}
    CHECK: ((fn_current_role() = 'sales'::user_role) AND (channel = ANY (ARRAY['Inside Sales'::channel_t, 'Field Sales'::channel_t])) AND (created_by = auth.uid()))
table orders | policy p_orders_sales_u | cmd UPDATE | roles {authenticated}
    USING: ((fn_current_role() = 'sales'::user_role) AND (created_by = auth.uid()))
table participant | policy participant_read | cmd SELECT | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL)
table participant | policy participant_write_ops | cmd ALL | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table participant | policy participant_write_sales | cmd ALL | roles {authenticated}
    USING: ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM order_assignment oa
  WHERE ((oa.order_id = participant.order_id) AND (oa.sales_id = ( SELECT profiles.sales_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())))))))
    CHECK: ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = 'sales'::user_role) AND (EXISTS ( SELECT 1
   FROM order_assignment oa
  WHERE ((oa.order_id = participant.order_id) AND (oa.sales_id = ( SELECT profiles.sales_id
           FROM profiles
          WHERE (profiles.user_id = auth.uid())))))))
table profiles | policy p_profiles_admin | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table profiles | policy p_profiles_self | cmd SELECT | roles {authenticated}
    USING: ((user_id = auth.uid()) OR (fn_current_role() = 'super_admin'::user_role))
table salesperson | policy p_sales_r | cmd SELECT | roles {authenticated}
    USING: true
table salesperson | policy p_sales_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table schedule | policy p_sched_r | cmd SELECT | roles {authenticated}
    USING: true
table schedule | policy p_sched_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (fn_current_role() = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table session_note | policy p_note_i | cmd INSERT | roles {authenticated}
    CHECK: (author = auth.uid())
table session_note | policy p_note_r | cmd SELECT | roles {authenticated}
    USING: true
table staging_calendar | policy p_stg2 | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table staging_order_booking | policy p_stg1 | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
table trainer | policy trainer_read | cmd SELECT | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL)
table trainer | policy trainer_write | cmd ALL | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table trainer_course | policy trainer_course_read | cmd SELECT | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL)
table trainer_course | policy trainer_course_write | cmd ALL | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table venue | policy venue_read | cmd SELECT | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) IS NOT NULL)
table venue | policy venue_write | cmd ALL | roles {authenticated}
    USING: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
    CHECK: (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.user_id = auth.uid())) = ANY (ARRAY['operations'::user_role, 'super_admin'::user_role]))
table webshop_product | policy p_product_r | cmd SELECT | roles {authenticated}
    USING: true
table webshop_product | policy p_product_w | cmd ALL | roles {authenticated}
    USING: (fn_current_role() = 'super_admin'::user_role)
    CHECK: (fn_current_role() = 'super_admin'::user_role)
*/
