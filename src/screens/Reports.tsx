'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useDigest, useOrderFacts, useReceivables, useCertsExpiring, useProfitability, useFunnel, useForecastVsActual, useTrainerLoad, useCountryRevenue } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import ChartTable, { ChartTableToggle } from '../components/ChartTable'
import { php, money, num, shortDate } from '../lib/format'
import { exportCsv } from '../lib/csv'
import { stageLabel } from '../lib/orderState'

const monthLabel = (d: string) => {
  const dt = new Date(d)
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })
}

// One digest card: a titled count with the top few rows and a link each.
function DigestCard({ title, rows, empty, render }: { title: string; rows: any[]; empty: string; render: (r: any) => any }) {
  return (
    <div className="card card-pad">
      <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="k-label">{title}</div>
        <span className="pill pill-webshop">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="fill-label">{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.slice(0, 6).map((r, i) => (<div key={i} className="fill-label">{render(r)}</div>))}
          {rows.length > 6 && <div className="fill-label" style={{ color: 'var(--text-faint)' }}>+{rows.length - 6} more</div>}
        </div>
      )}
    </div>
  )
}

// Days a receivable is overdue. Uses the invoice due date, or falls back to the
// order date plus 30 days when no invoice due date is set.
const overdueDaysOf = (r: any) => {
  const base = r.due_date || (r.order_date ? new Date(+new Date(r.order_date) + 30 * 86400000).toISOString().slice(0, 10) : null)
  if (!base) return 0
  return Math.floor((Date.now() - +new Date(base)) / 86400000)
}
const AGING = [
  { key: 'current', label: 'Not due', test: (d: number) => d <= 0 },
  { key: '1-30', label: '1 to 30 days', test: (d: number) => d >= 1 && d <= 30 },
  { key: '31-60', label: '31 to 60 days', test: (d: number) => d >= 31 && d <= 60 },
  { key: '60+', label: 'Over 60 days', test: (d: number) => d > 60 },
]

export type ReportSection = 'digest' | 'revenue' | 'receivables' | 'certs' | 'margin' | 'analytics'

