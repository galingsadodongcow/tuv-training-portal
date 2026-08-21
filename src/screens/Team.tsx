'use client'
import { useMemo } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useFulfillmentQueue } from '../hooks/data'
import { TableSkeleton } from '../components/Skeleton'
import { ErrorNote } from '../components/ui'
import { php } from '../lib/format'
import Inquiries from './Inquiries'
import Worklist from './Worklist'

// The sales manager's queue, in one destination (third-pass #8). It gathers the
// manager-specific work that used to be scattered across Fulfillment + Orders +
// the pipeline: the lead Pipeline, the order Queue (with unassigned / overdue /
// reassign — all already in the fulfillment queue), and a Workload roll-up per
// owner. Each tab reuses an existing screen `embedded`; RLS already scopes every
// query to the manager's team, so no new access is granted here.
interface Tab { key: string; label: string }
const TABS: Tab[] = [
  { key: 'workload', label: 'Workload' },
  { key: 'queue', label: 'Queue' },
  { key: 'pipeline', label: 'Pipeline' },
]

export default function Team() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const requested = params.get('tab') || 'workload'
  const active = TABS.some((t) => t.key === requested) ? requested : 'workload'
  // Switching tabs starts clean (drops the previous tab's own filters, e.g. the
  // Queue's who/view/stage); a tab's own controls preserve ?tab when they update.
  const setTab = (k: string) => router.replace(`${pathname}?tab=${k}`, { scroll: false })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p>Your team's pipeline, order queue, and workload — one place. Scoped to your team.</p>
        </div>
      </div>

      <div className="tabbar" role="tablist" aria-label="Team">
        {TABS.map((t) => (
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

      {active === 'workload' && <Workload />}
      {active === 'queue' && <Worklist embedded />}
      {active === 'pipeline' && <Inquiries embedded />}
    </>
  )
}

// A roll-up of the open fulfillment queue by owner: how much work each rep is
// carrying, how much of it is stalled, and how much is unassigned and waiting to
// be picked up. It reads the same queue the Queue tab does (RLS-scoped to the
// team), so a manager can see the load distribution before reassigning on the
// Queue tab.
function Workload() {
  const queue = useFulfillmentQueue()

  const { rows, unassigned, totals } = useMemo(() => {
    const data = queue.data || []
    const by: Record<string, { code: string; name: string; count: number; value: number; stalled: number }> = {}
    let un = { count: 0, value: 0 }
    for (const o of data) {
      const value = Number(o.total_amount || 0)
      const stalled = o.days_in_stage > 14 ? 1 : 0
      if (!o.owner_code) { un = { count: un.count + 1, value: un.value + value }; continue }
      const key = o.owner_code
      const cur = by[key] || { code: o.owner_code, name: o.owner || o.owner_code, count: 0, value: 0, stalled: 0 }
      cur.count += 1; cur.value += value; cur.stalled += stalled
      by[key] = cur
    }
    const rows = Object.values(by).sort((a, b) => b.count - a.count)
    const totals = {
      count: data.length,
      value: data.reduce((n: number, o: any) => n + Number(o.total_amount || 0), 0),
      stalled: data.filter((o: any) => o.days_in_stage > 14).length,
    }
    return { rows, unassigned: un, totals }
  }, [queue.data])

  if (queue.isLoading) return <TableSkeleton rows={6} cols={4} />
  if (queue.error) return <ErrorNote error={queue.error} />

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card card-pad"><div className="k-label">Open orders</div><div className="k-value" style={{ fontSize: 20 }}>{totals.count}</div></div>
        <div className="card card-pad"><div className="k-label">Total value</div><div className="k-value" style={{ fontSize: 20 }}>{php(totals.value)}</div></div>
        <div className="card card-pad"><div className="k-label">Stalled &gt;14d</div><div className="k-value" style={{ fontSize: 20, color: totals.stalled > 0 ? 'var(--tr-amber)' : undefined }}>{totals.stalled}</div></div>
        <div className="card card-pad"><div className="k-label">Unassigned</div><div className="k-value" style={{ fontSize: 20, color: unassigned.count > 0 ? 'var(--tr-amber)' : undefined }}>{unassigned.count}</div></div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Owner</th><th className="right">Open orders</th><th className="right">Stalled</th><th className="right">Value</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td className="right">{r.count}</td>
                <td className="right" style={{ color: r.stalled > 0 ? 'var(--tr-amber)' : undefined }}>{r.stalled || '—'}</td>
                <td className="right">{php(r.value)}</td>
              </tr>
            ))}
            {unassigned.count > 0 && (
              <tr>
                <td className="fill-label">Unassigned</td>
                <td className="right">{unassigned.count}</td>
                <td className="right">—</td>
                <td className="right">{php(unassigned.value)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length === 0 && unassigned.count === 0 && (
          <div className="empty">No open orders in the queue. Nothing to distribute.</div>
        )}
      </div>

      <p className="fill-label" style={{ marginTop: 10 }}>
        Open the Queue tab to reassign, unassign, or advance individual orders.
      </p>
    </>
  )
}
