'use client'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { Role } from '../lib/roles'
import Inquiries from './Inquiries'
import Quotations from './Quotations'
import Orders from './Orders'
import Worklist from './Worklist'

// One CRM area for the commercial pipeline, replacing four nav destinations
// (Inquiries, Quotations, New order, Orders). Role-scoped tabs, deep-linkable
// via ?tab=. Each panel is an existing screen rendered `embedded` — the shell
// owns the heading and the one tab strip. "New order" is an action here (and
// from a customer), not a tab; the create form keeps its own /sales-entry route.
// Old list routes redirect here (forwarding query params). RLS stays
// authoritative; these tabs are cosmetic gating.
const PIPELINE: Role[] = ['super_admin', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor']
const QUOTES: Role[] = ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager', 'management']
const ALL: Role[] = ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor']
const NEW_ORDER: Role[] = ['super_admin', 'sales', 'coordinator']

interface Tab { key: string; label: string; roles: Role[] }
const TABS: Tab[] = [
  { key: 'pipeline', label: 'Pipeline', roles: PIPELINE }, // Inquiries
  { key: 'quotes', label: 'Quotes', roles: QUOTES },       // Quotations
  { key: 'orders', label: 'Orders', roles: ALL },          // Orders
]

export default function CRM() {
  const { profile } = useAuth()
  const role = profile?.role as Role | undefined
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const visible = TABS.filter((t) => role && t.roles.includes(role))
  const fallback = visible[0]?.key || 'orders'
  const requested = params.get('tab') || fallback
  const active = visible.some((t) => t.key === requested) ? requested : fallback
  // Switching tabs starts the tab clean (drops the previous tab's filters like
  // Orders' q/stage/pay); a tab's own controls preserve ?tab when they update.
  const setTab = (k: string) => router.replace(`${pathname}?tab=${k}`, { scroll: false })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>CRM</h1>
          <p>The commercial pipeline — inquiries, quotes, and orders in one place.</p>
        </div>
        {role && NEW_ORDER.includes(role) && (
          <div className="toolbar">
            <Link href="/sales-entry" className="btn">+ New order</Link>
          </div>
        )}
      </div>

      {visible.length > 1 && (
        <div className="tabbar" role="tablist" aria-label="CRM">
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

      {active === 'pipeline' && <Inquiries embedded />}
      {active === 'quotes' && <Quotations embedded />}
      {active === 'orders' && <OrdersTab params={params} router={router} pathname={pathname} />}
    </>
  )
}

// The Orders tab carries two saved views: "All orders" (the orders book) and
// "Needs fulfillment" (the Fulfillment queue, folded in from /worklist — #5).
// The view is selected by ?queue=fulfillment, distinct from the shell's ?tab so
// the fulfillment queue keeps its own who/view/stage params.
function OrdersTab({ params, router, pathname }: { params: ReturnType<typeof useSearchParams>; router: ReturnType<typeof useRouter>; pathname: string }) {
  const fulfillment = params.get('queue') === 'fulfillment'
  const go = (q: string | null) =>
    router.replace(q ? `${pathname}?tab=orders&queue=${q}` : `${pathname}?tab=orders`, { scroll: false })
  return (
    <>
      <div className="filters" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={`seg-btn ${!fulfillment ? 'on' : ''}`} onClick={() => go(null)}>All orders</button>
          <button className={`seg-btn ${fulfillment ? 'on' : ''}`} onClick={() => go('fulfillment')}>Needs fulfillment</button>
        </div>
      </div>
      {fulfillment ? <Worklist embedded /> : <Orders embedded />}
    </>
  )
}
