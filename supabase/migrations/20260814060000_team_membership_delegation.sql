-- Delegated team membership and role assignment (owner feedback).
--
-- Before this, `profiles` was writable only by super_admin (p_profiles_admin)
-- and readable only by yourself (p_profiles_self), so operations and sales
-- supervisors could not see their own people, let alone build a team. Every such
-- request had to go through a super admin.
--
-- The table policies are deliberately left alone. Widening `profiles` for two
-- more roles would hand them every column of every user; instead this exposes a
-- narrow, scoped set of SECURITY DEFINER RPCs — the same pattern the workflow
-- functions already use (fn_create_order, fn_endorse_order, …). RLS stays the
-- authority on the table; these functions are the only widened path and each one
-- re-checks the caller.
--
-- The delegation matrix is the security boundary. Roles are only ever grantable
-- *downward*, so no one can mint an account with more authority than they hold:
--
--   super_admin        → any role
--   operations         → sales, coordinator, sales_manager
--   sales supervisor   → sales, and only inside their own team
--   everyone else      → nothing
--
-- Three further invariants, enforced in fn_can_manage_member / fn_grant_member_role:
--   * nobody may change their own role (no self-elevation),
--   * only a super_admin may touch an existing super_admin (no lateral takeover),
--   * a supervisor is confined to their own team, matched on salesperson.team.
--
-- Accounts are not created here: the browser holds the anon key and cannot call
-- the Auth admin API. A person signs in once (which provisions their profile
-- row) and is then given a role and a team through these functions.
--
-- Idempotent throughout.

-- ── Which roles may the caller hand out? ─────────────────────────────────────
create or replace function public.fn_member_grantable_roles()
returns public.user_role[]
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when public.fn_current_role() = 'super_admin' then
      array['super_admin','operations','business_owner','sales',
            'coordinator','sales_manager','management','auditor']::public.user_role[]
    when public.fn_current_role() = 'operations' then
      array['sales','coordinator','sales_manager']::public.user_role[]
    when public.fn_is_team_lead() then
      array['sales']::public.user_role[]
    else
      array[]::public.user_role[]
  end;
$function$;

