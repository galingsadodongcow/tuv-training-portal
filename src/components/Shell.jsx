import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { NAV, ROLE_LABEL } from '../lib/roles'

export default function Shell() {
  const { profile, signOut } = useAuth()
  const role = profile?.role
  const items = NAV.filter((n) => n.roles.includes(role))

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">TÜV</span>
          <span className="brand-sub">Academy Portal</span>
        </div>
        {items.map((n) => (
          <NavLink
            key={n.path}
            to={n.path}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div style={{ fontWeight: 600 }}>{profile?.full_name}</div>
          <div className="role-pill">
            {ROLE_LABEL[role]}
            {profile?.salesperson?.is_supervisor ? ' · Supervisor' : ''}
          </div>
          <div>
            <button className="linkbtn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
