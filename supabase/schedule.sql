-- Schedules the two Edge Functions with pg_cron + pg_net.
-- Run once in the Supabase SQL editor AFTER deploying both functions.
-- Replace <PROJECT-REF> and <SERVICE-ROLE-KEY> before running.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Monday 07:00 Manila = 23:00 UTC Sunday
select cron.schedule('weekly-digest', '0 23 * * 0', $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/weekly-digest',
    headers := '{"Authorization":"Bearer <SERVICE-ROLE-KEY>","Content-Type":"application/json"}'::jsonb
  );
$$);

-- Nightly 01:00 Manila = 17:00 UTC previous day
select cron.schedule('nightly-hygiene', '0 17 * * *', $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/nightly-hygiene',
    headers := '{"Authorization":"Bearer <SERVICE-ROLE-KEY>","Content-Type":"application/json"}'::jsonb
  );
$$);

select jobname, schedule from cron.job;
