-- ===========================================================================
-- IDX01 — index the hot foreign keys (#138).
--
-- A deliberately small slice of the pre-existing perf advisories: only the
-- unindexed FKs on the hottest join/filter paths (schedule filtered by year and
-- owner on every calendar/worklist/dashboard read; attribution and feedback
-- joins; orders → course). NOT a broad optimization sweep — the cold FKs
-- (webshop_product_id, forecast_by, reassigned_from, …) are intentionally left
-- alone. Plain CREATE INDEX IF NOT EXISTS so it is idempotent and safe inside a
-- migration transaction. Verified against pg_index before writing.
-- ===========================================================================

create index if not exists idx_schedule_year_id          on public.schedule (year_id);
create index if not exists idx_schedule_sales_owner      on public.schedule (sales_owner);
create index if not exists idx_schedule_operations_owner on public.schedule (operations_owner);
create index if not exists idx_orders_course_id          on public.orders (course_id);
create index if not exists idx_attribution_sales_id      on public.attribution (sales_id);
create index if not exists idx_attribution_schedule_id   on public.attribution (schedule_id);
create index if not exists idx_feedback_participant_id   on public.feedback (participant_id);
