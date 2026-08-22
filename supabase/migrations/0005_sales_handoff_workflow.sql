-- Complete customer -> inquiry -> quotation -> order -> Operations handoff slice.
-- Sales Supervisor is a scope on the existing sales role, not a sixth role.

alter table academy_v2.profiles
  add column is_sales_supervisor boolean not null default false,
  add constraint profiles_sales_supervisor_role_check
    check (not is_sales_supervisor or role = 'sales');

create table academy_v2.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  email_domain text check (
    email_domain is null
    or lower(email_domain) = email_domain
    and email_domain ~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$'
  ),
  industry text check (industry is null or char_length(btrim(industry)) between 2 and 100),
  address text check (address is null or char_length(btrim(address)) between 3 and 500),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references academy_v2.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table academy_v2.contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references academy_v2.customers(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  job_title text check (job_title is null or char_length(btrim(job_title)) between 2 and 100),
  email text check (email is null or email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text check (phone is null or char_length(btrim(phone)) between 7 and 40),
  is_active boolean not null default true,
  created_by uuid not null references academy_v2.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id),
  check (email is not null or phone is not null)
);

create table academy_v2.inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_number bigint generated always as identity unique,
  customer_id uuid not null references academy_v2.customers(id) on delete restrict,
  contact_id uuid,
  course_id uuid references academy_v2.courses(id) on delete restrict,
  owner_id uuid not null references academy_v2.profiles(id) on delete restrict,
  status text not null default 'new' check (status in ('new', 'qualified', 'quoted', 'won', 'lost')),
  requirement_summary text not null check (char_length(btrim(requirement_summary)) between 5 and 1000),
  participant_estimate integer check (participant_estimate is null or participant_estimate > 0),
  next_action text check (next_action is null or char_length(btrim(next_action)) between 3 and 300),
  follow_up_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id, owner_id),
  foreign key (contact_id, customer_id) references academy_v2.contacts(id, customer_id) on delete restrict
);

create table academy_v2.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number bigint generated always as identity unique,
  inquiry_id uuid not null unique,
  customer_id uuid not null,
  contact_id uuid,
  owner_id uuid not null references academy_v2.profiles(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  approval_status text not null default 'not_required'
    check (approval_status in ('not_required', 'pending', 'approved', 'rejected')),
  approved_by uuid references academy_v2.profiles(id) on delete restrict,
  approved_at timestamptz,
  issued_at timestamptz,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id, owner_id),
  foreign key (inquiry_id, customer_id, owner_id)
    references academy_v2.inquiries(id, customer_id, owner_id) on delete restrict,
  foreign key (contact_id, customer_id) references academy_v2.contacts(id, customer_id) on delete restrict,
  check (
    (approval_status = 'approved' and approved_by is not null and approved_at is not null)
    or (approval_status <> 'approved' and approved_by is null and approved_at is null)
  )
);

create table academy_v2.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references academy_v2.quotations(id) on delete restrict,
  course_id uuid not null references academy_v2.courses(id) on delete restrict,
  learning_type text not null check (learning_type in ('classroom', 'virtual', 'onsite')),
  participant_count integer not null check (participant_count > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_id, course_id, learning_type)
);

create table academy_v2.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  quotation_id uuid unique,
  inquiry_id uuid not null references academy_v2.inquiries(id) on delete restrict,
  customer_id uuid not null references academy_v2.customers(id) on delete restrict,
  contact_id uuid,
  sales_owner_id uuid not null references academy_v2.profiles(id) on delete restrict,
  operations_owner_id uuid references academy_v2.profiles(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'pending_operations', 'returned', 'with_operations', 'fulfillment', 'completed', 'cancelled')),
  requested_start_date date,
  delivery_notes text check (delivery_notes is null or char_length(btrim(delivery_notes)) between 10 and 1000),
  operations_note text check (operations_note is null or char_length(btrim(operations_note)) between 5 and 1000),
  handoff_sent_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id, sales_owner_id),
  foreign key (quotation_id, customer_id, sales_owner_id)
    references academy_v2.quotations(id, customer_id, owner_id) on delete restrict,
  foreign key (contact_id, customer_id) references academy_v2.contacts(id, customer_id) on delete restrict
);

create table academy_v2.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references academy_v2.orders(id) on delete restrict,
  course_id uuid not null references academy_v2.courses(id) on delete restrict,
  learning_type text not null check (learning_type in ('classroom', 'virtual', 'onsite')),
  participant_count integer not null check (participant_count > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, course_id, learning_type)
);

