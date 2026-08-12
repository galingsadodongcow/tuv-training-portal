-- ===========================================================================
-- Phase 2 RLS validation fix — customer-entity write authority + least-privilege.
--
-- The role-simulation pass (all 8 roles, live DB) found the client / contact /
-- organization / quote write policies were written pre-Phase-B and diverge from
-- the approved permission matrix (docs/implementation/role-crud-matrix.md):
--
--   GAPS (matrix grants authority the RLS denied):
--     * coordinator  — could not create/update clients, contacts, quotes (owns intake)
--     * operations   — could not update clients / contacts / organizations
--     * business_owner — could not update contacts / organizations
--
--   HOLES (RLS granted writes to read-only roles via ownership branches):
--     * contact  — `owner_sales_id is null` matched ANY role, so management/auditor
--                  could write contacts of unowned clients.
--     * quote    — `created_by = auth.uid()` matched ANY role, so any signed-in
--                  user (incl. management/auditor) could create a quote.
--
-- RLS is the authoritative access control (anon key in the browser). This
-- reconciles both directions to the matrix. Reads stay open to all authenticated;
-- management + auditor end up write-denied on every path. Idempotent.
-- ===========================================================================

-- ---- client -----------------------------------------------------------------
-- INSERT: super_admin, coordinator (intake), or a sales rep creating their own.
drop policy if exists p_client_i on public.client;
create policy p_client_i on public.client for insert to authenticated
  with check (
    fn_current_role() in ('super_admin','coordinator')
    or (fn_current_role() = 'sales' and owner_sales_id = fn_current_sales_id())
  );

-- UPDATE: super_admin, coordinator, operations, business_owner, or owning sales.
-- Folds in the old business_owner-only policy (p_client_bo_u), now redundant.
drop policy if exists p_client_bo_u on public.client;
drop policy if exists p_client_u on public.client;
create policy p_client_u on public.client for update to authenticated
  using (
    fn_current_role() in ('super_admin','coordinator','operations','business_owner')
    or (fn_current_role() = 'sales' and owner_sales_id = fn_current_sales_id())
  )
  with check (
    fn_current_role() in ('super_admin','coordinator','operations','business_owner')
    or (fn_current_role() = 'sales' and owner_sales_id = fn_current_sales_id())
  );

-- ---- contact ----------------------------------------------------------------
-- Split the old FOR ALL policy into C/U/D so the matrix's R-U vs C-R-U
-- distinction holds and the ownership branch is gated behind the sales role
-- (closing the unowned-client hole for read-only roles).
drop policy if exists p_contact_w on public.contact;

-- helper predicate inlined: a sales rep may touch contacts of clients they own
-- or that are unowned.
drop policy if exists p_contact_i on public.contact;
create policy p_contact_i on public.contact for insert to authenticated
  with check (
    fn_current_role() in ('super_admin','coordinator')
    or (fn_current_role() = 'sales' and exists (
          select 1 from public.client c where c.client_id = contact.client_id
            and (c.owner_sales_id is null or c.owner_sales_id = fn_current_sales_id())))
  );

drop policy if exists p_contact_u on public.contact;
create policy p_contact_u on public.contact for update to authenticated
  using (
    fn_current_role() in ('super_admin','coordinator','operations','business_owner')
    or (fn_current_role() = 'sales' and exists (
          select 1 from public.client c where c.client_id = contact.client_id
            and (c.owner_sales_id is null or c.owner_sales_id = fn_current_sales_id())))
  )
  with check (
    fn_current_role() in ('super_admin','coordinator','operations','business_owner')
    or (fn_current_role() = 'sales' and exists (
          select 1 from public.client c where c.client_id = contact.client_id
            and (c.owner_sales_id is null or c.owner_sales_id = fn_current_sales_id())))
  );

drop policy if exists p_contact_d on public.contact;
create policy p_contact_d on public.contact for delete to authenticated
  using (fn_current_role() in ('super_admin','coordinator'));

-- ---- organization -----------------------------------------------------------
-- UPDATE widened to the central roles (matrix: coordinator/operations/business_owner
-- R U). INSERT (p_org_i) left as-is (super_admin + sales set-org convenience).
drop policy if exists p_org_u on public.organization;
create policy p_org_u on public.organization for update to authenticated
  using (fn_current_role() in ('super_admin','coordinator','operations','business_owner','sales'))
  with check (fn_current_role() in ('super_admin','coordinator','operations','business_owner','sales'));

-- ---- quote / quote_line -----------------------------------------------------
-- Gate the "own quote" branch behind the selling roles so read-only and
-- fulfillment roles cannot create quotes by stamping created_by = self.
-- Matrix: Quotations — coordinator C R U; sales/sales_manager ● C U(own);
-- operations/business_owner R; management/auditor read-only.
drop policy if exists p_quote_w on public.quote;
create policy p_quote_w on public.quote for all to authenticated
  using (
    fn_current_role() = 'super_admin'
    or (fn_current_role() in ('coordinator','sales','sales_manager')
        and (created_by = auth.uid() or sales_id = fn_current_sales_id()))
  )
  with check (
    fn_current_role() = 'super_admin'
    or (fn_current_role() in ('coordinator','sales','sales_manager')
        and (created_by = auth.uid() or sales_id = fn_current_sales_id()))
  );

drop policy if exists p_quote_line_w on public.quote_line;
create policy p_quote_line_w on public.quote_line for all to authenticated
  using (
    fn_current_role() = 'super_admin'
    or (fn_current_role() in ('coordinator','sales','sales_manager') and exists (
          select 1 from public.quote q where q.quote_id = quote_line.quote_id
            and (q.created_by = auth.uid() or q.sales_id = fn_current_sales_id())))
  )
  with check (
    fn_current_role() = 'super_admin'
    or (fn_current_role() in ('coordinator','sales','sales_manager') and exists (
          select 1 from public.quote q where q.quote_id = quote_line.quote_id
            and (q.created_by = auth.uid() or q.sales_id = fn_current_sales_id())))
  );