-- ── May the caller manage this particular user? ──────────────────────────────
create or replace function public.fn_can_manage_member(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  target_role public.user_role;
  target_team text;
begin
  -- No self-management: a delegator must never be able to raise their own role.
  if p_user is null or p_user = (select auth.uid()) then
    return false;
  end if;

  select p.role, s.team
    into target_role, target_team
    from public.profiles p
    left join public.salesperson s on s.sales_id = p.sales_id
   where p.user_id = p_user;

  if not found then
    return false;
  end if;

  -- Only a super admin may act on another super admin.
  if target_role = 'super_admin' then
    return public.fn_current_role() = 'super_admin';
  end if;

  if public.fn_current_role() in ('super_admin', 'operations') then
    return true;
  end if;

  -- A supervisor manages the sales reps on their own team, nobody else. A null
  -- team on either side is not a match — it would otherwise pair up every
  -- unassigned person with every teamless supervisor.
  if public.fn_is_team_lead() then
    return target_role = 'sales'
       and target_team is not null
       and target_team is not distinct from public.fn_current_team();
  end if;

  return false;
end;
$function$;

-- ── The scoped member list the admin screen reads ────────────────────────────
-- Returns only the people the caller may manage, plus the caller's own row so
-- the screen can show "you". Never exposes anything beyond these columns.
create or replace function public.fn_team_members()
returns table (
  user_id uuid,
  full_name text,
  role text,
  sales_id uuid,
  sales_name text,
  code text,
  team text,
  region text,
  is_supervisor boolean,
  active boolean,
  manageable boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.user_id,
         p.full_name,
         p.role::text,
         p.sales_id,
         s.name,
         s.code,
         s.team,
         s.region,
         coalesce(s.is_supervisor, false),
         coalesce(s.active, true),
         public.fn_can_manage_member(p.user_id),
         p.user_id = (select auth.uid())
    from public.profiles p
    left join public.salesperson s on s.sales_id = p.sales_id
   where p.user_id = (select auth.uid())
      or public.fn_can_manage_member(p.user_id)
   order by p.full_name nulls last;
$function$;

-- ── Grant a role ─────────────────────────────────────────────────────────────
create or replace function public.fn_grant_member_role(
  p_user uuid,
  p_role text,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  new_role public.user_role;
  old_role public.user_role;
  keep_link boolean;
begin
  -- A CASE/param of text is typed text, and text → enum has no implicit
  -- assignment cast, so the enum is built explicitly (see CLAUDE.md).
  begin
    new_role := p_role::public.user_role;
  exception when invalid_text_representation then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end;

  if not public.fn_can_manage_member(p_user) then
    raise exception 'You may not manage this user' using errcode = '42501';
  end if;

  if not (new_role = any (public.fn_member_grantable_roles())) then
    raise exception 'You may not grant the % role', p_role using errcode = '42501';
  end if;

  select role into old_role from public.profiles where user_id = p_user;
  if old_role = new_role then
    return;
  end if;

  -- Only the selling roles resolve visibility through a salesperson record;
  -- moving off them clears the link so nothing points at a dead pointer.
  keep_link := new_role in ('sales', 'sales_manager');

  update public.profiles
     set role = new_role,
         sales_id = case when keep_link then sales_id else null end
   where user_id = p_user;

  insert into public.audit_log (table_name, row_pk, action, actor_id, actor_role,
                                old_data, new_data, source, reason)
  values ('profiles', p_user::text, 'UPDATE', (select auth.uid()), public.fn_current_role(),
          jsonb_build_object('role', old_role), jsonb_build_object('role', new_role),
          'fn_grant_member_role', p_reason);
end;
$function$;

-- ── Link a person to a salesperson record ────────────────────────────────────
create or replace function public.fn_link_member_salesperson(
  p_user uuid,
  p_sales_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  target_role public.user_role;
  link_team text;
  old_link uuid;
begin
  if not public.fn_can_manage_member(p_user) then
    raise exception 'You may not manage this user' using errcode = '42501';
  end if;

  select role, sales_id into target_role, old_link from public.profiles where user_id = p_user;
  if target_role not in ('sales', 'sales_manager') then
    raise exception 'Only the sales roles link to a salesperson record' using errcode = '22023';
  end if;

  if p_sales_id is not null then
    select team into link_team from public.salesperson where sales_id = p_sales_id;
    if not found then
      raise exception 'No such salesperson' using errcode = '23503';
    end if;
    -- A supervisor may only link people onto their own team.
    if public.fn_current_role() not in ('super_admin', 'operations')
       and link_team is distinct from public.fn_current_team() then
      raise exception 'You may only link people to your own team' using errcode = '42501';
    end if;
  end if;

  update public.profiles set sales_id = p_sales_id where user_id = p_user;

  insert into public.audit_log (table_name, row_pk, action, actor_id, actor_role,
                                old_data, new_data, source)
  values ('profiles', p_user::text, 'UPDATE', (select auth.uid()), public.fn_current_role(),
          jsonb_build_object('sales_id', old_link), jsonb_build_object('sales_id', p_sales_id),
          'fn_link_member_salesperson');
end;
$function$;

-- ── Create / update a salesperson record (the team roster) ───────────────────
-- Returns the sales_id so the caller can link a profile to it straight away.
create or replace function public.fn_upsert_team_member(
  p_name text,
  p_code text default null,
  p_team text default null,
  p_region text default null,
  p_sales_id uuid default null,
  p_active boolean default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  is_admin boolean;
  eff_team text;
  new_id uuid;
  old_row jsonb;
begin
  is_admin := public.fn_current_role() in ('super_admin', 'operations');

  if not (is_admin or public.fn_is_team_lead()) then
    raise exception 'You may not manage the team roster' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'A name is required' using errcode = '23502';
  end if;

  -- A supervisor cannot place people outside their own team, whatever they pass.
  eff_team := case when is_admin then p_team else public.fn_current_team() end;
  if not is_admin and eff_team is null then
    raise exception 'Your account has no team, so you cannot add members yet' using errcode = '42501';
  end if;

  if p_sales_id is null then
    insert into public.salesperson (name, code, team, region, active)
    values (btrim(p_name), nullif(btrim(coalesce(p_code, '')), ''), eff_team,
            case when is_admin then p_region else public.fn_current_region() end,
            coalesce(p_active, true))
    returning sales_id into new_id;

    insert into public.audit_log (table_name, row_pk, action, actor_id, actor_role, new_data, source)
    values ('salesperson', new_id::text, 'INSERT', (select auth.uid()), public.fn_current_role(),
            jsonb_build_object('name', btrim(p_name), 'team', eff_team), 'fn_upsert_team_member');
    return new_id;
  end if;

  -- Editing an existing member: a supervisor may only touch their own team.
  select to_jsonb(s) into old_row from public.salesperson s where s.sales_id = p_sales_id;
  if old_row is null then
    raise exception 'No such salesperson' using errcode = '23503';
  end if;
  if not is_admin and (old_row ->> 'team') is distinct from public.fn_current_team() then
    raise exception 'You may only manage your own team' using errcode = '42501';
  end if;

  update public.salesperson
     set name   = btrim(p_name),
         code   = coalesce(nullif(btrim(coalesce(p_code, '')), ''), code),
         team   = eff_team,
         region = case when is_admin then p_region else region end,
         active = coalesce(p_active, active)
   where sales_id = p_sales_id;

  insert into public.audit_log (table_name, row_pk, action, actor_id, actor_role,
                                old_data, new_data, source)
  values ('salesperson', p_sales_id::text, 'UPDATE', (select auth.uid()), public.fn_current_role(),
          old_row, jsonb_build_object('name', btrim(p_name), 'team', eff_team), 'fn_upsert_team_member');
  return p_sales_id;
end;
$function$;

-- ── Grants: authenticated only, never anon ───────────────────────────────────
revoke all on function public.fn_member_grantable_roles()                        from public, anon;
revoke all on function public.fn_can_manage_member(uuid)                         from public, anon;
revoke all on function public.fn_team_members()                                  from public, anon;
revoke all on function public.fn_grant_member_role(uuid, text, text)             from public, anon;
revoke all on function public.fn_link_member_salesperson(uuid, uuid)             from public, anon;
revoke all on function public.fn_upsert_team_member(text, text, text, text, uuid, boolean) from public, anon;

grant execute on function public.fn_member_grantable_roles()                        to authenticated;
grant execute on function public.fn_can_manage_member(uuid)                         to authenticated;
grant execute on function public.fn_team_members()                                  to authenticated;
grant execute on function public.fn_grant_member_role(uuid, text, text)             to authenticated;
grant execute on function public.fn_link_member_salesperson(uuid, uuid)             to authenticated;
grant execute on function public.fn_upsert_team_member(text, text, text, text, uuid, boolean) to authenticated;
