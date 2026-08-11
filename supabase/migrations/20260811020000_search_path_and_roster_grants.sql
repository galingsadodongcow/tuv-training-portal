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