create unique index customers_name_key on academy_v2.customers(lower(btrim(name)));
create unique index customers_email_domain_key on academy_v2.customers(email_domain) where email_domain is not null;
create index customers_status_name_idx on academy_v2.customers(status, name);
create index contacts_customer_id_idx on academy_v2.contacts(customer_id);
create unique index contacts_customer_email_key
  on academy_v2.contacts(customer_id, lower(email)) where email is not null;
create index inquiries_customer_id_idx on academy_v2.inquiries(customer_id);
create index inquiries_owner_status_followup_idx on academy_v2.inquiries(owner_id, status, follow_up_on);
create index inquiries_course_id_idx on academy_v2.inquiries(course_id);
create index quotations_owner_status_idx on academy_v2.quotations(owner_id, status);
create index quotations_customer_id_idx on academy_v2.quotations(customer_id);
create index quotation_lines_quotation_id_idx on academy_v2.quotation_lines(quotation_id);
create index quotation_lines_course_id_idx on academy_v2.quotation_lines(course_id);
create index orders_sales_owner_status_idx on academy_v2.orders(sales_owner_id, status);
create index orders_operations_status_idx on academy_v2.orders(operations_owner_id, status);
create index orders_customer_id_idx on academy_v2.orders(customer_id);
create index orders_inquiry_id_idx on academy_v2.orders(inquiry_id);
create index order_lines_order_id_idx on academy_v2.order_lines(order_id);
create index order_lines_course_id_idx on academy_v2.order_lines(course_id);

create or replace function academy_v2_private.is_sales_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from academy_v2.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role = 'sales'
      and p.is_sales_supervisor
  );
$$;

create or replace function academy_v2_private.can_manage_sales(record_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from academy_v2.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and (
        p.role = 'administrator'
        or (p.role = 'sales' and (p.id = record_owner_id or p.is_sales_supervisor))
      )
  );
$$;

revoke all on function academy_v2_private.is_sales_supervisor() from public, anon;
revoke all on function academy_v2_private.can_manage_sales(uuid) from public, anon;
grant execute on function academy_v2_private.is_sales_supervisor() to authenticated;
grant execute on function academy_v2_private.can_manage_sales(uuid) to authenticated;

create or replace function academy_v2_private.enforce_sales_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_to_check uuid;
begin
  owner_to_check := case tg_table_name
    when 'orders' then (to_jsonb(new) ->> 'sales_owner_id')::uuid
    else (to_jsonb(new) ->> 'owner_id')::uuid
  end;

  if not exists (
    select 1 from academy_v2.profiles p
    where p.id = owner_to_check and p.is_active and p.role = 'sales'
  ) then
    raise exception 'Sales ownership requires an active Sales profile' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function academy_v2_private.reset_quote_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Only a draft quotation can be repriced' using errcode = '23514';
  end if;
  new.approval_status := case when new.discount_percent > 10 then 'pending' else 'not_required' end;
  new.approved_by := null;
  new.approved_at := null;
  return new;
end;
$$;

revoke all on function academy_v2_private.enforce_sales_owner() from public, anon, authenticated;
revoke all on function academy_v2_private.reset_quote_approval() from public, anon, authenticated;

create trigger inquiries_enforce_sales_owner before insert or update of owner_id on academy_v2.inquiries
for each row execute function academy_v2_private.enforce_sales_owner();
create trigger quotations_enforce_sales_owner before insert or update of owner_id on academy_v2.quotations
for each row execute function academy_v2_private.enforce_sales_owner();
create trigger orders_enforce_sales_owner before insert or update of sales_owner_id on academy_v2.orders
for each row execute function academy_v2_private.enforce_sales_owner();
create trigger quotations_reset_approval before update of discount_percent on academy_v2.quotations
for each row when (old.discount_percent is distinct from new.discount_percent)
execute function academy_v2_private.reset_quote_approval();

create trigger customers_set_updated_at before update on academy_v2.customers
for each row execute function academy_v2_private.set_updated_at();
create trigger contacts_set_updated_at before update on academy_v2.contacts
for each row execute function academy_v2_private.set_updated_at();
create trigger inquiries_set_updated_at before update on academy_v2.inquiries
for each row execute function academy_v2_private.set_updated_at();
create trigger quotations_set_updated_at before update on academy_v2.quotations
for each row execute function academy_v2_private.set_updated_at();
create trigger quotation_lines_set_updated_at before update on academy_v2.quotation_lines
for each row execute function academy_v2_private.set_updated_at();
create trigger orders_set_updated_at before update on academy_v2.orders
for each row execute function academy_v2_private.set_updated_at();
create trigger order_lines_set_updated_at before update on academy_v2.order_lines
for each row execute function academy_v2_private.set_updated_at();

