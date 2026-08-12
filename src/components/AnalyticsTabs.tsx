'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { Role } from '../lib/roles'

// Ties the three analytics surfaces (Dashboard / Reports / Quality) into one
// "Analytics" area with a shared tab strip, matching the single Analytics nav
// item. Each tab is a real route (deep links keep working); tabs the role can't
// reach are hidden, and the strip disappears when only one tab is available.
const TABS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/dashboard', label: 'Overview', roles: ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor'] },
  { href: '/reports', label: 'Reports', roles: ['super_admin', 'operations', 'business_owner', 'management', 'auditor'] },
  { href: '/quality', label: 'Feedback', roles: ['super_admin', 'operations', 'business_owner', 'management'] },
]

export default function AnalyticsTabs() {
  const { profile } = useAuth()
  const role = profile?.role as Role | undefined
  const pathname = usePathname()
  const tabs = TABS.filter((t) => role && t.roles.includes(role))
  if (tabs.length < 2) return null
  return (
    <div className="tabbar" role="tablist" aria-label="Analytics">
      {tabs.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`tab ${active ? 'tab-on' : ''}`}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            style={{ textDecoration: 'none' }}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
