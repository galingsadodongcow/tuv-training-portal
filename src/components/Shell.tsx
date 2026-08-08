'use client'
import { ReactNode, Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { NAV_GROUPS, ROLE_LABEL, Role } from '@/lib/roles'
import { Spinner } from './ui'
import ThemeToggle from './ThemeToggle'

export default function Shell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const role = profile?.role as Role | undefined
  const pathname = usePathname()
  // Groups the current role can see, with their visible items.
  const groups = NAV_GROUPS
    .map((g) => ({ label: g.label, items: g.items.filter((n) => role && n.roles.includes(role)) }))
    .filter((g) => g.items.length > 0)
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleGroup = (label: string) => setCollapsed((c) => ({ ...c, [label]: !c[label] }))

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  return (
    <div className="app">
      <header className="topbar">
        <button className="topbar-toggle" aria-label="Toggle navigation" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
          ☰
        </button>
        <span className="brand-mark">Academy Portal</span>
      </header>

      {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">Academy</span>
          <span className="brand-sub">Portal</span>
        </div>
        <nav className="nav-groups">
          {groups.map((g) => {
            const isCollapsed = !!collapsed[g.label]
            return (
              <div key={g.label} className="nav-group">
                <button className="nav-group-head" aria-expanded={!isCollapsed} onClick={() => toggleGroup(g.label)}>
                  <span>{g.label}</span>
                  <span className="nav-group-caret">{isCollapsed ? '▸' : '▾'}</span>
                </button>
                {!isCollapsed && g.items.map((n) => {
                  const active = pathname === n.path || pathname.startsWith(n.path + '/')
                  return (
                    <Link key={n.path} href={n.path} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                      {n.label}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <ThemeToggle />
          <div style={{ fontWeight: 600, marginTop: 12 }}>{profile?.full_name}</div>
          <div className="role-pill">
            {role ? ROLE_LABEL[role] : ''}
            {profile?.salesperson?.is_supervisor ? ' · Supervisor' : ''}
          </div>
          <div>
            <button className="linkbtn" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <Suspense fallback={<Spinner label="Loading" />}>{children}</Suspense>
      </main>
    </div>
  )
}
