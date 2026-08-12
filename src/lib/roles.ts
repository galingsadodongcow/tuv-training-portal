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

// The role that lands on its own home instead of the shared "My Work" queue:
// management (no task queue — the KPI Overview is its home) and the auditor
// (whose whole job is the audit log + search). Used by the root/login redirects
// and by Guard when it bounces a role off a route it can't see.
export function homePathForRole(role?: Role | string | null): string {
  if (role === 'management') return '/overview'
  if (role === 'auditor') return '/audit'
  return '/my-work'
}

// Per-role nav, trimmed to the `docs/ux-third-pass/02-role-navigation.md`
// targets now that the destinations those cuts depended on exist (third-pass
// #8). Each daily role sees 4–6 primary concepts; supporting entities are
// reached through records + global search (⌘K, and /search for the auditor),
// not top-level slots. Configuration lives under one **Admin** group. Nothing
// loses *authority* — RLS is authoritative and every route Guard is unchanged;
// only nav *prominence* moved. The Shell renders a group header only when a role
// has an item in that group, so each role still sees a tight, ordered slice.
// Icons come from src/components/NavIcon.
export const NAV: NavItem[] = [
  // Home surfaces — one per role, mutually exclusive (see homePathForRole):
  // My Work for the working roles, Overview for management, Search for the auditor.
  { path: '/my-work', label: 'My Work', roles: ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager'], icon: 'fulfillment' },
  { path: '/overview', label: 'Overview', roles: ['management'], icon: 'dashboard' },
  { path: '/search', label: 'Search', roles: ['auditor'], icon: 'search' },

  // Calendar — the scheduling tool. Dropped from the pure-commercial roles
  // (sales/sales_manager reach a specific session from its order/course record)
  // and from oversight (management/auditor).
  { path: '/calendar', label: 'Calendar', roles: ['super_admin', 'operations', 'business_owner', 'coordinator'], icon: 'calendar' },

  // CRM — the commercial pipeline in one destination (#7): Pipeline · Quotes ·
  // Orders tabs, "New order" an action inside. This is where "Orders" lives; a
  // separate Orders slot was folded here. Off-nav for the read-only roles.
  { path: '/crm', label: 'CRM', roles: ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager'], icon: 'orders' },

  // Customers — Customer 360 (Organizations folded in, #6). Dropped from the
  // operations nav (reached via search + record links) and the auditor.
  { path: '/clients', label: 'Customers', roles: ['super_admin', 'business_owner', 'sales', 'coordinator', 'sales_manager', 'management'], icon: 'clients' },

  // Team — the sales manager's queue (#8): Workload · Queue · Pipeline. Reuses
  // the fulfillment/inquiry hooks; RLS scopes it to the manager's team.
  { path: '/team', label: 'Team', roles: ['sales_manager'], icon: 'team' },

  // Training — the catalogue. Two entries, mutually exclusive by role: a
  // read-only lookup (/training) for the roles that quote/oversee, and the
  // admin edit screen (/courses) for the roles that maintain it. Same label.
  { path: '/training', label: 'Training', roles: ['sales', 'management'], icon: 'courses' },
  { path: '/courses', label: 'Training', roles: ['super_admin', 'operations'], icon: 'courses' },

  // Resources — trainers & venues (delivery). Dropped from the management nav
  // (reached via Overview drill-through / search).
  { path: '/resources', label: 'Trainers and venues', roles: ['super_admin', 'operations', 'business_owner'], icon: 'resources' },

  // Financial — receivables + revenue for management (#8). Reuses the Reports data.
  { path: '/financial', label: 'Financial', roles: ['management'], icon: 'financial' },

  // Analytics — the single Dashboard + Reports + Quality + Data-quality area (#2).
  // Dropped from sales (own numbers in My Work/CRM), the coordinator, and the auditor.
  { path: '/analytics', label: 'Analytics', roles: ['super_admin', 'operations', 'business_owner', 'sales_manager', 'management'], icon: 'reports' },

  // Admin — configuration, kept as a grouped section for the roles that hold it
  // (there is no global-search fallback for these config screens, so they stay
  // reachable in one grouped click rather than being stranded).
  { path: '/pricing', label: 'Pricing rules', roles: ['super_admin', 'operations', 'business_owner'], icon: 'pricing', group: 'Admin' },
  { path: '/communications', label: 'Communications', roles: ['super_admin', 'operations'], icon: 'comms', group: 'Admin' },
  { path: '/rollover', label: 'Annual rollover', roles: ['super_admin', 'operations'], icon: 'rollover', group: 'Admin' },
  { path: '/admin', label: 'Users and access', roles: ['super_admin'], icon: 'admin', group: 'Admin' },

  // Audit log — the auditor's second home, and governance for super_admin.
  { path: '/audit', label: 'Audit log', roles: ['super_admin', 'auditor'], icon: 'audit' },
]
