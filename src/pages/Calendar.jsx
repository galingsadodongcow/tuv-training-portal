import { useMemo, useState } from 'react'
import { useSchedules, useChannelPax } from '../hooks/data'
import { useAuth } from '../hooks/useAuth'
import { Spinner, ErrorNote, StatusPill, GoPill, ChannelPill, FillBar } from '../components/ui'
import SessionDrawer from '../components/SessionDrawer'
import { dateRange, php, daysUntil } from '../lib/format'
import { Link } from 'react-router-dom'

const CURRENT_MONTH = new Date().toLocaleDateString('en-PH', { month: 'long' })

function SessionRows({ rows, pax, onOpen }) {
  return rows.map((r) => {
    const ch = pax?.[r.schedule_id] || {}
    const d = daysUntil(r.start_date)
    return (
      <tr key={r.schedule_id} className="clickable" onClick={() => onOpen(r)}>
        <td>
          <div style={{ fontWeight: 600 }}>{r.course?.course_name}</div>
          <div className="fill-label">{r.course?.category || '—'}</div>
        </td>
        <td>
          <span className={`pill ${r.course?.training_type === 'PersCert' ? 'pill-inside' : 'pill-webshop'}`}>
            {r.course?.training_type}
          </span>
        </td>
        <td>{dateRange(r.start_date, r.end_date)}{d != null && d >= 0 && <div className="fill-label">in {d}d</div>}</td>
        <td>{r.modality}</td>
        <td style={{ minWidth: 120 }}><FillBar booked={r.booked_participants} min={r.min_participants} /></td>
        <td>
          <div className="chip-row">
            {Object.entries(ch).length === 0 && <span className="muted fill-label">—</span>}
            {Object.entries(ch).map(([c, n]) => (
              <span key={c} className="fill-label" style={{ display: 'inline-flex', gap: 4 }}>
                <ChannelPill value={c} /> {n}
              </span>
            ))}
          </div>
        </td>
        <td><StatusPill value={r.status} /></td>
        <td><GoPill value={r.go_status} /></td>
        <td className="right">{php(r.price)}</td>
        <td className="right">
          {r.course?.url ? (
            <a href={r.course.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>View ↗</a>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
      </tr>
    )
  })
}

export default function Calendar() {
  const sched = useSchedules(2026)
  const pax = useChannelPax()
  const { profile } = useAuth()
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [status, setStatus] = useState('all')
  const [cat, setCat] = useState('all')
  const [open, setOpen] = useState(null)
  const canCreate = ['operations', 'super_admin'].includes(profile?.role)

  const months = useMemo(() => [...new Set((sched.data || []).map((r) => r.month))].filter(Boolean), [sched.data])

  const rows = useMemo(() => {
    if (!sched.data) return []
    return sched.data.filter(
      (r) =>
        (month === 'all' || r.month === month) &&
        (status === 'all' || r.status === status) &&
        (cat === 'all' || r.course?.training_type === cat)
    )
  }, [sched.data, month, status, cat])

  // PersCert on top, Professional after, each chronological (rows come pre-sorted by start date)
  const perscert = rows.filter((r) => r.course?.training_type === 'PersCert')
  const professional = rows.filter((r) => r.course?.training_type !== 'PersCert')

  if (sched.isLoading) return <Spinner label="Loading calendar" />
  if (sched.error) return <ErrorNote error={sched.error} />

  const monthAvailable = months.includes(CURRENT_MONTH)

  const head = (
    <thead>
      <tr>
        <th>Course</th><th>Training category</th><th>Dates</th><th>Modality</th><th>Fill</th>
        <th>Channels</th><th>Status</th><th>Go</th><th className="right">Fee</th><th className="right">Webshop</th>
      </tr>
    </thead>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Training calendar</h1>
          <p>{month === 'all' ? 'All 2026 sessions' : `${month} sessions`}, PersCert first, then Professional, in date order. Click a row to open it.</p>
        </div>
        {canCreate && (
          <div className="toolbar">
            <Link className="btn btn-ghost" to="/course/new">+ New course</Link>
            <Link className="btn" to="/session/new">+ New session</Link>
          </div>
        )}
      </div>

      <div className="filters">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All months</option>
          {months.map((m) => (<option key={m}>{m}</option>))}
          {!monthAvailable && !months.includes(month) && month !== 'all' && <option>{month}</option>}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {['Tentative', 'Confirmed', 'Running', 'Completed', 'Cancelled'].map((s) => (<option key={s}>{s}</option>))}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          <option>PersCert</option>
          <option>Professional</option>
        </select>
      </div>

      {perscert.length > 0 && (
        <>
          <h3 style={{ margin: '4px 0 8px' }}>PersCert</h3>
          <div className="card" style={{ marginBottom: 20 }}>
            <table>{head}<tbody><SessionRows rows={perscert} pax={pax.data} onOpen={setOpen} /></tbody></table>
          </div>
        </>
      )}

      {professional.length > 0 && (
        <>
          <h3 style={{ margin: '4px 0 8px' }}>Professional Training</h3>
          <div className="card">
            <table>{head}<tbody><SessionRows rows={professional} pax={pax.data} onOpen={setOpen} /></tbody></table>
          </div>
        </>
      )}

      {rows.length === 0 && (
        <div className="card"><div className="empty">
          No sessions match. {month !== 'all' && 'Try All months or another month.'}
        </div></div>
      )}

      {open && <SessionDrawer schedule={open} channelPax={pax.data} onClose={() => setOpen(null)} />}
    </>
  )
}
