'use client'
import { ReactNode, Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { NAV, ROLE_LABEL, Role } from '@/lib/roles'
import { Spinner } from './ui'

export default function Shell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const role = profile?.role as Role | undefined
  const pathname = usePathname()
  const items = NAV.filter((n) => role && n.roles.includes(role))

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">TÜV</span>
          <span className="brand-sub">Academy Portal</span>
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
          <div style={{ fontWeight: 600 }}>{profile?.full_name}</div>
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
