-- LOCAL DEVELOPMENT ONLY. Not part of the application's Supabase migrations.
--
-- The committed migrations cannot be applied to an empty database in filename
-- order as documented in docs/DEPLOYMENT.md: migrations 0005 and 0007 abort
-- with "Required sample identities or courses are missing" because they look up
-- the course `PH-C03-DPO-PERSCERT-VC`, but 0002 only references that code in its
-- price/competency seeds and never inserts the course row itself. The hosted
-- project evidently had this course created out-of-band before 0005 was applied.
--
-- This idempotent seed inserts the missing prerequisite so the Cloud Agent local
-- stack can bring the full schema and sample data up from scratch. It is applied
-- after 0002 and before 0003+ by .cursor/local-supabase/setup.sh. The permanent
-- fix belongs in the migrations themselves (add the course to 0002's course_seed).
insert into academy_v2.courses (category_id, code, title, duration_minutes, default_capacity)
select category.id,
       'PH-C03-DPO-PERSCERT-VC',
       'Data Protection Officer Personal Certification',
       960,
       25
from academy_v2.categories category
where lower(btrim(category.name)) = lower('Professional Development')
  and not exists (
    select 1 from academy_v2.courses c where c.code = 'PH-C03-DPO-PERSCERT-VC'
  );
