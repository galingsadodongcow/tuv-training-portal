'use client'
import AnalyticsTabs from '../components/AnalyticsTabs'
import { useMemo, useState, ReactNode } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import Link from 'next/link'
import {
  useSchedules,
  useOrders,
  useActiveYear,
  useFulfillmentQueue,
  useSessionHealth,
  useUnstaffed,
  useApprovals,
  useDuplicates,
  useReceivables,
  useFunnel,
  useInquiries,
  useCertsExpiring,
  useSlaBreaches,
  useAuditSearch,
} from '../hooks/data'
import { useAuth } from '../hooks/useAuth'
import { ErrorNote } from '../components/ui'
import { KpiSkeleton } from '../components/Skeleton'
import ChartTable, { ChartTableToggle } from '../components/ChartTable'
import { php, num } from '../lib/format'
import { isStalled, isOverdue, isPaidUnendorsed, isNoFeedback } from '../lib/orderState'
import { healthNeedsAction } from '../lib/health'
import type { Role } from '../lib/roles'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Webshop reads the theme accent token so it tracks light/dark; the rest are a
// fixed palette chosen to stay legible on both backgrounds.
const CH_COLORS: Record<string, string> = { Webshop: 'var(--accent)', 'Inside Sales': '#8b5cf6', 'Field Sales': '#ec4899', 'In-house Request': '#f5a623' }

// Open inquiry statuses (mirrors fn_funnel) — the live pipeline.
const OPEN_INQ = ['Received', 'Responded', 'RFQ or P Sent', 'Awaiting Feedback']
// Tables whose changes count as high-risk writes for the auditor view.
const HIGH_RISK_TABLES = ['payment', 'refund', 'course_fee', 'discount_rule', 'pricing_rule']
// Roles that get the revenue/channel charts under the KPI band.
const CHART_ROLES: Role[] = ['business_owner', 'management', 'super_admin']

// Days a receivable is overdue — invoice due date, else order date + 30d.
// (mirrors Reports.overdueDaysOf so the aging matches the receivables report.)
const overdueDaysOf = (r: any) => {
  const base = r.due_date || (r.order_date ? new Date(+new Date(r.order_date) + 30 * 86400000).toISOString().slice(0, 10) : null)
  if (!base) return 0
  return Math.floor((Date.now() - +new Date(base)) / 86400000)
}

interface CardDef {
  label: string
  value: number | string
  sub: string
  href: string
  alert?: boolean
}

