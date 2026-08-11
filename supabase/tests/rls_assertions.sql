-- ─────────────────────────────────────────────────────────────────────────
-- RLS regression assertions. Run AFTER rls_fixture.sql on the same database,
-- as a superuser (CI's `postgres`), so `set local role` can impersonate anon /
-- authenticated. Any failed expectation RAISEs, which aborts psql (run with
-- -v ON_ERROR_STOP=1) and fails the CI job.
--
-- Each check is its own DO block = its own implicit transaction, so `set local
-- role` and the `request.jwt.claim.sub` GUC auto-reset afterwards.
-- ─────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on

-- A. anon reads ZERO orders (RLS, not a missing grant — anon holds SELECT). ---
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*) into n from public.orders;
  set local role none;  -- superuser reset for the raise
  if n <> 0 then raise exception 'REGRESSION A: anon saw % order(s), expected 0', n; end if;
  raise notice 'A ok: anon sees 0 orders';
end $$;

-- B. S001 (TeamA rep) sees own (SO-A1) + teammate (SO-A2), NOT TeamB (SO-B1). -
do $$
declare ids text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  select string_agg(order_id, ',' order by order_id) into ids from public.orders;
  set local role none;
  if ids is distinct from 'SO-A1,SO-A2' then
    raise exception 'REGRESSION B: S001 saw [%], expected [SO-A1,SO-A2]', ids;
  end if;
  raise notice 'B ok: S001 sees own + teammate, not the other team';
end $$;

-- C. S003 (TeamB rep) sees only SO-B1. ---------------------------------------
do $$
declare ids text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  set local role authenticated;
  select string_agg(order_id, ',' order by order_id) into ids from public.orders;
  set local role none;
  if ids is distinct from 'SO-B1' then
    raise exception 'REGRESSION C: S003 saw [%], expected [SO-B1]', ids;
  end if;
  raise notice 'C ok: S003 sees only its own team';
end $$;

-- D. anon CANNOT execute fn_global_search (EXECUTE revoked from anon/PUBLIC). -
do $$
declare blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform public.fn_global_search('acme');
  exception when insufficient_privilege then blocked := true;
  end;
  set local role none;
  if not blocked then raise exception 'REGRESSION D: anon executed fn_global_search'; end if;
  raise notice 'D ok: anon blocked from fn_global_search';
end $$;

-- E. authenticated with NO jwt is rejected by the internal gate. --------------
do $$
declare gated boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  begin
    perform public.fn_global_search('acme');
  exception when others then gated := (sqlstate = '28000');
  end;
  set local role none;
  if not gated then raise exception 'REGRESSION E: no-JWT caller was not gated by fn_global_search'; end if;
  raise notice 'E ok: no-JWT caller gated (28000)';
end $$;

-- F. signed-in rep gets results from fn_global_search. ------------------------
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  select count(*) into n from public.fn_global_search('acme');
  set local role none;
  if n < 1 then raise exception 'REGRESSION F: signed-in fn_global_search returned % rows', n; end if;
  raise notice 'F ok: signed-in search returns % row(s)', n;
end $$;

-- G. anon CANNOT execute fn_org_summary. -------------------------------------
do $$
declare blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform public.fn_org_summary();
  exception when insufficient_privilege then blocked := true;
  end;
  set local role none;
  if not blocked then raise exception 'REGRESSION G: anon executed fn_org_summary'; end if;
  raise notice 'G ok: anon blocked from fn_org_summary';
end $$;

-- H. a NON-admin gets 0 rows from fn_audit_search (gate returns empty set). ---
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  select count(*) into n from public.fn_audit_search(null,null,null,null,null,null,200);
  set local role none;
  if n <> 0 then raise exception 'REGRESSION H: non-admin fn_audit_search returned % rows', n; end if;
  raise notice 'H ok: non-admin audit search is empty';
end $$;

-- I. super_admin DOES get audit rows (proves H is a gate, not a broken query).-
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
  set local role authenticated;
  select count(*) into n from public.fn_audit_search(null,null,null,null,null,null,200);
  set local role none;
  if n < 1 then raise exception 'REGRESSION I: super_admin fn_audit_search returned % rows', n; end if;
  raise notice 'I ok: super_admin sees audit rows';
end $$;

\echo '>> ALL RLS ASSERTIONS PASSED'