-- Expand the existing access audit to include the Sales Supervisor scope.
create or replace function academy_v2_private.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role is distinct from new.role
    or old.is_active is distinct from new.is_active
    or old.is_sales_supervisor is distinct from new.is_sales_supervisor then
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (
      (select auth.uid()),
      'profile.access_changed',
      'profile',
      new.id::text,
      jsonb_build_object(
        'role_before', old.role,
        'role_after', new.role,
        'active_before', old.is_active,
        'active_after', new.is_active,
        'sales_supervisor_before', old.is_sales_supervisor,
        'sales_supervisor_after', new.is_sales_supervisor
      )
    );
  end if;
  return new;
end;
$$;

drop trigger profiles_audit_access on academy_v2.profiles;
create trigger profiles_audit_access after update of role, is_active, is_sales_supervisor on academy_v2.profiles
for each row execute function academy_v2_private.audit_profile_change();

create or replace function academy_v2_private.create_quotation_from_inquiry(p_inquiry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inquiry_row academy_v2.inquiries%rowtype;
  quotation_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into inquiry_row
  from academy_v2.inquiries
  where id = p_inquiry_id
  for update;

  if not found or not academy_v2_private.can_manage_sales(inquiry_row.owner_id) then
    raise exception 'Inquiry not found or access denied' using errcode = '42501';
  end if;
  if inquiry_row.status not in ('qualified', 'quoted') then
    raise exception 'Qualify the inquiry before creating a quotation' using errcode = '23514';
  end if;

  select q.id into quotation_id from academy_v2.quotations q where q.inquiry_id = p_inquiry_id;
  if quotation_id is not null then
    return quotation_id;
  end if;

  insert into academy_v2.quotations(inquiry_id, customer_id, contact_id, owner_id, valid_until)
  values (inquiry_row.id, inquiry_row.customer_id, inquiry_row.contact_id, inquiry_row.owner_id, current_date + 30)
  returning id into quotation_id;

  update academy_v2.inquiries set status = 'quoted' where id = inquiry_row.id;
  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'quotation.created', 'quotation', quotation_id::text,
    jsonb_build_object('inquiry_id', inquiry_row.id));
  return quotation_id;
end;
$$;

create or replace function academy_v2_private.transition_quotation(
  p_quotation_id uuid,
  p_action text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  quotation_row academy_v2.quotations%rowtype;
  actor uuid := (select auth.uid());
  next_status text;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into quotation_row from academy_v2.quotations where id = p_quotation_id for update;
  if not found then raise exception 'Quotation not found' using errcode = 'P0002'; end if;

  if p_action in ('submit', 'accept') and not academy_v2_private.can_manage_sales(quotation_row.owner_id) then
    raise exception 'Quotation access denied' using errcode = '42501';
  end if;

  if p_action = 'submit' then
    if quotation_row.status <> 'draft' then raise exception 'Only a draft quotation can be submitted' using errcode = '23514'; end if;
    if not exists (select 1 from academy_v2.quotation_lines l where l.quotation_id = p_quotation_id) then
      raise exception 'Add at least one quotation line before submitting' using errcode = '23514';
    end if;
    if quotation_row.discount_percent > 10 then
      update academy_v2.quotations
      set approval_status = 'pending', approved_by = null, approved_at = null
      where id = p_quotation_id;
      next_status := 'draft';
      insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'quotation.approval_requested', 'quotation', p_quotation_id::text,
        jsonb_build_object('discount_percent', quotation_row.discount_percent));
    else
      update academy_v2.quotations
      set status = 'sent', approval_status = 'not_required', issued_at = now()
      where id = p_quotation_id;
      next_status := 'sent';
      insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'quotation.sent', 'quotation', p_quotation_id::text,
        jsonb_build_object('discount_percent', quotation_row.discount_percent));
    end if;
  elsif p_action in ('approve', 'reject') then
    if not (
      academy_v2_private.is_sales_supervisor()
      or academy_v2_private.has_role(array['administrator']::text[])
    ) then
      raise exception 'Sales Supervisor approval required' using errcode = '42501';
    end if;
    if quotation_row.owner_id = actor then
      raise exception 'A quotation owner cannot approve their own discount' using errcode = '42501';
    end if;
    if quotation_row.approval_status <> 'pending' then
      raise exception 'This quotation is not pending approval' using errcode = '23514';
    end if;
    if p_action = 'reject' and char_length(btrim(coalesce(p_reason, ''))) < 5 then
      raise exception 'A rejection reason is required' using errcode = '23514';
    end if;
    if p_action = 'approve' then
      update academy_v2.quotations
      set status = 'sent', approval_status = 'approved', approved_by = actor, approved_at = now(), issued_at = now()
      where id = p_quotation_id;
      next_status := 'sent';
      insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
      values (actor, 'quotation.approved', 'quotation', p_quotation_id::text,
        jsonb_build_object('discount_percent', quotation_row.discount_percent));
    else
      update academy_v2.quotations
      set approval_status = 'rejected', approved_by = null, approved_at = null
      where id = p_quotation_id;
      next_status := 'draft';
      insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
      values (actor, 'quotation.rejected', 'quotation', p_quotation_id::text, btrim(p_reason),
        jsonb_build_object('discount_percent', quotation_row.discount_percent));
    end if;
  elsif p_action = 'accept' then
    if quotation_row.status <> 'sent' then raise exception 'Only a sent quotation can be accepted' using errcode = '23514'; end if;
    update academy_v2.quotations set status = 'accepted' where id = p_quotation_id;
    update academy_v2.inquiries set status = 'won' where id = quotation_row.inquiry_id;
    next_status := 'accepted';
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'quotation.accepted', 'quotation', p_quotation_id::text, '{}'::jsonb);
  else
    raise exception 'Unsupported quotation action' using errcode = '22023';
  end if;
  return next_status;
