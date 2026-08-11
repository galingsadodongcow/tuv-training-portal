-- ============================================================================
-- TÜV Rheinland Academy PH — System-review build program (A–N) + QA hardening
-- Combined migration bundle. Paste whole into the Supabase SQL editor and run
-- once. Idempotent; safe to re-run. Do not reorder sections.
-- ============================================================================


-- ############################################################################
-- ## 20260808150000_course_pax_attributes.sql
-- ############################################################################

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


-- ############################################################################
-- ## 20260808160000_accounts_receivable.sql
-- ############################################################################

-- Accounts receivable. Real invoices and payments behind an order, so the
-- payment status and the collection clock are driven by recorded money, not by
-- a date heuristic.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create table if not exists public.invoice (
  invoice_id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id) on delete cascade,
  invoice_number text,
  issue_date date not null default current_date,
  due_date date,
  amount numeric(14,2) not null default 0,
  status text not null default 'Sent',           -- Draft, Sent, Paid, Void
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists invoice_order_idx on public.invoice(order_id);

create table if not exists public.payment (
  payment_id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id) on delete cascade,
  paid_date date not null default current_date,
  amount numeric(14,2) not null default 0,
  method text,                                    -- Bank transfer, Credit card, Cheque, Cash
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists payment_order_idx on public.payment(order_id);

alter table public.invoice enable row level security;
alter table public.payment enable row level security;

-- Read for any signed-in role. Manage for operations, business owner, super admin.
drop policy if exists p_invoice_r on public.invoice;
create policy p_invoice_r on public.invoice for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_invoice_w on public.invoice;
create policy p_invoice_w on public.invoice for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));

drop policy if exists p_payment_r on public.payment;
create policy p_payment_r on public.payment for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_payment_w on public.payment;
create policy p_payment_w on public.payment for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));

-- Recompute the order's payment status from the sum of payments.
create or replace function public.fn_ar_recompute(p_order text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_total numeric; v_paid numeric;
begin
  select total_amount into v_total from orders where order_id = p_order;
  select coalesce(sum(amount), 0) into v_paid from payment where order_id = p_order;
  update orders set payment_status =
    (case when coalesce(v_total,0) > 0 and v_paid >= v_total then 'Paid'
         when v_paid > 0 then 'Partial'
         else 'Unpaid' end)::payment_status_t
  where order_id = p_order;
end $$;

create or replace function public.fn_payment_touch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform fn_ar_recompute(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end $$;
drop trigger if exists trg_payment_touch on public.payment;
create trigger trg_payment_touch after insert or update or delete on public.payment
  for each row execute function public.fn_payment_touch();

-- Per-order receivable position for the order page and the aging report.
create or replace view public.v_order_ar as
  select o.order_id, o.order_date, o.total_amount, o.payment_status, o.order_status,
         cl.company, cl.name as client_name,
         coalesce((select sum(i.amount) from invoice i where i.order_id = o.order_id and i.status <> 'Void'), 0) as invoiced,
         coalesce((select sum(p.amount) from payment p where p.order_id = o.order_id), 0) as paid,
         o.total_amount - coalesce((select sum(p.amount) from payment p where p.order_id = o.order_id), 0) as balance,
         (select min(i.due_date) from invoice i where i.order_id = o.order_id and i.status <> 'Void') as due_date
    from orders o
    left join client cl on cl.client_id = o.client_id;


-- ############################################################################
-- ## 20260808170000_assessment_certification.sql
-- ############################################################################

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


-- ############################################################################
-- ## 20260808180000_document_attachments.sql
-- ############################################################################

-- Document attachments. A private storage bucket plus a metadata table that
-- links any stored file to a record (order, session, client, organization).
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- Private bucket.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Storage access: any signed-in role reads and uploads; the uploader or
-- operations and super admin can delete.
drop policy if exists p_att_read on storage.objects;
create policy p_att_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
drop policy if exists p_att_insert on storage.objects;
create policy p_att_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');
drop policy if exists p_att_delete on storage.objects;
create policy p_att_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or public.fn_current_role() in ('operations','super_admin')));

