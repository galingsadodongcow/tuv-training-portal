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

-- ═══════════════════════════════════════════════════════════════════════════
-- Delegation matrix (20260814060000 + 20260814070000).
-- These encode the boundary checks that were run by hand against the live
-- database on 2026-08-14; codified here so they cannot regress silently.
-- Identities: c1 = TeamA supervisor (sales_manager), a1/a2 = TeamA reps,
-- b1 = TeamB rep, f1 = operations, f2 = business_owner, ad = super_admin.
-- ═══════════════════════════════════════════════════════════════════════════

-- J. A supervisor may grant `sales` and nothing else. -------------------------
do $$
declare got text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  set local role authenticated;
  select public.fn_member_grantable_roles()::text into got;
  set local role none;
  if got is distinct from '{sales}' then
    raise exception 'REGRESSION J: supervisor grantable = %, expected {sales}', got;
  end if;
  raise notice 'J ok: supervisor may grant only sales';
end $$;

-- K. Supervisor scope: own-team rep yes, other team no, self no, ops no. ------
do $$
declare own boolean; other boolean; self_ boolean; ops boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  set local role authenticated;
  select public.fn_can_manage_member('00000000-0000-0000-0000-0000000000a1') into own;
  select public.fn_can_manage_member('00000000-0000-0000-0000-0000000000b1') into other;
  select public.fn_can_manage_member('00000000-0000-0000-0000-0000000000c1') into self_;
  select public.fn_can_manage_member('00000000-0000-0000-0000-0000000000f1') into ops;
  set local role none;
  if not own then raise exception 'REGRESSION K: supervisor cannot manage own-team rep'; end if;
  if other then raise exception 'REGRESSION K: supervisor managed a rep on ANOTHER team'; end if;
  if self_ then raise exception 'REGRESSION K: supervisor can manage themselves (self-elevation)'; end if;
  if ops  then raise exception 'REGRESSION K: supervisor can manage operations'; end if;
  raise notice 'K ok: supervisor scoped to own-team reps, not self, not ops';
end $$;

-- L. Privilege escalation: supervisor cannot grant super_admin. ---------------
do $$
declare blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  set local role authenticated;
  begin
    perform public.fn_grant_member_role('00000000-0000-0000-0000-0000000000a1', 'super_admin');
  exception when insufficient_privilege then blocked := true;
  end;
  set local role none;
  if not blocked then raise exception 'REGRESSION L: supervisor GRANTED super_admin'; end if;
  raise notice 'L ok: escalation to super_admin denied';
end $$;

-- M. Oversight ring-fence: operations cannot act on a business_owner. ---------
do $$
declare bo boolean; admin boolean; rep boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  set local role authenticated;
  select public.fn_can_manage_member('00000000-0000-0000-0000-0000000000f2') into bo;
  select public.fn_can_manage_member('00000000-0000-0000-0000-0000000000ad') into admin;
  select public.fn_can_manage_member('00000000-0000-0000-0000-0000000000a1') into rep;
  set local role none;
  if bo then raise exception 'REGRESSION M: operations can manage a business_owner'; end if;
  if admin then raise exception 'REGRESSION M: operations can manage a super_admin'; end if;
  if not rep then raise exception 'REGRESSION M: operations cannot manage a sales rep'; end if;
  raise notice 'M ok: operations ring-fenced from oversight roles, keeps sales';
end $$;

-- N. Operations cannot grant business_owner (matrix is downward-only). --------
do $$
declare blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  set local role authenticated;
  begin
    perform public.fn_grant_member_role('00000000-0000-0000-0000-0000000000a1', 'business_owner');
  exception when insufficient_privilege then blocked := true;
  end;
  set local role none;
  if not blocked then raise exception 'REGRESSION N: operations granted business_owner'; end if;
  raise notice 'N ok: operations cannot grant business_owner';
end $$;

-- O. A supervisor's team is forced server-side on roster writes. --------------
do $$
declare new_id uuid; t text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  set local role authenticated;
  -- Asks for TeamB; must be stored on the supervisor's own TeamA.
  select public.fn_upsert_team_member('Probe Member', 'PM', 'TeamB', 'Visayas') into new_id;
  set local role none;
  select team into t from public.salesperson where sales_id = new_id;
  if t is distinct from 'TeamA' then
    raise exception 'REGRESSION O: supervisor placed a member on team %, expected TeamA', t;
  end if;
  delete from public.salesperson where sales_id = new_id;
  raise notice 'O ok: supervisor roster write forced onto own team';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Order-creation authority (20260814080000). The gate is fn_create_order's own
