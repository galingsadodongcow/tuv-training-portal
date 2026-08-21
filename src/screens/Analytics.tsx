'use client'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { Role } from '../lib/roles'
import Dashboard from './Dashboard'
import Reports from './Reports'
import Quality from './Quality'
import DataQuality from './DataQuality'

// One Analytics area, replacing five destinations (Dashboard, Reports, Quality,
// Data quality, and the AnalyticsTabs strip that used to tie the first three).
// Role-scoped tabs, deep-linkable via ?tab=. Each panel is an existing screen
// rendered `embedded` — the shell owns the heading and the one tab strip, so
// there is no second level of tabs. Old routes redirect here (see the route
// files) for a release. RLS stays authoritative; these tabs are cosmetic gating.
const REPORT: Role[] = ['super_admin', 'operations', 'business_owner', 'management', 'auditor']
const QUALITY: Role[] = ['super_admin', 'operations', 'business_owner', 'management']
const ALL: Role[] = ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor']

interface Tab { key: string; label: string; roles: Role[] }
const TABS: Tab[] = [
  { key: 'overview', label: 'Overview', roles: ALL },              // role dashboards
  { key: 'revenue', label: 'Revenue', roles: REPORT },            // Reports · revenue
  { key: 'receivables', label: 'Receivables', roles: REPORT },    // Reports · receivables
  { key: 'certs', label: 'Certificates', roles: REPORT },         // Reports · certificates
  { key: 'margin', label: 'Profitability', roles: REPORT },       // Reports · profitability
  { key: 'pipeline', label: 'Pipeline', roles: REPORT },          // Reports · funnel/forecast/trainer load
  { key: 'quality', label: 'Quality', roles: QUALITY },           // feedback + trainer scores
  { key: 'data', label: 'Data quality', roles: ['super_admin'] }, // record-hygiene checks
]

export default function Analytics() {
  const { profile } = useAuth()
  const role = profile?.role as Role | undefined
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const visible = TABS.filter((t) => role && t.roles.includes(role))
  const requested = params.get('tab') || 'overview'
  // Fall back to Overview when the URL points at a tab this role can't see.
  const active = visible.some((t) => t.key === requested) ? requested : 'overview'
  const setTab = (k: string) =>
    router.replace(k === 'overview' ? pathname : `${pathname}?tab=${k}`, { scroll: false })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p>Your overview, the revenue book, and feedback — one place, scoped to your role.</p>
        </div>
      </div>

      {visible.length > 1 && (
        <div className="tabbar" role="tablist" aria-label="Analytics">
          {visible.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={active === t.key}
              className={`tab ${active === t.key ? 'tab-on' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {active === 'overview' && (
        <>
          <Dashboard embedded />
          {role && REPORT.includes(role) && (
            <div style={{ marginTop: 26 }}>
              <h2 style={{ fontSize: 16, marginBottom: 10 }}>Operational watch-list</h2>
              <Reports embedded section="digest" />
            </div>
          )}
        </>
      )}
      {active === 'revenue' && <Reports embedded section="revenue" />}
      {active === 'receivables' && <Reports embedded section="receivables" />}
      {active === 'certs' && <Reports embedded section="certs" />}
      {active === 'margin' && <Reports embedded section="margin" />}
      {active === 'pipeline' && <Reports embedded section="analytics" />}
      {active === 'quality' && <Quality embedded />}
      {active === 'data' && <DataQuality embedded />}
    </>
  )
}
