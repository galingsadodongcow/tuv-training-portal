-- ===========================================================================
-- S6 — retire the free-text course.category column.
--
-- The category → subcategory hierarchy (20260812220000_s6_category_hierarchy)
-- is fully adopted: every active course carries a subcategory_id, and the
-- category name derived through subcategory → category matches the old
-- free-text course.category for every course and every order fact (verified on
-- the live DB: 26/26 courses and 163/163 v_order_fact rows, zero mismatches).
-- The frontend now reads the category name from the hierarchy join everywhere
-- (useCourses / useSchedules map it onto course.category; the Calendar filter
-- and display, the Training catalogue, and the course form all read the
-- hierarchy), so nothing reads the column any more.
--
-- The only database dependency on course.category is the reporting view
-- v_order_fact. We recreate it to source `category` from the hierarchy (same
-- column, same position, same type — a compatible CREATE OR REPLACE), then drop
-- the column. Idempotent and safe to re-run.
--
-- Apply via .github/workflows/apply-supabase.yml. After applying, re-simulate
-- RLS as anon and as two sales reps, and re-run the Supabase advisors.
-- ===========================================================================

-- 1) Recreate v_order_fact with category sourced from subcategory → category
--    instead of the free-text course.category column. Column order and names
--    are unchanged, so this is a compatible replace. security_invoker=true is
--    preserved (a plain CREATE OR REPLACE would reset it and let the view
--    bypass the caller's RLS — which the Supabase advisor flags).
create or replace view public.v_order_fact
  with (security_invoker = true) as
  select
    o.order_id,
    o.order_date,
    date_trunc('month', o.order_date::timestamptz)::date as order_month,
    o.channel,
    o.modality,
    o.seats,
    o.amount_php,
    o.amount_php / nullif(cr.rate_php_eur, 0::numeric) as amount_eur_calc,
    o.payment_status,
    o.order_status,
    co.course_id,
    co.course_name,
    cat.name as category,
    co.training_type,
    s.schedule_id,
    s.start_date,
    cy.year,
    oa.sales_id,
    sp.name as sales_name
  from orders o
    left join schedule s on s.schedule_id = o.schedule_id
    left join calendar_year cy on cy.year_id = s.year_id
    left join course co on co.course_id = coalesce(o.course_id, s.course_id)
    left join subcategory sc on sc.subcategory_id = co.subcategory_id
    left join category cat on cat.category_id = sc.category_id
    left join order_assignment oa on oa.order_id = o.order_id
    left join salesperson sp on sp.sales_id = oa.sales_id
    left join conversion_rate cr on cr.month = date_trunc('month', o.order_date::timestamptz)::date;

-- 2) Drop the retired column (indexes on it, if any, drop automatically).
alter table public.course drop column if exists category;