end;
$$;

create or replace function academy_v2_private.convert_quotation_to_order(p_quotation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  quotation_row academy_v2.quotations%rowtype;
  order_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into quotation_row from academy_v2.quotations where id = p_quotation_id for update;
  if not found or not academy_v2_private.can_manage_sales(quotation_row.owner_id) then
    raise exception 'Quotation not found or access denied' using errcode = '42501';
  end if;
  if quotation_row.status <> 'accepted' then raise exception 'Accept the quotation before creating an order' using errcode = '23514'; end if;
  select o.id into order_id from academy_v2.orders o where o.quotation_id = p_quotation_id;
  if order_id is not null then return order_id; end if;

  insert into academy_v2.orders(quotation_id, inquiry_id, customer_id, contact_id, sales_owner_id)
  values (quotation_row.id, quotation_row.inquiry_id, quotation_row.customer_id, quotation_row.contact_id, quotation_row.owner_id)
  returning id into order_id;

  insert into academy_v2.order_lines(order_id, course_id, learning_type, participant_count, unit_price, currency)
  select order_id, l.course_id, l.learning_type, l.participant_count,
    round(l.unit_price * (1 - quotation_row.discount_percent / 100), 2), l.currency
  from academy_v2.quotation_lines l where l.quotation_id = p_quotation_id;

  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'order.created_from_quotation', 'order', order_id::text,
    jsonb_build_object('quotation_id', p_quotation_id));
  return order_id;
end;
$$;

create or replace function academy_v2_private.prepare_order(
  p_order_id uuid,
  p_requested_start_date date,
  p_delivery_notes text
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
  if order_row.status not in ('draft', 'returned') then raise exception 'This order can no longer be prepared by Sales' using errcode = '23514'; end if;
  if p_requested_start_date is null or p_requested_start_date < current_date then
    raise exception 'Requested start date must be today or later' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_delivery_notes, ''))) < 10 then
    raise exception 'Delivery notes must contain at least 10 characters' using errcode = '23514';
  end if;
  update academy_v2.orders
  set requested_start_date = p_requested_start_date, delivery_notes = btrim(p_delivery_notes)
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
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into order_row from academy_v2.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  actor_is_operations := academy_v2_private.has_role(array['administrator', 'operations']::text[]);

  if p_action = 'send' then
    if not academy_v2_private.can_manage_sales(order_row.sales_owner_id) then raise exception 'Order access denied' using errcode = '42501'; end if;
    if order_row.status not in ('draft', 'returned') then raise exception 'Only a draft or returned order can be sent' using errcode = '23514'; end if;
    if order_row.contact_id is null or order_row.requested_start_date is null or char_length(btrim(coalesce(order_row.delivery_notes, ''))) < 10 then
      raise exception 'Customer contact, requested date, and delivery notes are required' using errcode = '23514';
    end if;
    if not exists (select 1 from academy_v2.order_lines l where l.order_id = p_order_id) then
      raise exception 'At least one order line is required' using errcode = '23514';
    end if;
    update academy_v2.orders
    set status = 'pending_operations', handoff_sent_at = now(), reviewed_at = null,
      operations_owner_id = null, operations_note = null
    where id = p_order_id;
    next_status := 'pending_operations';
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'order.sent_to_operations', 'order', p_order_id::text, '{}'::jsonb);
  elsif p_action = 'accept' then
    if not actor_is_operations then raise exception 'Operations access required' using errcode = '42501'; end if;
    if order_row.status <> 'pending_operations' then raise exception 'This order is not pending Operations review' using errcode = '23514'; end if;
    update academy_v2.orders
    set status = 'with_operations', operations_owner_id = actor, operations_note = null, reviewed_at = now()
    where id = p_order_id;
    next_status := 'with_operations';
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (actor, 'order.handoff_accepted', 'order', p_order_id::text, '{}'::jsonb);
  elsif p_action = 'return' then
    if not actor_is_operations then raise exception 'Operations access required' using errcode = '42501'; end if;
    if order_row.status <> 'pending_operations' then raise exception 'This order is not pending Operations review' using errcode = '23514'; end if;
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
  else
    raise exception 'Unsupported order action' using errcode = '22023';
  end if;
  return next_status;
