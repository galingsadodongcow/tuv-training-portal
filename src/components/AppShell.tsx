import Link from 'next/link'
import type { Profile } from '@/types/auth'
import { logoutAction } from '@/app/login/actions'
import { navigationForProfile, type WorkArea } from '@/lib/permissions'
import { Button } from './ui/Button'

export function AppShell({
  profile,
  active,
  children,
}: {
  profile: Profile
  active: WorkArea
  children: React.ReactNode
}) {
  const navigation = navigationForProfile(profile)
  const authorityLabel = profile.is_sales_supervisor ? 'Sales supervisor' : profile.role.replace('_', ' ')

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Academy Portal home">
          <span className="brand-mark">AP</span>
          <span>Academy Portal</span>
        </Link>
        <details className="mobile-navigation">
          <summary aria-label="Open navigation">Menu</summary>
          <nav aria-label="Mobile primary navigation">
            {navigation.map((item) => <Link key={item.href} className={`nav-link${active === item.area ? ' nav-link-active' : ''}`} href={item.href}>{item.label}</Link>)}
          </nav>
        </details>
        <div className="topbar-user">
          <span>{profile.full_name}</span>
          <span className="role-label">{authorityLabel}</span>
          <form action={logoutAction}>
            <Button className="button-quiet" type="submit">Sign out</Button>
          </form>
        </div>
      </header>
      <div className="shell-body">
        <aside className="sidebar" aria-label="Primary navigation">
          <p className="sidebar-label">Your workspace</p>
          {navigation.map((item) => (
            <Link
              key={item.href}
              className={`nav-link${active === item.area ? ' nav-link-active' : ''}`}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
          <p className="sidebar-note">Navigation reflects your assigned responsibility and database permissions.</p>
        </aside>
        <main id="main-content" className="main-content">{children}</main>
      </div>
    </div>
  )
}
