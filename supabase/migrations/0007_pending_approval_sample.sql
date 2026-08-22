-- Preserve one representative Sales Supervisor approval task after UI acceptance testing.

do $$
declare
  seed_actor uuid;
  melis_id uuid;
  v_customer_id uuid;
  v_contact_id uuid;
  v_course_id uuid;
  v_inquiry_id uuid;
  v_quotation_id uuid;
begin
  select id into seed_actor from auth.users where lower(email) = 'alanclifford.filart@tuv.com';
  select id into melis_id from auth.users where lower(email) = 'melis.test@tuv-portal.local';
  select id into v_customer_id from academy_v2.customers where name = 'Harbor Foods — Sample';
  select id into v_contact_id from academy_v2.contacts where customer_id = v_customer_id order by created_at limit 1;
  select id into v_course_id from academy_v2.courses where code = 'ISO-45001-LA';

  if seed_actor is null or melis_id is null or v_customer_id is null or v_contact_id is null or v_course_id is null then
    raise exception 'Required sample records are missing';
  end if;

  insert into academy_v2.inquiries(customer_id, contact_id, course_id, owner_id, status,
    requirement_summary, participant_estimate, next_action, follow_up_on)
  values (v_customer_id, v_contact_id, v_course_id, melis_id, 'quoted',
    'Lead auditor program with a commercial discount requiring supervisor review.', 10,
    'Await Sales Supervisor discount decision', current_date)
  returning id into v_inquiry_id;

  insert into academy_v2.quotations(inquiry_id, customer_id, contact_id, owner_id,
    status, discount_percent, approval_status, valid_until)
  values (v_inquiry_id, v_customer_id, v_contact_id, melis_id, 'draft', 12.5, 'pending', current_date + 21)
  returning id into v_quotation_id;

  insert into academy_v2.quotation_lines(quotation_id, course_id, learning_type, participant_count, unit_price)
  values (v_quotation_id, v_course_id, 'virtual', 10, 22000);

  insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
  values (seed_actor, 'demo.pending_approval_seeded', 'quotation', v_quotation_id::text,
    jsonb_build_object('discount_percent', 12.5));
end;
$$;