-- allowlist, NOT RLS — it is SECURITY DEFINER and bypasses the INSERT policies.
-- Both probes fail BEFORE any row is written: 42501 at the role check, 22004 at
-- the empty-reference check just after it.
-- ═══════════════════════════════════════════════════════════════════════════

-- P. business_owner may NOT create an order. ---------------------------------
do $$
declare state text := '';
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
  set local role authenticated;
  begin
    perform public.fn_create_order('', 'Inside Sales', current_date, null, '[]'::jsonb);
  exception when others then state := sqlstate;
  end;
  set local role none;
  if state <> '42501' then
    raise exception 'REGRESSION P: business_owner create_order gave %, expected 42501', state;
  end if;
  raise notice 'P ok: business_owner blocked from creating orders';
end $$;

-- Q. sales_manager MAY create (reaches validation, not the role check). -------
do $$
declare state text := '';
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  set local role authenticated;
  begin
    perform public.fn_create_order('', 'Inside Sales', current_date, null, '[]'::jsonb);
  exception when others then state := sqlstate;
  end;
  set local role none;
  if state = '42501' then
    raise exception 'REGRESSION Q: sales_manager was blocked from creating orders';
  end if;
  if state <> '22004' then
    raise exception 'REGRESSION Q: sales_manager create_order gave %, expected 22004', state;
  end if;
  raise notice 'Q ok: sales_manager passes the order-creation gate';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Cost and margin visibility (20260814090000) — audit finding P0-1.
-- Fixture session: trainer 8000/day + venue 5000/day over 2 days, 10 pax @ 5000.
-- ═══════════════════════════════════════════════════════════════════════════

-- R. A sales rep sees revenue but NO cost and NO margin. ----------------------
do $$
declare visible boolean; rev numeric; costs int; margins int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  select public.fn_cost_visible() into visible;
  select sum(revenue), count(trainer_cost) + count(venue_cost), count(margin)
    into rev, costs, margins from public.v_session_pnl;
  set local role none;
  if visible then raise exception 'REGRESSION R: fn_cost_visible() true for a sales rep'; end if;
  if costs <> 0 then raise exception 'REGRESSION R: sales rep saw % cost value(s), expected 0', costs; end if;
  if margins <> 0 then raise exception 'REGRESSION R: sales rep saw % margin value(s), expected 0', margins; end if;
  if coalesce(rev, 0) <= 0 then raise exception 'REGRESSION R: revenue was masked too (got %) — only cost should be', rev; end if;
  raise notice 'R ok: sales sees revenue (%), no cost, no margin', rev;
end $$;

-- S. Operations still gets the full P&L (proves R is a gate, not a broken view).
do $$
declare visible boolean; tc numeric; vc numeric; m numeric;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  set local role authenticated;
  select public.fn_cost_visible() into visible;
  select sum(trainer_cost), sum(venue_cost), sum(margin) into tc, vc, m from public.v_session_pnl;
  set local role none;
  if not visible then raise exception 'REGRESSION S: fn_cost_visible() false for operations'; end if;
  -- 8000 * 2 days = 16000 trainer, 5000 * 2 = 10000 venue,
  -- margin = 50000 revenue - (16000 + 10000 + 1000 materials) = 23000.
  if tc is distinct from 16000 then raise exception 'REGRESSION S: trainer_cost %, expected 16000', tc; end if;
  if vc is distinct from 10000 then raise exception 'REGRESSION S: venue_cost %, expected 10000', vc; end if;
  if m  is distinct from 23000 then raise exception 'REGRESSION S: margin %, expected 23000', m; end if;
  raise notice 'S ok: operations sees full P&L (margin %)', m;
end $$;

-- T. The rate columns are not directly readable, even by operations. ----------
-- The narrowed grant is column-level, so `select daily_rate` and `select *`
-- both fail; the safe columns still work. Cost reaches the app only through
-- v_session_pnl, which masks per role.
do $$
declare blocked_rate boolean := false; blocked_star boolean := false; safe_ok boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  begin perform daily_rate from public.trainer; exception when insufficient_privilege then blocked_rate := true; end;
  begin perform * from public.trainer;          exception when insufficient_privilege then blocked_star := true; end;
  begin perform name, trainer_type from public.trainer; safe_ok := true; exception when others then safe_ok := false; end;
  set local role none;
  if not blocked_rate then raise exception 'REGRESSION T: sales read trainer.daily_rate directly'; end if;
  if not blocked_star then raise exception 'REGRESSION T: select * on trainer succeeded despite the narrowed grant'; end if;
  if not safe_ok then raise exception 'REGRESSION T: the safe trainer columns became unreadable'; end if;
  raise notice 'T ok: rate columns locked, safe columns still readable';
end $$;

\echo '>> ALL RLS ASSERTIONS PASSED'