// Rendered standalone at /reports historically; now embedded as the Revenue /
// Receivables / Certificates / Profitability / Pipeline panels of the single
// Analytics shell. When `embedded`, the parent picks the section and owns the
// tab strip, so we render just that one section without our own chrome.
export default function Reports({ embedded, section }: { embedded?: boolean; section?: ReportSection } = {}) {
  const [tab, setTab] = useState<ReportSection>('digest')
  const activeTab: ReportSection = embedded && section ? section : tab
  const [funnelTable, setFunnelTable] = useState(false)

  // Period filter (RPT01). Presets resolve to a {from,to} of yyyy-mm; a custom
  // range is driven by the two month inputs. Default 'all' == whole dataset, so
  // nothing changes until the user picks a range. Only the date-bearing tabs
  // (revenue, margin) read this; snapshot/future-dated tabs ignore it.
  const [period, setPeriod] = useState<'all' | 'year' | 'ytd' | '12m' | 'custom'>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = useMemo<{ from: string; to: string }>(() => {
    const ym = (d: Date) => d.toISOString().slice(0, 7)
    const now = new Date()
    const y = now.getFullYear()
    switch (period) {
      case 'year': return { from: `${y}-01`, to: `${y}-12` }
      case 'ytd': return { from: `${y}-01`, to: ym(now) }
      case '12m': return { from: ym(new Date(y, now.getMonth() - 11, 1)), to: ym(now) }
      case 'custom': return { from: customFrom, to: customTo }
      default: return { from: '', to: '' }
    }
  }, [period, customFrom, customTo])
  const inPeriod = (d?: string | null) => {
    if (!range.from && !range.to) return true
    if (!d) return false
    const m = String(d).slice(0, 7)
    if (range.from && m < range.from) return false
    if (range.to && m > range.to) return false
    return true
  }
  const periodLabel = useMemo(() => {
    if (!range.from && !range.to) return 'All time'
    const fmt = (m: string) => (m ? monthLabel(`${m}-01`) : '—')
    if (range.from && range.to) return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`
    return range.from ? `From ${fmt(range.from)}` : `Through ${fmt(range.to)}`
  }, [range])
  const periodBar = (
    <div className="filters">
      <div className="seg">
        {([['all', 'All'], ['year', 'This year'], ['ytd', 'Year to date'], ['12m', 'Last 12 months']] as const).map(([k, label]) => (
          <button key={k} className={`seg-btn ${period === k ? 'on' : ''}`} onClick={() => setPeriod(k)}>{label}</button>
        ))}
      </div>
      <input type="month" aria-label="Period from" value={range.from}
        onChange={(e) => { const v = e.target.value; setCustomFrom(v); setCustomTo((t) => t || range.to); setPeriod('custom') }} />
      <span className="fill-label">to</span>
      <input type="month" aria-label="Period to" value={range.to}
        onChange={(e) => { const v = e.target.value; setCustomTo(v); setCustomFrom((f) => f || range.from); setPeriod('custom') }} />
      <span className="fill-label" style={{ marginLeft: 'auto' }}>{periodLabel}</span>
    </div>
  )
  const digest = useDigest()
  const facts = useOrderFacts()
  const receivables = useReceivables()
  const certs = useCertsExpiring()
  const pnl = useProfitability()
  const funnel = useFunnel()
  const forecast = useForecastVsActual()
  const trainerLoad = useTrainerLoad()
  const countryRev = useCountryRevenue()

  const margins = useMemo(() => {
    const rows = (pnl.data || []).filter((r: any) => (Number(r.revenue) > 0 || Number(r.total_cost) > 0) && inPeriod(r.start_date))
    const t = rows.reduce((a: any, r: any) => ({ revenue: a.revenue + Number(r.revenue || 0), cost: a.cost + Number(r.total_cost || 0), margin: a.margin + Number(r.margin || 0) }), { revenue: 0, cost: 0, margin: 0 })
    return { rows, ...t }
  }, [pnl.data, range])
  const [verifyNo, setVerifyNo] = useState('')
  const [verifyResult, setVerifyResult] = useState<any>(undefined)
  const [verifyError, setVerifyError] = useState<any>(null)
  const verify = async () => {
    if (!verifyNo.trim()) return
    setVerifyError(null)
    const { data, error } = await supabase.rpc('fn_verify_certificate', { p_cert: verifyNo.trim() })
    if (error) { setVerifyError(error); setVerifyResult(undefined); return }
    setVerifyResult(data && data.length ? data[0] : null)
  }

  const aging = useMemo(() => {
    const rows = (receivables.data || []).map((r: any) => ({ ...r, od: overdueDaysOf(r) }))
    const buckets = AGING.map((b) => {
      const items = rows.filter((r: any) => b.test(r.od))
      return { ...b, count: items.length, total: items.reduce((n: number, r: any) => n + Number(r.balance || 0), 0) }
    })
    const total = rows.reduce((n: number, r: any) => n + Number(r.balance || 0), 0)
    const overdue = rows.filter((r: any) => r.od > 0).sort((a: any, b: any) => b.od - a.od)
    return { buckets, total, overdue, count: rows.length }
  }, [receivables.data])

  const revenue = useMemo(() => {
    const rows = (facts.data || []).filter((f: any) => f.order_status !== 'Cancelled' && inPeriod(f.order_month))
    const byMonth: Record<string, any> = {}
    const byChannel: Record<string, any> = {}
    const bySales: Record<string, any> = {}
    const bump = (bucket: Record<string, any>, key: string, f: any) => {
      const b = (bucket[key] ||= { key, orders: 0, seats: 0, booked: 0, collected: 0 })
      b.orders += 1
      b.seats += Number(f.seats || 0)
      b.booked += Number(f.amount_php || 0)
      if (f.payment_status === 'Paid') b.collected += Number(f.amount_php || 0)
    }
    for (const f of rows) {
      if (f.order_month) bump(byMonth, f.order_month, f)
      bump(byChannel, f.channel || 'Unknown', f)
      bump(bySales, f.sales_name || 'Unassigned', f)
    }
    const months = Object.values(byMonth).sort((a: any, b: any) => (a.key < b.key ? 1 : -1))
    const channels = Object.values(byChannel).sort((a: any, b: any) => b.booked - a.booked)
    const sales = Object.values(bySales).sort((a: any, b: any) => b.booked - a.booked)
    const totals = rows.reduce((t: any, f: any) => {
      t.orders += 1; t.seats += Number(f.seats || 0); t.booked += Number(f.amount_php || 0)
      if (f.payment_status === 'Paid') t.collected += Number(f.amount_php || 0)
      return t
    }, { orders: 0, seats: 0, booked: 0, collected: 0 })
    return { months, channels, sales, totals }
  }, [facts.data, range])

  const stamp = () => new Date().toISOString().slice(0, 10)
  const exportMonths = () =>
    exportCsv(
      'revenue-by-month-' + stamp(),
      ['Month', 'Orders', 'Seats', 'Booked PHP', 'Collected PHP'],
      revenue.months.map((m: any) => [monthLabel(m.key), m.orders, m.seats, m.booked, m.collected])
    )
  const exportChannels = () =>
    exportCsv(
      'revenue-by-channel-' + stamp(),
      ['Channel', 'Orders', 'Booked PHP'],
      revenue.channels.map((c: any) => [c.key, c.orders, c.booked])
    )
  const exportSales = () =>
    exportCsv(
      'revenue-by-salesperson-' + stamp(),
      ['Salesperson', 'Orders', 'Booked PHP'],
      revenue.sales.map((s: any) => [s.key, s.orders, s.booked])
    )
  const exportReceivables = () =>
    exportCsv(
      'receivables-overdue-' + stamp(),
      ['Order', 'Customer', 'Balance PHP', 'Days overdue'],
      aging.overdue.map((r: any) => [r.order_id, r.company || r.client_name || '', r.balance, r.od])
    )
  const exportCerts = () =>
    exportCsv(
      'expiring-certificates-' + stamp(),
      ['Certificate', 'Holder', 'Course', 'Expiry', 'Days left'],
      (certs.data || []).map((c: any) => [c.cert_number, c.full_name, c.course_name, c.cert_expiry_date, c.days_left])
    )
  const exportMargins = () =>
    exportCsv(
      'profitability-' + stamp(),
      ['Course', 'Date', 'Revenue PHP', 'Cost PHP', 'Margin PHP', 'Margin %'],
      margins.rows.map((r: any) => [r.course_name, r.start_date, Number(r.revenue), Number(r.total_cost), Number(r.margin), Number(r.revenue) > 0 ? Math.round(Number(r.margin) / Number(r.revenue) * 100) : ''])
    )
  const exportTrainers = () =>
    exportCsv(
      'trainer-load-' + stamp(),
      ['Trainer', 'Code', 'Sessions', 'Training days', 'Delivered'],
      (trainerLoad.data || []).map((t: any) => [t.name, t.code, t.sessions, t.training_days, t.delivered])
    )

  return (
    <>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>Reports</h1>
            <p>The operational digest and the revenue book. The digest is the same watch-list the nightly job runs on.</p>
          </div>
          <div className="seg">
            <button className={`seg-btn ${tab === 'digest' ? 'on' : ''}`} onClick={() => setTab('digest')}>Digest</button>
            <button className={`seg-btn ${tab === 'revenue' ? 'on' : ''}`} onClick={() => setTab('revenue')}>Revenue</button>
            <button className={`seg-btn ${tab === 'receivables' ? 'on' : ''}`} onClick={() => setTab('receivables')}>Receivables</button>
            <button className={`seg-btn ${tab === 'certs' ? 'on' : ''}`} onClick={() => setTab('certs')}>Certificates</button>
            <button className={`seg-btn ${tab === 'margin' ? 'on' : ''}`} onClick={() => setTab('margin')}>Profitability</button>
            <button className={`seg-btn ${tab === 'analytics' ? 'on' : ''}`} onClick={() => setTab('analytics')}>Analytics</button>
          </div>
        </div>
      )}

      {activeTab === 'digest' && (
        digest.isLoading ? <Spinner label="Loading digest" /> : digest.error ? <ErrorNote error={digest.error} /> : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <DigestCard title="Sessions at risk" rows={digest.data?.atRisk || []} empty="No under-filled sessions in the next three weeks."
              render={(r) => (<><Link href={`/session/${r.schedule_id}`}>{r.course_name}</Link> · {shortDate(r.start_date)} · needs {r.seats_needed} more</>)} />
            <DigestCard title="Roster gaps" rows={digest.data?.rosterGaps || []} empty="Every seat sold has a name."
              render={(r) => (<><Link href={`/session/${r.schedule_id}`}>{r.course_name}</Link> · {shortDate(r.start_date)} · {r.missing} missing</>)} />
            <DigestCard title="Stalled orders" rows={digest.data?.stalled || []} empty="Nothing sat too long in a stage."
              render={(r) => (<><Link href={`/orders/${r.order_id}`}>{r.order_id}</Link> · {r.company || '—'} · {r.days_in_stage}d in {stageLabel(r.fulfillment_stage)}</>)} />
            <DigestCard title="Unstaffed sessions" rows={digest.data?.unstaffed || []} empty="Every upcoming session has a trainer."
              render={(r) => (<><Link href={`/session/${r.schedule_id}`}>{r.course_name}</Link> · {shortDate(r.start_date)} · {r.days_out}d out</>)} />
            <DigestCard title="E-learning waiting" rows={digest.data?.elearning || []} empty="No paid e-learning is waiting for access."
              render={(r) => (<><Link href={`/orders/${r.order_id}`}>{r.order_id}</Link> · {r.company || '—'} · {r.days_waiting}d waiting</>)} />
          </div>
        )
      )}

      {activeTab === 'revenue' && (
        facts.isLoading ? <Spinner label="Loading revenue" /> : facts.error ? <ErrorNote error={facts.error} /> : (
          <>
            {periodBar}
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
                <div><div className="k-label">Orders</div><div className="k-value">{num(revenue.totals.orders)}</div></div>
                <div><div className="k-label">Seats</div><div className="k-value">{num(revenue.totals.seats)}</div></div>
                <div><div className="k-label">Booked</div><div className="k-value">{php(revenue.totals.booked)}</div></div>
                <div><div className="k-label">Collected</div><div className="k-value">{php(revenue.totals.collected)}</div></div>
              </div>
            </div>

            <div className="page-head" style={{ marginBottom: 8 }}>
              <div><h2 style={{ fontSize: 16 }}>By month <span className="fill-label" style={{ fontWeight: 400 }}>· {periodLabel}</span></h2></div>
              <button className="btn btn-ghost btn-sm" onClick={exportMonths}>Export CSV</button>
            </div>
            <div className="card" style={{ marginBottom: 20 }}>
              <table>
                <thead><tr><th>Month</th><th className="right">Orders</th><th className="right">Seats</th><th className="right">Booked</th><th className="right">Collected</th></tr></thead>
                <tbody>
                  {revenue.months.length === 0 && <tr><td colSpan={5}><div className="empty">No orders yet.</div></td></tr>}
                  {revenue.months.map((m: any) => (
                    <tr key={m.key}>
                      <td style={{ fontWeight: 600 }}>{monthLabel(m.key)}</td>
                      <td className="right">{num(m.orders)}</td>
                      <td className="right">{num(m.seats)}</td>
                      <td className="right">{php(m.booked)}</td>
                      <td className="right">{php(m.collected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              <div>
                <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <h2 style={{ fontSize: 16 }}>By channel</h2>
                  <button className="btn btn-ghost btn-sm" onClick={exportChannels} disabled={revenue.channels.length === 0}>Export CSV</button>
                </div>
                <div className="card">
                  <table>
                    <thead><tr><th>Channel</th><th className="right">Orders</th><th className="right">Booked</th></tr></thead>
                    <tbody>
                      {revenue.channels.map((c: any) => (<tr key={c.key}><td>{c.key}</td><td className="right">{num(c.orders)}</td><td className="right">{php(c.booked)}</td></tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <h2 style={{ fontSize: 16 }}>By salesperson</h2>
                  <button className="btn btn-ghost btn-sm" onClick={exportSales} disabled={revenue.sales.length === 0}>Export CSV</button>
                </div>
                <div className="card">
                  <table>
                    <thead><tr><th>Salesperson</th><th className="right">Orders</th><th className="right">Booked</th></tr></thead>
                    <tbody>
                      {revenue.sales.map((s: any) => (<tr key={s.key}><td>{s.key}</td><td className="right">{num(s.orders)}</td><td className="right">{php(s.booked)}</td></tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {(countryRev.data?.length || 0) > 1 && (
              <div style={{ marginTop: 16 }}>
                <h2 style={{ fontSize: 16, marginBottom: 8 }}>By country</h2>
                <div className="card">
                  <table>
                    <thead><tr><th>Country</th><th>Currency</th><th className="right">Orders</th><th className="right">Seats</th><th className="right">Booked</th></tr></thead>
                    <tbody>
                      {(countryRev.data || []).map((c: any) => (
                        <tr key={`${c.country}-${c.currency}`}>
                          <td style={{ fontWeight: 600 }}>{c.country}</td>
                          <td className="fill-label">{c.currency}</td>
                          <td className="right">{num(c.orders)}</td>
                          <td className="right">{num(c.seats)}</td>
                          <td className="right">{money(Number(c.booked), c.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      )}

      {activeTab === 'receivables' && (
        receivables.isLoading ? <Spinner label="Loading receivables" /> : receivables.error ? <ErrorNote error={receivables.error} /> : (
          <>
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <div><div className="k-label">Open balance</div><div className="k-value">{php(aging.total)}</div></div>
                {aging.buckets.map((b) => (
                  <div key={b.key}><div className="k-label">{b.label}</div><div className="k-value">{php(b.total)}</div><div className="fill-label">{b.count} order{b.count === 1 ? '' : 's'}</div></div>
                ))}
              </div>
            </div>

            <div className="page-head" style={{ marginBottom: 8 }}>
              <div><h2 style={{ fontSize: 16 }}>Overdue</h2></div>
              <button className="btn btn-ghost btn-sm" onClick={exportReceivables} disabled={aging.overdue.length === 0}>Export CSV</button>
            </div>
            <div className="card">
              {aging.overdue.length === 0 ? (
                <div className="empty">Nothing overdue. {aging.count === 0 ? 'No open balances.' : 'All open balances are within terms.'}</div>
              ) : (
                <table>
                  <thead><tr><th>Order</th><th>Customer</th><th className="right">Balance</th><th className="right">Days overdue</th></tr></thead>
                  <tbody>
                    {aging.overdue.map((r: any) => (
                      <tr key={r.order_id}>
                        <td><Link href={`/orders/${r.order_id}`} style={{ fontWeight: 600 }}>{r.order_id}</Link></td>
                        <td className="fill-label">{r.company || r.client_name || '—'}</td>
                        <td className="right">{php(r.balance)}</td>
                        <td className="right" style={{ color: 'var(--warning)' }}>{r.od}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )
      )}

      {activeTab === 'certs' && (
        <>
          <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 640 }}>
            <div className="k-label" style={{ marginBottom: 8 }}>Verify a certificate</div>
            <div className="toolbar">
              <input aria-label="Certificate number" placeholder="TRA-2026-000001" value={verifyNo} onChange={(e) => { setVerifyNo(e.target.value); setVerifyResult(undefined); setVerifyError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && verify()} style={{ minWidth: 220 }} />
              <button className="btn btn-sm" onClick={verify}>Verify</button>
            </div>
            {verifyError && <div className="notice notice-error" style={{ marginTop: 10 }}>Could not verify the certificate: {String(verifyError.message || verifyError)}. Please try again.</div>}
            {!verifyError && verifyResult === null && <div className="notice notice-warn" style={{ marginTop: 10 }}>No certificate found with that number.</div>}
            {verifyResult && (
              <div className={`notice ${verifyResult.valid ? 'notice-info' : 'notice-error'}`} style={{ marginTop: 10 }}>
                <strong>{verifyResult.full_name}</strong> · {verifyResult.course_name}<br />
                Issued {verifyResult.cert_issued_date || '—'}{verifyResult.cert_expiry_date ? ` · valid to ${verifyResult.cert_expiry_date}` : ''} · {verifyResult.valid ? 'Valid' : 'Expired'}
              </div>
            )}
          </div>

          <div className="page-head" style={{ marginBottom: 8 }}>
            <div><h2 style={{ fontSize: 16 }}>Expiring within four months</h2></div>
            <button className="btn btn-ghost btn-sm" onClick={exportCerts} disabled={(certs.data?.length || 0) === 0}>Export CSV</button>
          </div>
          <div className="card">
            {certs.isLoading ? <Spinner /> : certs.error ? <ErrorNote error={certs.error} /> : (certs.data?.length || 0) === 0 ? (
              <div className="empty">No certificates are expiring soon.</div>
            ) : (
              <table>
                <thead><tr><th>Certificate</th><th>Holder</th><th>Course</th><th>Expiry</th><th className="right">Days left</th></tr></thead>
                <tbody>
                  {certs.data.map((c: any) => (
                    <tr key={c.participant_id}>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{c.cert_number}</td>
                      <td>{c.full_name}</td>
                      <td className="fill-label">{c.course_name}</td>
                      <td className="fill-label">{c.cert_expiry_date}</td>
                      <td className="right" style={{ color: c.days_left < 0 ? 'var(--danger)' : c.days_left < 30 ? 'var(--warning)' : 'inherit' }}>{c.days_left}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'margin' && (
        pnl.isLoading ? <Spinner label="Loading profitability" /> : pnl.error ? <ErrorNote error={pnl.error} /> : (
          <>
            {periodBar}
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <div><div className="k-label">Revenue</div><div className="k-value">{php(margins.revenue)}</div></div>
                <div><div className="k-label">Cost</div><div className="k-value">{php(margins.cost)}</div></div>
                <div><div className="k-label">Margin</div><div className="k-value" style={{ color: margins.margin >= 0 ? 'inherit' : 'var(--danger)' }}>{php(margins.margin)}</div></div>
                <div><div className="k-label">Margin %</div><div className="k-value">{margins.revenue > 0 ? Math.round(margins.margin / margins.revenue * 100) : 0}%</div></div>
              </div>
            </div>
            <div className="page-head" style={{ marginBottom: 8 }}>
              <div><h2 style={{ fontSize: 16 }}>By session <span className="fill-label" style={{ fontWeight: 400 }}>· {periodLabel}</span></h2></div>
              <button className="btn btn-ghost btn-sm" onClick={exportMargins} disabled={margins.rows.length === 0}>Export CSV</button>
            </div>
            <div className="card">
              {margins.rows.length === 0 ? (
                <div className="empty">No sessions with revenue or cost yet.</div>
              ) : (
                <table>
                  <thead><tr><th>Course</th><th>Date</th><th className="right">Revenue</th><th className="right">Cost</th><th className="right">Margin</th><th className="right">%</th></tr></thead>
                  <tbody>
                    {margins.rows.map((r: any) => (
                      <tr key={r.schedule_id}>
                        <td><Link href={`/session/${r.schedule_id}`} style={{ fontWeight: 600 }}>{r.course_name}</Link></td>
                        <td className="fill-label">{r.start_date}</td>
                        <td className="right">{php(Number(r.revenue))}</td>
                        <td className="right">{php(Number(r.total_cost))}</td>
                        <td className="right" style={{ color: Number(r.margin) >= 0 ? 'inherit' : 'var(--danger)' }}>{php(Number(r.margin))}</td>
                        <td className="right fill-label">{Number(r.revenue) > 0 ? Math.round(Number(r.margin) / Number(r.revenue) * 100) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )
      )}

      {activeTab === 'analytics' && (
        <>
          <div className="page-head" style={{ marginBottom: 8 }}>
            <div><h2 style={{ fontSize: 16 }}>Conversion funnel</h2></div>
            {funnel.data && <ChartTableToggle on={funnelTable} onToggle={() => setFunnelTable((v) => !v)} />}
          </div>
          {funnel.isLoading ? <Spinner label="Loading funnel" /> : !funnel.data ? (
            <div className="card"><div className="empty">Funnel data is unavailable. Run the analytics migration to enable it.</div></div>
          ) : funnelTable ? (
            <div className="card card-pad" style={{ marginBottom: 20 }}>
              <ChartTable
                caption="Conversion funnel"
                columns={[{ key: 'stage', label: 'Stage' }, { key: 'value', label: 'Value', align: 'right' }, { key: 'note', label: 'Detail', align: 'right' }]}
                rows={[
                  { stage: 'Inquiries', value: num(funnel.data.inquiries), note: `${num(funnel.data.open_inq)} still open` },
                  { stage: 'Won', value: num(funnel.data.won), note: `${num(funnel.data.lost)} lost` },
                  { stage: 'Win rate', value: `${Number(funnel.data.won) + Number(funnel.data.lost) > 0 ? Math.round(Number(funnel.data.won) / (Number(funnel.data.won) + Number(funnel.data.lost)) * 100) : 0}%`, note: 'of closed inquiries' },
                  { stage: 'Quotes', value: num(funnel.data.quotes), note: `${num(funnel.data.quotes_accepted)} accepted` },
                  { stage: 'Orders', value: num(funnel.data.orders_total), note: 'active' },
                ]}
              />
            </div>
          ) : (
            <div className="card card-pad" style={{ marginBottom: 20 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
                <div><div className="k-label">Inquiries</div><div className="k-value">{num(funnel.data.inquiries)}</div><div className="fill-label">{num(funnel.data.open_inq)} still open</div></div>
                <div><div className="k-label">Won</div><div className="k-value">{num(funnel.data.won)}</div><div className="fill-label">{num(funnel.data.lost)} lost</div></div>
                <div><div className="k-label">Win rate</div><div className="k-value">{Number(funnel.data.won) + Number(funnel.data.lost) > 0 ? Math.round(Number(funnel.data.won) / (Number(funnel.data.won) + Number(funnel.data.lost)) * 100) : 0}%</div><div className="fill-label">of closed inquiries</div></div>
                <div><div className="k-label">Quotes</div><div className="k-value">{num(funnel.data.quotes)}</div><div className="fill-label">{num(funnel.data.quotes_accepted)} accepted</div></div>
                <div><div className="k-label">Orders</div><div className="k-value">{num(funnel.data.orders_total)}</div><div className="fill-label">active</div></div>
              </div>
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            <div>
              <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 style={{ fontSize: 16 }}>Trainer utilization</h2>
                <button className="btn btn-ghost btn-sm" onClick={exportTrainers} disabled={(trainerLoad.data?.length || 0) === 0}>Export CSV</button>
              </div>
              <div className="card">
                {trainerLoad.isLoading ? <Spinner /> : trainerLoad.error ? <ErrorNote error={trainerLoad.error} /> : (trainerLoad.data?.length || 0) === 0 ? (
                  <div className="empty">No active trainers.</div>
                ) : (
                  <table>
                    <thead><tr><th>Trainer</th><th className="right">Sessions</th><th className="right">Days</th><th className="right">Delivered</th></tr></thead>
                    <tbody>
                      {(trainerLoad.data || []).map((t: any) => (
                        <tr key={t.trainer_id}>
                          <td style={{ fontWeight: 600 }}>{t.name} <span className="fill-label">{t.code}</span></td>
                          <td className="right">{num(t.sessions)}</td>
                          <td className="right">{num(t.training_days)}</td>
                          <td className="right">{num(t.delivered)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: 16, marginBottom: 8 }}>Forecast against actual</h2>
              <div className="card">
                {forecast.isLoading ? <Spinner /> : forecast.error ? <ErrorNote error={forecast.error} /> : (forecast.data?.length || 0) === 0 ? (
                  <div className="empty">No sessions to forecast.</div>
                ) : (
                  <table>
                    <thead><tr><th>Course</th><th>Date</th><th className="right">Forecast</th><th className="right">Actual</th><th className="right">Fill</th></tr></thead>
                    <tbody>
                      {(forecast.data || []).slice(0, 40).map((r: any) => (
                        <tr key={r.schedule_id}>
                          <td><Link href={`/session/${r.schedule_id}`} style={{ fontWeight: 600 }}>{r.course_name}</Link></td>
                          <td className="fill-label">{shortDate(r.start_date)}</td>
                          <td className="right fill-label">{php(Number(r.forecast_revenue))}</td>
                          <td className="right">{php(Number(r.actual_revenue))}</td>
                          <td className="right">{Number(r.capacity) > 0 ? Math.round(Number(r.booked) / Number(r.capacity) * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