// A drill-through KPI card — the whole card is a link to the records behind the
// number, so no metric is a dead end. (mirrors Home's AttentionCard.)
function DashCard({ c }: { c: CardDef }) {
  const hot = c.alert && typeof c.value === 'number' && c.value > 0
  return (
    <Link href={c.href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card card-pad kpi">
        <div className="k-label">{c.label}</div>
        <div className="k-value" style={{ color: hot ? 'var(--tr-amber)' : undefined }}>{c.value}</div>
        <div className="k-sub">{c.sub} ›</div>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const role = profile?.role as Role | undefined
  const myCode = profile?.salesperson?.code
  const mySalesId = profile?.sales_id

  // Derive the dashboard year from the active calendar year (highest, if more
  // than one is active), falling back to the current calendar year. Avoids a
  // hardcoded 2026 that goes stale on 1 Jan.
  const activeYear = useActiveYear()
  const YEAR = activeYear.data?.at(-1)?.year ?? new Date().getFullYear()

  // Every hook is called unconditionally; the role only decides what we RENDER.
  const sched = useSchedules(YEAR)
  const orders = useOrders()
  const queue = useFulfillmentQueue()
  const health = useSessionHealth()
  const unstaffed = useUnstaffed()
  const approvals = useApprovals()
  const dups = useDuplicates()
  const receivables = useReceivables()
  const funnel = useFunnel()
  const inquiries = useInquiries()
  const certs = useCertsExpiring()
  const sla = useSlaBreaches()
  const audit = useAuditSearch({ limit: 500 })

  // ---- Revenue model (schedules + orders), reused by the charts and the money
  // KPIs. Scoped to the dashboard year so a prior/next-year order can't leak in.
  const model = useMemo(() => {
    if (!sched.data || !orders.data) return null
    const live = orders.data.filter(
      (o: any) =>
        ['New', 'Confirmed', 'Completed'].includes(o.order_status) &&
        o.order_date && new Date(o.order_date).getFullYear() === YEAR
    )
    const revenue = live.reduce((s: number, o: any) => s + (o.total_amount || 0), 0)
    const forecast = sched.data.reduce((s: number, r: any) => s + (r.forecast_revenue || 0), 0)
    const delivered = sched.data
      .filter((r: any) => r.status === 'Completed')
      .reduce((s: number, r: any) => s + Number(r.actual_revenue || 0), 0)
    const deliveredPax = sched.data
      .filter((r: any) => r.status === 'Completed')
      .reduce((s: number, r: any) => s + (r.actual_participants || 0), 0)

    const byMonth = MONTHS.map((m) => ({ month: m, revenue: 0 }))
    for (const o of live) {
      const mi = new Date(o.order_date).getMonth()
      if (byMonth[mi]) byMonth[mi].revenue += o.total_amount || 0
    }
    const byChannel: Record<string, number> = {}
    for (const o of live) {
      const chan = o.channel || 'Other'
      byChannel[chan] = (byChannel[chan] || 0) + (o.total_amount || 0)
    }
    const channelData = Object.entries(byChannel).map(([name, value]) => ({ name, value }))

    const cancelled = orders.data.filter((o: any) => o.order_status === 'Cancelled').length
    const cancelRate = orders.data.length ? Math.round((cancelled / orders.data.length) * 100) : 0

    return { revenue, forecast, delivered, deliveredPax, byMonth, channelData, cancelRate }
  }, [sched.data, orders.data, YEAR])

  // ---- Order-queue metrics, computed once from the fulfillment queue.
  const q: any[] = queue.data || []
  const unassigned = q.filter((o) => !o.owner_code).length
  const mine = q.filter((o) => o.owner_code === myCode).length
  const myStalled = q.filter((o) => o.owner_code === myCode && isStalled(o)).length
  const myOverdue = q.filter((o) => o.owner_code === myCode && isOverdue(o)).length
  const stalledAll = q.filter(isStalled).length
  const overdueAll = q.filter(isOverdue).length
  const paidUnendorsed = q.filter(isPaidUnendorsed).length
  const noFeedback = q.filter(isNoFeedback).length
  const awaitingEndorsement = q.filter((o) => ['For Order Creation', 'Endorsed to Ops'].includes(o.fulfillment_stage)).length

  // ---- Sessions / staffing.
  const needsAttentionSessions = (health.data || []).filter((r: any) => healthNeedsAction(r.health)).length
  const unstaffedNear = (unstaffed.data || []).filter((u: any) => u.days_out <= 21).length

  // ---- Approvals / dedup / SLA / certs.
  const pendingApprovals = (approvals.data || []).filter((a: any) => a.decision === 'Pending').length
  const dupCount = (dups.data || []).length
  const slaBreaches = (sla.data || []).length
  const certsExpiring = (certs.data || []).length

  // ---- Receivables aging.
  const ar = useMemo(() => {
    const rows = (receivables.data || []).map((r: any) => ({ ...r, od: overdueDaysOf(r) }))
    const outstanding = rows.reduce((n: number, r: any) => n + Number(r.balance || 0), 0)
    const overdueCount = rows.filter((r: any) => r.od > 0).length
    const over60 = rows.filter((r: any) => r.od > 60).reduce((n: number, r: any) => n + Number(r.balance || 0), 0)
    return { outstanding, overdueCount, over60 }
  }, [receivables.data])

  // ---- Pipeline (open inquiries, est_value), all and self-scoped.
  const pipeline = useMemo(() => {
    const open = (inquiries.data || []).filter((i: any) => OPEN_INQ.includes(i.status))
    const value = open.reduce((n: number, i: any) => n + Number(i.est_value || 0), 0)
    const mineValue = open
      .filter((i: any) => i.sales_id && i.sales_id === mySalesId)
      .reduce((n: number, i: any) => n + Number(i.est_value || 0), 0)
    return { value, mineValue }
  }, [inquiries.data, mySalesId])

  // ---- Conversion (inquiry → order), from the funnel RPC.
  const conversion = funnel.data && Number(funnel.data.won) + Number(funnel.data.lost) > 0
    ? Math.round((Number(funnel.data.won) / (Number(funnel.data.won) + Number(funnel.data.lost))) * 100)
    : 0

  // ---- Audit governance counts (auditor view).
  const gov = useMemo(() => {
    const rows: any[] = audit.data?.rows || []
    const today = new Date().toDateString()
    const weekAgo = Date.now() - 7 * 86400000
    const changesToday = rows.filter((r) => r.changed_at && new Date(r.changed_at).toDateString() === today).length
    const deletesWeek = rows.filter((r) => r.action === 'DELETE' && r.changed_at && +new Date(r.changed_at) >= weekAgo).length
    const roleChanges = rows.filter((r) => r.table_name === 'profiles').length
    const highRisk = rows.filter((r) => HIGH_RISK_TABLES.includes(r.table_name)).length
    return { changesToday, deletesWeek, roleChanges, highRisk }
  }, [audit.data])

  // Money helpers — safe before the revenue model has loaded.
  const booked = model?.revenue ?? 0
  const forecast = model?.forecast ?? 0
  const delivered = model?.delivered ?? 0
  const deliveredPax = model?.deliveredPax ?? 0
  const attain = forecast ? Math.round((booked / forecast) * 100) : 0
  const cancelRate = model?.cancelRate ?? 0

  // ---- Per-role KPI card sets. EVERY card is a drill-through link.
  const cardsByRole: Partial<Record<Role, CardDef[]>> = {
    sales: [
      { label: 'My open orders', value: mine, sub: 'Assigned to me', href: '/worklist?who=mine' },
      { label: 'My stalled orders', value: myStalled, sub: 'Over 14 days in stage', href: '/worklist?who=mine&view=stalled', alert: true },
      { label: 'My overdue collections', value: myOverdue, sub: 'Past terms, chase these', href: '/worklist?who=mine&view=overdue', alert: true },
      { label: 'My open pipeline', value: php(pipeline.mineValue), sub: 'Open inquiries I own', href: '/inquiries' },
      { label: 'Sessions needing pax', value: needsAttentionSessions, sub: 'Below minimum, sell seats', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Unassigned orders', value: unassigned, sub: 'Claim these', href: '/worklist?who=unassigned' },
    ],
    sales_manager: [
      { label: 'Team pipeline', value: php(pipeline.value), sub: 'Open inquiry value', href: '/inquiries' },
      { label: 'Team stalled orders', value: stalledAll, sub: 'Over 14 days in stage', href: '/worklist?who=all&view=stalled', alert: true },
      { label: 'Unassigned orders', value: unassigned, sub: 'Need an owner', href: '/worklist?who=unassigned', alert: true },
      { label: 'Team overdue collections', value: overdueAll, sub: 'Past terms across the team', href: '/worklist?who=all&view=overdue', alert: true },
      { label: 'Conversion', value: `${conversion}%`, sub: 'Inquiry to order', href: '/reports' },
      { label: 'Sessions needing attention', value: needsAttentionSessions, sub: 'At risk or below minimum', href: '/calendar?month=all&sort=fill&dir=asc' },
    ],
    coordinator: [
      { label: 'Awaiting endorsement', value: awaitingEndorsement, sub: 'Orders to move to ops', href: '/worklist?who=all&stage=Endorsed to Ops', alert: true },
      { label: 'Paid, not endorsed', value: paidUnendorsed, sub: 'Payment received, review and endorse', href: '/worklist?who=all&view=paid_unendorsed', alert: true },
      { label: 'Unowned orders', value: unassigned, sub: 'No owner yet', href: '/worklist?who=unassigned', alert: true },
      { label: 'Duplicate candidates', value: dupCount, sub: 'Review and merge', href: '/duplicates', alert: true },
      { label: 'Stalled orders', value: stalledAll, sub: 'Over 14 days in stage', href: '/worklist?who=all&view=stalled' },
      { label: 'No feedback', value: noFeedback, sub: 'Awaiting customer feedback', href: '/worklist?who=all&view=no_feedback' },
    ],
    operations: [
      { label: 'Sessions needing attention', value: needsAttentionSessions, sub: 'At risk, below minimum, or blocked', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Unstaffed sessions', value: unstaffedNear, sub: 'No trainer within 3 weeks', href: '/calendar?month=all', alert: true },
      { label: 'Awaiting endorsement', value: awaitingEndorsement, sub: 'Orders to move to ops', href: '/worklist?who=all&stage=Endorsed to Ops' },
      { label: 'Stalled orders', value: stalledAll, sub: 'Over 14 days in stage', href: '/worklist?who=all&view=stalled', alert: true },
      { label: 'SLA breaches', value: slaBreaches, sub: 'Past the stage target', href: '/worklist?who=all', alert: true },
      { label: 'Certificates expiring', value: certsExpiring, sub: 'Within four months', href: '/reports' },
    ],
    business_owner: [
      { label: 'Pending approvals', value: pendingApprovals, sub: 'Awaiting your decision', href: '/approvals', alert: true },
      { label: 'Booked revenue', value: php(booked), sub: `${attain}% of forecast`, href: '/reports' },
      { label: 'Delivered revenue', value: php(delivered), sub: `${num(deliveredPax)} participants trained`, href: '/reports' },
      { label: 'AR outstanding', value: php(ar.outstanding), sub: `${num(ar.overdueCount)} order${ar.overdueCount === 1 ? '' : 's'} overdue`, href: '/reports', alert: ar.overdueCount > 0 },
      { label: 'Sessions needing attention', value: needsAttentionSessions, sub: 'Risk of a no-go', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Cancellation rate', value: `${cancelRate}%`, sub: 'Orders cancelled', href: '/orders?stage=Cancelled' },
    ],
    management: [
      { label: 'Booked revenue', value: php(booked), sub: `${attain}% of forecast`, href: '/reports' },
      { label: 'Pipeline', value: php(pipeline.value), sub: 'Open inquiry value', href: '/inquiries' },
      { label: 'Conversion', value: `${conversion}%`, sub: 'Inquiry to order', href: '/reports' },
      { label: 'Delivered revenue', value: php(delivered), sub: `${num(deliveredPax)} participants trained`, href: '/reports' },
      { label: 'AR outstanding', value: php(ar.outstanding), sub: `${php(ar.over60)} over 60 days`, href: '/reports', alert: ar.over60 > 0 },
      { label: 'Session health', value: needsAttentionSessions, sub: 'At risk or blocked', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Exceptions', value: slaBreaches, sub: 'Need exec attention', href: '/worklist?who=all', alert: true },
    ],
    auditor: [
      { label: 'Changes today', value: gov.changesToday, sub: 'Recorded across the system', href: '/audit' },
      { label: 'Deletes this week', value: gov.deletesWeek, sub: 'Rows removed in the last 7 days', href: '/audit', alert: true },
      { label: 'Profile / access changes', value: gov.roleChanges, sub: 'Role and user edits', href: '/audit', alert: true },
      { label: 'High-risk writes', value: gov.highRisk, sub: 'Payment and pricing changes', href: '/audit', alert: true },
    ],
    super_admin: [
      { label: 'Data quality', value: 'View', sub: 'Records needing attention', href: '/data-quality', alert: true },
      { label: 'Duplicate candidates', value: dupCount, sub: 'Review and merge', href: '/duplicates', alert: true },
      { label: 'Orders missing an owner', value: unassigned, sub: 'Assign a salesperson', href: '/worklist?who=unassigned', alert: true },
      { label: 'Pending approvals', value: pendingApprovals, sub: 'Across the team', href: '/approvals' },
      { label: 'Sessions needing attention', value: needsAttentionSessions, sub: 'At risk or below minimum', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Booked revenue', value: php(booked), sub: `${attain}% of forecast`, href: '/reports' },
      { label: 'AR outstanding', value: php(ar.outstanding), sub: `${num(ar.overdueCount)} order${ar.overdueCount === 1 ? '' : 's'} overdue`, href: '/reports', alert: ar.overdueCount > 0 },
      { label: 'SLA breaches', value: slaBreaches, sub: 'Past the stage target', href: '/worklist?who=all', alert: true },
    ],
  }

  // A synthetic query-like object so audit's inner {error} surfaces in the band.
  const auditDep = { isLoading: audit.isLoading, error: audit.error || audit.data?.error }
  // Which queries gate each role's band loading/error state.
  const depsByRole: Partial<Record<Role, { isLoading: boolean; error: any }[]>> = {
    sales: [queue, health, inquiries],
    sales_manager: [queue, inquiries, health],
    coordinator: [queue, dups],
    operations: [queue, health, unstaffed, sla, certs],
    business_owner: [orders, sched, queue, health, approvals, receivables],
    management: [orders, sched, receivables, health, inquiries, sla],
    auditor: [auditDep],
    super_admin: [orders, sched, queue, health, approvals, receivables, dups, sla],
  }

  // A role with no configured cards falls back to the super_admin superset —
  // never a blank page. Empty until the role resolves so a sales user can't
  // flash another role's metrics.
  const cards = role ? (cardsByRole[role] || cardsByRole.super_admin!) : []
  const deps = role ? (depsByRole[role] || depsByRole.super_admin!) : []
  const bandLoading = deps.some((d) => d.isLoading)
  const bandError = deps.map((d) => d.error).find(Boolean)
  const showCharts = !!role && CHART_ROLES.includes(role)

  const HEAD: Partial<Record<Role, { title: string; sub: string }>> = {
    sales: { title: 'Dashboard', sub: 'Your pipeline and the work that is slipping.' },
    sales_manager: { title: 'Team dashboard', sub: 'Team pipeline, conversion, and where to step in.' },
    coordinator: { title: 'Intake dashboard', sub: 'The order intake queue and what is blocking it.' },
    operations: { title: 'Operations dashboard', sub: 'Sessions at risk, staffing gaps, and stalled fulfillment.' },
    business_owner: { title: 'Business dashboard', sub: `Revenue against forecast, receivables, approvals, and delivery risk for ${YEAR}.` },
    management: { title: 'Executive dashboard', sub: `Revenue, pipeline, cash, and delivery risk for ${YEAR}. Read-only — drill in for the records.` },
    auditor: { title: 'Governance dashboard', sub: 'Recent changes and high-risk activity across the system.' },
    super_admin: { title: 'Dashboard', sub: `System health, exceptions, and revenue for ${YEAR}.` },
  }
  const head = (role && HEAD[role]) || { title: 'Dashboard', sub: `System health, exceptions, and revenue for ${YEAR}.` }

  return (
    <>
      <AnalyticsTabs />
      <div className="page-head">
        <div>
          <h1>{head.title}</h1>
          <p>{head.sub}</p>
        </div>
      </div>

      {bandError ? (
        <ErrorNote error={bandError} />
      ) : !role || bandLoading ? (
        <KpiSkeleton count={cards.length || 6} />
      ) : (
        <div className="grid kpis">
          {cards.map((c) => (<DashCard key={c.label} c={c} />))}
        </div>
      )}

      {showCharts && (
        <RevenueCharts YEAR={YEAR} model={model} loading={sched.isLoading || orders.isLoading} error={sched.error || orders.error} />
      )}
    </>
  )
}

// Revenue-by-month and revenue-by-channel charts, for the exec/owner roles.
// Split into its own component so the per-chart "View as table" toggle state
// lives with the charts and never sits behind a conditional-hooks hazard.
function RevenueCharts({ YEAR, model, loading, error }: { YEAR: number; model: any; loading: boolean; error: any }) {
  const [monthTable, setMonthTable] = useState(false)
  const [channelTable, setChannelTable] = useState(false)

  if (error) return <ErrorNote error={error} />
  if (loading || !model) return <KpiSkeleton count={2} />

  const monthlyEmpty = model.byMonth.every((m: any) => m.revenue === 0)
  const channelEmpty = model.channelData.length === 0
  const channelSummary = model.channelData.map((e: any) => `${e.name} ${php(e.value)}`).join(', ')

  return (
    <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
      <div className="card card-pad">
        <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="k-label">Booked revenue by month</div>
          {!monthlyEmpty && <ChartTableToggle on={monthTable} onToggle={() => setMonthTable((v) => !v)} />}
        </div>
        {monthlyEmpty ? (
          <div className="empty" style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No booked revenue yet for {YEAR}.</div>
        ) : monthTable ? (
          <ChartTable
            caption={`Booked revenue by month for ${YEAR}`}
            columns={[{ key: 'month', label: 'Month' }, { key: 'revenue', label: 'Booked revenue', align: 'right' }]}
            rows={model.byMonth.map((m: any) => ({ month: m.month, revenue: php(m.revenue) }))}
          />
        ) : (
          <div role="img" aria-label={`Booked revenue by month for ${YEAR}, total ${php(model.revenue)}`}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={model.byMonth} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: any) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v: any) => php(v)} cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="k-label">Revenue by channel</div>
          {!channelEmpty && <ChartTableToggle on={channelTable} onToggle={() => setChannelTable((v) => !v)} />}
        </div>
        {channelEmpty ? (
          <div className="empty" style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data yet.</div>
        ) : channelTable ? (
          <ChartTable
            caption={`Revenue by channel for ${YEAR}`}
            columns={[{ key: 'name', label: 'Channel' }, { key: 'value', label: 'Revenue', align: 'right' }]}
            rows={model.channelData.map((e: any) => ({ name: e.name, value: php(e.value) }))}
          />
        ) : (
          <>
            <div role="img" aria-label={`Revenue by channel for ${YEAR}: ${channelSummary}`}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={model.channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={92} paddingAngle={2}>
                    {model.channelData.map((e: any) => (
                      <Cell key={e.name} fill={CH_COLORS[e.name] || 'var(--text-faint)'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => php(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="chip-row" style={{ justifyContent: 'center', marginTop: 8 }}>
              {model.channelData.map((e: any) => (
                <span key={e.name} className="fill-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: CH_COLORS[e.name] || 'var(--text-faint)', display: 'inline-block' }} />
                  {e.name}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