end;
$$;

revoke all on function academy_v2_private.create_quotation_from_inquiry(uuid) from public, anon;
revoke all on function academy_v2_private.transition_quotation(uuid, text, text) from public, anon;
revoke all on function academy_v2_private.convert_quotation_to_order(uuid) from public, anon;
revoke all on function academy_v2_private.prepare_order(uuid, date, text) from public, anon;
revoke all on function academy_v2_private.transition_order(uuid, text, text) from public, anon;
grant execute on function academy_v2_private.create_quotation_from_inquiry(uuid) to authenticated;
grant execute on function academy_v2_private.transition_quotation(uuid, text, text) to authenticated;
grant execute on function academy_v2_private.convert_quotation_to_order(uuid) to authenticated;
grant execute on function academy_v2_private.prepare_order(uuid, date, text) to authenticated;
grant execute on function academy_v2_private.transition_order(uuid, text, text) to authenticated;

-- Exposed security-invoker wrappers keep privileged implementations private.
create function academy_v2.create_quotation_from_inquiry(p_inquiry_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select academy_v2_private.create_quotation_from_inquiry(p_inquiry_id); $$;
create function academy_v2.transition_quotation(p_quotation_id uuid, p_action text, p_reason text default null)
returns text language sql security invoker set search_path = ''
as $$ select academy_v2_private.transition_quotation(p_quotation_id, p_action, p_reason); $$;
create function academy_v2.convert_quotation_to_order(p_quotation_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select academy_v2_private.convert_quotation_to_order(p_quotation_id); $$;
create function academy_v2.prepare_order(p_order_id uuid, p_requested_start_date date, p_delivery_notes text)
returns void language sql security invoker set search_path = ''
as $$ select academy_v2_private.prepare_order(p_order_id, p_requested_start_date, p_delivery_notes); $$;
create function academy_v2.transition_order(p_order_id uuid, p_action text, p_reason text default null)
returns text language sql security invoker set search_path = ''
as $$ select academy_v2_private.transition_order(p_order_id, p_action, p_reason); $$;

revoke all on function academy_v2.create_quotation_from_inquiry(uuid) from public, anon;
revoke all on function academy_v2.transition_quotation(uuid, text, text) from public, anon;
revoke all on function academy_v2.convert_quotation_to_order(uuid) from public, anon;
revoke all on function academy_v2.prepare_order(uuid, date, text) from public, anon;
revoke all on function academy_v2.transition_order(uuid, text, text) from public, anon;
grant execute on function academy_v2.create_quotation_from_inquiry(uuid) to authenticated;
grant execute on function academy_v2.transition_quotation(uuid, text, text) to authenticated;
grant execute on function academy_v2.convert_quotation_to_order(uuid) to authenticated;
grant execute on function academy_v2.prepare_order(uuid, date, text) to authenticated;
grant execute on function academy_v2.transition_order(uuid, text, text) to authenticated;

revoke all on table academy_v2.customers, academy_v2.contacts, academy_v2.inquiries,
  academy_v2.quotations, academy_v2.quotation_lines, academy_v2.orders, academy_v2.order_lines
  from anon, authenticated;
grant select on table academy_v2.customers, academy_v2.contacts, academy_v2.inquiries,
  academy_v2.quotations, academy_v2.quotation_lines, academy_v2.orders, academy_v2.order_lines
  to authenticated;
grant insert on table academy_v2.customers, academy_v2.contacts, academy_v2.inquiries,
  academy_v2.quotation_lines to authenticated;
grant update(name, email_domain, industry, address, status) on academy_v2.customers to authenticated;
grant update(full_name, job_title, email, phone, is_active) on academy_v2.contacts to authenticated;
grant update(contact_id, course_id, status, requirement_summary, participant_estimate, next_action, follow_up_on)
  on academy_v2.inquiries to authenticated;
grant update(discount_percent) on academy_v2.quotations to authenticated;
grant update(course_id, learning_type, participant_count, unit_price, currency)
  on academy_v2.quotation_lines to authenticated;
grant delete on academy_v2.quotation_lines to authenticated;
grant update(full_name, role, is_active, is_sales_supervisor) on academy_v2.profiles to authenticated;

alter table academy_v2.customers enable row level security;
alter table academy_v2.contacts enable row level security;
alter table academy_v2.inquiries enable row level security;
alter table academy_v2.quotations enable row level security;
alter table academy_v2.quotation_lines enable row level security;
alter table academy_v2.orders enable row level security;
alter table academy_v2.order_lines enable row level security;
alter table academy_v2.customers force row level security;
alter table academy_v2.contacts force row level security;
alter table academy_v2.inquiries force row level security;
alter table academy_v2.quotations force row level security;
alter table academy_v2.quotation_lines force row level security;
alter table academy_v2.orders force row level security;
alter table academy_v2.order_lines force row level security;

create policy profiles_active_colleague_read on academy_v2.profiles
for select to authenticated
using (
  is_active
  and (select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[]))
);

create policy customers_active_read on academy_v2.customers
for select to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[])));
create policy customers_sales_insert on academy_v2.customers
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'sales']::text[])) and created_by = (select auth.uid()));
create policy customers_sales_update on academy_v2.customers
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'sales']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'sales']::text[])));

