import { useMemo, useState } from 'react'
import { useClients, useAttribution, useClientHistory } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { shortDate, num, php } from '../lib/format'
import { formatSegments } from '../lib/labels'
import { StatusPill } from '../components/ui'

export default function Clients() {
  const clients = useClients()
  const attribution = useAttribution()
  const [tab, setTab] = useState('clients')
  const [q, setQ] = useState('')
  const [openClient, setOpenClient] = useState(null)

  const filtered = useMemo(() => {
    if (!clients.data) return []
    const t = q.trim().toLowerCase()
    if (!t) return clients.data
    return clients.data.filter(
      (c) => c.company?.toLowerCase().includes(t) || c.name?.toLowerCase().includes(t) || c.email?.toLowerCase().includes(t)
    )
  }, [clients.data, q])

  const bySales = useMemo(() => {
    if (!attribution.data) return []
    const map = {}
    for (const a of attribution.data) {
      const key = a.salesperson?.name || 'Unassigned'
      map[key] = (map[key] || 0) + (a.clients_brought || 0)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [attribution.data])

  if (clients.isLoading) return <Spinner label="Loading clients" />
  if (clients.error) return <ErrorNote error={clients.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients and attribution</h1>
          <p>The client book everyone reads. Sales edit only their own. Attribution totals clients brought per salesperson.</p>
        </div>
      </div>

      <div className="filters">
        {['clients', 'attribution'].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? '' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t === 'clients' ? 'Clients' : 'Attribution'}
          </button>
        ))}
        {tab === 'clients' && (
          <input placeholder="Search company, name, email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        )}
      </div>

      {tab === 'clients' ? (
        <div className="card">
          <table>
            <thead>
              <tr><th>Company</th><th>Contact</th><th>Email</th><th>Phone</th><th>Owner</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((c) => (
                <tr key={c.client_id} className="clickable" onClick={() => setOpenClient(c)}>
                  <td style={{ fontWeight: 600 }}>{c.company || '—'}</td>
                  <td>{c.name || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.salesperson?.name || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty">No clients match.</div>}
          {filtered.length > 300 && <div className="empty muted">Showing first 300 of {filtered.length}.</div>}
        </div>
      ) : attribution.error ? (
        <ErrorNote error={attribution.error} />
      ) : (
        <>
          <div className="grid kpis" style={{ marginBottom: 18 }}>
            {bySales.map(([name, total]) => (
              <div key={name} className="card card-pad kpi">
                <div className="k-label">{name}</div>
                <div className="k-value">{num(total)}</div>
                <div className="k-sub">clients brought</div>
              </div>
            ))}
          </div>
          <div className="card">
            <table>
              <thead>
                <tr><th>Salesperson</th><th>Session</th><th>Date</th><th className="right">Clients brought</th></tr>
              </thead>
              <tbody>
                {attribution.data?.map((a) => (
                  <tr key={a.attribution_id}>
                    <td>{a.salesperson?.name || '—'}</td>
                    <td>{a.schedule?.course?.course_name || '—'}</td>
                    <td>{shortDate(a.date_recorded)}</td>
                    <td className="right">{a.clients_brought}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!attribution.data || attribution.data.length === 0) && (
              <div className="empty">No attribution records yet. Sales log clients brought against sessions.</div>
            )}
          </div>
        </>
      )}
      {openClient && <ClientHistory client={openClient} onClose={() => setOpenClient(null)} />}
    </>
  )
}

function ClientHistory({ client, onClose }) {
  const hist = useClientHistory(client.client_id)
  const live = (hist.data || []).filter((o) => o.order_status !== 'Cancelled')
  const spend = live.reduce((n, o) => n + Number(o.total_amount || 0), 0)
  const seats = live.reduce((n, o) => n + (o.total_seats || 0), 0)

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{client.company || client.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>{client.email || '—'} · owner {client.salesperson?.name || 'unassigned'}</div>
          </div>
          <button className="linkbtn" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-body">
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 18 }}>
            <div><div className="k-label">Bookings</div><div className="k-value" style={{ fontSize: 22 }}>{live.length}</div></div>
            <div><div className="k-label">Seats</div><div className="k-value" style={{ fontSize: 22 }}>{seats}</div></div>
            <div><div className="k-label">Lifetime value</div><div className="k-value" style={{ fontSize: 22 }}>{php(spend)}</div></div>
          </div>
          {hist.isLoading ? <div className="empty">Loading…</div> : hist.error ? (
            <ErrorNote error={hist.error} />
          ) : hist.data?.length === 0 ? (
            <div className="empty">No orders on record.</div>
          ) : (
            <table>
              <thead><tr><th>Course</th><th>Session</th><th className="right">Amount</th></tr></thead>
              <tbody>
                {hist.data.map((o) => (
                  <tr key={o.order_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {o.lines?.map((l) => l.course?.course_name).filter(Boolean).join(', ') || '—'}
                      </div>
                      <div className="fill-label">{o.order_id} · {shortDate(o.order_date)} · {o.payment_status}</div>
                    </td>
                    <td className="fill-label">
                      {o.lines?.[0]?.schedule
                        ? formatSegments(o.lines[0].schedule.date_segments, o.lines[0].schedule.start_date, o.lines[0].schedule.end_date)
                        : 'E-learning'}
                    </td>
                    <td className="right">{php(o.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
