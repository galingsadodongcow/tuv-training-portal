-- Automatic trainer and venue codes (owner feedback).
--
-- Trainer codes were a free-text box on the add form — easy to leave blank,
-- duplicate, or typo — and venues had no code at all. Generate both in the
-- database rather than the client: a browser can race another browser, and the
-- anon-key app is not the only writer (seeds and the SQL editor insert too), so
-- the sequence + trigger is the only place that can guarantee uniqueness.
--
-- Format follows the codes already in the table (TR-01, TR-02, …): a 2-digit
-- zero-padded suffix that simply grows past 99 (lpad never truncates).
-- A caller may still pass an explicit code — the trigger only fills a blank one,
-- so historical/manual codes keep working.
--
-- Idempotent throughout.

-- ── Venue gains the column trainers already had ───────────────────────────────
alter table public.venue add column if not exists code text;

-- ── Sequences, seeded past whatever already exists ────────────────────────────
create sequence if not exists public.trainer_code_seq;
create sequence if not exists public.venue_code_seq;

-- Seed each sequence to the highest numeric suffix currently in use so the first
-- generated code cannot collide with a hand-entered one. Runs on every apply and
-- only ever moves the sequence forward.
-- Derived from the codes actually present, so re-running is safe: the value is a
-- function of the table, not of the sequence's current position. Non-numeric
-- codes contribute nothing (regexp strips to '', nullif makes it null, max
-- ignores it).
--
-- is_called = false, so the next nextval() returns exactly max + 1. Using
-- is_called = true here would skip a number on an empty register — the first
-- venue came out VN-02 instead of VN-01.
do $$
declare
  max_t integer;
  max_v integer;
begin
  select coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::integer), 0)
    into max_t from public.trainer where code is not null;
  select coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::integer), 0)
    into max_v from public.venue where code is not null;
  perform setval('public.trainer_code_seq', max_t + 1, false);
  perform setval('public.venue_code_seq',   max_v + 1, false);
end $$;

-- ── Trigger functions ─────────────────────────────────────────────────────────
-- SECURITY INVOKER (the default) and a pinned empty search_path: these only read
-- their own NEW row and a sequence, so they need no elevated rights.
create or replace function public.fn_trainer_autocode()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := 'TR-' || lpad(nextval('public.trainer_code_seq')::text, 2, '0');
  end if;
  return new;
end;
$function$;

create or replace function public.fn_venue_autocode()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := 'VN-' || lpad(nextval('public.venue_code_seq')::text, 2, '0');
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_trainer_autocode on public.trainer;
create trigger trg_trainer_autocode before insert on public.trainer
  for each row execute function public.fn_trainer_autocode();

drop trigger if exists trg_venue_autocode on public.venue;
create trigger trg_venue_autocode before insert on public.venue
  for each row execute function public.fn_venue_autocode();

-- These are BEFORE-trigger functions returning `trigger`; they are never called
-- as RPCs. Revoke the default PUBLIC EXECUTE so they are not exposed through
-- PostgREST (same reasoning as 20260812010000 / 20260814030000). Revoking does
-- not stop the triggers firing.
revoke execute on function public.fn_trainer_autocode() from public, anon, authenticated;
revoke execute on function public.fn_venue_autocode()   from public, anon, authenticated;

-- ── Backfill anything already missing a code ──────────────────────────────────
-- Deterministic order so a rebuild assigns the same codes. Only touches rows
-- with no code, so re-applying is a no-op.
do $$
declare
  r record;
begin
  for r in select venue_id from public.venue where code is null or btrim(code) = ''
           order by created_at, name loop
    update public.venue
       set code = 'VN-' || lpad(nextval('public.venue_code_seq')::text, 2, '0')
     where venue_id = r.venue_id;
  end loop;

  for r in select trainer_id from public.trainer where code is null or btrim(code) = ''
           order by created_at, name loop
    update public.trainer
       set code = 'TR-' || lpad(nextval('public.trainer_code_seq')::text, 2, '0')
     where trainer_id = r.trainer_id;
  end loop;
end $$;

-- ── Uniqueness ────────────────────────────────────────────────────────────────
-- Case-insensitive so TR-01 and tr-01 cannot coexist. Partial, because a row is
-- allowed to sit with a null code between insert and backfill in older data.
create unique index if not exists ux_trainer_code_lower
  on public.trainer (lower(code)) where code is not null;
create unique index if not exists ux_venue_code_lower
  on public.venue (lower(code)) where code is not null;
