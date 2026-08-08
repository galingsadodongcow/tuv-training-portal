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
