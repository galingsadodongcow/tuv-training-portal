'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useDigest, useOrderFacts, useReceivables, useCertsExpiring } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { php, num, shortDate } from '../lib/format'
import { exportCsv } from '../lib/csv'

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

export default function Reports() {
  const [tab, setTab] = useState<'digest' | 'revenue' | 'receivables' | 'certs'>('digest')
  const digest = useDigest()
  const facts = useOrderFacts()
  const receivables = useReceivables()
  const certs = useCertsExpiring()
  const [verifyNo, setVerifyNo] = useState('')
  const [verifyResult, setVerifyResult] = useState<any>(undefined)
  const verify = async () => {
    if (!verifyNo.trim()) return
    const { data } = await supabase.rpc('fn_verify_certificate', { p_cert: verifyNo.trim() })
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
    const rows = (facts.data || []).filter((f: any) => f.order_status !== 'Cancelled')
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
  }, [facts.data])

  const exportMonths = () =>
    exportCsv(
      'revenue-by-month-' + new Date().toISOString().slice(0, 10),
      ['Month', 'Orders', 'Seats', 'Booked PHP', 'Collected PHP'],
      revenue.months.map((m: any) => [monthLabel(m.key), m.orders, m.seats, m.booked, m.collected])
    )

  return (
    <>
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
        </div>
      </div>

      {tab === 'digest' && (
        digest.isLoading ? <Spinner label="Loading digest" /> : digest.error ? <ErrorNote error={digest.error} /> : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <DigestCard title="Sessions at risk" rows={digest.data?.atRisk || []} empty="No under-filled sessions in the next three weeks."
              render={(r) => (<><Link href={`/session/${r.schedule_id}`}>{r.course_name}</Link> · {shortDate(r.start_date)} · needs {r.seats_needed} more</>)} />
            <DigestCard title="Roster gaps" rows={digest.data?.rosterGaps || []} empty="Every seat sold has a name."
              render={(r) => (<><Link href={`/session/${r.schedule_id}`}>{r.course_name}</Link> · {shortDate(r.start_date)} · {r.missing} missing</>)} />
            <DigestCard title="Stalled orders" rows={digest.data?.stalled || []} empty="Nothing sat too long in a stage."
              render={(r) => (<><Link href={`/orders/${r.order_id}`}>{r.order_id}</Link> · {r.company || '—'} · {r.days_in_stage}d in {r.fulfillment_stage}</>)} />
            <DigestCard title="Unstaffed sessions" rows={digest.data?.unstaffed || []} empty="Every upcoming session has a trainer."
              render={(r) => (<><Link href={`/session/${r.schedule_id}`}>{r.course_name}</Link> · {shortDate(r.start_date)} · {r.days_out}d out</>)} />
            <DigestCard title="E-learning waiting" rows={digest.data?.elearning || []} empty="No paid e-learning is waiting for access."
              render={(r) => (<><Link href={`/orders/${r.order_id}`}>{r.order_id}</Link> · {r.company || '—'} · {r.days_waiting}d waiting</>)} />
          </div>
        )
      )}

      {tab === 'revenue' && (
        facts.isLoading ? <Spinner label="Loading revenue" /> : facts.error ? <ErrorNote error={facts.error} /> : (
          <>
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
                <div><div className="k-label">Orders</div><div className="k-value">{num(revenue.totals.orders)}</div></div>
                <div><div className="k-label">Seats</div><div className="k-value">{num(revenue.totals.seats)}</div></div>
                <div><div className="k-label">Booked</div><div className="k-value">{php(revenue.totals.booked)}</div></div>
                <div><div className="k-label">Collected</div><div className="k-value">{php(revenue.totals.collected)}</div></div>
              </div>
            </div>

            <div className="page-head" style={{ marginBottom: 8 }}>
              <div><h2 style={{ fontSize: 16 }}>By month</h2></div>
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
                <h2 style={{ fontSize: 16, marginBottom: 8 }}>By channel</h2>
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
                <h2 style={{ fontSize: 16, marginBottom: 8 }}>By salesperson</h2>
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
          </>
        )
      )}

      {tab === 'receivables' && (
        receivables.isLoading ? <Spinner label="Loading receivables" /> : (
          <>
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <div><div className="k-label">Open balance</div><div className="k-value">{php(aging.total)}</div></div>
                {aging.buckets.map((b) => (
                  <div key={b.key}><div className="k-label">{b.label}</div><div className="k-value">{php(b.total)}</div><div className="fill-label">{b.count} order{b.count === 1 ? '' : 's'}</div></div>
                ))}
              </div>
            </div>

            <div className="page-head" style={{ marginBottom: 8 }}><div><h2 style={{ fontSize: 16 }}>Overdue</h2></div></div>
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

      {tab === 'certs' && (
        <>
          <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 640 }}>
            <div className="k-label" style={{ marginBottom: 8 }}>Verify a certificate</div>
            <div className="toolbar">
              <input placeholder="TRA-2026-000001" value={verifyNo} onChange={(e) => { setVerifyNo(e.target.value); setVerifyResult(undefined) }}
                onKeyDown={(e) => e.key === 'Enter' && verify()} style={{ minWidth: 220 }} />
              <button className="btn btn-sm" onClick={verify}>Verify</button>
            </div>
            {verifyResult === null && <div className="notice notice-error" style={{ marginTop: 10 }}>No certificate found with that number.</div>}
            {verifyResult && (
              <div className={`notice ${verifyResult.valid ? 'notice-info' : 'notice-error'}`} style={{ marginTop: 10 }}>
                <strong>{verifyResult.full_name}</strong> · {verifyResult.course_name}<br />
                Issued {verifyResult.cert_issued_date || '—'}{verifyResult.cert_expiry_date ? ` · valid to ${verifyResult.cert_expiry_date}` : ''} · {verifyResult.valid ? 'Valid' : 'Expired'}
              </div>
            )}
          </div>

          <div className="page-head" style={{ marginBottom: 8 }}><div><h2 style={{ fontSize: 16 }}>Expiring within four months</h2></div></div>
          <div className="card">
            {certs.isLoading ? <Spinner /> : (certs.data?.length || 0) === 0 ? (
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
    </>
  )
}
