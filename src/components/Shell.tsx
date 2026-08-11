'use client'
import { ReactNode, Suspense, useEffect, useRef, useState, KeyboardEvent, Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { NAV, ROLE_LABEL, Role } from '@/lib/roles'
import { Spinner } from './ui'
import NavIcon from './NavIcon'
import ThemeToggle from './ThemeToggle'
import NotificationCenter from './NotificationCenter'

export default function Shell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const role = profile?.role as Role | undefined
  const pathname = usePathname()
  const items = NAV.filter((n) => role && n.roles.includes(role))
  const [navOpen, setNavOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [skipFocused, setSkipFocused] = useState(false)
  const asideRef = useRef<HTMLElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)

  // Track the mobile breakpoint so the off-canvas rules (inert, focus trap)
  // only apply where the drawer is actually off-canvas. Desktop is untouched.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 860px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  // When collapsed on mobile the drawer is only translated off-screen, so mark it
  // inert to pull it out of the tab order and hide it from assistive tech.
  const drawerHidden = isMobile && !navOpen
  useEffect(() => {
    const el = asideRef.current as (HTMLElement & { inert?: boolean }) | null
    if (el) el.inert = drawerHidden
  }, [drawerHidden])

  // On open (mobile), move focus into the drawer; on close, return it to the toggle.
  useEffect(() => {
    if (!isMobile) return
    if (navOpen) {
      asideRef.current?.querySelector<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])')?.focus()
    } else {
      toggleRef.current?.focus()
    }
  }, [navOpen, isMobile])

  // Open the command palette by re-emitting the shortcut it already listens for.
  const openPalette = () => {
    window.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
  }

  const focusMain = () => {
    document.getElementById('main-content')?.focus()
  }

  // Escape closes the drawer; Tab is trapped inside it while open on mobile.
  const onDrawerKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isMobile && navOpen) { setNavOpen(false); return }
    if (e.key !== 'Tab' || !isMobile || !navOpen || !asideRef.current) return
    const list = Array.from(
      asideRef.current.querySelectorAll<HTMLElement>('a, button, input, select, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute('disabled'))
    if (list.length === 0) return
    const first = list[0]
    const last = list[list.length - 1]
    const activeEl = document.activeElement as HTMLElement | null
    if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="app">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => { e.preventDefault(); focusMain() }}
        onFocus={() => setSkipFocused(true)}
        onBlur={() => setSkipFocused(false)}
        style={{
          position: 'absolute', zIndex: 100, left: 8,
          top: skipFocused ? 8 : -48,
          background: 'var(--card)', color: 'var(--text)',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
          padding: '8px 12px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
          transition: 'top 0.15s var(--ease)',
        }}
      >
        Skip to main content
      </a>

      <header className="topbar">
        <button ref={toggleRef} className="topbar-toggle" aria-label="Toggle navigation" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
          ☰
        </button>
        <span className="brand-mark">Academy Portal</span>
        <button
          className="cmdk-hint"
          onClick={openPalette}
          aria-label="Open command menu (Command or Control + K)"
          title="Search and jump (⌘K)"
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
            padding: '4px 8px', fontSize: 12, cursor: 'pointer',
          }}
        >
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>⌘K</kbd>
        </button>
        <NotificationCenter />
      </header>

      {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}

      <aside ref={asideRef} className={`sidebar ${navOpen ? 'open' : ''}`} onKeyDown={onDrawerKey}>
        <div className="brand">
          <span className="brand-mark">Academy</span>
          <span className="brand-sub">Portal</span>
        </div>
        <nav className="nav-list">
          {items.map((n, i) => {
            const active = pathname === n.path || pathname.startsWith(n.path + '/')
            const showGroup = n.group && n.group !== items[i - 1]?.group
            return (
              <Fragment key={n.path}>
                {showGroup && <div className="nav-group">{n.group}</div>}
                <Link href={n.path} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <NavIcon name={n.icon} />
                  <span>{n.label}</span>
                </Link>
              </Fragment>
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

      <main className="main" id="main-content" tabIndex={-1}>
        <Suspense fallback={<Spinner label="Loading" />}>{children}</Suspense>
      </main>
    </div>
  )
}
