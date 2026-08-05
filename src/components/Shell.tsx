'use client'
import { ReactNode, Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { NAV, ROLE_LABEL, Role } from '@/lib/roles'
import { Spinner } from './ui'
import ThemeToggle from './ThemeToggle'

export default function Shell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const role = profile?.role as Role | undefined
  const pathname = usePathname()
  const items = NAV.filter((n) => role && n.roles.includes(role))
  const [navOpen, setNavOpen] = useState(false)

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
        {items.map((n) => {
          const active = pathname === n.path || pathname.startsWith(n.path + '/')
          return (
            <Link key={n.path} href={n.path} className={`nav-link ${active ? 'active' : ''}`}>
              {n.label}
            </Link>
          )
        })}
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
