-- ===========================================================================
-- #123 — Seed role-default saved views for Orders / Calendar / the fulfilment
-- queue (Worklist).
--
-- saved_view already ships the hooks and RLS: users CRUD their own personal
-- views (owner_id = auth.uid(), shared_role IS NULL), and everyone can READ a
-- shared_role view whose role matches theirs — but only super_admin may WRITE a
-- shared view. So the out-of-the-box defaults are seeded here as data (this runs
-- as the DB owner, bypassing RLS).
--
-- Each seed carries config->>'_seed' = 'true' so the reseed is idempotent
-- without a natural key: we delete only our own seeds, then re-insert. Manually
-- authored shared views (if any) are left untouched. config values are the exact
-- URL params each surface reads; a view omits a param it wants at its default
-- (Worklist's who defaults to the whole queue for non-selling roles, so an
-- "everyone" view simply omits who).
-- ===========================================================================

delete from public.saved_view
 where owner_id is null
   and shared_role is not null
   and coalesce(config->>'_seed', '') = 'true'
   and surface in ('orders', 'calendar', 'worklist');

insert into public.saved_view (owner_id, surface, shared_role, name, config, is_default) values
  -- Fulfilment queue (Worklist) --------------------------------------------
  (null, 'worklist', 'coordinator',   'Awaiting endorsement', '{"_seed":true,"stage":"Endorsed to Ops"}',   false),
  (null, 'worklist', 'coordinator',   'Stalled 14d+',         '{"_seed":true,"view":"stalled"}',            false),
  (null, 'worklist', 'coordinator',   'Unassigned',           '{"_seed":true,"who":"unassigned"}',          false),
  (null, 'worklist', 'operations',    'Stalled 14d+',         '{"_seed":true,"view":"stalled"}',            false),
  (null, 'worklist', 'operations',    'No feedback',          '{"_seed":true,"view":"no_feedback"}',        false),
  (null, 'worklist', 'operations',    'Paid, not endorsed',   '{"_seed":true,"view":"paid_unendorsed"}',    false),
  (null, 'worklist', 'sales',         'My stalled',           '{"_seed":true,"who":"mine","view":"stalled"}', false),
  (null, 'worklist', 'sales',         'My overdue collections','{"_seed":true,"who":"mine","view":"overdue"}', false),
  (null, 'worklist', 'sales_manager', 'Team stalled',         '{"_seed":true,"view":"stalled"}',            false),
  (null, 'worklist', 'sales_manager', 'Unassigned',           '{"_seed":true,"who":"unassigned"}',          false),
  -- Orders (the CRM Orders tab) ---------------------------------------------
  (null, 'orders',   'coordinator',   'Unpaid orders',        '{"_seed":true,"pay":"Unpaid"}',              false),
  (null, 'orders',   'coordinator',   'Cancelled',            '{"_seed":true,"stage":"Cancelled"}',         false),
  (null, 'orders',   'operations',    'Booked in SAP',        '{"_seed":true,"stage":"SAP Created"}',       false),
  (null, 'orders',   'operations',    'Awaiting order creation','{"_seed":true,"stage":"For Order Creation"}', false),
  (null, 'orders',   'sales',         'Unpaid orders',        '{"_seed":true,"pay":"Unpaid"}',              false),
  -- Calendar ----------------------------------------------------------------
  (null, 'calendar', 'operations',    'Fill risk (all months)','{"_seed":true,"cal":"list","month":"all","sort":"fill","dir":"asc"}', false),
  (null, 'calendar', 'sales',         'Fill risk (all months)','{"_seed":true,"cal":"list","month":"all","sort":"fill","dir":"asc"}', false);
