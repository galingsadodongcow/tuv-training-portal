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


-- ############################################################################
-- ## 20260811020000_search_path_and_roster_grants.sql
-- ############################################################################

-- Supabase advisors: 0011 function_search_path_mutable + 0028 anon can execute
-- a SECURITY DEFINER function (fn_session_roster).
--
-- 1) Pin search_path on the three functions flagged by 0011:
--    fn_stage_stamp, fn_touch_updated_at, fn_norm_org. The first two HAD it set
--    in 20260805000000, but a later `create or replace` reset the attribute
--    (create-or-replace drops options not restated); fn_norm_org exists only on
--    the live DB (repo/live drift) and never had it. A mutable search_path lets
--    the caller's role resolve unqualified names against a schema they control,
--    which for a SECURITY DEFINER / trigger function is a privilege-escalation
--    vector. We pin whatever signature actually exists (loop over pg_proc) so a
--    missing function or an unexpected signature is simply skipped, never an
--    error that aborts the bundle.
--
-- 2) Re-revoke EXECUTE on fn_session_roster(uuid) from anon/PUBLIC. It was
--    revoked in 20260805000000, but the function is dropped+recreated in
--    20260808170000 (which the bundle re-runs) and a newly created function
--    grants EXECUTE to PUBLIC by default — re-opening roster data to the anon
--    key. This migration is ordered AFTER that section, so the revoke sticks.
--    Signed-in users keep access (the session-detail screen calls it).
--
-- Idempotent; safe to re-apply.

-- 1) search_path -------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_stage_stamp', 'fn_touch_updated_at', 'fn_norm_org')
  loop
    execute format('alter function %s set search_path to ''public''', r.sig);
    raise notice 'pinned search_path on %', r.sig;
  end loop;
end $$;

-- 2) fn_session_roster: re-close to anon, keep authenticated ------------------
do $$
begin
  execute 'revoke execute on function public.fn_session_roster(uuid) from public, anon';
  execute 'grant execute on function public.fn_session_roster(uuid) to authenticated';
exception
  when undefined_function then raise notice 'fn_session_roster(uuid) not present, skipping';
end $$;


-- ############################################################################
-- ## 20260811030000_orders_sales_field_guard.sql
-- ############################################################################

-- Close the AR control gap: a sales user could change orders.payment_status
-- and orders.sap_order_no on any order they can update (their own / team),
-- because the row-level p_orders_sales_u policy is column-unrestricted. RLS
-- cannot express "sales may update the row but not these two columns", so this
-- adds a BEFORE UPDATE trigger that forbids a sales caller from changing either
-- field. Operations / business_owner / super_admin are unaffected.
--
-- Payment status and the SAP reference are AR/finance-controlled; a rep must not
-- be able to self-mark an order Paid. The UI also hides these fields from sales
-- (OrderDetail), but this trigger is the authoritative guard.
--
-- Idempotent; safe to re-apply.

create or replace function public.fn_guard_orders_sales_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if fn_current_role() = 'sales' then
    if new.payment_status is distinct from old.payment_status then
      raise exception 'sales role may not change payment_status'
        using errcode = '42501';
    end if;
    if new.sap_order_no is distinct from old.sap_order_no then
      raise exception 'sales role may not change sap_order_no'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_orders_sales_fields on public.orders;
create trigger trg_guard_orders_sales_fields
  before update on public.orders
  for each row execute function public.fn_guard_orders_sales_fields();


-- ############################################################################
-- ## 20260811040000_ops_reassign_and_transfer_guard.sql
-- ############################################################################

-- Two product-decision follow-ups from the UX review:
--
-- 1) Operations may reassign order owners. Today order_assignment writes are
--    permitted only to super_admin (p_asg_admin), business_owner / sales
--    supervisors (p_asg_lead_*), and a sales rep for their own row
--    (p_asg_sales_*). Operations was excluded. Add an operations policy so the
--    intended set — super_admin, operations, business_owner, sales supervisor —
--    can (re)assign. Policies are OR-ed per command, so this only widens access.
--
-- 2) fn_transfer_line ("move a booking to another session") is SECURITY DEFINER
--    and only checked that the caller had *a* role — a rep could move a line on
--    an order they cannot see. Add an fn_can_see_order() visibility guard so the
--    caller must be able to see the owning order. Body is otherwise unchanged.
--
-- Idempotent; safe to re-apply.

-- 1) Operations write access to order_assignment ----------------------------
drop policy if exists p_asg_ops on public.order_assignment;
create policy p_asg_ops on public.order_assignment for all to authenticated
  using      (public.fn_current_role() = 'operations'::public.user_role)
  with check (public.fn_current_role() = 'operations'::public.user_role);

