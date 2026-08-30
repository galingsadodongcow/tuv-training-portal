import type { Profile, Role } from '@/types/auth'

export type WorkArea = 'administration' | 'my-work' | 'sales' | 'customers' | 'training' | 'participants' | 'overview'

export interface NavigationItem {
  href: `/${string}`
  label: string
  area: WorkArea
}

const NAVIGATION: Record<Role, NavigationItem[]> = {
  administrator: [
    { href: '/administration', label: 'Administration', area: 'administration' },
    { href: '/my-work', label: 'My Work', area: 'my-work' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants', area: 'participants' },
    { href: '/sales', label: 'Sales', area: 'sales' },
    { href: '/customers', label: 'Customers', area: 'customers' },
    { href: '/overview', label: 'Reports', area: 'overview' },
  ],
  operations: [
    { href: '/my-work', label: 'My Work', area: 'my-work' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants', area: 'participants' },
    { href: '/overview', label: 'Delivery reports', area: 'overview' },
    { href: '/customers', label: 'Customers', area: 'customers' },
    { href: '/administration', label: 'Training setup', area: 'administration' },
  ],
  sales: [
    { href: '/my-work', label: 'My Work', area: 'my-work' },
    { href: '/sales', label: 'Sales', area: 'sales' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants', area: 'participants' },
    { href: '/customers', label: 'Customers', area: 'customers' },
  ],
  manager: [
    { href: '/overview', label: 'Management reports', area: 'overview' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants', area: 'participants' },
  ],
  auditor: [
    { href: '/overview', label: 'Audit & reports', area: 'overview' },
    { href: '/training', label: 'Training calendar', area: 'training' },
    { href: '/participants', label: 'Participants', area: 'participants' },
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

export function canViewReporting(profile: Profile): boolean {
  return canViewOverview(profile.role) || profile.role === 'operations' || (profile.role === 'sales' && profile.is_sales_supervisor)
}
