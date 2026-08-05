import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useSchedules, useOrders } from '../hooks/data'
import { Link } from 'react-router-dom'
import { Spinner, ErrorNote } from '../components/ui'
import { php, num } from '../lib/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CH_COLORS = { Webshop: '#0071b9', 'Inside Sales': '#7c4dcf', 'Field Sales': '#d20033', 'In-house Request': '#e8a400' }

function Kpi({ label, value, sub }) {
  return (
    <div className="card card-pad kpi">
      <div className="k-label">{label}</div>
      <div className="k-value">{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const sched = useSchedules(2026)
  const orders = useOrders()

  const model = useMemo(() => {
    if (!sched.data || !orders.data) return null
    const live = orders.data.filter((o) => ['New', 'Confirmed', 'Completed'].includes(o.order_status))
    const revenue = live.reduce((s, o) => s + (o.amount_php || 0), 0)
    const forecast = sched.data.reduce((s, r) => s + (r.forecast_revenue || 0), 0)
    const delivered = sched.data
      .filter((r) => r.status === 'Completed')
      .reduce((s, r) => s + Number(r.actual_revenue || 0), 0)
    const deliveredPax = sched.data
      .filter((r) => r.status === 'Completed')
      .reduce((s, r) => s + (r.actual_participants || 0), 0)
    const atRisk = sched.data.filter(
      (r) =>
        ['Tentative', 'Confirmed'].includes(r.status) &&
        r.booked_participants < r.min_participants &&
        new Date(r.start_date) >= new Date()
    ).length
    const pending = orders.data.filter((o) => o.payment_status !== 'Paid' && o.order_status !== 'Cancelled').length

    const byMonth = MONTHS.map((m, i) => ({ month: m, revenue: 0 }))
    for (const o of live) {
      const mi = new Date(o.order_date).getMonth()
      if (byMonth[mi]) byMonth[mi].revenue += o.amount_php || 0
    }
    const byChannel = {}
    for (const o of live) byChannel[o.channel] = (byChannel[o.channel] || 0) + (o.amount_php || 0)
    const channelData = Object.entries(byChannel).map(([name, value]) => ({ name, value }))

    const cancelled = orders.data.filter((o) => o.order_status === 'Cancelled').length
    const cancelRate = orders.data.length ? Math.round((cancelled / orders.data.length) * 100) : 0

    return { revenue, forecast, delivered, deliveredPax, atRisk, pending, byMonth, channelData, cancelRate }
  }, [sched.data, orders.data])

  if (sched.isLoading || orders.isLoading) return <Spinner label="Loading dashboard" />
  if (sched.error) return <ErrorNote error={sched.error} />
  if (orders.error) return <ErrorNote error={orders.error} />

  const attain = model.forecast ? Math.round((model.revenue / model.forecast) * 100) : 0

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Booked revenue against forecast, session risk, and channel mix for 2026.</p>
        </div>
      </div>

      <div className="grid kpis">
        <Kpi label="Booked revenue" value={php(model.revenue)} sub={`${attain}% of forecast`} />
        <Kpi label="Forecast" value={php(model.forecast)} sub="Set by the business owner" />
        <Kpi label="Delivered revenue" value={php(model.delivered)} sub={`${num(model.deliveredPax)} participants trained`} />
        <Link to="/calendar?month=all&sort=fill&dir=asc" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Kpi label="Sessions at risk" value={num(model.atRisk)} sub="Below minimum, still upcoming · view" />
        </Link>
        <Kpi label="Pending payments" value={num(model.pending)} sub="Unpaid or partial, not cancelled" />
        <Kpi label="Cancellation rate" value={`${model.cancelRate}%`} sub="Orders cancelled" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="card card-pad">
          <div className="k-label" style={{ marginBottom: 10 }}>Booked revenue by month</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={model.byMonth} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => php(v)} cursor={{ fill: '#f0f4f7' }} />
              <Bar dataKey="revenue" fill="#0071b9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card card-pad">
          <div className="k-label" style={{ marginBottom: 10 }}>Revenue by channel</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={model.channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={92} paddingAngle={2}>
                {model.channelData.map((e) => (
                  <Cell key={e.name} fill={CH_COLORS[e.name] || '#9aa7b1'} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => php(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chip-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            {model.channelData.map((e) => (
              <span key={e.name} className="fill-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: CH_COLORS[e.name] || '#9aa7b1', display: 'inline-block' }} />
                {e.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
