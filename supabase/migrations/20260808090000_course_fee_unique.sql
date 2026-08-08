-- The course pricing UI upserts one fee per course and learning type with
-- ON CONFLICT (course_id, modality). The only unique constraint was on
-- (course_id, modality, effective_date), so the upsert raised "no unique or
-- exclusion constraint matching the ON CONFLICT specification". Add a unique
-- constraint that matches how the app models pricing: one current fee per
-- course and learning type.
--
-- Already applied to production via the connector; this file records it for
-- version control. Idempotent and safe to paste into the Supabase SQL editor.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'course_fee_course_modality_uk'
  ) then
    alter table public.course_fee
      add constraint course_fee_course_modality_uk unique (course_id, modality);
  end if;
end $$;
