'use client'
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import Link from 'next/link'
import {
  useActiveYear,
  useDashboardMetrics,
} from '../hooks/data'
import { useAuth } from '../hooks/useAuth'
import { ErrorNote } from '../components/ui'
import { KpiSkeleton } from '../components/Skeleton'
import ChartTable, { ChartTableToggle } from '../components/ChartTable'
import { php, num } from '../lib/format'
import type { Role } from '../lib/roles'

// Webshop reads the theme accent token so it tracks light/dark; the rest are a
// fixed palette chosen to stay legible on both backgrounds.
const CH_COLORS: Record<string, string> = { Webshop: 'var(--accent)', 'Inside Sales': '#8b5cf6', 'Field Sales': '#ec4899', 'In-house Request': '#f5a623' }

// Roles that get the revenue/channel charts under the KPI band.
const CHART_ROLES: Role[] = ['business_owner', 'management', 'super_admin']

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

// The role dashboards. Rendered as the "Overview" tab of the single Analytics
// shell (`embedded`), where the shell owns the heading and tab strip.
export default function Dashboard({ embedded }: { embedded?: boolean } = {}) {
  const { profile } = useAuth()
  const role = profile?.role as Role | undefined

  // Derive the dashboard year from the active calendar year (highest, if more
  // than one is active), falling back to the current calendar year. Avoids a
  // hardcoded 2026 that goes stale on 1 Jan.
  const activeYear = useActiveYear()
  const YEAR = activeYear.data?.at(-1)?.year ?? new Date().getFullYear()

  const metrics = useDashboardMetrics(YEAR, !!role)
  const data = metrics.data || {}
  const q = data.queue || {}
  const sessions = data.sessions || {}
  const ar = data.receivables || {}
  const pipeline = data.pipeline || {}
  const gov = data.governance || {}
  const revenue = data.revenue
  const model = revenue ? {
    revenue: Number(revenue.booked || 0),
    forecast: Number(revenue.forecast || 0),
    delivered: Number(revenue.delivered || 0),
    deliveredPax: Number(revenue.delivered_pax || 0),
    byMonth: revenue.by_month || [],
    channelData: revenue.by_channel || [],
    cancelRate: Number(revenue.total_orders) > 0
      ? Math.round((Number(revenue.cancelled || 0) / Number(revenue.total_orders)) * 100)
      : 0,
  } : null
  const unassigned = Number(q.unassigned || 0)
  const mine = Number(q.mine || 0)
  const myStalled = Number(q.my_stalled || 0)
  const myOverdue = Number(q.my_overdue || 0)
  const stalledAll = Number(q.stalled || 0)
  const overdueAll = Number(q.overdue || 0)
  const paidUnendorsed = Number(q.paid_unendorsed || 0)
  const noFeedback = Number(q.no_feedback || 0)
  const awaitingEndorsement = Number(q.awaiting_endorsement || 0)
  const needsAttentionSessions = Number(sessions.needs_attention || 0)
  const unstaffedNear = Number(sessions.unstaffed_near || 0)
  const pendingApprovals = Number(data.pending_approvals || 0)
  const dupCount = Number(data.duplicate_candidates || 0)
  const slaBreaches = Number(data.sla_breaches || 0)
  const certsExpiring = Number(data.certs_expiring || 0)
  const conversionBase = Number(pipeline.won || 0) + Number(pipeline.lost || 0)
  const conversion = conversionBase ? Math.round((Number(pipeline.won || 0) / conversionBase) * 100) : 0

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
      { label: 'My open pipeline', value: php(Number(pipeline.mine_value || 0)), sub: 'Open inquiries I own', href: '/crm?tab=pipeline' },
      { label: 'Sessions needing pax', value: needsAttentionSessions, sub: 'Below minimum, sell seats', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Unassigned orders', value: unassigned, sub: 'Claim these', href: '/worklist?who=unassigned' },
    ],
    sales_manager: [
      { label: 'Team pipeline', value: php(Number(pipeline.value || 0)), sub: 'Open inquiry value', href: '/crm?tab=pipeline' },
      { label: 'Team stalled orders', value: stalledAll, sub: 'Over 14 days in stage', href: '/worklist?who=all&view=stalled', alert: true },
      { label: 'Unassigned orders', value: unassigned, sub: 'Need an owner', href: '/worklist?who=unassigned', alert: true },
      { label: 'Team overdue collections', value: overdueAll, sub: 'Past terms across the team', href: '/worklist?who=all&view=overdue', alert: true },
      { label: 'Conversion', value: `${conversion}%`, sub: 'Inquiry to order', href: '/analytics?tab=pipeline' },
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
      { label: 'Certificates expiring', value: certsExpiring, sub: 'Within four months', href: '/analytics?tab=certs' },
    ],
    business_owner: [
      { label: 'Pending approvals', value: pendingApprovals, sub: 'Awaiting your decision', href: '/approvals', alert: true },
      { label: 'Booked revenue', value: php(booked), sub: `${attain}% of forecast`, href: '/analytics?tab=revenue' },
      { label: 'Delivered revenue', value: php(delivered), sub: `${num(deliveredPax)} participants trained`, href: '/analytics?tab=revenue' },
      { label: 'AR outstanding', value: php(ar.outstanding), sub: `${num(ar.overdueCount)} order${ar.overdueCount === 1 ? '' : 's'} overdue`, href: '/analytics?tab=receivables', alert: ar.overdueCount > 0 },
      { label: 'Sessions needing attention', value: needsAttentionSessions, sub: 'Risk of a no-go', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Cancellation rate', value: `${cancelRate}%`, sub: 'Orders cancelled', href: '/crm?tab=orders&stage=Cancelled' },
    ],
    management: [
      { label: 'Booked revenue', value: php(booked), sub: `${attain}% of forecast`, href: '/analytics?tab=revenue' },
      { label: 'Pipeline', value: php(Number(pipeline.value || 0)), sub: 'Open inquiry value', href: '/crm?tab=pipeline' },
      { label: 'Conversion', value: `${conversion}%`, sub: 'Inquiry to order', href: '/analytics?tab=pipeline' },
      { label: 'Delivered revenue', value: php(delivered), sub: `${num(deliveredPax)} participants trained`, href: '/analytics?tab=revenue' },
      { label: 'AR outstanding', value: php(ar.outstanding), sub: `${php(ar.over60)} over 60 days`, href: '/analytics?tab=receivables', alert: ar.over60 > 0 },
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
      { label: 'Data quality', value: 'View', sub: 'Records needing attention', href: '/analytics?tab=data', alert: true },
      { label: 'Duplicate candidates', value: dupCount, sub: 'Review and merge', href: '/duplicates', alert: true },
      { label: 'Orders missing an owner', value: unassigned, sub: 'Assign a salesperson', href: '/worklist?who=unassigned', alert: true },
      { label: 'Pending approvals', value: pendingApprovals, sub: 'Across the team', href: '/approvals' },
      { label: 'Sessions needing attention', value: needsAttentionSessions, sub: 'At risk or below minimum', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Booked revenue', value: php(booked), sub: `${attain}% of forecast`, href: '/analytics?tab=revenue' },
      { label: 'AR outstanding', value: php(ar.outstanding), sub: `${num(ar.overdueCount)} order${ar.overdueCount === 1 ? '' : 's'} overdue`, href: '/analytics?tab=receivables', alert: ar.overdueCount > 0 },
      { label: 'SLA breaches', value: slaBreaches, sub: 'Past the stage target', href: '/worklist?who=all', alert: true },
    ],
  }

  // A role with no configured cards falls back to the super_admin superset —
  // never a blank page. Empty until the role resolves so a sales user can't
  // flash another role's metrics.
  const cards = role ? (cardsByRole[role] || cardsByRole.super_admin!) : []
  const bandLoading = metrics.isLoading
  const bandError = metrics.error
  const showCharts = !!role && CHART_ROLES.includes(role)

  // "Needs you now": the alert cards whose count is non-zero, lifted above the
  // quieter metrics so the one thing that needs the user is unmissable (#132).
  const isHot = (c: CardDef) => !!c.alert && typeof c.value === 'number' && c.value > 0
  const needsNow = cards.filter(isHot)
  const quietCards = cards.filter((c) => !isHot(c))

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
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>{head.title}</h1>
            <p>{head.sub}</p>
          </div>
        </div>
      )}

      {bandError ? (
        <ErrorNote error={bandError} />
      ) : !role || bandLoading ? (
        <KpiSkeleton count={cards.length || 6} />
      ) : (
        <>
          {needsNow.length > 0 && (
            <div className="section needs-now">
              <div className="k-label needs-now-label" style={{ marginBottom: 8 }}>Needs you now</div>
              <div className="grid kpis">
                {needsNow.map((c) => (<DashCard key={c.label} c={c} />))}
              </div>
            </div>
          )}
          <div className="grid kpis">
            {quietCards.map((c) => (<DashCard key={c.label} c={c} />))}
          </div>
        </>
      )}

      {showCharts && (
        <RevenueCharts YEAR={YEAR} model={model} loading={metrics.isLoading} error={metrics.error} />
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
