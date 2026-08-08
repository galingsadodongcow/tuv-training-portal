export type Role = 'super_admin' | 'operations' | 'business_owner' | 'sales'

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  operations: 'Operations',
  business_owner: 'Business Owner',
  sales: 'Sales',
}

export interface NavItem {
  path: string
  label: string
  roles: Role[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

const ALL: Role[] = ['super_admin', 'operations', 'business_owner', 'sales']

// Navigation grouped into primary function categories. Each group renders as a
// collapsible section, and shows only when the signed-in role has at least one
// item in it.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { path: '/home', label: 'Home', roles: ALL },
      { path: '/dashboard', label: 'Dashboard', roles: ALL },
      { path: '/data-quality', label: 'Data quality', roles: ['super_admin'] },
    ],
  },
  {
    label: 'Sales and orders',
    items: [
      { path: '/orders', label: 'Orders', roles: ALL },
      { path: '/worklist', label: 'Fulfillment', roles: ['super_admin', 'operations', 'business_owner', 'sales'] },
      { path: '/sales-entry', label: 'New sales order', roles: ['super_admin', 'sales'] },
      { path: '/clients', label: 'Clients', roles: ALL },
      { path: '/duplicates', label: 'Duplicates', roles: ['super_admin', 'sales'] },
    ],
  },
  {
    label: 'Delivery',
    items: [
      { path: '/calendar', label: 'Calendar', roles: ALL },
      { path: '/courses', label: 'Courses and pricing', roles: ['super_admin', 'operations'] },
      { path: '/resources', label: 'Trainers and venues', roles: ['super_admin', 'operations', 'business_owner'] },
      { path: '/elearning', label: 'E-learning access', roles: ['super_admin', 'operations'] },
      { path: '/rollover', label: 'Annual rollover', roles: ['super_admin', 'operations'] },
    ],
  },
  {
    label: 'Decisions',
    items: [
      { path: '/approvals', label: 'Approvals', roles: ['super_admin', 'operations', 'business_owner'] },
    ],
  },
]

// Flat list, kept for the command palette and anything that wants every item.
export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)