-- 2) fn_transfer_line with a visibility guard --------------------------------
create or replace function public.fn_transfer_line(p_line uuid, p_new_schedule uuid, p_reason text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role user_role; v_old uuid; v_seats int; v_order text;
  v_max int; v_taken int; v_oldname text; v_newname text;
begin
  select role into v_role from profiles where user_id = auth.uid();
  if v_role is null then raise exception 'Not allowed to transfer'; end if;

  select schedule_id, seats, order_id into v_old, v_seats, v_order from order_line where line_id = p_line;
  if v_order is null then raise exception 'Order line not found'; end if;

  -- Visibility guard: the caller must be able to see the owning order.
  if not fn_can_see_order(v_order) then
    raise exception 'Not allowed to transfer this order' using errcode = '42501';
  end if;

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
end $function$;

revoke execute on function public.fn_transfer_line(uuid, uuid, text) from public, anon;
grant execute on function public.fn_transfer_line(uuid, uuid, text) to authenticated;


-- ############################################################################
-- ## 20260812000000_phase1_workflow_integrity.sql
-- ############################################################################

-- ===========================================================================
-- Phase 1 — workflow integrity & correctness (from the UX review, P0 items).
--
--   1. Enforce the order fulfillment-stage state machine in the DB (the legal
--      graph lived only in the UI; a bulk op / direct write could set any stage).
--   2. Block adding the same participant (email) to a session twice.
--   3. Wire fn_queue_reminders into nightly hygiene (it was coded but never
--      called) and auto-expire lapsed quotes.
--   4. fn_merge_orders(keep, dup, reason) — actually reconcile a duplicate
--      order (cancel it + its lines so seats/revenue stop double-counting) and
--      close the duplicate_candidate. The Duplicates screen "merge" previously
--      only flagged the row.
--   5. v_session_health — one computed health level per session (the signal
--      was scattered across Go/No-Go strings, v_cancel_readiness, v_sla_breach).
--
-- All idempotent. Validated against the live schema in a rolled-back
-- transaction before applying. Uses ::text comparisons on enums so a label
-- rename can never turn a guard into a hard error.
-- ===========================================================================

-- 1. Order fulfillment-stage state machine ----------------------------------
-- Forward moves along the pipeline are allowed; Cancelled and No Feedback may
-- be set from anywhere; reopening to New is allowed from anywhere; and once in
-- No Feedback / Cancelled a record may move on. Backward regressions within the
-- pipeline (e.g. SAP Created -> In Communication) and un-cancelling to a
-- non-New stage are blocked. System context (no JWT) and super_admin bypass, so
-- background jobs (fn_nightly_hygiene) and admins are never blocked.
create or replace function public.fn_stage_pos(p text)
returns int language sql immutable set search_path to 'public' as $$
  select case p
    when 'New' then 1
    when 'In Communication' then 2
    when 'For Order Creation' then 3
    when 'Endorsed to Ops' then 4
    when 'SAP Created' then 5
    else 0 end;   -- No Feedback / Cancelled are off the linear pipeline
$$;

create or replace function public.fn_orders_stage_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r text; oldp int; newp int;
begin
  if new.fulfillment_stage is distinct from old.fulfillment_stage then
    r := fn_current_role()::text;
    -- bypass for system/background (no role) and super_admin
    if r is not null and r <> 'super_admin' then
      oldp := fn_stage_pos(old.fulfillment_stage::text);
      newp := fn_stage_pos(new.fulfillment_stage::text);
      if not (
            new.fulfillment_stage::text in ('Cancelled','No Feedback','New')  -- cancel / flag / reopen
         or old.fulfillment_stage::text in ('Cancelled','No Feedback')        -- move on from terminal-ish
         or (newp > oldp and newp > 0 and oldp > 0)                           -- forward along the pipeline
      ) then
        raise exception 'Illegal stage change: % -> %',
          old.fulfillment_stage, new.fulfillment_stage using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_stage_guard on public.orders;
create trigger trg_orders_stage_guard
  before update on public.orders
  for each row execute function public.fn_orders_stage_guard();

-- 2. Participant duplicate-add guard (grandfathers existing data) -------------
create or replace function public.fn_participant_dedup_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.email is not null and btrim(new.email) <> '' and new.schedule_id is not null then
    if exists (
      select 1 from participant p
       where p.schedule_id = new.schedule_id
         and lower(p.email) = lower(new.email)
    ) then
      raise exception 'A participant with email % is already on this session', new.email
        using errcode = '23505';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_participant_dedup_guard on public.participant;
create trigger trg_participant_dedup_guard
  before insert on public.participant
  for each row execute function public.fn_participant_dedup_guard();

-- 3. Nightly hygiene: add reminders + quote auto-expire ----------------------
create or replace function public.fn_nightly_hygiene()
returns table(action text, affected integer)
language plpgsql security definer set search_path to 'public' as $function$
declare n1 int; n2 int; n3 int; n4 int;
begin
  update schedule set status = 'Completed'
   where status in ('Tentative', 'Confirmed')
     and end_date < current_date - 1;
  get diagnostics n1 = row_count;

  update schedule set status = 'Running'
   where status = 'Confirmed'
     and start_date <= current_date and end_date >= current_date;
  get diagnostics n2 = row_count;

  update orders set fulfillment_stage = 'No Feedback'
   where fulfillment_stage in ('New', 'In Communication')
     and stage_changed_at < now() - interval '30 days'
     and order_status <> 'Cancelled';
  get diagnostics n3 = row_count;

  -- Auto-expire quotes past their validity that were never converted.
  update quote set status = 'Expired'
   where status = 'Sent'
     and valid_until is not null and valid_until < current_date
     and converted_order_id is null;
  get diagnostics n4 = row_count;

  -- Queue session + payment reminders into comms_log. Guarded so a reminder
  -- failure can never abort nightly hygiene. (fn_queue_reminders only writes to
  -- the comms_log queue; nothing sends unless the send-comms function runs.)
  begin
    perform fn_queue_reminders();
  exception when others then null;
  end;

  return query
    select 'sessions closed'::text, n1
    union all select 'sessions running', n2
    union all select 'orders flagged no feedback', n3
    union all select 'quotes expired', n4;

  return query select * from public.fn_generate_worklist_tasks();
end $function$;

-- 4. fn_merge_orders — reconcile a duplicate order ---------------------------
create or replace function public.fn_merge_orders(p_keep text, p_dup text, p_reason text default null)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare r text;
begin
  r := fn_current_role()::text;
  if r is null or r not in ('operations','super_admin') then
    raise exception 'Only operations or super admin may merge orders' using errcode = '42501';
  end if;
  if p_keep is null or p_dup is null or p_keep = p_dup then
    raise exception 'Pick two different orders to merge';
  end if;
  if not exists (select 1 from orders where order_id = p_keep) then
    raise exception 'Surviving order % not found', p_keep;
  end if;
  if not exists (select 1 from orders where order_id = p_dup) then
    raise exception 'Duplicate order % not found', p_dup;
  end if;
  if not (fn_can_see_order(p_keep) and fn_can_see_order(p_dup)) then
    raise exception 'Not allowed to merge these orders' using errcode = '42501';
  end if;

  -- Cancel the duplicate's live lines so seats/revenue stop double-counting.
  -- The order_line rollup + totals triggers recompute session fill and order
  -- totals automatically; the audit triggers record the change.
  update order_line
     set line_status = 'Cancelled'
   where order_id = p_dup and line_status not in ('Cancelled');

  -- Cancel the duplicate order itself.
  update orders
     set order_status = 'Cancelled',
         fulfillment_stage = 'Cancelled'
   where order_id = p_dup;

  -- Close any duplicate_candidate rows pairing these two.
  update duplicate_candidate
     set status = 'Merged', resolved_by = auth.uid(), resolved_date = now()
   where status <> 'Merged'
     and ((order_id_a = p_keep and order_id_b = p_dup)
       or (order_id_a = p_dup and order_id_b = p_keep));

  return p_keep;
end $$;

revoke execute on function public.fn_merge_orders(text, text, text) from public, anon;
grant execute on function public.fn_merge_orders(text, text, text) to authenticated;

-- 5. v_session_health — one computed health level per session ----------------
-- Levels: Healthy / Needs Attention / At Risk / Blocked (terminal sessions carry
-- their own status). security_invoker so it respects the caller's RLS on schedule.
create or replace view public.v_session_health
with (security_invoker = true) as
with sig as (
  select
    s.schedule_id,
    s.status::text                                  as status,
    s.go_status::text                               as go_status,
    s.start_date,
    (s.start_date - current_date)                   as days_until,
    s.trainer_id, s.venue_id, s.modality::text      as modality,
    coalesce(s.booked_participants, 0)              as booked,
    coalesce(s.max_participants, 0)                 as max_p,
    (select count(*) from participant p
       where p.schedule_id = s.schedule_id
         and coalesce(btrim(p.full_name),'') <> '') as names_captured,
    (select coalesce(sum(ol.seats),0) from order_line ol
       where ol.schedule_id = s.schedule_id
         and ol.line_status::text not in ('Cancelled','Waitlist')) as seats_sold,
    exists (
      select 1 from order_line ol join orders o on o.order_id = ol.order_id
       where ol.schedule_id = s.schedule_id
         and ol.line_status::text not in ('Cancelled','Waitlist')
         and o.payment_status::text <> 'Paid'
         and o.order_status::text <> 'Cancelled'
    )                                               as has_unpaid
  from schedule s
  where s.deleted_at is null
)
select schedule_id, status, go_status, start_date, days_until,
  (names_captured < seats_sold)                     as roster_gap,
  has_unpaid,
  -- Health escalates with proximity: staffing/payment/roster gaps are normal far
  -- out and only matter as the date nears. "Needs Attention" is reserved for the
  -- structural planning concerns (below minimum / at capacity) so the signal
  -- stays meaningful instead of flagging every future session.
  case
    when status in ('Completed','Cancelled') then status
    when (trainer_id is null or (venue_id is null and modality = 'Face-to-face'))
         and days_until <= 14 then 'Blocked'
    when go_status = 'No-Go' and days_until <= 0 then 'Blocked'
    when go_status = 'No-Go' and days_until <= 7 then 'At Risk'
    when ((trainer_id is null or (venue_id is null and modality = 'Face-to-face')) and days_until <= 30)
         or (has_unpaid and days_until <= 7)
         or (names_captured < seats_sold and days_until <= 3) then 'At Risk'
    when go_status = 'No-Go' or (max_p > 0 and booked >= max_p) then 'Needs Attention'
    else 'Healthy'
  end                                               as health
from sig;

grant select on public.v_session_health to authenticated;


-- ############################################################################
-- ## 20260812010000_lock_trigger_fn_execute.sql
-- ############################################################################

-- ===========================================================================
-- Revoke EXECUTE on BEFORE-trigger functions from the API roles. New functions
-- default to EXECUTE for PUBLIC, which PostgREST exposes as anon-callable
-- /rest/v1/rpc endpoints; for SECURITY DEFINER trigger functions that is pure
-- attack surface (flagged by the Supabase security advisor, 0028/0029). The
-- triggers keep firing — trigger execution does not check the invoker's EXECUTE
-- privilege. Covers this pass's two functions plus the pre-existing
-- fn_guard_orders_sales_fields. Idempotent: REVOKE is a no-op when absent.
-- ===========================================================================

revoke execute on function public.fn_orders_stage_guard()        from public, anon, authenticated;
revoke execute on function public.fn_participant_dedup_guard()   from public, anon, authenticated;
revoke execute on function public.fn_guard_orders_sales_fields() from public, anon, authenticated;


-- ############################################################################
-- ## 20260812100000_phaseb_roles_enum.sql
-- ############################################################################

-- ===========================================================================
-- Phase B (second-pass) — 1/6: the 8-role model, enum values only.
--
-- Adds the four new roles agreed in the Phase A decision session (D1, D4, D7,
-- D8) to the user_role enum:
--   coordinator    — owns webshop + manual order intake, dedup, endorsement (D1)
--   sales_manager  — real team-scoped manager role (D8)
--   management     — read-only executive role (D4)
--   auditor        — read-only governance role with audit_log access (D7)
--
-- ISOLATED on purpose: `alter type ... add value` commits a new enum label, and
-- PostgreSQL forbids using a just-added label in the SAME transaction. The CI
-- bundle is applied by psql in autocommit mode (each statement its own txn), so
-- adding the labels here and USING them only in the later Phase B migration
-- files is safe. Do not add anything that references the new labels to this file.
--
-- Idempotent: `if not exists` makes re-runs a no-op.
-- ===========================================================================

alter type public.user_role add value if not exists 'coordinator';
alter type public.user_role add value if not exists 'sales_manager';
alter type public.user_role add value if not exists 'management';
alter type public.user_role add value if not exists 'auditor';


-- ############################################################################
-- ## 20260812110000_phaseb_role_rls.sql
-- ############################################################################

-- ===========================================================================
-- Phase B (second-pass) — 2/6: RLS for the 8-role model.
--
-- Uses the enum labels added in 20260812100000 (separate txn — safe under the
-- psql-autocommit bundle). Establishes the read/write posture for the four new
-- roles and folds them into the existing policies:
--
--   Read-all (SELECT everywhere): super_admin, operations, business_owner,
--     coordinator, management, auditor.  (coordinator needs the global view to
--     own intake + dedup; management/auditor are read-only by decision.)
--   Team-scoped read: sales (own + team), sales_manager (team + region, like a
--     supervisor).
--   Writes: coordinator gets operations-like INTAKE writes (orders, lines,
--     assignments, inquiries); management + auditor get NO writes anywhere;
--     auditor additionally reads audit_log.
--
-- Payments/refunds authority (D3) and the customer model live in later files.
-- All idempotent (create-or-replace fn, drop-then-create policy). ::text-free
-- role comparisons are fine here — role labels are stable enum values.
-- ===========================================================================

-- ---- Role-group helpers (single source of truth for the posture) ----------
-- Broad-read roles: see every order / lead / receivable regardless of ownership.
create or replace function public.fn_role_reads_all()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select fn_current_role() in
    ('super_admin','operations','business_owner','coordinator','management','auditor');
$$;

-- Team-lead scope: supervisors (legacy is_supervisor flag) and the new
-- sales_manager role both get region-wide visibility over their team.
create or replace function public.fn_is_team_lead()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select fn_is_supervisor() or fn_current_role() = 'sales_manager';
$$;

-- Intake-writer roles: who may create/edit orders, lines, assignments, leads.
create or replace function public.fn_role_intake_write()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select fn_current_role() in ('super_admin','operations','coordinator');
$$;

grant execute on function public.fn_role_reads_all()    to authenticated;
grant execute on function public.fn_is_team_lead()      to authenticated;
grant execute on function public.fn_role_intake_write() to authenticated;

-- ---- fn_can_see_order: widen read-all group + add sales_manager scope -------
create or replace function public.fn_can_see_order(p_order text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    fn_role_reads_all()
    or exists (select 1 from orders o where o.order_id = p_order and o.created_by = auth.uid())
    or exists (
      select 1 from order_assignment oa join salesperson sp on sp.sales_id = oa.sales_id
       where oa.order_id = p_order
         and ((fn_current_team() is not null and sp.team is not distinct from fn_current_team())
           or (fn_is_team_lead() and fn_current_region() is not null
               and sp.region is not distinct from fn_current_region())));
$$;

-- ---- orders: SELECT for read-all roles + sales_manager region scope ---------
drop policy if exists p_orders_r on public.orders;
create policy p_orders_r on public.orders for select to authenticated using (
  fn_role_reads_all()
  or (created_by = auth.uid())
  or exists (
    select 1 from order_assignment oa join salesperson sp on sp.sales_id = oa.sales_id
     where oa.order_id = orders.order_id
       and ((fn_current_team() is not null and sp.team is not distinct from fn_current_team())
         or (fn_is_team_lead() and fn_current_region() is not null
             and sp.region is not distinct from fn_current_region())))
);

-- Coordinator INTAKE writes on orders (any channel: webshop re-key + manual).
-- created_by is stamped to the coordinator for traceability on insert.
drop policy if exists p_orders_coord_i on public.orders;
create policy p_orders_coord_i on public.orders for insert to authenticated
  with check (fn_current_role() = 'coordinator' and created_by = auth.uid());

-- Widen the privileged UPDATE to include coordinator (ops/business_owner kept).
drop policy if exists p_orders_priv_u on public.orders;
create policy p_orders_priv_u on public.orders for update to authenticated
  using (fn_current_role() in ('operations','business_owner','coordinator'))
  with check (fn_current_role() in ('operations','business_owner','coordinator'));

-- ---- order_line: coordinator joins the privileged writer set ----------------
drop policy if exists order_line_write_priv on public.order_line;
create policy order_line_write_priv on public.order_line for all to authenticated
  using (fn_current_role() in ('operations','super_admin','coordinator'))
  with check (fn_current_role() in ('operations','super_admin','coordinator'));

-- ---- order_assignment: coordinator may assign; sales_manager may reassign ---
drop policy if exists p_asg_coord on public.order_assignment;
create policy p_asg_coord on public.order_assignment for all to authenticated
  using (fn_current_role() = 'coordinator')
  with check (fn_current_role() = 'coordinator');

-- Refresh the "team lead" assignment policies to include sales_manager. These
-- exist on the live DB (drop-if-exists is a no-op where they are absent).
drop policy if exists p_asg_lead_i on public.order_assignment;
create policy p_asg_lead_i on public.order_assignment for insert to authenticated
  with check (fn_current_role() = 'business_owner'
    or (fn_current_role() = 'sales' and fn_is_supervisor())
    or fn_current_role() = 'sales_manager');
drop policy if exists p_asg_lead_u on public.order_assignment;
create policy p_asg_lead_u on public.order_assignment for update to authenticated
  using (fn_current_role() = 'business_owner'
    or (fn_current_role() = 'sales' and fn_is_supervisor())
    or fn_current_role() = 'sales_manager');
drop policy if exists p_asg_lead_d on public.order_assignment;
create policy p_asg_lead_d on public.order_assignment for delete to authenticated
  using (fn_current_role() = 'business_owner'
    or (fn_current_role() = 'sales' and fn_is_supervisor())
    or fn_current_role() = 'sales_manager');

-- ---- inquiry: read-all roles + team-lead team view + coordinator intake -----
-- Existing p_inq_rw (super_admin | own sales) is kept for sales self-service and
-- write. Add SELECT for the read-all roles, a team view for sales_manager, and
-- full intake write for coordinator.
drop policy if exists p_inq_readall on public.inquiry;
create policy p_inq_readall on public.inquiry for select to authenticated
  using (fn_role_reads_all());

drop policy if exists p_inq_team_lead on public.inquiry;
create policy p_inq_team_lead on public.inquiry for select to authenticated
  using (fn_current_role() = 'sales_manager' and exists (
    select 1 from salesperson sp where sp.sales_id = inquiry.sales_id
      and sp.team is not distinct from fn_current_team()));

drop policy if exists p_inq_coord on public.inquiry;
create policy p_inq_coord on public.inquiry for all to authenticated
  using (fn_current_role() = 'coordinator')
  with check (fn_current_role() = 'coordinator');

-- ---- audit_log: add the auditor role (read-only governance) -----------------
drop policy if exists p_audit_r on public.audit_log;
create policy p_audit_r on public.audit_log for select to authenticated
  using (fn_current_role() in ('super_admin','auditor'));


-- ############################################################################
-- ## 20260812120000_phaseb_customer360.sql
-- ############################################################################

-- ===========================================================================
-- Phase B (second-pass) — 3/6: Customer 360 data model (D5).
--
-- Decision: roll the transactional `client` under `organization` (reversible,
-- low blast radius) — NOT a full collapse of client into organization.
--
--  1. Reconcile the client → organization FK drift. The live `client` table
--     carries TWO FKs to organization (org_id AND organization_id). Make
--     `organization_id` canonical and keep `org_id` as a synced, deprecated
--     mirror so any legacy reader/writer still works during the transition.
--     (A later cleanup migration may DROP org_id once nothing writes it.)
--  2. Ensure every client with a company name rolls up to an organization:
--     dedupe by normalized name (fn_norm_org) and backfill organization_id.
--  3. Resolve leads to customers: add inquiry.client_id (+ inquiry.owner for
--     O01) and backfill via email, then normalized-company, dedup.
--  4. Customer-360 read views (org contacts + org rollup), security_invoker so
--     they respect the caller's RLS.
--
-- Idempotent. No column is dropped in this pass. No RLS is loosened: client /
-- organization / contact SELECT already admit every authenticated role.
-- ===========================================================================

-- ---- 1. Canonical FK + deprecated mirror ----------------------------------
comment on column public.client.org_id is
  'DEPRECATED mirror of organization_id (Customer-360 transition). Kept in sync by trg_client_org_sync; do not write directly. Slated for removal once no app path writes it.';

create or replace function public.fn_client_org_sync()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  -- organization_id is canonical. Promote a legacy-only org_id write, then
  -- mirror canonical -> org_id so old readers keep working.
  if new.organization_id is null and new.org_id is not null then
    new.organization_id := new.org_id;
  end if;
  new.org_id := new.organization_id;
  return new;
end $$;

drop trigger if exists trg_client_org_sync on public.client;
create trigger trg_client_org_sync before insert or update on public.client
  for each row execute function public.fn_client_org_sync();

-- Converge existing rows onto the canonical value (fn_audit skips no-op rows).
update public.client
   set organization_id = coalesce(organization_id, org_id),
       org_id          = coalesce(organization_id, org_id)
 where (organization_id is not null or org_id is not null)
   and (organization_id is distinct from org_id
        or organization_id is null or org_id is null);

-- ---- 2. Roll clients under organizations (dedupe by normalized name) -------
-- Create an organization for each distinct normalized company name that has no
-- matching org yet (only for clients not already linked).
insert into public.organization (name, country)
select distinct on (fn_norm_org(c.company)) c.company, c.country
  from public.client c
 where c.organization_id is null
   and coalesce(btrim(c.company),'') <> ''
   and fn_norm_org(c.company) is not null
   and not exists (
     select 1 from public.organization o
      where fn_norm_org(o.name) = fn_norm_org(c.company))
 order by fn_norm_org(c.company), c.company;

-- Link every unlinked client to its organization by normalized name.
update public.client c
   set organization_id = o.org_id
  from public.organization o
 where c.organization_id is null
   and coalesce(btrim(c.company),'') <> ''
   and fn_norm_org(o.name) = fn_norm_org(c.company);

-- ---- 3. inquiry.client_id + inquiry.owner (lead -> customer, O01) ----------
alter table public.inquiry add column if not exists client_id uuid references public.client(client_id);
alter table public.inquiry add column if not exists owner uuid references public.salesperson(sales_id);

-- Backfill client by exact email match first (most reliable), then by
-- normalized company name for the remainder.
update public.inquiry i
   set client_id = c.client_id
  from public.client c
 where i.client_id is null
   and coalesce(btrim(i.email),'') <> ''
   and lower(c.email) = lower(i.email);

update public.inquiry i
   set client_id = c.client_id
  from public.client c
 where i.client_id is null
   and coalesce(btrim(i.company),'') <> ''
   and fn_norm_org(c.company) = fn_norm_org(i.company);

-- Owner defaults to the inquiry's originating sales rep.
update public.inquiry set owner = sales_id where owner is null;

-- ---- 4. Customer-360 read views -------------------------------------------
create or replace view public.v_org_contacts with (security_invoker = true) as
  select o.org_id, o.name as org_name,
         c.client_id, c.name as client_name,
         ct.contact_id, ct.name as contact_name, ct.title,
         ct.email, ct.phone, ct.is_primary
    from public.organization o
    join public.client c  on c.organization_id = o.org_id
    join public.contact ct on ct.client_id = c.client_id;
grant select on public.v_org_contacts to authenticated;

-- Org-level rollup for the Customer-360 header. Subqueries (not joins) avoid
-- fan-out double counting; security_invoker means each count only reflects rows
-- the caller may see.
create or replace view public.v_customer_360 with (security_invoker = true) as
  select o.org_id, o.name as org_name, o.country, o.industry, o.owner_sales_id,
    (select count(*) from public.client c where c.organization_id = o.org_id) as clients,
    (select count(*) from public.contact ct join public.client c on c.client_id = ct.client_id
      where c.organization_id = o.org_id) as contacts,
    (select count(*) from public.orders ord join public.client c on c.client_id = ord.client_id
      where c.organization_id = o.org_id and ord.order_status <> 'Cancelled') as active_orders,
    (select coalesce(sum(ord.total_amount),0) from public.orders ord
       join public.client c on c.client_id = ord.client_id
      where c.organization_id = o.org_id and ord.order_status <> 'Cancelled') as booked_amount,
    (select count(*) from public.inquiry q join public.client c on c.client_id = q.client_id
      where c.organization_id = o.org_id) as linked_inquiries
  from public.organization o;
grant select on public.v_customer_360 to authenticated;


-- ############################################################################
-- ## 20260812130000_phaseb_payments_money.sql
-- ############################################################################

-- ===========================================================================
-- Phase B (second-pass) — 4/6: money model (D3).
--
--  * Payments become IMMUTABLE: never deleted, financial fields frozen once
--    written. A payment lifecycle (Pending -> Confirmed -> Voided) replaces the
--    old hard-DELETE "refund". Recording/confirming = coordinator / operations /
--    business_owner / super_admin. VOID and REFUND = business_owner / super_admin
--    only, each behind a mandatory persisted reason.
--  * New `refund` and `credit_note` objects give audit-grade financial history.
--  * fn_ar_recompute now derives AR from CONFIRMED payments − refunds + applied
--    credit notes (was: sum of all payment rows).
--
-- Idempotent. Trigger functions have EXECUTE revoked from the API roles (they
-- fire on triggers, not as RPCs). Enum CASE is cast to payment_status_t to avoid
-- the text→enum assignment error (42804) noted in CLAUDE.md.
-- ===========================================================================

-- ---- Per-payment lifecycle enum (distinct from order-level payment_status_t) --
do $$ begin
  if not exists (select 1 from pg_type where typname = 'payment_state_t') then
    create type public.payment_state_t as enum ('Pending','Confirmed','Voided');
  end if;
end $$;

-- ---- Payment lifecycle columns (existing rows are historical Confirmed) -----
alter table public.payment add column if not exists status public.payment_state_t not null default 'Confirmed';
alter table public.payment add column if not exists confirmed_by uuid;
alter table public.payment add column if not exists confirmed_at timestamptz;
alter table public.payment add column if not exists voided_by uuid;
alter table public.payment add column if not exists voided_at timestamptz;
alter table public.payment add column if not exists void_reason text;

-- Stamp confirmation provenance on pre-existing rows (before the guard exists).
update public.payment
   set confirmed_at = coalesce(confirmed_at, created_at),
       confirmed_by = coalesce(confirmed_by, created_by)
 where status = 'Confirmed' and confirmed_at is null;

-- ---- Immutability guard: no deletes; freeze financial identity -------------
create or replace function public.fn_payment_immutable_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments are immutable and cannot be deleted; void or refund instead'
      using errcode = '42501';
  end if;

  -- Financial identity is frozen for the life of the row.
  if new.order_id   is distinct from old.order_id
  or new.amount     is distinct from old.amount
  or new.paid_date  is distinct from old.paid_date
  or new.method     is distinct from old.method
  or new.reference  is distinct from old.reference
  or new.created_by is distinct from old.created_by
  or new.created_at is distinct from old.created_at then
    raise exception 'Payment financial fields are immutable (only status/confirmation/void may change)'
      using errcode = '42501';
  end if;

  -- Legal transitions only.
  if new.status is distinct from old.status then
    if not ( (old.status = 'Pending'   and new.status in ('Confirmed','Voided'))
          or (old.status = 'Confirmed' and new.status = 'Voided') ) then
      raise exception 'Illegal payment status transition: % -> %', old.status, new.status
        using errcode = '42501';
    end if;
    if new.status = 'Confirmed' then
      new.confirmed_at := coalesce(new.confirmed_at, now());
      new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
    end if;
    if new.status = 'Voided' then
      if r is null or r not in ('business_owner','super_admin') then
        raise exception 'Only business_owner or super_admin may void a payment' using errcode = '42501';
      end if;
      if coalesce(btrim(new.void_reason),'') = '' then
        raise exception 'A void requires a reason' using errcode = '42501';
      end if;
      new.voided_at := coalesce(new.voided_at, now());
      new.voided_by := coalesce(new.voided_by, auth.uid());
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fn_payment_immutable_guard() from public, anon, authenticated;

drop trigger if exists trg_payment_immutable on public.payment;
create trigger trg_payment_immutable before update or delete on public.payment
  for each row execute function public.fn_payment_immutable_guard();

-- ---- Payment RLS: split the old ALL policy into record / update, no delete --
drop policy if exists p_payment_w on public.payment;
-- p_payment_r (SELECT via fn_can_see_order) is unchanged.
drop policy if exists p_payment_i on public.payment;
create policy p_payment_i on public.payment for insert to authenticated
  with check (fn_current_role() in ('operations','coordinator','business_owner','super_admin')
              and status in ('Pending','Confirmed'));
drop policy if exists p_payment_u on public.payment;
create policy p_payment_u on public.payment for update to authenticated
  using  (fn_current_role() in ('operations','coordinator','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','coordinator','business_owner','super_admin'));
-- No DELETE policy: deletes are denied by RLS and blocked by the guard.

-- ---- Refund object (BO / super_admin only) --------------------------------
create table if not exists public.refund (
  refund_id  uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payment(payment_id),
  order_id   text not null references public.orders(order_id),
  amount     numeric not null check (amount > 0),
  reason     text not null,
  refunded_by uuid,
  created_at timestamptz not null default now()
);
alter table public.refund enable row level security;
drop policy if exists p_refund_r on public.refund;
create policy p_refund_r on public.refund for select to authenticated
  using (fn_can_see_order(order_id));
drop policy if exists p_refund_w on public.refund;
create policy p_refund_w on public.refund for all to authenticated
  using  (fn_current_role() in ('business_owner','super_admin'))
  with check (fn_current_role() in ('business_owner','super_admin'));

create or replace function public.fn_refund_touch()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin perform fn_ar_recompute(coalesce(new.order_id, old.order_id)); return coalesce(new, old); end $$;
revoke execute on function public.fn_refund_touch() from public, anon, authenticated;
drop trigger if exists trg_refund_touch on public.refund;
create trigger trg_refund_touch after insert or update or delete on public.refund
  for each row execute function public.fn_refund_touch();

-- ---- Credit note object (BO / super_admin write; read-all + order-visible) --
create table if not exists public.credit_note (
  credit_id uuid primary key default gen_random_uuid(),
  org_id    uuid references public.organization(org_id),
  order_id  text references public.orders(order_id),
  amount    numeric not null check (amount > 0),
  reason    text not null,
  status    text not null default 'Open',      -- Open | Applied | Cancelled
  applied_to_order text references public.orders(order_id),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.credit_note enable row level security;
drop policy if exists p_credit_r on public.credit_note;
create policy p_credit_r on public.credit_note for select to authenticated
  using (fn_role_reads_all()
         or (order_id is not null and fn_can_see_order(order_id))
         or (applied_to_order is not null and fn_can_see_order(applied_to_order)));
drop policy if exists p_credit_w on public.credit_note;
create policy p_credit_w on public.credit_note for all to authenticated
  using  (fn_current_role() in ('business_owner','super_admin'))
  with check (fn_current_role() in ('business_owner','super_admin'));

create or replace function public.fn_credit_touch()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.applied_to_order, old.applied_to_order) is not null then
    perform fn_ar_recompute(coalesce(new.applied_to_order, old.applied_to_order));
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.fn_credit_touch() from public, anon, authenticated;
drop trigger if exists trg_credit_touch on public.credit_note;
create trigger trg_credit_touch after insert or update or delete on public.credit_note
  for each row execute function public.fn_credit_touch();

-- ---- AR now nets confirmed payments − refunds + applied credits ------------
create or replace function public.fn_ar_recompute(p_order text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_total numeric; v_paid numeric; v_refunded numeric; v_credit numeric; v_net numeric;
begin
  select coalesce(total_amount,0) into v_total from orders where order_id = p_order;
  select coalesce(sum(amount),0) into v_paid
    from payment where order_id = p_order and status = 'Confirmed';
  select coalesce(sum(amount),0) into v_refunded
    from refund where order_id = p_order;
  select coalesce(sum(amount),0) into v_credit
    from credit_note where applied_to_order = p_order and status = 'Applied';
  v_net := v_paid - v_refunded + v_credit;
  update orders
     set payment_status = (case
           when v_net <= 0 then 'Unpaid'
           when v_net >= v_total then 'Paid'
           else 'Partial' end)::payment_status_t
   where order_id = p_order;
end $$;

-- ---- Sensitive-action RPCs (server-enforced authority) --------------------
create or replace function public.fn_void_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text; v_order text;
begin
  if r is null or r not in ('business_owner','super_admin') then
    raise exception 'Only business_owner or super_admin may void a payment' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'A void requires a reason'; end if;
  update payment set status = 'Voided', void_reason = p_reason,
                     voided_by = auth.uid(), voided_at = now()
   where payment_id = p_payment returning order_id into v_order;
  if v_order is null then raise exception 'Payment % not found', p_payment; end if;
  -- AR is recomputed by trg_payment_touch on the update above.
end $$;
revoke execute on function public.fn_void_payment(uuid, text) from public, anon;
grant execute on function public.fn_void_payment(uuid, text) to authenticated;

create or replace function public.fn_refund_payment(p_payment uuid, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text; v_order text; v_amt numeric; v_id uuid;
begin
  if r is null or r not in ('business_owner','super_admin') then
    raise exception 'Only business_owner or super_admin may refund' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'A refund requires a reason'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Refund amount must be positive'; end if;
  select order_id, amount into v_order, v_amt from payment
    where payment_id = p_payment and status = 'Confirmed';
  if v_order is null then raise exception 'Confirmed payment % not found', p_payment; end if;
  if p_amount > v_amt then raise exception 'Refund exceeds the payment amount'; end if;
  insert into refund (payment_id, order_id, amount, reason, refunded_by)
    values (p_payment, v_order, p_amount, p_reason, auth.uid())
    returning refund_id into v_id;
  return v_id;  -- AR recomputed by trg_refund_touch.
end $$;
revoke execute on function public.fn_refund_payment(uuid, numeric, text) from public, anon;
grant execute on function public.fn_refund_payment(uuid, numeric, text) to authenticated;

grant select, insert, update, delete on public.refund, public.credit_note to authenticated;


-- ############################################################################
-- ## 20260812140000_phaseb_audit_r02.sql
-- ############################################################################

-- ===========================================================================
-- Phase B (second-pass) — 5/6: audit-grade capture (R02).
--
-- The live fn_audit already records old_data / new_data / changed_fields
-- ({field:{old,new}}). This closes the remaining R02 gaps:
--   * add a `source` flag (system vs user) so background-job writes are
--     distinguishable from human writes;
--   * add a `reason` column, populated from a transaction-local GUC
--     (app.audit_reason) that RPCs set before a sensitive write;
--   * extend audit-trigger coverage to the money + lead + contact tables that
--     were previously unaudited: payment, refund, credit_note, inquiry,
--     contact, invoice, participant.
--
-- Idempotent. fn_audit keeps its existing behaviour; only the two new columns
-- are added to each row it writes.
-- ===========================================================================

alter table public.audit_log add column if not exists source text not null default 'user';
alter table public.audit_log add column if not exists reason text;

-- fn_audit: unchanged capture + source flag + optional reason from GUC.
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  v_pk_col  text := tg_argv[0];
  v_old     jsonb;
  v_new     jsonb;
  v_pk      text;
  v_changed jsonb;
  v_actor   uuid;
  v_role    user_role;
  v_source  text;
  v_reason  text;
begin
  v_actor  := auth.uid();
  v_source := case when v_actor is null then 'system' else 'user' end;
  v_reason := nullif(current_setting('app.audit_reason', true), '');
  select role into v_role from profiles where user_id = v_actor;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_pk := v_new ->> v_pk_col;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_pk := v_old ->> v_pk_col;
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    v_pk  := coalesce(v_new ->> v_pk_col, v_old ->> v_pk_col);
    select jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
      into v_changed
      from jsonb_each(v_old) o join jsonb_each(v_new) n using (key)
      where o.value is distinct from n.value;
  end if;

  if tg_op = 'UPDATE' and (v_changed is null or v_changed = '{}'::jsonb) then
    return null;
  end if;

  insert into audit_log (table_name, row_pk, action, actor_id, actor_role,
                         old_data, new_data, changed_fields, source, reason)
  values (tg_table_name, v_pk, tg_op, v_actor, v_role,
          v_old, v_new, v_changed, v_source, v_reason);
  return null;
end;
$function$;
revoke execute on function public.fn_audit() from public, anon, authenticated;

-- Extend audit coverage to the money / lead / contact tables.
drop trigger if exists trg_audit_payment on public.payment;
create trigger trg_audit_payment after insert or delete or update on public.payment
  for each row execute function public.fn_audit('payment_id');
drop trigger if exists trg_audit_refund on public.refund;
create trigger trg_audit_refund after insert or delete or update on public.refund
  for each row execute function public.fn_audit('refund_id');
drop trigger if exists trg_audit_credit_note on public.credit_note;
create trigger trg_audit_credit_note after insert or delete or update on public.credit_note
  for each row execute function public.fn_audit('credit_id');
drop trigger if exists trg_audit_inquiry on public.inquiry;
create trigger trg_audit_inquiry after insert or delete or update on public.inquiry
  for each row execute function public.fn_audit('inquiry_id');
drop trigger if exists trg_audit_contact on public.contact;
create trigger trg_audit_contact after insert or delete or update on public.contact
  for each row execute function public.fn_audit('contact_id');
drop trigger if exists trg_audit_invoice on public.invoice;
create trigger trg_audit_invoice after insert or delete or update on public.invoice
  for each row execute function public.fn_audit('invoice_id');
drop trigger if exists trg_audit_participant on public.participant;
create trigger trg_audit_participant after insert or delete or update on public.participant
  for each row execute function public.fn_audit('participant_id');

-- Surface source + reason through the super-admin/auditor audit browser.
-- Return type changes (added columns) => must drop before recreate.
drop function if exists public.fn_audit_search(text, text, text, timestamptz, timestamptz, text, integer);
create or replace function public.fn_audit_search(
  p_table text default null, p_action text default null, p_role text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_search text default null, p_limit integer default 200)
returns table(audit_id bigint, table_name text, row_pk text, action text,
              actor_role text, actor_id uuid, changed_at timestamptz,
              changed_fields jsonb, source text, reason text)
language sql stable security definer set search_path to 'public' as $$
  select a.audit_id, a.table_name, a.row_pk, a.action, a.actor_role, a.actor_id,
         a.changed_at, a.changed_fields, a.source, a.reason
    from audit_log a
   where fn_current_role() in ('super_admin','auditor')
     and (p_table  is null or a.table_name = p_table)
     and (p_action is null or a.action = p_action)
     and (p_role   is null or a.actor_role::text = p_role)
     and (p_from   is null or a.changed_at >= p_from)
     and (p_to     is null or a.changed_at <= p_to)
     and (p_search is null or a.row_pk ilike '%'||p_search||'%'
          or a.changed_fields::text ilike '%'||p_search||'%')
   order by a.changed_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
grant execute on function public.fn_audit_search(text, text, text, timestamptz, timestamptz, text, integer) to authenticated;


-- ############################################################################
-- ## 20260812150000_phaseb_handoff.sql
-- ############################################################################

-- ===========================================================================
-- Phase B (second-pass) — 6/6: the Sales/Coordinator -> Operations handoff
-- transaction (H01 completeness gate, H02 Accept/Return, RET01 universal
-- return-for-correction).
--
--  * fn_order_completeness(order) — the D2 required-field contract as data:
--    HARD blocks (matched client, >=1 line, session-for-scheduled-lines, a fee,
--    a reference) and WARN items (deposit unpaid). Reusable by UI + endorse.
--  * fn_endorse_order — coordinator/operations/sales/super_admin; refuses unless
--    complete (super_admin may override with a reason). Moves the order to
--    'Endorsed to Ops' and opens an order_handoff row.
--  * fn_accept_endorsement — operations/super_admin accept; the two-sided close.
--  * fn_return_for_correction — anyone downstream may bounce it back WITH a
--    reason; regresses the stage to 'For Order Creation'.
--
-- The stage guard (fn_orders_stage_guard) is taught a single controlled bypass
-- (a txn-local GUC set only by fn_return_for_correction) so a legitimate return
-- can regress the pipeline without opening backward moves generally.
-- Idempotent throughout.
-- ===========================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'handoff_status_t') then
    create type public.handoff_status_t as enum ('Endorsed','Accepted','Returned');
  end if;
end $$;

create table if not exists public.order_handoff (
  handoff_id   uuid primary key default gen_random_uuid(),
  order_id     text not null unique references public.orders(order_id),
  status       public.handoff_status_t not null default 'Endorsed',
  endorsed_by  uuid, endorsed_at timestamptz,
  accepted_by  uuid, accepted_at timestamptz,
  returned_by  uuid, returned_at timestamptz, return_reason text,
  completeness jsonb,
  updated_at   timestamptz not null default now()
);
alter table public.order_handoff enable row level security;
drop policy if exists p_handoff_r on public.order_handoff;
create policy p_handoff_r on public.order_handoff for select to authenticated
  using (fn_can_see_order(order_id));
-- Direct writes are super_admin-only; the normal path is the RPCs below
-- (SECURITY DEFINER), which enforce their own role gates.
drop policy if exists p_handoff_w on public.order_handoff;
create policy p_handoff_w on public.order_handoff for all to authenticated
  using (fn_current_role() = 'super_admin') with check (fn_current_role() = 'super_admin');
grant select, insert, update, delete on public.order_handoff to authenticated;

-- ---- Completeness contract (D2) as data ------------------------------------
create or replace function public.fn_order_completeness(p_order text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  o record; v_lines int; v_unscheduled int; v_fee numeric; hard jsonb := '[]'::jsonb; warn jsonb := '[]'::jsonb;
begin
  if not fn_can_see_order(p_order) then
    raise exception 'Not allowed to view this order' using errcode = '42501';
  end if;
  select * into o from orders where order_id = p_order;
  if not found then raise exception 'Order % not found', p_order; end if;

  if o.client_id is null then hard := hard || to_jsonb('Matched customer required (order has no client)'::text); end if;

  select count(*) into v_lines from order_line
    where order_id = p_order and line_status::text <> 'Cancelled';
  if v_lines = 0 then hard := hard || to_jsonb('At least one active order line required'::text); end if;

  -- Scheduled (non e-learning) lines must be tied to a session.
  select count(*) into v_unscheduled from order_line
    where order_id = p_order and line_status::text <> 'Cancelled'
      and modality::text <> 'E-learning' and schedule_id is null;
  if v_unscheduled > 0 then
    hard := hard || to_jsonb((v_unscheduled || ' scheduled line(s) have no session assigned')::text);
  end if;

  v_fee := coalesce(o.total_amount, 0) + coalesce(o.amount_php, 0)
           + coalesce((select sum(amount_php) from order_line where order_id = p_order), 0);
  if v_fee <= 0 then hard := hard || to_jsonb('A fee is required'::text); end if;

  if coalesce(btrim(o.order_id), '') = '' then
    hard := hard || to_jsonb('A reference is required'::text);
  end if;

  -- Warning: deposit unpaid at endorsement (advisory, not blocking).
  if o.payment_status::text = 'Unpaid' then
    warn := warn || to_jsonb('Deposit/payment not yet recorded'::text);
  end if;

  return jsonb_build_object('ok', jsonb_array_length(hard) = 0, 'hard', hard, 'warn', warn);
end $$;
grant execute on function public.fn_order_completeness(text) to authenticated;

-- ---- Endorse (H01 gate) ----------------------------------------------------
create or replace function public.fn_endorse_order(p_order text, p_override_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text; v_check jsonb; v_is_admin boolean;
begin
  if r is null or r not in ('coordinator','operations','sales','super_admin') then
    raise exception 'Your role may not endorse orders' using errcode = '42501';
  end if;
  if not fn_can_see_order(p_order) then
    raise exception 'Not allowed to act on this order' using errcode = '42501';
  end if;

  v_check := fn_order_completeness(p_order);
  v_is_admin := (r = 'super_admin');
  if not (v_check->>'ok')::boolean then
    if not (v_is_admin and coalesce(btrim(p_override_reason),'') <> '') then
      raise exception 'Order is not complete: %', (v_check->'hard')::text using errcode = '42501';
    end if;
    perform set_config('app.audit_reason', 'endorse override: '||p_override_reason, true);
  end if;

  update orders set fulfillment_stage = 'Endorsed to Ops' where order_id = p_order;

  insert into order_handoff (order_id, status, endorsed_by, endorsed_at, completeness, updated_at)
    values (p_order, 'Endorsed', auth.uid(), now(), v_check, now())
  on conflict (order_id) do update
    set status = 'Endorsed', endorsed_by = auth.uid(), endorsed_at = now(),
        returned_by = null, returned_at = null, return_reason = null,
        completeness = excluded.completeness, updated_at = now();
  return v_check;
end $$;
revoke execute on function public.fn_endorse_order(text, text) from public, anon;
grant execute on function public.fn_endorse_order(text, text) to authenticated;

-- ---- Accept (H02 two-sided close) ------------------------------------------
create or replace function public.fn_accept_endorsement(p_order text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if r is null or r not in ('operations','super_admin') then
    raise exception 'Only operations or super_admin may accept an endorsement' using errcode = '42501';
  end if;
  update order_handoff
     set status = 'Accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
   where order_id = p_order and status = 'Endorsed';
  if not found then
    raise exception 'No pending endorsement to accept for order %', p_order using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.fn_accept_endorsement(text) from public, anon;
grant execute on function public.fn_accept_endorsement(text) to authenticated;

-- ---- Return for correction (H02 / RET01) -----------------------------------
create or replace function public.fn_return_for_correction(p_order text, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if r is null or r not in ('operations','coordinator','business_owner','super_admin') then
    raise exception 'Your role may not return an order for correction' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason),'') = '' then
    raise exception 'A return requires a reason' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', 'returned: '||p_reason, true);
  -- Controlled, single-purpose bypass of the forward-only stage guard.
  perform set_config('app.allow_stage_regression', 'on', true);
  update orders set fulfillment_stage = 'For Order Creation'
   where order_id = p_order and fulfillment_stage::text <> 'For Order Creation';
  perform set_config('app.allow_stage_regression', 'off', true);

  insert into order_handoff (order_id, status, returned_by, returned_at, return_reason, updated_at)
    values (p_order, 'Returned', auth.uid(), now(), p_reason, now())
  on conflict (order_id) do update
    set status = 'Returned', returned_by = auth.uid(), returned_at = now(),
        return_reason = p_reason, updated_at = now();
end $$;
revoke execute on function public.fn_return_for_correction(text, text) from public, anon;
grant execute on function public.fn_return_for_correction(text, text) to authenticated;

-- ---- Teach the stage guard one controlled regression bypass ----------------
create or replace function public.fn_orders_stage_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r text; oldp int; newp int;
begin
  if new.fulfillment_stage is distinct from old.fulfillment_stage then
    r := fn_current_role()::text;
    if r is not null and r <> 'super_admin'
       and coalesce(current_setting('app.allow_stage_regression', true), 'off') <> 'on' then
      oldp := fn_stage_pos(old.fulfillment_stage::text);
      newp := fn_stage_pos(new.fulfillment_stage::text);
      if not (
            new.fulfillment_stage::text in ('Cancelled','No Feedback','New')
         or old.fulfillment_stage::text in ('Cancelled','No Feedback')
         or (newp > oldp and newp > 0 and oldp > 0)
      ) then
        raise exception 'Illegal stage change: % -> %',
          old.fulfillment_stage, new.fulfillment_stage using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fn_orders_stage_guard() from public, anon, authenticated;
