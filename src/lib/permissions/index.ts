import type { Profile, Role } from '@/types/auth'

export type WorkArea = 'administration' | 'my-work' | 'sales' | 'customers' | 'training' | 'participants' | 'overview' | 'audit'

export interface NavigationItem {
  href: `/${string}`
  label: string
  area: WorkArea
}

export interface RoleCapability {
  area: string
  access: 'manage' | 'approve' | 'view' | 'none'
  detail: string
}

const NAVIGATION: Record<Role, NavigationItem[]> = {
  administrator: [
    { href: '/administration', label: 'Administration', area: 'administration' },
    { href: '/my-work', label: 'My Work', area: 'my-work' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants & certificates', area: 'participants' },
    { href: '/sales', label: 'Sales', area: 'sales' },
    { href: '/customers', label: 'Customers', area: 'customers' },
    { href: '/overview', label: 'Reports', area: 'overview' },
    { href: '/audit', label: 'Audit trail', area: 'audit' },
  ],
  operations: [
    { href: '/my-work', label: 'My Work', area: 'my-work' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants & certificates', area: 'participants' },
    { href: '/overview', label: 'Delivery reports', area: 'overview' },
    { href: '/customers', label: 'Customers', area: 'customers' },
    { href: '/administration', label: 'Training setup', area: 'administration' },
  ],
  sales: [
    { href: '/my-work', label: 'My Work', area: 'my-work' },
    { href: '/sales', label: 'Sales', area: 'sales' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants & certificates', area: 'participants' },
    { href: '/customers', label: 'Customers', area: 'customers' },
  ],
  manager: [
    { href: '/overview', label: 'Management reports', area: 'overview' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants & certificates', area: 'participants' },
  ],
  auditor: [
    { href: '/overview', label: 'Reports', area: 'overview' },
    { href: '/audit', label: 'Audit trail', area: 'audit' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants & certificates', area: 'participants' },
  ],
}

export function canManageTraining(role: Role): boolean {
  return role === 'administrator' || role === 'operations'
}

export function canViewDelivery(role: Role): boolean {
  return ['administrator', 'operations', 'sales', 'manager', 'auditor'].includes(role)
}

export function canManageDelivery(role: Role): boolean {
  return role === 'administrator' || role === 'operations'
}

export function hasActionQueue(role: Role): boolean {
  return role === 'administrator' || role === 'operations' || role === 'sales'
}

export function navigationForRole(role: Role): NavigationItem[] {
  return NAVIGATION[role]
}

export function navigationForProfile(profile: Profile): NavigationItem[] {
  const navigation = navigationForRole(profile.role)
  if (profile.role === 'sales' && profile.is_sales_supervisor) {
    const salesIndex = navigation.findIndex((item) => item.area === 'sales')
    return [...navigation.slice(0, salesIndex + 1), { href: '/overview', label: 'Team reports', area: 'overview' }, ...navigation.slice(salesIndex + 1)]
  }
  return navigation
}

export function homePath(role: Role): NavigationItem['href'] {
  return NAVIGATION[role][0].href
}

export function canViewMyWork(role: Role): boolean {
  return role === 'administrator' || role === 'operations' || role === 'sales'
}

export function canViewSales(role: Role): boolean {
  return role === 'administrator' || role === 'sales'
}

export function canViewCustomers(role: Role): boolean {
  return role === 'administrator' || role === 'operations' || role === 'sales' || role === 'manager' || role === 'auditor'
}

export function canWriteSales(profile: Profile): boolean {
  return profile.role === 'administrator' || profile.role === 'sales'
}

export function canApproveDiscount(profile: Profile): boolean {
  return profile.role === 'administrator' || (profile.role === 'sales' && profile.is_sales_supervisor)
}

export function canViewOverview(role: Role): boolean {
  return role === 'administrator' || role === 'manager' || role === 'auditor'
}

export function canViewAudit(role: Role): boolean {
  return role === 'administrator' || role === 'auditor'
}

export function canViewReporting(profile: Profile): boolean {
  return canViewOverview(profile.role) || profile.role === 'operations' || (profile.role === 'sales' && profile.is_sales_supervisor)
}

export function capabilitiesForProfile(profile: Profile): RoleCapability[] {
  return [
    { area: 'Training catalogue', access: canManageTraining(profile.role) ? 'manage' : 'view', detail: canManageTraining(profile.role) ? 'Create and maintain courses, prices, trainers, and venues.' : 'Use active catalogue facts in permitted workflows.' },
    { area: 'Sales pipeline', access: canWriteSales(profile) ? 'manage' : canViewSales(profile.role) ? 'view' : 'none', detail: canWriteSales(profile) ? 'Own inquiries, quotes, orders, and operations handoff.' : 'No commercial write authority.' },
    { area: 'Discount exception', access: canApproveDiscount(profile) ? 'approve' : 'none', detail: canApproveDiscount(profile) ? 'Approve controlled discount exceptions.' : 'Cannot approve pricing exceptions.' },
    { area: 'Training delivery', access: canManageDelivery(profile.role) ? 'manage' : canViewDelivery(profile.role) ? 'view' : 'none', detail: canManageDelivery(profile.role) ? 'Schedule, register, record outcomes, and issue certificates.' : 'Read-only, database-scoped delivery evidence.' },
    { area: 'Customers', access: canViewCustomers(profile.role) ? 'view' : 'none', detail: canViewCustomers(profile.role) ? 'See customer records permitted by database scope.' : 'No customer access.' },
    { area: 'Reporting', access: canViewReporting(profile) ? 'view' : 'none', detail: canViewReporting(profile) ? 'See the role-appropriate reporting scope.' : 'No management reporting access.' },
  ]
}
