\set ON_ERROR_STOP on

-- Run against the seeded staging/live project after 0006_sales_workflow_advisor_fixes.sql.

do $$
declare
  romely_id uuid;
  melis_id uuid;
  joane_id uuid;
  row_count integer;
  individual_count integer;
begin
  select id into romely_id from auth.users where lower(email) = 'romely.test@tuv-portal.local';
  select id into melis_id from auth.users where lower(email) = 'melis.test@tuv-portal.local';
  select id into joane_id from auth.users where lower(email) = 'joane.test@tuv-portal.local';
  if romely_id is null or melis_id is null or joane_id is null then
    raise exception 'Required role-test identities are missing';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', melis_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into individual_count from academy_v2.inquiries;
  set local role none;
  if individual_count < 1 then raise exception 'Individual Sales expected at least one owned inquiry'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', romely_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into row_count from academy_v2.inquiries;
  set local role none;
  if row_count <= individual_count then raise exception 'Sales Supervisor did not receive broader team scope'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', joane_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into row_count from academy_v2.inquiries;
  set local role none;
  if row_count <> 0 then raise exception 'Operations unexpectedly saw % inquiries', row_count; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', joane_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into row_count from academy_v2.orders where status = 'pending_operations';
  set local role none;
  if row_count < 1 then raise exception 'Operations expected at least one pending handoff'; end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'academy_v2.transition_order(uuid,text,text)', 'execute') then
    raise exception 'Anonymous role can execute order transitions';
  end if;
  if not has_function_privilege('authenticated', 'academy_v2.transition_order(uuid,text,text)', 'execute') then
    raise exception 'Authenticated role cannot reach the protected transition wrapper';
  end if;
end;
$$;

\echo 'Sales workflow security smoke tests passed'
