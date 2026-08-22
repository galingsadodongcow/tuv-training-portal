-- Dedicated non-production test identities mapped to the five approved roles.
-- Apply only with explicit authorization because this activates Auth identities.

with role_map(email, full_name, role) as (
  values
    ('alanclifford.filart@tuv.com', 'Alan Clifford Filart', 'administrator'),
    ('alan.test@tuv-portal.local', 'Alan — Operations', 'operations'),
    ('romely.test@tuv-portal.local', 'Romely — Operations', 'operations'),
    ('joane.test@tuv-portal.local', 'Joane — Sales', 'sales'),
    ('melis.test@tuv-portal.local', 'Melis — Sales', 'sales'),
    ('pinky.test@tuv-portal.local', 'Pinky — Manager', 'manager'),
    ('qa-axe-bot@tuv-training-portal.netlify.app', 'QA — Auditor', 'auditor')
)
update academy_v2.profiles p
set full_name = role_map.full_name,
    role = role_map.role,
    is_active = true
from auth.users u
join role_map on role_map.email = lower(u.email)
where p.id = u.id
  and (p.full_name, p.role, p.is_active) is distinct from (role_map.full_name, role_map.role, true);
