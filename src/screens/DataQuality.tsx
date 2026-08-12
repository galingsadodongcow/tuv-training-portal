'use client'
import Link from 'next/link'
import {
  useFulfillmentQueue,
  useSessionHealth,
  useUnstaffed,
  useDuplicates,
} from '../hooks/data'
import { KpiSkeleton } from '../components/Skeleton'
import { ErrorNote } from '../components/ui'
import { isUnowned, isStalled, isOverdue } from '../lib/orderState'
import { healthNeedsAction } from '../lib/health'

// Days-out threshold for calling an unstaffed session urgent.
const SOON_DAYS = 21

interface Check {
  label: string
  value: number
  sub: string
  href: string
}

function CheckCard({ c }: { c: Check }) {
  const hot = c.value > 0
  return (
    <Link href={c.href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card card-pad kpi">
        <div className="k-label">{c.label}</div>
        <div className="k-value" style={{ color: hot ? 'var(--tr-amber)' : 'var(--success)' }}>{c.value}</div>
        <div className="k-sub">{c.sub} ›</div>
      </div>
    </Link>
  )
}

// One place a super admin reads the health of the data: how many records are
// missing an owner, stalling, overdue, or unmatched. Every tile drills through
// to the exact records behind the number. All derived from existing views, so
// no schema change.
export default function DataQuality() {
  const queue = useFulfillmentQueue()
  const health = useSessionHealth()
  const unstaffed = useUnstaffed()
  const dups = useDuplicates()

  const loading = queue.isLoading || health.isLoading || unstaffed.isLoading || dups.isLoading
  const error = queue.error || health.error || unstaffed.error || dups.error

  const q: any[] = queue.data || []
  // Authoritative session-risk signal: the computed health view (v_session_health),
  // same source My Work and the calendar read. Count the actionable sessions.
  const needsAttentionSessions = (health.data || []).filter((r: any) => healthNeedsAction(r.health)).length

  const checks: Check[] = [
    { label: 'Orders without an owner', value: q.filter(isUnowned).length, sub: 'Assign a salesperson', href: '/worklist?who=unassigned' },
    { label: 'Stalled orders', value: q.filter(isStalled).length, sub: 'Over 14 days in stage', href: '/worklist?view=stalled' },
    { label: 'Overdue collections', value: q.filter(isOverdue).length, sub: 'Unpaid past 30 days', href: '/worklist?view=overdue' },
    { label: 'Sessions needing attention', value: needsAttentionSessions, sub: 'At risk, below minimum, or blocked', href: '/calendar?month=all&sort=fill&dir=asc' },
    { label: 'Unstaffed sessions', value: (unstaffed.data || []).filter((u: any) => u.days_out <= SOON_DAYS).length, sub: 'No trainer within 3 weeks', href: '/calendar?month=all' },
    { label: 'Duplicate candidates', value: (dups.data || []).length, sub: 'Review and merge', href: '/duplicates' },
  ]

  const totalIssues = checks.reduce((n, c) => n + c.value, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Data quality</h1>
          <p>
            {error ? 'A check could not be loaded.' : loading ? 'Checking the data…' : totalIssues === 0
              ? 'No issues found. The data is clean.'
              : `${totalIssues} record${totalIssues === 1 ? '' : 's'} need attention across ${checks.filter((c) => c.value > 0).length} check${checks.filter((c) => c.value > 0).length === 1 ? '' : 's'}. Every tile opens the records behind it.`}
          </p>
        </div>
      </div>

      {error ? (
        <ErrorNote error={error} />
      ) : loading ? (
        <KpiSkeleton count={8} />
      ) : (
        <div className="grid kpis">
          {checks.map((c) => (<CheckCard key={c.label} c={c} />))}
        </div>
      )}
    </>
  )
}
