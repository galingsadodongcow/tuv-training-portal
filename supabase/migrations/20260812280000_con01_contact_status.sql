-- ===========================================================================
-- CON01 — contact lifecycle status for soft-delete (#129).
--
-- Contacts were hard-deleted (destroying the row), inconsistent with the
-- soft-delete/void stance everywhere else (participants, clients, orders). Adds
-- contact.status ('Active' | 'Removed') and fn_remove_contact, a role-gated
-- soft-remove that matches fn_remove_participant. The contact list filters out
-- 'Removed'. Idempotent.
-- ===========================================================================

alter table public.contact add column if not exists status text not null default 'Active';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contact_status_chk') then
    alter table public.contact
      add constraint contact_status_chk check (status in ('Active','Removed'));
  end if;
end $$;

-- Soft-delete: keep the row, flag it Removed. Matches the contact DELETE gate
-- (super_admin / coordinator) from the customer-authority RLS.
create or replace function public.fn_remove_contact(p_contact uuid, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r text := fn_current_role()::text;
begin
  if r is null or r not in ('coordinator','super_admin') then
    raise exception 'Only coordinator or super_admin may remove a contact' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', coalesce('contact removed: ' || p_reason, 'contact removed'), true);
  update contact set status = 'Removed' where contact_id = p_contact;
  if not found then raise exception 'Contact % not found', p_contact using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.fn_remove_contact(uuid, text) from public, anon;
grant execute on function public.fn_remove_contact(uuid, text) to authenticated;
