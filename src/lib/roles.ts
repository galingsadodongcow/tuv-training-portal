export type Role =
  | 'super_admin'
  | 'operations'
  | 'business_owner'
  | 'sales'
  | 'coordinator'
  | 'sales_manager'
  | 'management'
  | 'auditor'

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  operations: 'Operations',
  business_owner: 'Business Owner',
  sales: 'Sales',
  coordinator: 'Order Coordinator',
  sales_manager: 'Sales Manager',
  management: 'Management',
  auditor: 'Auditor',
}

export interface NavItem {
  path: string
  label: string
  roles: Role[]
  icon: string
  group?: string // section header the item sits under; blank = top (Home/My Work)
}

const ALL: Role[] = [
  'super_admin', 'operations', 'business_owner', 'sales',
  'coordinator', 'sales_manager', 'management', 'auditor',
]

// Read-only oversight roles: they see the read surfaces but the database RLS
// denies every write, so surfacing a read screen to them is safe.
const OVERSIGHT: Role[] = ['management', 'auditor']
// Anyone who works an order into and through fulfillment.
const INTAKE: Role[] = ['super_admin', 'operations', 'coordinator']

// A grouped menu: Home and My Work lead for everyone, then each item sits under a
// workflow section (Sales / Operations / Customers / Oversight / Insights /
// Admin). Items are filtered by role, and the Shell renders a section header
// only when a role actually has an item in that section, so each role still sees
// a tight, ordered slice. Icons come from src/components/NavIcon.
// Lighter, workflow-shaped nav. My Work is the single action surface and the
// landing page (Home was retired into it); Calendar leads as the core
// scheduling tool. Supporting entities live inside workflow groups rather than
// each taking a top-level slot. Role gates are unchanged from before — only the
// grouping, order, and the removal of Home changed. Section headers render only
// when a role has an item in that group, so each role still sees a tight slice.
export const NAV: NavItem[] = [
  { path: '/my-work', label: 'My Work', roles: ALL, icon: 'fulfillment' },
  { path: '/calendar', label: 'Calendar', roles: ALL, icon: 'calendar' },

  // CRM — the commercial pipeline (Sales / Coordinator facing).
  { path: '/inquiries', label: 'Inquiries', roles: ['super_admin', 'sales', 'coordinator', 'sales_manager', ...OVERSIGHT], icon: 'inquiries', group: 'CRM' },
  { path: '/quotations', label: 'Quotations', roles: ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor'], icon: 'quotes', group: 'CRM' },
  { path: '/sales-entry', label: 'New order', roles: ['super_admin', 'sales', 'coordinator'], icon: 'plus', group: 'CRM' },
  { path: '/orders', label: 'Orders', roles: ALL, icon: 'orders', group: 'CRM' },

  // Customers — the customer record.
  { path: '/clients', label: 'Customers', roles: ALL, icon: 'clients', group: 'Customers' },
  { path: '/organizations', label: 'Organizations', roles: ALL, icon: 'organizations', group: 'Customers' },

  // Operations — delivery and fulfillment.
  { path: '/operations-today', label: 'Operations today', roles: ['super_admin', 'operations', 'business_owner', 'coordinator', 'management'], icon: 'fulfillment', group: 'Operations' },
  { path: '/worklist', label: 'Fulfillment', roles: ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager', ...OVERSIGHT], icon: 'fulfillment', group: 'Operations' },
  { path: '/resources', label: 'Trainers and venues', roles: ['super_admin', 'operations', 'business_owner', 'management'], icon: 'resources', group: 'Operations' },
  { path: '/duplicates', label: 'Duplicates', roles: ['super_admin', 'operations', 'coordinator'], icon: 'duplicates', group: 'Operations' },
  { path: '/elearning', label: 'E-learning access', roles: ['super_admin', 'operations', 'coordinator'], icon: 'elearning', group: 'Operations' },

  // Oversight — decisions and analysis. Analytics is one area (AnalyticsTabs
  // reaches Reports and Feedback where the role allows; those routes remain).
  { path: '/approvals', label: 'Approvals', roles: ['super_admin', 'operations', 'business_owner'], icon: 'approvals', group: 'Oversight' },
  { path: '/dashboard', label: 'Analytics', roles: ALL, icon: 'dashboard', group: 'Oversight' },

  // Admin — catalogue, pricing, configuration, governance.
  { path: '/courses', label: 'Courses and pricing', roles: ['super_admin', 'operations'], icon: 'courses', group: 'Admin' },
  { path: '/pricing', label: 'Pricing rules', roles: ['super_admin', 'operations', 'business_owner'], icon: 'pricing', group: 'Admin' },
  { path: '/communications', label: 'Communications', roles: ['super_admin', 'operations'], icon: 'comms', group: 'Admin' },
  { path: '/rollover', label: 'Annual rollover', roles: ['super_admin', 'operations'], icon: 'rollover', group: 'Admin' },
  { path: '/data-quality', label: 'Data quality', roles: ['super_admin'], icon: 'quality', group: 'Admin' },
  { path: '/admin', label: 'Users and access', roles: ['super_admin'], icon: 'admin', group: 'Admin' },
  { path: '/audit', label: 'Audit log', roles: ['super_admin', 'auditor'], icon: 'audit', group: 'Admin' },
]
