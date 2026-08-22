-- Realistic sample records for the Academy Portal catalogue slice.
-- Existing records are preserved; only missing sample records are inserted.

insert into academy_v2.categories(name)
select seed.name
from (values
  ('Management Systems'),
  ('Food Safety'),
  ('Sustainability'),
  ('Professional Development')
) as seed(name)
where not exists (
  select 1 from academy_v2.categories c
  where c.parent_id is null and lower(btrim(c.name)) = lower(seed.name)
);

insert into academy_v2.categories(parent_id, name)
select parent.id, seed.child_name
from (values
  ('Management Systems', 'Quality Management'),
  ('Management Systems', 'Environmental Management'),
  ('Management Systems', 'Occupational Health and Safety'),
  ('Food Safety', 'HACCP and Food Hygiene'),
  ('Sustainability', 'ESG Fundamentals'),
  ('Professional Development', 'Train the Trainer'),
  ('Data Privacy', 'Data Protection')
) as seed(parent_name, child_name)
join academy_v2.categories parent
  on parent.parent_id is null and lower(btrim(parent.name)) = lower(seed.parent_name)
where not exists (
  select 1 from academy_v2.categories child
  where child.parent_id = parent.id and lower(btrim(child.name)) = lower(seed.child_name)
);

with course_seed(code, title, category_name, duration_minutes, default_capacity) as (
  values
    ('ISO-9001-LA', 'ISO 9001:2015 Lead Auditor', 'Quality Management', 2400, 20),
    ('ISO-9001-IA', 'ISO 9001:2015 Internal Auditor', 'Quality Management', 960, 24),
    ('ISO-14001-IA', 'ISO 14001:2015 Internal Auditor', 'Environmental Management', 960, 24),
    ('ISO-45001-LA', 'ISO 45001:2018 Lead Auditor', 'Occupational Health and Safety', 2400, 20),
    ('HACCP-L3', 'HACCP Level 3 for Food Manufacturing', 'HACCP and Food Hygiene', 960, 24),
    ('ESG-FOUND', 'ESG and Sustainability Foundations', 'ESG Fundamentals', 480, 30),
    ('TOT-PRO', 'Professional Training of Trainers', 'Train the Trainer', 960, 20)
)
insert into academy_v2.courses(category_id, code, title, duration_minutes, default_capacity)
select category.id, seed.code, seed.title, seed.duration_minutes, seed.default_capacity
from course_seed seed
join academy_v2.categories category on lower(btrim(category.name)) = lower(seed.category_name)
where not exists (select 1 from academy_v2.courses c where c.code = seed.code);

with price_seed(code, learning_type, amount) as (
  values
    ('PH-C03-DPO-PERSCERT-VC', 'virtual', 28000.00::numeric),
    ('PH-C03-DPO-PERSCERT-VC', 'classroom', 32000.00::numeric),
    ('ISO-9001-LA', 'virtual', 30000.00::numeric),
    ('ISO-9001-LA', 'classroom', 35000.00::numeric),
    ('ISO-9001-IA', 'virtual', 12500.00::numeric),
    ('ISO-9001-IA', 'classroom', 15000.00::numeric),
    ('ISO-14001-IA', 'virtual', 12500.00::numeric),
    ('ISO-14001-IA', 'classroom', 15000.00::numeric),
    ('ISO-45001-LA', 'virtual', 30000.00::numeric),
    ('ISO-45001-LA', 'classroom', 35000.00::numeric),
    ('HACCP-L3', 'classroom', 14500.00::numeric),
    ('HACCP-L3', 'onsite', 18000.00::numeric),
    ('ESG-FOUND', 'virtual', 8500.00::numeric),
    ('ESG-FOUND', 'classroom', 10500.00::numeric),
    ('TOT-PRO', 'classroom', 16500.00::numeric),
    ('TOT-PRO', 'onsite', 20000.00::numeric)
)
insert into academy_v2.course_prices(course_id, learning_type, amount, currency, effective_from)
select course.id, seed.learning_type, seed.amount, 'PHP', date '2026-01-01'
from price_seed seed
join academy_v2.courses course on course.code = seed.code
where not exists (
  select 1 from academy_v2.course_prices price
  where price.course_id = course.id
    and price.learning_type = seed.learning_type
    and price.currency = 'PHP'
    and price.is_active
);

insert into academy_v2.trainers(name)
select seed.name
from (values
  ('Alex Rivera — Sample Trainer'),
  ('Bianca Cruz — Sample Trainer'),
  ('Carlos Mendoza — Sample Trainer'),
  ('Diana Lim — Sample Trainer'),
  ('Emilio Santos — Sample Trainer')
) as seed(name)
where not exists (
  select 1 from academy_v2.trainers trainer where lower(btrim(trainer.name)) = lower(seed.name)
);

with competency_seed(trainer_name, course_code, qualified_until) as (
  values
    ('Alex Rivera — Sample Trainer', 'ISO-9001-LA', date '2027-12-31'),
    ('Alex Rivera — Sample Trainer', 'ISO-9001-IA', date '2027-12-31'),
    ('Bianca Cruz — Sample Trainer', 'ISO-14001-IA', date '2027-06-30'),
    ('Bianca Cruz — Sample Trainer', 'ESG-FOUND', date '2027-06-30'),
    ('Carlos Mendoza — Sample Trainer', 'ISO-45001-LA', date '2028-03-31'),
    ('Diana Lim — Sample Trainer', 'HACCP-L3', date '2027-09-30'),
    ('Emilio Santos — Sample Trainer', 'TOT-PRO', date '2027-12-31'),
    ('Emilio Santos — Sample Trainer', 'PH-C03-DPO-PERSCERT-VC', date '2027-12-31')
)
insert into academy_v2.trainer_courses(trainer_id, course_id, qualified_until)
select trainer.id, course.id, seed.qualified_until
from competency_seed seed
join academy_v2.trainers trainer on trainer.name = seed.trainer_name
join academy_v2.courses course on course.code = seed.course_code
where not exists (
  select 1 from academy_v2.trainer_courses competency
  where competency.trainer_id = trainer.id and competency.course_id = course.id
);

insert into academy_v2.venues(name, venue_type, capacity, address)
select seed.name, seed.venue_type, seed.capacity, seed.address
from (values
  ('Makati Training Room A — Sample', 'physical', 24, 'Makati City, Metro Manila'),
  ('Cebu Training Room — Sample', 'physical', 20, 'Cebu Business Park, Cebu City'),
  ('Customer Site — Sample', 'physical', 50, 'Address confirmed for each onsite engagement'),
  ('Microsoft Teams Classroom — Sample', 'virtual', null::integer, 'Secure meeting link issued per session')
) as seed(name, venue_type, capacity, address)
where not exists (
  select 1 from academy_v2.venues venue where lower(btrim(venue.name)) = lower(seed.name)
);

insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, reason, details)
select p.id, 'demo.seed_applied', 'configuration', 'catalogue-v1',
  'Populate representative role and catalogue data',
  jsonb_build_object('roles', 5, 'sample_data', true)
from academy_v2.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = 'alanclifford.filart@tuv.com'
  and not exists (
    select 1 from academy_v2.audit_events a
    where a.action = 'demo.seed_applied' and a.entity_id = 'catalogue-v1'
  );