create policy contacts_active_read on academy_v2.contacts
for select to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[])));
create policy contacts_sales_insert on academy_v2.contacts
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'sales']::text[])) and created_by = (select auth.uid()));
create policy contacts_sales_update on academy_v2.contacts
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'sales']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'sales']::text[])));

create policy inquiries_scoped_read on academy_v2.inquiries
for select to authenticated
using (
  (select academy_v2_private.can_manage_sales(owner_id))
  or (select academy_v2_private.has_role(array['manager', 'auditor']::text[]))
);
create policy inquiries_scoped_insert on academy_v2.inquiries
for insert to authenticated
with check ((select academy_v2_private.can_manage_sales(owner_id)));
create policy inquiries_scoped_update on academy_v2.inquiries
for update to authenticated
using ((select academy_v2_private.can_manage_sales(owner_id)))
with check ((select academy_v2_private.can_manage_sales(owner_id)));

create policy quotations_scoped_read on academy_v2.quotations
for select to authenticated
using (
  (select academy_v2_private.can_manage_sales(owner_id))
  or (select academy_v2_private.has_role(array['manager', 'auditor']::text[]))
);
create policy quotations_discount_update on academy_v2.quotations
for update to authenticated
using (status = 'draft' and (select academy_v2_private.can_manage_sales(owner_id)))
with check ((select academy_v2_private.can_manage_sales(owner_id)));

create policy quotation_lines_scoped_read on academy_v2.quotation_lines
for select to authenticated
using (exists (
  select 1 from academy_v2.quotations q
  where q.id = quotation_id
    and (
      (select academy_v2_private.can_manage_sales(q.owner_id))
      or (select academy_v2_private.has_role(array['manager', 'auditor']::text[]))
    )
));
create policy quotation_lines_draft_insert on academy_v2.quotation_lines
for insert to authenticated
with check (exists (
  select 1 from academy_v2.quotations q
  where q.id = quotation_id and q.status = 'draft'
    and (select academy_v2_private.can_manage_sales(q.owner_id))
));
create policy quotation_lines_draft_update on academy_v2.quotation_lines
for update to authenticated
using (exists (
  select 1 from academy_v2.quotations q
  where q.id = quotation_id and q.status = 'draft'
    and (select academy_v2_private.can_manage_sales(q.owner_id))
))
with check (exists (
  select 1 from academy_v2.quotations q
  where q.id = quotation_id and q.status = 'draft'
    and (select academy_v2_private.can_manage_sales(q.owner_id))
));
create policy quotation_lines_draft_delete on academy_v2.quotation_lines
for delete to authenticated
using (exists (
  select 1 from academy_v2.quotations q
  where q.id = quotation_id and q.status = 'draft'
    and (select academy_v2_private.can_manage_sales(q.owner_id))
));

