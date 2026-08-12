-- ===========================================================================
-- QTE01 — add the missing quote_line.course_id → course foreign key (#quote-fix).
--
-- quote_line had an FK on quote_id but none on course_id, so the PostgREST embed
-- `course:course_id(course_name)` in useQuoteLines had no relationship to resolve
-- and the quote's Lines section errored out ("Could not find a relationship
-- between 'quote_line' and 'course_id' in the schema cache") — the same class of
-- bug as the quote.sales_id FK (20260812240000). Data verified first: 0 orphan
-- quote_line.course_id. Idempotent.
-- ===========================================================================

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quote_line'::regclass
      and conname  = 'quote_line_course_id_fkey'
  ) then
    alter table public.quote_line
      add constraint quote_line_course_id_fkey
      foreign key (course_id) references public.course (course_id);
  end if;
end $$;
