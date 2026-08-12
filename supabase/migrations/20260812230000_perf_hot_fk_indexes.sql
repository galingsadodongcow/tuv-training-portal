-- ============================================================================
-- Perf: covering indexes for the hot foreign keys joined on every load
-- ----------------------------------------------------------------------------
-- The performance advisor flags ~51 unindexed FKs; most are cold and deferred.
-- This migration indexes ONLY the foreign keys that are exercised on the hottest
-- paths (My Work / Calendar / Orders / roster / global search) or inside an RLS
-- SELECT policy that runs on every read:
--   * orders.created_by            -- p_orders_r filters `created_by = auth.uid()`
--   * order_assignment.sales_id    -- p_orders_r joins order_assignment -> salesperson
--   * orders.schedule_id           -- orders <-> session/calendar joins
--   * participant.line_id          -- roster/attendance + fn_can_see_order(line->order)
--   * schedule.course_id           -- calendar <-> course on every calendar load
--   * course.subcategory_id        -- S6 FK (new); category/subcategory filtering
-- Deferred (cold / not on a hot path): multiple_permissive_policies (59),
-- auth_rls_initplan (30), and the remaining cold unindexed FKs.
-- Idempotent: `create index if not exists`.
-- ============================================================================

create index if not exists idx_orders_created_by        on public.orders(created_by);
create index if not exists idx_orders_schedule_id        on public.orders(schedule_id);
create index if not exists idx_order_assignment_sales_id on public.order_assignment(sales_id);
create index if not exists idx_participant_line_id       on public.participant(line_id);
create index if not exists idx_schedule_course_id        on public.schedule(course_id);
create index if not exists idx_course_subcategory_id     on public.course(subcategory_id);
