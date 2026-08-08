-- Feedback and quality. Post-course feedback with an NPS score and content,
-- trainer, and venue ratings; a complaint register for issues raised against an
-- order, client, or session.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- ---- Feedback ----
create table if not exists public.feedback (
  feedback_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedule(schedule_id) on delete cascade,
  participant_id uuid references public.participant(participant_id) on delete set null,
  nps smallint check (nps between 0 and 10),
  content_rating smallint check (content_rating between 1 and 5),
  trainer_rating smallint check (trainer_rating between 1 and 5),
  venue_rating smallint check (venue_rating between 1 and 5),
  comments text,
  submitted_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists ix_feedback_schedule on public.feedback(schedule_id);

alter table public.feedback enable row level security;
drop policy if exists p_feedback_r on public.feedback;
create policy p_feedback_r on public.feedback for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_feedback_w on public.feedback;
create policy p_feedback_w on public.feedback for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));

-- Per-session feedback rollup with the NPS score
-- (% promoters [9-10] minus % detractors [0-6]).
create or replace view public.v_session_feedback as
  select f.schedule_id,
         co.course_name,
         s.start_date,
         s.trainer_id,
         count(*) as responses,
         round(avg(f.content_rating)::numeric, 2) as avg_content,
         round(avg(f.trainer_rating)::numeric, 2) as avg_trainer,
         round(avg(f.venue_rating)::numeric, 2) as avg_venue,
         count(*) filter (where f.nps >= 9) as promoters,
         count(*) filter (where f.nps between 7 and 8) as passives,
         count(*) filter (where f.nps between 0 and 6) as detractors,
         case when count(*) filter (where f.nps is not null) > 0
              then round((count(*) filter (where f.nps >= 9) - count(*) filter (where f.nps between 0 and 6))::numeric
                          * 100 / count(*) filter (where f.nps is not null), 0)
         end as nps_score
    from feedback f
    join schedule s on s.schedule_id = f.schedule_id
    join course co on co.course_id = s.course_id
   group by f.schedule_id, co.course_name, s.start_date, s.trainer_id;

-- Per-trainer quality rollup across all their rated sessions.
create or replace view public.v_trainer_quality as
  select t.trainer_id, t.name, t.code,
         count(f.feedback_id) as responses,
         round(avg(f.trainer_rating)::numeric, 2) as avg_trainer,
         round(avg(f.content_rating)::numeric, 2) as avg_content,
         count(*) filter (where f.nps >= 9) as promoters,
         count(*) filter (where f.nps between 0 and 6) as detractors,
         case when count(*) filter (where f.nps is not null) > 0
              then round((count(*) filter (where f.nps >= 9) - count(*) filter (where f.nps between 0 and 6))::numeric
                          * 100 / count(*) filter (where f.nps is not null), 0)
         end as nps_score
    from trainer t
    left join schedule s on s.trainer_id = t.trainer_id
    left join feedback f on f.schedule_id = s.schedule_id
   where t.active
   group by t.trainer_id, t.name, t.code;

-- Overall NPS across every response, for the quality overview.
create or replace function public.fn_nps_summary()
returns table(responses bigint, promoters bigint, passives bigint, detractors bigint,
              nps_score numeric, avg_content numeric, avg_trainer numeric)
language sql stable security definer set search_path to 'public'
as $$
  select count(*) filter (where nps is not null),
         count(*) filter (where nps >= 9),
         count(*) filter (where nps between 7 and 8),
         count(*) filter (where nps between 0 and 6),
         case when count(*) filter (where nps is not null) > 0
              then round((count(*) filter (where nps >= 9) - count(*) filter (where nps between 0 and 6))::numeric
                          * 100 / count(*) filter (where nps is not null), 0) end,
         round(avg(content_rating)::numeric, 2),
         round(avg(trainer_rating)::numeric, 2)
    from feedback;
$$;
grant execute on function public.fn_nps_summary() to authenticated;

-- ---- Complaints ----
create table if not exists public.complaint (
  complaint_id uuid primary key default gen_random_uuid(),
  subject text not null,
  description text,
  severity text not null default 'Medium' check (severity in ('Low','Medium','High')),
  status text not null default 'Open' check (status in ('Open','In Progress','Resolved','Closed')),
  client_id uuid references public.client(client_id) on delete set null,
  order_id text references public.orders(order_id) on delete set null,
  schedule_id uuid references public.schedule(schedule_id) on delete set null,
  assigned_to uuid,
  resolution text,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ix_complaint_status on public.complaint(status);

-- Stamp resolved_at when a complaint moves to a closed state, and clear it if
-- it reopens.
create or replace function public.fn_complaint_stamp()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status in ('Resolved','Closed') and (old.status is null or old.status not in ('Resolved','Closed')) then
    new.resolved_at := now();
  elsif new.status not in ('Resolved','Closed') then
    new.resolved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_complaint_stamp on public.complaint;
create trigger trg_complaint_stamp before insert or update on public.complaint
  for each row execute function public.fn_complaint_stamp();

alter table public.complaint enable row level security;
-- Anyone signed in can raise and read complaints; ops and above manage them.
drop policy if exists p_complaint_r on public.complaint;
create policy p_complaint_r on public.complaint for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_complaint_i on public.complaint;
create policy p_complaint_i on public.complaint for insert to authenticated
  with check (fn_current_role() is not null);
drop policy if exists p_complaint_u on public.complaint;
create policy p_complaint_u on public.complaint for update to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));
