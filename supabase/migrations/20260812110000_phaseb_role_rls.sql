-- ===========================================================================
-- Phase B (second-pass) — 2/6: RLS for the 8-role model.
--
-- Uses the enum labels added in 20260812100000 (separate txn — safe under the
-- psql-autocommit bundle). Establishes the read/write posture for the four new
-- roles and folds them into the existing policies:
--
--   Read-all (SELECT everywhere): super_admin, operations, business_owner,
--     coordinator, management, auditor.  (coordinator needs the global view to
--     own intake + dedup; management/auditor are read-only by decision.)
--   Team-scoped read: sales (own + team), sales_manager (team + region, like a
--     supervisor).
--   Writes: coordinator gets operations-like INTAKE writes (orders, lines,
--     assignments, inquiries); management + auditor get NO writes anywhere;
--     auditor additionally reads audit_log.
--
-- Payments/refunds authority (D3) and the customer model live in later files.
-- All idempotent (create-or-replace fn, drop-then-create policy). ::text-free
-- role comparisons are fine here — role labels are stable enum values.
-- ===========================================================================

-- ---- Role-group helpers (single source of truth for the posture) ----------
-- Broad-read roles: see every order / lead / receivable regardless of ownership.
create or replace function public.fn_role_reads_all()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select fn_current_role() in
    ('super_admin','operations','business_owner','coordinator','management','auditor');
$$;

-- Team-lead scope: supervisors (legacy is_supervisor flag) and the new
-- sales_manager role both get region-wide visibility over their team.
create or replace function public.fn_is_team_lead()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select fn_is_supervisor() or fn_current_role() = 'sales_manager';
$$;

-- Intake-writer roles: who may create/edit orders, lines, assignments, leads.
create or replace function public.fn_role_intake_write()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select fn_current_role() in ('super_admin','operations','coordinator');
$$;

grant execute on function public.fn_role_reads_all()    to authenticated;
grant execute on function public.fn_is_team_lead()      to authenticated;
grant execute on function public.fn_role_intake_write() to authenticated;

-- ---- fn_can_see_order: widen read-all group + add sales_manager scope -------
create or replace function public.fn_can_see_order(p_order text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    fn_role_reads_all()
    or exists (select 1 from orders o where o.order_id = p_order and o.created_by = auth.uid())
    or exists (
      select 1 from order_assignment oa join salesperson sp on sp.sales_id = oa.sales_id
       where oa.order_id = p_order
         and ((fn_current_team() is not null and sp.team is not distinct from fn_current_team())
           or (fn_is_team_lead() and fn_current_region() is not null
               and sp.region is not distinct from fn_current_region())));
$$;

-- ---- orders: SELECT for read-all roles + sales_manager region scope ---------
drop policy if exists p_orders_r on public.orders;
create policy p_orders_r on public.orders for select to authenticated using (
  fn_role_reads_all()
  or (created_by = auth.uid())
  or exists (
    select 1 from order_assignment oa join salesperson sp on sp.sales_id = oa.sales_id
     where oa.order_id = orders.order_id
       and ((fn_current_team() is not null and sp.team is not distinct from fn_current_team())
         or (fn_is_team_lead() and fn_current_region() is not null
             and sp.region is not distinct from fn_current_region())))
);

-- Coordinator INTAKE writes on orders (any channel: webshop re-key + manual).
-- created_by is stamped to the coordinator for traceability on insert.
drop policy if exists p_orders_coord_i on public.orders;
create policy p_orders_coord_i on public.orders for insert to authenticated
  with check (fn_current_role() = 'coordinator' and created_by = auth.uid());

-- Widen the privileged UPDATE to include coordinator (ops/business_owner kept).
drop policy if exists p_orders_priv_u on public.orders;
create policy p_orders_priv_u on public.orders for update to authenticated
  using (fn_current_role() in ('operations','business_owner','coordinator'))
  with check (fn_current_role() in ('operations','business_owner','coordinator'));

-- ---- order_line: coordinator joins the privileged writer set ----------------
drop policy if exists order_line_write_priv on public.order_line;
create policy order_line_write_priv on public.order_line for all to authenticated
  using (fn_current_role() in ('operations','super_admin','coordinator'))
  with check (fn_current_role() in ('operations','super_admin','coordinator'));

-- ---- order_assignment: coordinator may assign; sales_manager may reassign ---
drop policy if exists p_asg_coord on public.order_assignment;
create policy p_asg_coord on public.order_assignment for all to authenticated
  using (fn_current_role() = 'coordinator')
  with check (fn_current_role() = 'coordinator');

-- Refresh the "team lead" assignment policies to include sales_manager. These
-- exist on the live DB (drop-if-exists is a no-op where they are absent).
drop policy if exists p_asg_lead_i on public.order_assignment;
create policy p_asg_lead_i on public.order_assignment for insert to authenticated
  with check (fn_current_role() = 'business_owner'
    or (fn_current_role() = 'sales' and fn_is_supervisor())
    or fn_current_role() = 'sales_manager');
drop policy if exists p_asg_lead_u on public.order_assignment;
create policy p_asg_lead_u on public.order_assignment for update to authenticated
  using (fn_current_role() = 'business_owner'
    or (fn_current_role() = 'sales' and fn_is_supervisor())
    or fn_current_role() = 'sales_manager');
drop policy if exists p_asg_lead_d on public.order_assignment;
create policy p_asg_lead_d on public.order_assignment for delete to authenticated
  using (fn_current_role() = 'business_owner'
    or (fn_current_role() = 'sales' and fn_is_supervisor())
    or fn_current_role() = 'sales_manager');

-- ---- inquiry: read-all roles + team-lead team view + coordinator intake -----
-- Existing p_inq_rw (super_admin | own sales) is kept for sales self-service and
-- write. Add SELECT for the read-all roles, a team view for sales_manager, and
-- full intake write for coordinator.
drop policy if exists p_inq_readall on public.inquiry;
create policy p_inq_readall on public.inquiry for select to authenticated
  using (fn_role_reads_all());

drop policy if exists p_inq_team_lead on public.inquiry;
create policy p_inq_team_lead on public.inquiry for select to authenticated
  using (fn_current_role() = 'sales_manager' and exists (
    select 1 from salesperson sp where sp.sales_id = inquiry.sales_id
      and sp.team is not distinct from fn_current_team()));

drop policy if exists p_inq_coord on public.inquiry;
create policy p_inq_coord on public.inquiry for all to authenticated
  using (fn_current_role() = 'coordinator')
  with check (fn_current_role() = 'coordinator');

-- ---- audit_log: add the auditor role (read-only governance) -----------------
drop policy if exists p_audit_r on public.audit_log;
create policy p_audit_r on public.audit_log for select to authenticated
  using (fn_current_role() in ('super_admin','auditor'));
