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
