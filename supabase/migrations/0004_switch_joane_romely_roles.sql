-- Swap the Joane and Romely demo access assignments approved on 2026-08-22.
-- "Sales Supervisor" is a display title; the portal permission tier remains `sales`.

with role_map(email, full_name, role) as (
  values
    ('joane.test@tuv-portal.local', 'Joane — Operations', 'operations'),
    ('romely.test@tuv-portal.local', 'Romely — Sales Supervisor', 'sales')
)
update academy_v2.profiles p
set full_name = role_map.full_name,
    role = role_map.role
from auth.users u
join role_map on role_map.email = lower(u.email)
where p.id = u.id
  and (p.full_name, p.role) is distinct from (role_map.full_name, role_map.role);
