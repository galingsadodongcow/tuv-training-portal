-- Participant reads flow through a role-aware listing function so Manager and
-- Auditor receive operational evidence without contact or employee identifiers.

create function academy_v2_private.list_participants()
returns table (
  id uuid,
  participant_number bigint,
  session_id uuid,
  customer_id uuid,
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
    p.full_name,
    case when academy_v2_private.has_role(array['administrator', 'operations']::text[])
      or academy_v2_private.can_manage_sales(o.sales_owner_id) then p.email else null end,
    case when academy_v2_private.has_role(array['administrator', 'operations']::text[])
      or academy_v2_private.can_manage_sales(o.sales_owner_id) then p.phone else null end,
    case when academy_v2_private.has_role(array['administrator', 'operations']::text[])
      or academy_v2_private.can_manage_sales(o.sales_owner_id) then p.employee_reference else null end,
    p.status,
    p.attendance_status,
    p.attended_minutes,
    p.assessment_status,
    p.assessment_score,
    p.certificate_status,
    p.certificate_number,
    p.certificate_issued_at,
    case when academy_v2_private.has_role(array['administrator', 'operations']::text[])
      or academy_v2_private.can_manage_sales(o.sales_owner_id) then p.certificate_note else null end,
    p.created_at
  from academy_v2.participants p
  join academy_v2.sessions s on s.id = p.session_id
  join academy_v2.orders o on o.id = s.order_id
  where academy_v2_private.can_view_delivery_order(s.order_id);
$$;

create function academy_v2.list_participants()
returns table (
  id uuid,
  participant_number bigint,
  session_id uuid,
  customer_id uuid,
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

revoke select on table academy_v2.participants from authenticated;
