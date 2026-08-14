-- Protect the oversight roles from operations (owner decision, follow-up to
-- 20260814060000).
--
-- The first cut of fn_can_manage_member only ring-fenced super_admin, so
-- operations could act on anyone else — including demoting the business owner.
-- Verified live: as the operations account, fn_can_manage_member(<business
-- owner>) returned true. That is not a privilege *escalation* (operations still
-- cannot grant business_owner, so they cannot take the role themselves), but it
-- does let operations strip senior oversight access, which is not the intent.
--
-- Oversight roles — business_owner, management, auditor — now join super_admin
-- as roles only a super_admin may act on. Operations keeps full control of the
-- operational roles it is meant to run: sales, coordinator, sales_manager.
--
-- Only the guard changes; the grant matrix in fn_member_grantable_roles is
-- already correct (operations was never able to grant these roles).
-- Idempotent: create or replace.

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

  -- super_admin plus the oversight roles: super_admin only. This blocks a
  -- lateral takedown (operations demoting the business owner) as well as the
  -- upward path already covered by the grant matrix.
  if target_role in ('super_admin', 'business_owner', 'management', 'auditor') then
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
