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
