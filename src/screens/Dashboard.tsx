'use client'
import { useMemo, ReactNode } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useSchedules, useOrders, useActiveYear } from '../hooks/data'
import Link from 'next/link'
import { Spinner, ErrorNote } from '../components/ui'
import { KpiSkeleton } from '../components/Skeleton'
import { php, num } from '../lib/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Webshop reads the theme accent token so it tracks light/dark; the rest are a
// fixed palette chosen to stay legible on both backgrounds.
const CH_COLORS: Record<string, string> = { Webshop: 'var(--accent)', 'Inside Sales': '#8b5cf6', 'Field Sales': '#ec4899', 'In-house Request': '#f5a623' }

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card card-pad kpi">
      <div className="k-label">{label}</div>
      <div className="k-value">{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  // Derive the dashboard year from the active calendar year (highest, if more
  // than one is active), falling back to the current calendar year. Avoids a
  // hardcoded 2026 that goes stale on 1 Jan.
  const activeYear = useActiveYear()
  const YEAR = activeYear.data?.at(-1)?.year ?? new Date().getFullYear()
  const sched = useSchedules(YEAR)
  const orders = useOrders()

  const model = useMemo(() => {
    if (!sched.data || !orders.data) return null
    // Scope booked revenue / monthly / channel mix to the dashboard's year so a
    // prior- or next-year order can't leak into the year's figures.
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
    const atRisk = sched.data.filter(
      (r: any) =>
        ['Tentative', 'Confirmed'].includes(r.status) &&
        r.booked_participants < r.min_participants &&
        new Date(r.start_date) >= new Date()
    ).length
    const pending = orders.data.filter((o: any) => o.payment_status !== 'Paid' && o.order_status !== 'Cancelled').length

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

    return { revenue, forecast, delivered, deliveredPax, atRisk, pending, byMonth, channelData, cancelRate }
  }, [sched.data, orders.data, YEAR])

  if (sched.isLoading || orders.isLoading)
    return (
      <>
        <div className="page-head"><div><h1>Dashboard</h1></div></div>
        <KpiSkeleton count={6} />
      </>
    )
  if (sched.error) return <ErrorNote error={sched.error} />
  if (orders.error) return <ErrorNote error={orders.error} />
  if (!model) return <Spinner label="Loading dashboard" />

  const attain = model.forecast ? Math.round((model.revenue / model.forecast) * 100) : 0
  const monthlyEmpty = model.byMonth.every((m) => m.revenue === 0)
  const channelEmpty = model.channelData.length === 0
  const channelSummary = model.channelData.map((e) => `${e.name} ${php(e.value)}`).join(', ')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Booked revenue against forecast, session risk, and channel mix for {YEAR}.</p>
        </div>
      </div>

      <div className="grid kpis">
        <Kpi label="Booked revenue" value={php(model.revenue)} sub={`${attain}% of forecast`} />
        <Kpi label="Forecast" value={php(model.forecast)} sub="Set by the business owner" />
        <Kpi label="Delivered revenue" value={php(model.delivered)} sub={`${num(model.deliveredPax)} participants trained`} />
        <Link href="/calendar?month=all&sort=fill&dir=asc" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Kpi label="Sessions at risk" value={num(model.atRisk)} sub="Below minimum, still upcoming · view" />
        </Link>
        <Kpi label="Pending payments" value={num(model.pending)} sub="Unpaid or partial, not cancelled" />
        <Kpi label="Cancellation rate" value={`${model.cancelRate}%`} sub="Orders cancelled" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="card card-pad">
          <div className="k-label" style={{ marginBottom: 10 }}>Booked revenue by month</div>
          {monthlyEmpty ? (
            <div className="empty" style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No booked revenue yet for {YEAR}.</div>
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
          <div className="k-label" style={{ marginBottom: 10 }}>Revenue by channel</div>
          {channelEmpty ? (
            <div className="empty" style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data yet.</div>
          ) : (
            <>
              <div role="img" aria-label={`Revenue by channel for ${YEAR}: ${channelSummary}`}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={model.channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={92} paddingAngle={2}>
                      {model.channelData.map((e) => (
                        <Cell key={e.name} fill={CH_COLORS[e.name] || 'var(--text-faint)'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => php(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="chip-row" style={{ justifyContent: 'center', marginTop: 8 }}>
                {model.channelData.map((e) => (
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
    </>
  )
}