-- Metadata for each uploaded file.
create table if not exists public.attachment (
  attachment_id uuid primary key default gen_random_uuid(),
  entity_type text not null,      -- order, session, client, organization
  entity_id text not null,
  path text not null,             -- storage object path
  file_name text not null,
  mime text,
  size bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists attachment_entity_idx on public.attachment(entity_type, entity_id);

alter table public.attachment enable row level security;

drop policy if exists p_attach_r on public.attachment;
create policy p_attach_r on public.attachment for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_attach_i on public.attachment;
create policy p_attach_i on public.attachment for insert to authenticated
  with check (uploaded_by = auth.uid());
drop policy if exists p_attach_d on public.attachment;
create policy p_attach_d on public.attachment for delete to authenticated
  using (uploaded_by = auth.uid() or fn_current_role() in ('operations','super_admin'));


-- ############################################################################
-- ## 20260808190000_communications.sql
-- ############################################################################

-- Communications. Message templates, an outbound log, and functions to queue
-- emails (manually or as reminders). A separate edge function sends the queued
-- rows through the email provider and marks them Sent or Failed.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create table if not exists public.message_template (
  template_key text primary key,
  name text not null,
  subject text not null,
  body text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.comms_log (
  comm_id uuid primary key default gen_random_uuid(),
  template_key text,
  to_email text not null,
  subject text not null,
  body text not null,
  entity_type text,
  entity_id text,
  status text not null default 'Queued',      -- Queued, Sent, Failed
  error text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists comms_log_status_idx on public.comms_log(status);
create index if not exists comms_log_entity_idx on public.comms_log(entity_type, entity_id);

alter table public.message_template enable row level security;
alter table public.comms_log enable row level security;

drop policy if exists p_tmpl_r on public.message_template;
create policy p_tmpl_r on public.message_template for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_tmpl_w on public.message_template;
create policy p_tmpl_w on public.message_template for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

drop policy if exists p_comms_r on public.comms_log;
create policy p_comms_r on public.comms_log for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_comms_w on public.comms_log;
create policy p_comms_w on public.comms_log for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin')) with check (fn_current_role() in ('operations','business_owner','super_admin'));

-- Default templates. {{placeholders}} are filled at queue time.
insert into public.message_template (template_key, name, subject, body) values
  ('booking_confirmation', 'Booking confirmation', 'Your booking is confirmed: {{course}}',
   'Hi {{name}},\n\nYour booking for {{course}} on {{date}} is confirmed.\n\nThank you,\nTUV Rheinland Academy'),
  ('session_reminder', 'Session reminder', 'Reminder: {{course}} on {{date}}',
   'Hi {{name}},\n\nThis is a reminder that {{course}} runs on {{date}}. We look forward to seeing you.\n\nTUV Rheinland Academy'),
  ('payment_reminder', 'Payment reminder', 'Payment reminder for order {{order}}',
   'Hello {{company}},\n\nOur records show an outstanding balance of PHP {{balance}} on order {{order}}. Please arrange payment at your earliest convenience.\n\nThank you,\nTUV Rheinland Academy'),
  ('certificate_issued', 'Certificate issued', 'Your certificate for {{course}}',
   'Hi {{name}},\n\nCongratulations. Your certificate {{cert}} for {{course}} has been issued.\n\nTUV Rheinland Academy')
on conflict (template_key) do nothing;

-- Render a template with its variables into a subject and body.
create or replace function public.fn_render_template(p_key text, p_vars jsonb)
returns table(subject text, body text)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_sub text; v_body text; k text; v text;
begin
  select t.subject, t.body into v_sub, v_body from message_template t where t.template_key = p_key and t.active;
  if not found then return; end if;
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_sub := replace(v_sub, '{{' || k || '}}', v);
    v_body := replace(v_body, '{{' || k || '}}', v);
  end loop;
  subject := v_sub; body := v_body; return next;
end $$;

-- Queue one email from a template (manual send from the app).
create or replace function public.fn_queue_email(p_template_key text, p_to_email text, p_entity_type text, p_entity_id text, p_vars jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_sub text; v_body text; v_id uuid;
begin
  if coalesce(fn_current_role() in ('operations','business_owner','super_admin'), false) is not true then
    raise exception 'Only operations can send messages.';
  end if;
  select subject, body into v_sub, v_body from fn_render_template(p_template_key, p_vars);
  if v_sub is null then raise exception 'Template % not found.', p_template_key; end if;
  insert into comms_log(template_key, to_email, subject, body, entity_type, entity_id, created_by)
    values (p_template_key, p_to_email, v_sub, v_body, p_entity_type, p_entity_id, auth.uid())
    returning comm_id into v_id;
  return v_id;
end $$;

-- Queue reminders: session reminders three days out, and payment reminders for
-- overdue balances. De-duplicates against the last seven days. Runs as definer
-- so the nightly job can call it.
create or replace function public.fn_queue_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count int := 0; r record; v_sub text; v_body text;
begin
  for r in
    select p.full_name, p.email, co.course_name, s.start_date, s.schedule_id
      from participant p
      join schedule s on s.schedule_id = p.schedule_id
      join course co on co.course_id = s.course_id
     where s.start_date = current_date + 3 and p.email is not null
       and not exists (select 1 from comms_log c where c.entity_type = 'session' and c.entity_id = s.schedule_id::text
                         and c.to_email = p.email and c.template_key = 'session_reminder' and c.created_at > now() - interval '7 days')
  loop
    select subject, body into v_sub, v_body from fn_render_template('session_reminder',
      jsonb_build_object('name', r.full_name, 'course', r.course_name, 'date', to_char(r.start_date, 'FMMonth DD, YYYY')));
    if v_sub is not null then
      insert into comms_log(template_key, to_email, subject, body, entity_type, entity_id)
        values ('session_reminder', r.email, v_sub, v_body, 'session', r.schedule_id::text);
      v_count := v_count + 1;
    end if;
  end loop;

  for r in
    select ar.order_id, ar.balance, ar.company, ar.client_name, cl.email
      from v_order_ar ar
      join orders o on o.order_id = ar.order_id
      left join client cl on cl.client_id = o.client_id
     where ar.balance > 0 and ar.due_date is not null and ar.due_date < current_date and cl.email is not null
       and not exists (select 1 from comms_log c where c.entity_type = 'order' and c.entity_id = ar.order_id
                         and c.template_key = 'payment_reminder' and c.created_at > now() - interval '7 days')
  loop
    select subject, body into v_sub, v_body from fn_render_template('payment_reminder',
      jsonb_build_object('company', coalesce(r.company, r.client_name, ''), 'order', r.order_id, 'balance', to_char(r.balance, 'FM999,999,990')));
    if v_sub is not null then
      insert into comms_log(template_key, to_email, subject, body, entity_type, entity_id)
        values ('payment_reminder', r.email, v_sub, v_body, 'order', r.order_id);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;
grant execute on function public.fn_queue_reminders() to authenticated;


-- ############################################################################
-- ## 20260808200000_quotations.sql
-- ############################################################################

-- Quotations. A formal quote with line items, a discount, and a validity date,
-- that a salesperson can send and then turn into an order.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create sequence if not exists public.quote_seq;
-- The anon key runs as authenticated; without USAGE on the sequence, inserting a
-- quote (whose quote_number default calls nextval) fails with "permission denied
-- for sequence quote_seq".
grant usage, select on sequence public.quote_seq to authenticated;

create table if not exists public.quote (
  quote_id uuid primary key default gen_random_uuid(),
  quote_number text not null default ('QUO-' || lpad(nextval('public.quote_seq')::text, 5, '0')),
  client_id uuid references public.client(client_id) on delete set null,
  inquiry_id uuid,
  sales_id uuid,
  status text not null default 'Draft',        -- Draft, Sent, Accepted, Declined, Expired
  valid_until date,
  discount_pct numeric not null default 0,
  note text,
  converted_order_id text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists quote_client_idx on public.quote(client_id);

create table if not exists public.quote_line (
  line_id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quote(quote_id) on delete cascade,
  course_id uuid,
  modality modality_t not null default 'Face-to-face',
  seats integer not null default 1,
  unit_price numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists quote_line_quote_idx on public.quote_line(quote_id);

alter table public.quote enable row level security;
alter table public.quote_line enable row level security;

-- Read for any signed-in role. Manage for super admin and sales.
drop policy if exists p_quote_r on public.quote;
create policy p_quote_r on public.quote for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_quote_w on public.quote;
create policy p_quote_w on public.quote for all to authenticated
  using (fn_current_role() in ('super_admin','sales')) with check (fn_current_role() in ('super_admin','sales'));

drop policy if exists p_quote_line_r on public.quote_line;
create policy p_quote_line_r on public.quote_line for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_quote_line_w on public.quote_line;
create policy p_quote_line_w on public.quote_line for all to authenticated
  using (fn_current_role() in ('super_admin','sales')) with check (fn_current_role() in ('super_admin','sales'));

-- Quote totals for the list and the detail header.
create or replace view public.v_quote_total as
  select q.quote_id,
         coalesce((select sum(l.seats * l.unit_price) from quote_line l where l.quote_id = q.quote_id), 0) as subtotal,
         q.discount_pct,
         round(coalesce((select sum(l.seats * l.unit_price) from quote_line l where l.quote_id = q.quote_id), 0) * (1 - q.discount_pct / 100.0), 2) as total
    from quote q;


-- ############################################################################
-- ## 20260808210000_crm_depth.sql
-- ############################################################################

-- CRM depth. Multiple contacts per client, richer inquiry fields, and a
-- Closed Lost stage with a reason.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.
-- Note: the ALTER TYPE runs on its own; keep it as the first statement.

alter type inquiry_status_t add value if not exists 'Closed Lost';

create table if not exists public.contact (
  contact_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.client(client_id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contact_client_idx on public.contact(client_id);

alter table public.contact enable row level security;
drop policy if exists p_contact_r on public.contact;
create policy p_contact_r on public.contact for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_contact_w on public.contact;
create policy p_contact_w on public.contact for all to authenticated
  using (fn_current_role() in ('super_admin','sales')) with check (fn_current_role() in ('super_admin','sales'));

-- Richer inquiry fields.
alter table public.inquiry add column if not exists est_value numeric;
alter table public.inquiry add column if not exists probability integer;
alter table public.inquiry add column if not exists expected_close date;
alter table public.inquiry add column if not exists source text;
alter table public.inquiry add column if not exists lost_reason text;

-- Make sure the client interaction log is readable and writable.
alter table public.client_interaction enable row level security;
drop policy if exists p_ci_r on public.client_interaction;
create policy p_ci_r on public.client_interaction for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_ci_w on public.client_interaction;
create policy p_ci_w on public.client_interaction for all to authenticated
  using (fn_current_role() in ('super_admin','sales')) with check (fn_current_role() in ('super_admin','sales'));


-- ############################################################################
-- ## 20260808220000_trainer_management.sql
-- ############################################################################

-- Trainer management for operations: availability (blackout dates) enforced when
-- assigning a trainer, co-trainers on a session, and competency policies.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create table if not exists public.trainer_availability (
  avail_id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer(trainer_id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists trainer_avail_idx on public.trainer_availability(trainer_id, start_date);

create table if not exists public.session_trainer (
  schedule_id uuid not null references public.schedule(schedule_id) on delete cascade,
  trainer_id uuid not null references public.trainer(trainer_id) on delete cascade,
  role text not null default 'Assistant',   -- Lead, Assistant
  primary key (schedule_id, trainer_id)
);

alter table public.trainer_availability enable row level security;
alter table public.session_trainer enable row level security;
alter table public.trainer_course enable row level security;

drop policy if exists p_avail_r on public.trainer_availability;
create policy p_avail_r on public.trainer_availability for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_avail_w on public.trainer_availability;
create policy p_avail_w on public.trainer_availability for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

drop policy if exists p_strainer_r on public.session_trainer;
create policy p_strainer_r on public.session_trainer for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_strainer_w on public.session_trainer;
create policy p_strainer_w on public.session_trainer for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

drop policy if exists p_tcourse_r on public.trainer_course;
create policy p_tcourse_r on public.trainer_course for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_tcourse_w on public.trainer_course;
create policy p_tcourse_w on public.trainer_course for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

-- Block assigning a trainer to a session that overlaps their blackout.
create or replace function public.fn_trainer_blackout_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_name text;
begin
  if new.trainer_id is null then return new; end if;
  if exists (
    select 1 from trainer_availability a
    where a.trainer_id = new.trainer_id
      and a.start_date <= new.end_date and a.end_date >= new.start_date
  ) then
    select name into v_name from trainer where trainer_id = new.trainer_id;
    raise exception 'Trainer % is on blackout for these dates.', coalesce(v_name, 'selected');
  end if;
  return new;
end $$;
drop trigger if exists trg_trainer_blackout on public.schedule;
create trigger trg_trainer_blackout before insert or update of trainer_id, start_date, end_date on public.schedule
  for each row execute function public.fn_trainer_blackout_guard();


-- ############################################################################
-- ## 20260808230000_session_profitability.sql
-- ############################################################################

-- Session profitability. Revenue against trainer, co-trainer, venue, and
-- material cost, so each session shows a margin.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

alter table public.schedule add column if not exists material_cost numeric not null default 0;

create or replace view public.v_session_pnl as
  select x.*,
         (x.trainer_cost + x.venue_cost + x.material_cost) as total_cost,
         x.revenue - (x.trainer_cost + x.venue_cost + x.material_cost) as margin
  from (
    select s.schedule_id, co.course_name, s.start_date, s.status, s.country,
           coalesce(s.duration_days, 1) as days,
           coalesce(s.actual_revenue, s.booked_participants * s.price, 0) as revenue,
           (coalesce(t.daily_rate, 0)
             + coalesce((select sum(tr.daily_rate) from session_trainer st join trainer tr on tr.trainer_id = st.trainer_id where st.schedule_id = s.schedule_id), 0)
           ) * coalesce(s.duration_days, 1) as trainer_cost,
           coalesce(v.day_rate, 0) * coalesce(s.duration_days, 1) as venue_cost,
           coalesce(s.material_cost, 0) as material_cost
      from schedule s
      join course co on co.course_id = s.course_id
      left join trainer t on t.trainer_id = s.trainer_id
      left join venue v on v.venue_id = s.venue_id
  ) x;


-- ############################################################################
-- ## 20260808240000_waitlist_sla.sql
-- ############################################################################

-- Waitlist automation and a configurable SLA engine.
--
-- 1. When seats free up on a session, the oldest waitlisted bookings that fit
--    are promoted to a seat automatically, and their owner is notified.
-- 2. A per-stage SLA policy drives a breach view and an escalation function.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- ---- Waitlist auto-promotion ----
create or replace function public.fn_waitlist_autopromote()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_sid uuid; v_max int; v_taken int; v_free int; r record; v_uid uuid;
begin
  if tg_op = 'DELETE' then
    v_sid := old.schedule_id;
  elsif tg_op = 'UPDATE' then
    if old.line_status in ('New','Confirmed','Completed')
       and (new.line_status not in ('New','Confirmed','Completed') or new.seats < old.seats) then
      v_sid := coalesce(new.schedule_id, old.schedule_id);
    else
      return coalesce(new, old);   -- not a seat-freeing change (and avoids recursion on promote)
    end if;
  else
    return coalesce(new, old);
  end if;
  if v_sid is null then return coalesce(new, old); end if;

  select max_participants into v_max from schedule where schedule_id = v_sid;
  if v_max is null then return coalesce(new, old); end if;
  select coalesce(sum(seats), 0) into v_taken from order_line
    where schedule_id = v_sid and line_status in ('New','Confirmed','Completed');
  v_free := v_max - v_taken;

  for r in
    select line_id, order_id, seats from order_line
    where schedule_id = v_sid and line_status = 'Waitlist' order by created_at
  loop
    exit when v_free <= 0;
    if r.seats <= v_free then
      update order_line set line_status = 'New' where line_id = r.line_id;
      v_free := v_free - r.seats;
      select coalesce(
        (select p.user_id from profiles p join order_assignment oa on oa.sales_id = p.sales_id where oa.order_id = r.order_id limit 1),
        (select created_by from orders where order_id = r.order_id)
      ) into v_uid;
      if v_uid is not null then
        insert into notification(recipient_id, kind, title, body, entity_type, entity_id, actor_id)
        values (v_uid, 'system', 'Waitlist promoted',
                'A waitlisted booking on order ' || r.order_id || ' moved to a seat.', 'order', r.order_id, auth.uid());
      end if;
    end if;
  end loop;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_waitlist_autopromote on public.order_line;
create trigger trg_waitlist_autopromote after update or delete on public.order_line
  for each row execute function public.fn_waitlist_autopromote();

-- ---- SLA engine ----
create table if not exists public.sla_policy (
  stage text primary key,
  max_days integer not null,
  active boolean not null default true
);
insert into public.sla_policy (stage, max_days) values
  ('New', 3), ('In Communication', 5), ('For Order Creation', 3), ('Endorsed to Ops', 5), ('No Feedback', 7)
on conflict (stage) do nothing;

alter table public.sla_policy enable row level security;
drop policy if exists p_sla_r on public.sla_policy;
create policy p_sla_r on public.sla_policy for select to authenticated using (fn_current_role() is not null);
drop policy if exists p_sla_w on public.sla_policy;
create policy p_sla_w on public.sla_policy for all to authenticated
  using (fn_current_role() in ('operations','super_admin')) with check (fn_current_role() in ('operations','super_admin'));

create or replace view public.v_sla_breach as
  select q.order_id, q.company, q.fulfillment_stage, q.owner, q.total_amount,
         q.days_in_stage, p.max_days, (q.days_in_stage - p.max_days) as days_over
    from v_fulfillment_queue q
    join sla_policy p on p.stage = q.fulfillment_stage::text and p.active
   where q.days_in_stage > p.max_days
   order by (q.days_in_stage - p.max_days) desc;

-- Notify order owners of SLA breaches, de-duplicated over three days. For the
-- nightly job or an on-demand run.
create or replace function public.fn_notify_sla_breaches()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count int := 0; r record; v_uid uuid;
begin
  for r in select order_id, fulfillment_stage, days_over from v_sla_breach loop
    select p.user_id into v_uid from profiles p
      join order_assignment oa on oa.sales_id = p.sales_id where oa.order_id = r.order_id limit 1;
    if v_uid is null then continue; end if;
    if exists (select 1 from notification n where n.recipient_id = v_uid and n.entity_type = 'order'
                 and n.entity_id = r.order_id and n.kind = 'sla' and n.created_at > now() - interval '3 days') then
      continue;
    end if;
    insert into notification(recipient_id, kind, title, body, entity_type, entity_id)
      values (v_uid, 'sla', 'SLA breach on order ' || r.order_id,
              'Order ' || r.order_id || ' is ' || r.days_over || ' day(s) over the ' || r.fulfillment_stage || ' target.', 'order', r.order_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
grant execute on function public.fn_notify_sla_breaches() to authenticated;


-- ############################################################################
-- ## 20260808250000_analytics.sql
-- ############################################################################

-- Analytics. A conversion funnel across inquiries, quotes, and orders.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create or replace function public.fn_funnel()
returns table(inquiries bigint, open_inq bigint, won bigint, lost bigint,
              quotes bigint, quotes_accepted bigint, orders_total bigint)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    (select count(*) from inquiry),
    (select count(*) from inquiry where status in ('Received','Responded','RFQ or P Sent','Awaiting Feedback')),
    (select count(*) from inquiry where status = 'Closed Won'),
    (select count(*) from inquiry where status::text = 'Closed Lost'),
    (select count(*) from quote),
    (select count(*) from quote where status = 'Accepted'),
    (select count(*) from orders where order_status <> 'Cancelled');
$$;
grant execute on function public.fn_funnel() to authenticated;

-- Forecast against actual, per session. Forecast is a full room at the session
-- price; actual is what the roster has booked (or the recorded revenue).
-- Named distinctly from the base v_forecast_vs_actual (a different, pre-existing
-- view) so create-or-replace never has to reshape that view's columns.
create or replace view public.v_session_forecast as
  select s.schedule_id,
         co.course_name,
         s.start_date,
         s.status,
         coalesce(s.max_participants, 0) as capacity,
         coalesce(s.booked_participants, 0) as booked,
         coalesce(s.max_participants, 0) * coalesce(s.price, 0) as forecast_revenue,
         coalesce(s.actual_revenue, s.booked_participants * s.price, 0) as actual_revenue
    from schedule s
    join course co on co.course_id = s.course_id;


-- ############################################################################
-- ## 20260808260000_access_scoping.sql
-- ############################################################################

-- Access scoping. Two changes:
--
--  1. Order read visibility is scoped for the sales role. Operations, business
--     owners, and super admins keep full read (they manage across the pool).
--     A salesperson sees an order when they created it, when the assigned
--     salesperson is on their team, or — for supervisors — anywhere in their
--     region. Other roles are unaffected.
--
--  2. Helper functions expose the caller's team and region so the policy and the
--     app can reason about scope consistently.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor. If it is
-- never applied the old "all authenticated read all orders" policy stays in
-- force, so the app keeps working either way.

create or replace function public.fn_current_team()
returns text
language sql stable security definer set search_path to 'public'
as $$ select team from salesperson where sales_id = fn_current_sales_id() $$;
grant execute on function public.fn_current_team() to authenticated;

create or replace function public.fn_current_region()
returns text
language sql stable security definer set search_path to 'public'
as $$ select region from salesperson where sales_id = fn_current_sales_id() $$;
grant execute on function public.fn_current_region() to authenticated;

-- Replace the blanket order read policy with a scoped one. Ensure RLS is
-- actually enabled on orders first — a policy has no effect on a table whose
-- row security is off, which would leave the scoping silently inert.
alter table public.orders enable row level security;
drop policy if exists p_orders_r on public.orders;
create policy p_orders_r on public.orders for select to authenticated
using (
  -- Roles that manage the whole pool see everything.
  fn_current_role() in ('super_admin','operations','business_owner')
  -- Sales always see what they created.
  or created_by = auth.uid()
  -- Sales see orders owned by a teammate; supervisors, the whole region.
  or exists (
    select 1
      from order_assignment oa
      join salesperson sp on sp.sales_id = oa.sales_id
     where oa.order_id = orders.order_id
       and (
         (fn_current_team() is not null and sp.team is not distinct from fn_current_team())
         or (fn_is_supervisor() and fn_current_region() is not null and sp.region is not distinct from fn_current_region())
       )
  )
);


-- ############################################################################
-- ## 20260808270000_feedback_quality.sql
-- ############################################################################

-- Feedback and quality. Post-course feedback with an NPS score and content,
-- trainer, and venue ratings; a complaint register for issues raised against an
-- order, client, or session.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- ---- Feedback ----
create table if not exists public.feedback (
  feedback_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedule(schedule_id) on delete cascade,
  participant_id uuid references public.participant(participant_id) on delete set null,
  nps smallint check (nps between 0 and 10),
  content_rating smallint check (content_rating between 1 and 5),
  trainer_rating smallint check (trainer_rating between 1 and 5),
  venue_rating smallint check (venue_rating between 1 and 5),
  comments text,
  submitted_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists ix_feedback_schedule on public.feedback(schedule_id);

alter table public.feedback enable row level security;
drop policy if exists p_feedback_r on public.feedback;
create policy p_feedback_r on public.feedback for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_feedback_w on public.feedback;
create policy p_feedback_w on public.feedback for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));

-- Per-session feedback rollup with the NPS score
-- (% promoters [9-10] minus % detractors [0-6]).
create or replace view public.v_session_feedback as
  select f.schedule_id,
         co.course_name,
         s.start_date,
         s.trainer_id,
         count(*) as responses,
         round(avg(f.content_rating)::numeric, 2) as avg_content,
         round(avg(f.trainer_rating)::numeric, 2) as avg_trainer,
         round(avg(f.venue_rating)::numeric, 2) as avg_venue,
         count(*) filter (where f.nps >= 9) as promoters,
         count(*) filter (where f.nps between 7 and 8) as passives,
         count(*) filter (where f.nps between 0 and 6) as detractors,
         case when count(*) filter (where f.nps is not null) > 0
              then round((count(*) filter (where f.nps >= 9) - count(*) filter (where f.nps between 0 and 6))::numeric
                          * 100 / count(*) filter (where f.nps is not null), 0)
         end as nps_score
    from feedback f
    join schedule s on s.schedule_id = f.schedule_id
    join course co on co.course_id = s.course_id
   group by f.schedule_id, co.course_name, s.start_date, s.trainer_id;

-- Per-trainer quality rollup across all their rated sessions.
create or replace view public.v_trainer_quality as
  select t.trainer_id, t.name, t.code,
         count(f.feedback_id) as responses,
         round(avg(f.trainer_rating)::numeric, 2) as avg_trainer,
         round(avg(f.content_rating)::numeric, 2) as avg_content,
         count(*) filter (where f.nps >= 9) as promoters,
         count(*) filter (where f.nps between 0 and 6) as detractors,
         case when count(*) filter (where f.nps is not null) > 0
              then round((count(*) filter (where f.nps >= 9) - count(*) filter (where f.nps between 0 and 6))::numeric
                          * 100 / count(*) filter (where f.nps is not null), 0)
         end as nps_score
    from trainer t
    left join schedule s on s.trainer_id = t.trainer_id
    left join feedback f on f.schedule_id = s.schedule_id
   where t.active
   group by t.trainer_id, t.name, t.code;

-- Overall NPS across every response, for the quality overview.
create or replace function public.fn_nps_summary()
returns table(responses bigint, promoters bigint, passives bigint, detractors bigint,
              nps_score numeric, avg_content numeric, avg_trainer numeric)
language sql stable security definer set search_path to 'public'
as $$
  select count(*) filter (where nps is not null),
         count(*) filter (where nps >= 9),
         count(*) filter (where nps between 7 and 8),
         count(*) filter (where nps between 0 and 6),
         case when count(*) filter (where nps is not null) > 0
              then round((count(*) filter (where nps >= 9) - count(*) filter (where nps between 0 and 6))::numeric
                          * 100 / count(*) filter (where nps is not null), 0) end,
         round(avg(content_rating)::numeric, 2),
         round(avg(trainer_rating)::numeric, 2)
    from feedback;
$$;
grant execute on function public.fn_nps_summary() to authenticated;

-- ---- Complaints ----
create table if not exists public.complaint (
  complaint_id uuid primary key default gen_random_uuid(),
  subject text not null,
  description text,
  severity text not null default 'Medium' check (severity in ('Low','Medium','High')),
  status text not null default 'Open' check (status in ('Open','In Progress','Resolved','Closed')),
  client_id uuid references public.client(client_id) on delete set null,
  order_id text references public.orders(order_id) on delete set null,
  schedule_id uuid references public.schedule(schedule_id) on delete set null,
  assigned_to uuid,
  resolution text,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ix_complaint_status on public.complaint(status);

-- Stamp resolved_at when a complaint moves to a closed state, and clear it if
-- it reopens.
create or replace function public.fn_complaint_stamp()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status in ('Resolved','Closed') and (old.status is null or old.status not in ('Resolved','Closed')) then
    new.resolved_at := now();
  elsif new.status not in ('Resolved','Closed') then
    new.resolved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_complaint_stamp on public.complaint;
create trigger trg_complaint_stamp before insert or update on public.complaint
  for each row execute function public.fn_complaint_stamp();

alter table public.complaint enable row level security;
-- Anyone signed in can raise and read complaints; ops and above manage them.
drop policy if exists p_complaint_r on public.complaint;
create policy p_complaint_r on public.complaint for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_complaint_i on public.complaint;
create policy p_complaint_i on public.complaint for insert to authenticated
  with check (fn_current_role() is not null);
drop policy if exists p_complaint_u on public.complaint;
create policy p_complaint_u on public.complaint for update to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));


-- ############################################################################
-- ## 20260808280000_pricing_country_audit.sql
-- ############################################################################

-- Phase N. Three additions:
--
--  1. A pricing and discount engine: reusable discount rules (volume or type
--     based) and a function that returns the rules applicable to a booking, so
--     quotes and sales entry can advise the best discount without hard-coding it.
--  2. Multi-country scaffolding: a fn_current_country() helper and a country
--     currency lookup, plus a v_country_revenue rollup by country and currency.
--  3. A global audit search function for the super-admin audit browser.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor. Nothing here
-- changes existing booking math — the discount engine is advisory.

-- ---- Pricing and discount rules ----
create table if not exists public.discount_rule (
  rule_id uuid primary key default gen_random_uuid(),
  label text not null,
  course_id uuid references public.course(course_id) on delete cascade,   -- null = all courses
  training_type training_type_t,                                          -- null = all types
  country country_t,                                                      -- null = all countries
  min_seats integer not null default 1,
  discount_pct numeric check (discount_pct >= 0 and discount_pct <= 100),
  discount_amount numeric check (discount_amount >= 0),
  active boolean not null default true,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now()
);

alter table public.discount_rule enable row level security;
drop policy if exists p_discount_r on public.discount_rule;
create policy p_discount_r on public.discount_rule for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_discount_w on public.discount_rule;
create policy p_discount_w on public.discount_rule for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));

-- Rules that apply to a given course / type / country / seat count, today,
-- richest discount first.
create or replace function public.fn_applicable_discounts(
  p_course uuid default null,
  p_type text default null,
  p_country text default null,
  p_seats integer default 1
)
returns setof public.discount_rule
language sql stable security definer set search_path to 'public'
as $$
  select *
    from discount_rule r
   where r.active
     and (r.course_id is null or r.course_id = p_course)
     and (r.training_type is null or p_type is null or r.training_type::text = p_type)
     and (r.country is null or p_country is null or r.country::text = p_country)
     and r.min_seats <= coalesce(p_seats, 1)
     and (r.valid_from is null or r.valid_from <= current_date)
     and (r.valid_to is null or r.valid_to >= current_date)
   order by coalesce(r.discount_pct, 0) desc, coalesce(r.discount_amount, 0) desc;
$$;
grant execute on function public.fn_applicable_discounts(uuid, text, text, integer) to authenticated;

-- ---- Multi-country ----
-- The caller's country, taken from their linked salesperson's region mapping is
-- not reliable, so we expose it from the profile-linked salesperson's most
-- recent order country, falling back to PH. Kept as a helper for reporting and
-- future country-scoped policies; not enforced in RLS here.
create or replace function public.fn_current_country()
returns country_t
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select o.country from orders o
       where o.created_by = auth.uid()
       order by o.created_at desc limit 1),
    'PH'::country_t
  );
$$;
grant execute on function public.fn_current_country() to authenticated;

create or replace view public.v_country_revenue as
  select o.country,
         o.currency,
         count(*) as orders,
         sum(o.total_seats) as seats,
         sum(o.total_amount) as booked
    from orders o
   where o.order_status <> 'Cancelled'
   group by o.country, o.currency
   order by sum(o.total_amount) desc;

-- ---- Global audit search ----
-- A filterable window over audit_log for the super-admin browser. Every
-- argument is optional; nulls widen the search.
create or replace function public.fn_audit_search(
  p_table text default null,
  p_action text default null,
  p_role text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_limit integer default 200
)
returns table(audit_id bigint, table_name text, row_pk text, action text,
              actor_role text, actor_id uuid, changed_at timestamptz, changed_fields jsonb)
language sql stable security definer set search_path to 'public'
as $$
  select a.audit_id, a.table_name, a.row_pk, a.action, a.actor_role, a.actor_id, a.changed_at, a.changed_fields
    from audit_log a
   where fn_current_role() = 'super_admin'
     and (p_table is null or a.table_name = p_table)
     and (p_action is null or a.action = p_action)
     and (p_role is null or a.actor_role::text = p_role)
     and (p_from is null or a.changed_at >= p_from)
     and (p_to is null or a.changed_at <= p_to)
     and (p_search is null or a.row_pk ilike '%' || p_search || '%' or a.changed_fields::text ilike '%' || p_search || '%')
   order by a.changed_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
grant execute on function public.fn_audit_search(text, text, text, timestamptz, timestamptz, text, integer) to authenticated;


-- ############################################################################
-- ## 20260808290000_rls_hardening.sql
-- ############################################################################

-- RLS hardening found by the QA simulation.
--
-- 1. Order-linked child tables (order_line, participant, invoice, payment) were
--    readable by ANY authenticated user (using (fn_current_role() is not null)),
--    so the phase-L order scoping was cosmetic: a sales user scoped out of an
--    order could still read its participants' PII and its financials directly
--    via PostgREST. Scope each child's SELECT to the same visibility as its
--    order.
-- 2. The AR/analytics views added after the security-hardening batch never got
--    security_invoker, so they ran as owner and ignored RLS. Set it so they
--    honour the caller's row access.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- Single source of truth for "can the caller see this order", mirroring p_orders_r.
create or replace function public.fn_can_see_order(p_order text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select
    fn_current_role() in ('super_admin','operations','business_owner')
    or exists (select 1 from orders o where o.order_id = p_order and o.created_by = auth.uid())
    or exists (
      select 1 from order_assignment oa join salesperson sp on sp.sales_id = oa.sales_id
       where oa.order_id = p_order
         and ((fn_current_team() is not null and sp.team is not distinct from fn_current_team())
           or (fn_is_supervisor() and fn_current_region() is not null and sp.region is not distinct from fn_current_region())));
$$;
grant execute on function public.fn_can_see_order(text) to authenticated;

-- Ensure row security is actually on for the child tables (a policy is inert
-- otherwise), then scope each SELECT to the order's visibility.
alter table public.order_line enable row level security;
alter table public.participant enable row level security;
alter table public.invoice enable row level security;
alter table public.payment enable row level security;

drop policy if exists order_line_read on public.order_line;
create policy order_line_read on public.order_line for select to authenticated
  using (fn_can_see_order(order_id));

drop policy if exists participant_read on public.participant;
create policy participant_read on public.participant for select to authenticated
  using (fn_can_see_order(order_id));

drop policy if exists p_invoice_r on public.invoice;
create policy p_invoice_r on public.invoice for select to authenticated
  using (fn_can_see_order(order_id));

drop policy if exists p_payment_r on public.payment;
create policy p_payment_r on public.payment for select to authenticated
  using (fn_can_see_order(order_id));

-- Views run with the caller's row access, not the owner's.
alter view public.v_order_ar set (security_invoker = true);
alter view public.v_session_pnl set (security_invoker = true);
alter view public.v_session_forecast set (security_invoker = true);
alter view public.v_country_revenue set (security_invoker = true);


-- ############################################################################
-- ## 20260808300000_rls_ownership.sql
-- ############################################################################

-- RLS ownership hardening (QA findings S3–S6). Role gates alone let one sales
-- rep act on another rep's rows; add ownership predicates. All app inserts stamp
-- created_by / sales_id with the current user, so these do not affect the happy
-- path (a rep always retains access to what they create).
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- S3 — Quotes: a rep may write only their own quotes (or unassigned ones they
-- created); super_admin writes any. Prevents editing/accepting/deleting a
-- teammate's quote.
drop policy if exists p_quote_w on public.quote;
create policy p_quote_w on public.quote for all to authenticated
  using (fn_current_role() = 'super_admin' or created_by = auth.uid() or sales_id = fn_current_sales_id())
  with check (fn_current_role() = 'super_admin' or created_by = auth.uid() or sales_id = fn_current_sales_id());

drop policy if exists p_quote_line_w on public.quote_line;
create policy p_quote_line_w on public.quote_line for all to authenticated
  using (fn_current_role() = 'super_admin' or exists (
    select 1 from quote q where q.quote_id = quote_line.quote_id
      and (q.created_by = auth.uid() or q.sales_id = fn_current_sales_id())))
  with check (fn_current_role() = 'super_admin' or exists (
    select 1 from quote q where q.quote_id = quote_line.quote_id
      and (q.created_by = auth.uid() or q.sales_id = fn_current_sales_id())));

-- S4 — Order lines: a sales user may INSERT a line only onto an order they can
-- see (created or team-assigned), not merely any eligible-channel order. Keep
-- the sales-role + channel gate; add the visibility test to WITH CHECK (which
-- INSERT uses; the existing USING already scopes UPDATE/DELETE by assignment).
drop policy if exists order_line_write_sales on public.order_line;
create policy order_line_write_sales on public.order_line for all to authenticated
  using (
    fn_current_role() = 'sales'
    and exists (select 1 from order_assignment oa
                 where oa.order_id = order_line.order_id and oa.sales_id = fn_current_sales_id()))
  with check (
    fn_current_role() = 'sales'
    and fn_can_see_order(order_line.order_id)
    and exists (select 1 from orders o
                 where o.order_id = order_line.order_id
                   and o.channel = any (array['Inside Sales','Field Sales','In-house Request']::channel_t[])));

-- S5 — Client interactions: a rep may write only rows attributed to themselves
-- (stops attribution tampering). super_admin writes any.
drop policy if exists p_ci_w on public.client_interaction;
create policy p_ci_w on public.client_interaction for all to authenticated
  using (fn_current_role() = 'super_admin' or sales_id = fn_current_sales_id())
  with check (fn_current_role() = 'super_admin' or sales_id = fn_current_sales_id());

-- S5 — Contacts: a rep may write contacts on clients they own or on unowned
-- clients; super_admin writes any. Prevents editing a teammate's client roster.
drop policy if exists p_contact_w on public.contact;
create policy p_contact_w on public.contact for all to authenticated
  using (fn_current_role() = 'super_admin' or exists (
    select 1 from client c where c.client_id = contact.client_id
      and (c.owner_sales_id is null or c.owner_sales_id = fn_current_sales_id())))
  with check (fn_current_role() = 'super_admin' or exists (
    select 1 from client c where c.client_id = contact.client_id
      and (c.owner_sales_id is null or c.owner_sales_id = fn_current_sales_id())));

-- S6 — Email reminders: gate fn_queue_reminders to ops and above, matching
-- fn_queue_email. Without this any signed-in user could queue customer emails.
create or replace function public.fn_queue_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count int := 0; r record; v_sub text; v_body text;
begin
  if coalesce(fn_current_role() in ('operations','business_owner','super_admin'), false) is not true then
    raise exception 'Queuing reminders is limited to operations and above';
  end if;

  for r in
    select p.full_name, p.email, co.course_name, s.start_date, s.schedule_id
      from participant p
      join schedule s on s.schedule_id = p.schedule_id
      join course co on co.course_id = s.course_id
     where s.start_date = current_date + 3 and p.email is not null
       and not exists (select 1 from comms_log c where c.entity_type = 'session' and c.entity_id = s.schedule_id::text
                         and c.to_email = p.email and c.template_key = 'session_reminder' and c.created_at > now() - interval '7 days')
  loop
    select subject, body into v_sub, v_body from fn_render_template('session_reminder',
      jsonb_build_object('name', r.full_name, 'course', r.course_name, 'date', to_char(r.start_date, 'FMMonth DD, YYYY')));
    if v_sub is not null then
      insert into comms_log(template_key, to_email, subject, body, entity_type, entity_id)
        values ('session_reminder', r.email, v_sub, v_body, 'session', r.schedule_id::text);
      v_count := v_count + 1;
    end if;
  end loop;

  for r in
    select ar.order_id, ar.balance, ar.company, ar.client_name, cl.email
      from v_order_ar ar
      join orders o on o.order_id = ar.order_id
      left join client cl on cl.client_id = o.client_id
     where ar.balance > 0 and ar.due_date is not null and ar.due_date < current_date and cl.email is not null
       and not exists (select 1 from comms_log c where c.entity_type = 'order' and c.entity_id = ar.order_id
                         and c.template_key = 'payment_reminder' and c.created_at > now() - interval '7 days')
  loop
    select subject, body into v_sub, v_body from fn_render_template('payment_reminder',
      jsonb_build_object('company', coalesce(r.company, r.client_name, ''), 'order', r.order_id, 'balance', to_char(r.balance, 'FM999,999,990')));
    if v_sub is not null then
      insert into comms_log(template_key, to_email, subject, body, entity_type, entity_id)
        values ('payment_reminder', r.email, v_sub, v_body, 'order', r.order_id);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;
grant execute on function public.fn_queue_reminders() to authenticated;


-- ############################################################################
-- ## 20260808310000_enable_rls_all.sql
-- ############################################################################

-- Ensure row level security is ENABLED on every base table that ships RLS
-- policies. A policy has no effect while row security is off, so any table that
-- has deliberately-authored policies but never had `enable row level security`
-- is silently wide open to the anon key.
--
-- This was found during CRUD verification: with RLS off on `profiles`, a signed-in
-- `sales` user could `update profiles set role='super_admin' where user_id =
-- auth.uid()` and escalate to super admin; and edit every salesperson, course,
-- price, and schedule directly via PostgREST regardless of the UI guards.
--
-- Enabling RLS activates the policies that already exist (which are role-scoped
-- as intended), so legitimate role-based writes keep working while the direct-API
-- bypass closes. Idempotent: enabling an already-enabled table is a no-op, so this
-- is safe to run against a database where some or all of these are already on.

do $$
declare r record;
begin
  for r in
    select distinct c.relname
      from pg_class c
      join pg_namespace nsp on nsp.oid = c.relnamespace and nsp.nspname = 'public'
     where c.relkind = 'r'
       and exists (select 1 from pg_policy p where p.polrelid = c.oid)
       and c.relrowsecurity = false
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    raise notice 'Enabled RLS on %', r.relname;
  end loop;
end $$;



-- ############################################################################
-- ## 20260809030000_pax_option_b_per_session.sql
-- ############################################################################

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


-- ############################################################################
-- ## 20260811000000_lock_search_rpcs.sql
-- ############################################################################

-- Lock down the two SECURITY DEFINER read RPCs (fn_global_search, fn_org_summary).
--
-- Both were `language sql ... security definer` with NO internal role check —
-- their only guard was the EXECUTE grant. That is brittle: a stray
-- `grant execute ... to public` (or the default PUBLIC execute that Postgres
-- gives every new function) re-opens them to anon, and because they bypass RLS
-- (definer rights) an anonymous caller could read order/client/session/org names
-- across the whole tenant. This migration closes that in depth:
--
--   1. Convert each to plpgsql with an internal gate: a caller with no role
--      (`fn_current_role() is null`, i.e. anon / no JWT) is rejected before any
--      row is read. Defense that does not depend on grants staying correct.
--   2. REVOKE EXECUTE from anon and PUBLIC, then GRANT only to authenticated.
--      Belt and suspenders with (1).
--
-- Behaviour for a signed-in user is unchanged (same columns, same order, same
-- caps). Idempotent; safe to re-apply.

-- 1. Global record search — gate + revoke/grant ------------------------------
create or replace function public.fn_global_search(p_q text)
returns table(kind text, id text, title text, subtitle text)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  -- Internal guard: only a signed-in user with a role may search.
  if fn_current_role() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  return query
  with q as (select '%' || btrim(p_q) || '%' as pat)
  select * from (
    (select 'order'::text, o.order_id, coalesce(c.company, c.name, o.order_id),
            o.fulfillment_stage::text
       from orders o left join client c on c.client_id = o.client_id, q
      where o.order_id ilike q.pat or c.company ilike q.pat or c.name ilike q.pat
      order by o.order_date desc limit 6)
    union all
    (select 'client'::text, c.client_id::text, coalesce(c.company, c.name), c.email
       from client c, q
      where c.company ilike q.pat or c.name ilike q.pat or c.email ilike q.pat
      order by c.company nulls last limit 6)
    union all
    (select 'session'::text, s.schedule_id::text, co.course_name,
            to_char(s.start_date, 'YYYY-MM-DD') || ' · ' || s.status::text
       from schedule s join course co on co.course_id = s.course_id, q
      where co.course_name ilike q.pat
      order by s.start_date desc limit 6)
    union all
    (select 'organization'::text, og.org_id::text, og.name, og.industry
       from organization og, q
      where og.name ilike q.pat
      order by og.name limit 6)
    union all
    (select 'course'::text, co.course_id::text, co.course_name, co.training_type::text
       from course co, q
      where co.course_name ilike q.pat and co.active
      order by co.course_name limit 6)
    union all
    (select 'inquiry'::text, iq.inquiry_id::text, iq.company, iq.status::text
       from inquiry iq, q
      where iq.company ilike q.pat
      order by iq.inquiry_date desc limit 6)
  ) hits;
end;
$$;

revoke execute on function public.fn_global_search(text) from public, anon;
grant execute on function public.fn_global_search(text) to authenticated;

-- 2. Organization roll-up — gate + revoke/grant -----------------------------
create or replace function public.fn_org_summary()
returns table(org_id uuid, name text, industry text, country country_t,
              client_count bigint, order_count bigint, seat_count bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if fn_current_role() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- NOTE: this is plpgsql, so the RETURNS TABLE columns (org_id, name, …) are
  -- in-scope variables. Every reference to client.org_id in the sub-selects is
  -- table-qualified (alias `cl`) so it can never bind to the OUT variable.
  return query
  select o.org_id, o.name, o.industry, o.country,
    (select count(*) from client c where c.org_id = o.org_id),
    (select count(*) from orders ord
       where ord.client_id in (select cl.client_id from client cl where cl.org_id = o.org_id)),
    (select coalesce(sum(ord.total_seats), 0) from orders ord
       where ord.client_id in (select cl.client_id from client cl where cl.org_id = o.org_id))
  from organization o
  order by o.name;
end;
$$;

revoke execute on function public.fn_org_summary() from public, anon;
grant execute on function public.fn_org_summary() to authenticated;


-- ############################################################################
-- ## 20260811010000_security_invoker_views.sql
-- ############################################################################

-- Supabase Security Advisor 0010_security_definer_view (ERROR).
--
-- Four program-era reporting views were created WITHOUT security_invoker, so
-- Postgres runs their underlying queries with the view OWNER's rights and the
-- OWNER's RLS — bypassing the querying user's row-level security. On a portal
-- where RLS is the only real access control, that is a data-exposure hole: a
-- sales user selecting from these views could see rows their own RLS would deny.
--
--   flagged: v_cert_expiring, v_quote_total, v_session_feedback, v_trainer_quality
--
-- The earlier hardening passes (20260805000000, 20260808290000) already flipped
-- the pre-program views and four other program views (v_order_ar, v_session_pnl,
-- v_session_forecast, v_country_revenue); these four were added afterwards and
-- were missed. Flip them — and defensively re-assert the rest of the program
-- views — to security_invoker so each view enforces the CALLER's RLS. These are
-- read-only aggregates over the same tables the app already reads directly, so
-- invoker-scoping simply makes view access consistent with direct access.
--
-- Idempotent (IF EXISTS + setting an already-set option is a no-op); safe to
-- re-apply and safe if a view is not present on a given database.

-- The four the advisor flagged.
alter view if exists public.v_cert_expiring    set (security_invoker = true);
alter view if exists public.v_quote_total      set (security_invoker = true);
alter view if exists public.v_session_feedback set (security_invoker = true);
alter view if exists public.v_trainer_quality  set (security_invoker = true);

-- Defensive re-assertion for the remaining program views (no-ops where already
-- set) so the whole class stays closed against future drift.
alter view if exists public.v_sla_breach       set (security_invoker = true);
alter view if exists public.v_order_ar         set (security_invoker = true);
alter view if exists public.v_session_pnl      set (security_invoker = true);
alter view if exists public.v_session_forecast set (security_invoker = true);
alter view if exists public.v_country_revenue  set (security_invoker = true);
