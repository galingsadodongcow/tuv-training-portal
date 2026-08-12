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
  icon: string
  group?: string // section header the item sits under; blank = top (Home/My Work)
}

const ALL: Role[] = ['super_admin', 'operations', 'business_owner', 'sales']

// A grouped menu: Home and My Work lead for everyone, then each item sits under a
// workflow section (Sales / Operations / Customers / Oversight / Insights /
// Admin). Items are filtered by role, and the Shell renders a section header
// only when a role actually has an item in that section, so each role still sees
// a tight, ordered slice. Icons come from src/components/NavIcon.
export const NAV: NavItem[] = [
  { path: '/home', label: 'Home', roles: ALL, icon: 'home' },
  { path: '/my-work', label: 'My Work', roles: ALL, icon: 'fulfillment' },

  { path: '/inquiries', label: 'Inquiries', roles: ['super_admin', 'sales'], icon: 'inquiries', group: 'Sales' },
  { path: '/quotations', label: 'Quotations', roles: ['super_admin', 'operations', 'business_owner', 'sales'], icon: 'quotes', group: 'Sales' },
  { path: '/sales-entry', label: 'New sales order', roles: ['super_admin', 'sales'], icon: 'plus', group: 'Sales' },
  { path: '/orders', label: 'Orders', roles: ALL, icon: 'orders', group: 'Sales' },
  { path: '/worklist', label: 'Fulfillment', roles: ['super_admin', 'operations', 'business_owner', 'sales'], icon: 'fulfillment', group: 'Sales' },
  { path: '/duplicates', label: 'Duplicates', roles: ['super_admin', 'operations'], icon: 'duplicates', group: 'Operations' },

  { path: '/operations-today', label: 'Operations today', roles: ['super_admin', 'operations', 'business_owner'], icon: 'fulfillment', group: 'Operations' },
  { path: '/calendar', label: 'Calendar', roles: ALL, icon: 'calendar', group: 'Operations' },
  { path: '/resources', label: 'Trainers and venues', roles: ['super_admin', 'operations', 'business_owner'], icon: 'resources', group: 'Operations' },
  { path: '/elearning', label: 'E-learning access', roles: ['super_admin', 'operations'], icon: 'elearning', group: 'Operations' },
  { path: '/rollover', label: 'Annual rollover', roles: ['super_admin', 'operations'], icon: 'rollover', group: 'Operations' },

  { path: '/clients', label: 'Clients', roles: ALL, icon: 'clients', group: 'Customers' },
  { path: '/organizations', label: 'Organizations', roles: ALL, icon: 'organizations', group: 'Customers' },

  { path: '/approvals', label: 'Approvals', roles: ['super_admin', 'operations', 'business_owner'], icon: 'approvals', group: 'Oversight' },

  { path: '/dashboard', label: 'Dashboard', roles: ALL, icon: 'dashboard', group: 'Insights' },
  { path: '/reports', label: 'Reports', roles: ['super_admin', 'operations', 'business_owner'], icon: 'reports', group: 'Insights' },
  { path: '/quality', label: 'Feedback and quality', roles: ['super_admin', 'operations', 'business_owner'], icon: 'quality-star', group: 'Insights' },

  { path: '/courses', label: 'Courses and pricing', roles: ['super_admin', 'operations'], icon: 'courses', group: 'Admin' },
  { path: '/pricing', label: 'Pricing rules', roles: ['super_admin', 'operations', 'business_owner'], icon: 'pricing', group: 'Admin' },
  { path: '/communications', label: 'Communications', roles: ['super_admin', 'operations'], icon: 'comms', group: 'Admin' },
  { path: '/data-quality', label: 'Data quality', roles: ['super_admin'], icon: 'quality', group: 'Admin' },
  { path: '/admin', label: 'Users and access', roles: ['super_admin'], icon: 'admin', group: 'Admin' },
  { path: '/audit', label: 'Audit log', roles: ['super_admin'], icon: 'audit', group: 'Admin' },
]
