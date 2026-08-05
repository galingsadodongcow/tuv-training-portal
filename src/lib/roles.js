export const ROLE_LABEL = {
  super_admin: 'Super Admin',
  operations: 'Operations',
  business_owner: 'Business Owner',
  sales: 'Sales',
}

export const NAV = [
  { path: '/dashboard', label: 'Dashboard', roles: ['super_admin', 'operations', 'business_owner', 'sales'] },
  { path: '/calendar', label: 'Calendar', roles: ['super_admin', 'operations', 'business_owner', 'sales'] },
  { path: '/orders', label: 'Orders', roles: ['super_admin', 'operations', 'business_owner', 'sales'] },
  { path: '/worklist', label: 'Fulfillment', roles: ['super_admin', 'business_owner', 'sales'] },
  { path: '/clients', label: 'Clients', roles: ['super_admin', 'operations', 'business_owner', 'sales'] },
  { path: '/sales-entry', label: 'New sales order', roles: ['super_admin', 'sales'] },
  { path: '/duplicates', label: 'Duplicates', roles: ['super_admin', 'sales'] },
  { path: '/approvals', label: 'Approvals', roles: ['super_admin', 'operations', 'business_owner'] },
  { path: '/elearning', label: 'E-learning access', roles: ['super_admin', 'operations'] },
  { path: '/resources', label: 'Trainers & venues', roles: ['super_admin', 'operations', 'business_owner'] },
  { path: '/rollover', label: 'Annual rollover', roles: ['super_admin', 'operations'] },
]
