\set ON_ERROR_STOP on

-- Run as the local/staging postgres role after 0001_initial_schema.sql.

do $$
declare
  blocked boolean := false;
begin
  set local role anon;
  begin
    perform count(*) from academy_v2.categories;
  exception when insufficient_privilege then
    blocked := true;
  end;
  set local role none;
  if not blocked then
    raise exception 'Anonymous role unexpectedly read catalogue data';
  end if;
end;
$$;

do $$
declare
  row_count integer;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  select count(*) into row_count from academy_v2.categories;
  set local role none;
  if row_count <> 0 then
    raise exception 'Authenticated caller without a profile saw % catalogue rows', row_count;
  end if;
end;
$$;

do $$
declare
  can_execute boolean;
begin
  select has_function_privilege('anon', 'academy_v2_private.has_role(text[])', 'execute') into can_execute;
  if can_execute then
    raise exception 'Anonymous role can execute academy_v2_private.has_role';
  end if;
end;
$$;

\echo 'Baseline security smoke tests passed'
