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
}

const ALL: Role[] = ['super_admin', 'operations', 'business_owner', 'sales']

// One flat, logically ordered menu. Home and Calendar lead for everyone, then
// each role's day-to-day screens follow, then the analytical views last. Each
// item is filtered by role, so a role sees its own ordered slice. Icons come
// from src/components/NavIcon.
export const NAV: NavItem[] = [
  { path: '/home', label: 'Home', roles: ALL, icon: 'home' },
  { path: '/calendar', label: 'Calendar', roles: ALL, icon: 'calendar' },
  { path: '/orders', label: 'Orders', roles: ALL, icon: 'orders' },
  { path: '/worklist', label: 'Fulfillment', roles: ['super_admin', 'operations', 'business_owner', 'sales'], icon: 'fulfillment' },
  { path: '/inquiries', label: 'Inquiries', roles: ['super_admin', 'sales'], icon: 'inquiries' },
  { path: '/quotations', label: 'Quotations', roles: ['super_admin', 'operations', 'business_owner', 'sales'], icon: 'quotes' },
  { path: '/sales-entry', label: 'New sales order', roles: ['super_admin', 'sales'], icon: 'plus' },
  { path: '/clients', label: 'Clients', roles: ALL, icon: 'clients' },
  { path: '/organizations', label: 'Organizations', roles: ALL, icon: 'organizations' },
  { path: '/duplicates', label: 'Duplicates', roles: ['super_admin', 'sales'], icon: 'duplicates' },
  { path: '/approvals', label: 'Approvals', roles: ['super_admin', 'operations', 'business_owner'], icon: 'approvals' },
  { path: '/courses', label: 'Courses and pricing', roles: ['super_admin', 'operations'], icon: 'courses' },
  { path: '/resources', label: 'Trainers and venues', roles: ['super_admin', 'operations', 'business_owner'], icon: 'resources' },
  { path: '/elearning', label: 'E-learning access', roles: ['super_admin', 'operations'], icon: 'elearning' },
  { path: '/communications', label: 'Communications', roles: ['super_admin', 'operations'], icon: 'comms' },
  { path: '/rollover', label: 'Annual rollover', roles: ['super_admin', 'operations'], icon: 'rollover' },
  { path: '/dashboard', label: 'Dashboard', roles: ALL, icon: 'dashboard' },
  { path: '/reports', label: 'Reports', roles: ['super_admin', 'operations', 'business_owner'], icon: 'reports' },
  { path: '/quality', label: 'Feedback and quality', roles: ['super_admin', 'operations', 'business_owner'], icon: 'quality-star' },
  { path: '/data-quality', label: 'Data quality', roles: ['super_admin'], icon: 'quality' },
  { path: '/admin', label: 'Users and access', roles: ['super_admin'], icon: 'admin' },
]
