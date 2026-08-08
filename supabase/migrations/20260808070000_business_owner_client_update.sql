-- Let the business owner update client rows, so they can archive and restore
-- customers alongside the super admin and the owning salesperson.
--
-- RLS combines permissive policies with OR, so this adds a business-owner path
-- next to the existing super-admin and owner-sales policies without touching
-- them. Idempotent and safe to paste whole into the Supabase SQL editor.

drop policy if exists p_client_bo_u on public.client;
create policy p_client_bo_u on public.client for update to authenticated
  using      (public.fn_current_role() = 'business_owner'::public.user_role)
  with check (public.fn_current_role() = 'business_owner'::public.user_role);