create policy orders_scoped_read on academy_v2.orders
for select to authenticated
using (
  (select academy_v2_private.can_manage_sales(sales_owner_id))
  or (select academy_v2_private.has_role(array['manager', 'auditor']::text[]))
  or (
    status in ('pending_operations', 'with_operations', 'fulfillment', 'completed')
    and (select academy_v2_private.has_role(array['operations']::text[]))
  )
);
create policy order_lines_scoped_read on academy_v2.order_lines
for select to authenticated
using (exists (
  select 1 from academy_v2.orders o
  where o.id = order_id
    and (
      (select academy_v2_private.can_manage_sales(o.sales_owner_id))
      or (select academy_v2_private.has_role(array['manager', 'auditor']::text[]))
      or (
        o.status in ('pending_operations', 'with_operations', 'fulfillment', 'completed')
        and (select academy_v2_private.has_role(array['operations']::text[]))
      )
    )
));

-- Romely retains the Sales role and receives the distinct approval/team scope.
update academy_v2.profiles p
set is_sales_supervisor = true
from auth.users u
where p.id = u.id and lower(u.email) = 'romely.test@tuv-portal.local';

-- Representative workflow records. Names are conspicuously sample data.
do $$
declare
  seed_actor uuid;
  melis_id uuid;
  romely_id uuid;
  customer_acme uuid;
  customer_bayan uuid;
  customer_harbor uuid;
  contact_acme uuid;
  contact_bayan uuid;
  contact_harbor uuid;
  course_iso uuid;
  course_dpo uuid;
  inquiry_new uuid;
  inquiry_pending uuid;
  inquiry_handoff uuid;
  inquiry_returned uuid;
  quote_pending uuid;
  quote_handoff uuid;
  quote_returned uuid;
  order_handoff uuid;
  order_returned uuid;
