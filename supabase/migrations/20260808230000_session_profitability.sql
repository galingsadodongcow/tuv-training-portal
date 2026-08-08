-- Session profitability. Revenue against trainer, co-trainer, venue, and
-- material cost, so each session shows a margin.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

alter table public.schedule add column if not exists material_cost numeric not null default 0;

create or replace view public.v_session_pnl as
  select x.*,
         (x.trainer_cost + x.venue_cost + x.material_cost) as total_cost,
         x.revenue - (x.trainer_cost + x.venue_cost + x.material_cost) as margin
  from (
    select s.schedule_id, co.course_name, s.start_date, s.status, s.country,
           coalesce(s.duration_days, 1) as days,
           coalesce(s.actual_revenue, s.booked_participants * s.price, 0) as revenue,
           (coalesce(t.daily_rate, 0)
             + coalesce((select sum(tr.daily_rate) from session_trainer st join trainer tr on tr.trainer_id = st.trainer_id where st.schedule_id = s.schedule_id), 0)
           ) * coalesce(s.duration_days, 1) as trainer_cost,
           coalesce(v.day_rate, 0) * coalesce(s.duration_days, 1) as venue_cost,
           coalesce(s.material_cost, 0) as material_cost
      from schedule s
      join course co on co.course_id = s.course_id
      left join trainer t on t.trainer_id = s.trainer_id
      left join venue v on v.venue_id = s.venue_id
  ) x;