begin
  select u.id into seed_actor from auth.users u where lower(u.email) = 'alanclifford.filart@tuv.com';
  select u.id into melis_id from auth.users u where lower(u.email) = 'melis.test@tuv-portal.local';
  select u.id into romely_id from auth.users u where lower(u.email) = 'romely.test@tuv-portal.local';
  select c.id into course_iso from academy_v2.courses c where c.code = 'ISO-9001-IA';
  select c.id into course_dpo from academy_v2.courses c where c.code = 'PH-C03-DPO-PERSCERT-VC';

  if seed_actor is null or melis_id is null or romely_id is null or course_iso is null or course_dpo is null then
    raise exception 'Required sample identities or courses are missing';
  end if;

  insert into academy_v2.customers(name, email_domain, industry, address, created_by)
  values ('Acme Manufacturing — Sample', 'acme-sample.test', 'Manufacturing', 'Laguna Technopark, Philippines', seed_actor)
  returning id into customer_acme;
  insert into academy_v2.customers(name, email_domain, industry, address, created_by)
  values ('Bayan Digital Bank — Sample', 'bayanbank-sample.test', 'Financial Services', 'Bonifacio Global City, Taguig', seed_actor)
  returning id into customer_bayan;
  insert into academy_v2.customers(name, email_domain, industry, address, created_by)
  values ('Harbor Foods — Sample', 'harborfoods-sample.test', 'Food Manufacturing', 'Cebu Business Park, Cebu', seed_actor)
  returning id into customer_harbor;

  insert into academy_v2.contacts(customer_id, full_name, job_title, email, phone, created_by)
  values (customer_acme, 'Maria Santos — Sample', 'Quality Manager', 'maria@acme-sample.test', '+63 917 000 0101', seed_actor)
  returning id into contact_acme;
  insert into academy_v2.contacts(customer_id, full_name, job_title, email, phone, created_by)
  values (customer_bayan, 'Carlo Reyes — Sample', 'Data Protection Lead', 'carlo@bayanbank-sample.test', '+63 917 000 0102', seed_actor)
  returning id into contact_bayan;
  insert into academy_v2.contacts(customer_id, full_name, job_title, email, phone, created_by)
  values (customer_harbor, 'Liza Cruz — Sample', 'Learning Manager', 'liza@harborfoods-sample.test', '+63 917 000 0103', seed_actor)
  returning id into contact_harbor;

  insert into academy_v2.inquiries(customer_id, contact_id, course_id, owner_id, status,
    requirement_summary, participant_estimate, next_action, follow_up_on)
  values (customer_harbor, contact_harbor, course_iso, melis_id, 'new',
    'Internal auditor training for the next quality team intake.', 18,
    'Confirm preferred delivery dates', current_date - 2)
  returning id into inquiry_new;

  insert into academy_v2.inquiries(customer_id, contact_id, course_id, owner_id, status,
    requirement_summary, participant_estimate, next_action, follow_up_on)
  values (customer_acme, contact_acme, course_iso, melis_id, 'quoted',
    'Private ISO 9001 internal auditor program for site auditors.', 20,
    'Supervisor to review requested discount', current_date)
  returning id into inquiry_pending;

  insert into academy_v2.quotations(inquiry_id, customer_id, contact_id, owner_id, status,
    discount_percent, approval_status, valid_until)
  values (inquiry_pending, customer_acme, contact_acme, melis_id, 'draft', 15, 'pending', current_date + 21)
  returning id into quote_pending;
  insert into academy_v2.quotation_lines(quotation_id, course_id, learning_type, participant_count, unit_price)
  values (quote_pending, course_iso, 'onsite', 20, 85000);

  insert into academy_v2.inquiries(customer_id, contact_id, course_id, owner_id, status,
    requirement_summary, participant_estimate, next_action, follow_up_on)
  values (customer_bayan, contact_bayan, course_dpo, romely_id, 'won',
    'Virtual DPO certification program for the privacy team.', 12,
    'Await Operations handoff decision', current_date + 3)
  returning id into inquiry_handoff;
  insert into academy_v2.quotations(inquiry_id, customer_id, contact_id, owner_id, status,
    discount_percent, approval_status, issued_at, valid_until)
  values (inquiry_handoff, customer_bayan, contact_bayan, romely_id, 'accepted', 5, 'not_required', now() - interval '3 days', current_date + 14)
  returning id into quote_handoff;
  insert into academy_v2.quotation_lines(quotation_id, course_id, learning_type, participant_count, unit_price)
  values (quote_handoff, course_dpo, 'virtual', 12, 15000);
  insert into academy_v2.orders(quotation_id, inquiry_id, customer_id, contact_id, sales_owner_id,
    status, requested_start_date, delivery_notes, handoff_sent_at)
  values (quote_handoff, inquiry_handoff, customer_bayan, contact_bayan, romely_id,
    'pending_operations', current_date + 30, 'Twelve named participants; virtual delivery across two consecutive days.', now() - interval '1 day')
  returning id into order_handoff;
  insert into academy_v2.order_lines(order_id, course_id, learning_type, participant_count, unit_price)
  values (order_handoff, course_dpo, 'virtual', 12, 14250);

  insert into academy_v2.inquiries(customer_id, contact_id, course_id, owner_id, status,
    requirement_summary, participant_estimate, next_action, follow_up_on)
  values (customer_acme, contact_acme, course_iso, melis_id, 'won',
    'Classroom internal auditor training for a second production site.', 16,
    'Correct venue and timing details', current_date + 1)
  returning id into inquiry_returned;
  insert into academy_v2.quotations(inquiry_id, customer_id, contact_id, owner_id, status,
    discount_percent, approval_status, issued_at, valid_until)
  values (inquiry_returned, customer_acme, contact_acme, melis_id, 'accepted', 0, 'not_required', now() - interval '5 days', current_date + 10)
  returning id into quote_returned;
  insert into academy_v2.quotation_lines(quotation_id, course_id, learning_type, participant_count, unit_price)
  values (quote_returned, course_iso, 'classroom', 16, 90000);
  insert into academy_v2.orders(quotation_id, inquiry_id, customer_id, contact_id, sales_owner_id,
    status, requested_start_date, delivery_notes, operations_note, handoff_sent_at, reviewed_at)
  values (quote_returned, inquiry_returned, customer_acme, contact_acme, melis_id,
    'returned', current_date + 20, 'Classroom delivery requested for the Laguna site.',
    'Please confirm the exact venue and whether weekend delivery is acceptable.', now() - interval '2 days', now() - interval '1 day')
  returning id into order_returned;
  insert into academy_v2.order_lines(order_id, course_id, learning_type, participant_count, unit_price)
  values (order_returned, course_iso, 'classroom', 16, 90000);

  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (seed_actor, 'demo.sales_workflow_seeded', 'demo_seed', 'sales_handoff_v1',
    jsonb_build_object('customers', 3, 'inquiries', 4, 'quotations', 3, 'orders', 2));
end;
$$;

comment on column academy_v2.profiles.is_sales_supervisor is 'Sales team scope and discount approval authority; not a separate role';
comment on table academy_v2.customers is 'Authoritative company directory with normalized duplicate prevention';
comment on table academy_v2.contacts is 'Customer people used by inquiries and handoffs';
comment on table academy_v2.inquiries is 'Sales opportunity, owner, follow-up, and qualification state';
comment on table academy_v2.quotations is 'Commercial offer with focused discount approval';
comment on table academy_v2.quotation_lines is 'Course, modality, quantity, and price snapshot for a quotation';
comment on table academy_v2.orders is 'Commercial commitment and Sales-to-Operations handoff state';
comment on table academy_v2.order_lines is 'Commercial course snapshot copied atomically from an accepted quotation';
