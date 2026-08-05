import { useMemo, useState } from 'react'
import { useSchedules, useChannelPax, useYears } from '../hooks/data'
import { useAuth } from '../hooks/useAuth'
import { Spinner, ErrorNote, StatusPill, GoPill, ChannelPill, FillBar } from '../components/ui'
import SessionDrawer from '../components/SessionDrawer'
import { php, daysUntil } from '../lib/format'
import { lt, formatSegments } from '../lib/labels'
import { Link } from 'react-router-dom'

const CURRENT_MONTH = new Date().toLocaleDateString('en-PH', { month: 'long' })

function SessionRows({ rows, pax, onOpen, canEdit }) {
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
        <td>
          {formatSegments(r.date_segments, r.start_date, r.end_date)}
          {d != null && d >= 0 && <div className="fill-label">in {d}d</div>}
        </td>
        <td>{lt(r.modality)}</td>
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
        <td className="right" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {r.course?.url ? (
              <a href={r.course.url} target="_blank" rel="noreferrer">View ↗</a>
            ) : (<span className="muted">—</span>)}
            {canEdit && <Link to={`/session/${r.schedule_id}/edit`}>Edit</Link>}
            {canEdit && <Link to={`/course/${r.course_id}/edit`} className="muted">Course</Link>}
          </div>
        </td>
      </tr>
    )
  })
}

export default function Calendar() {
  const years = useYears()
  const [year, setYear] = useState(2026)
  const sched = useSchedules(year)
  const pax = useChannelPax()
  const { profile } = useAuth()
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [ltype, setLtype] = useState('all')
  const [open, setOpen] = useState(null)
  const canEdit = ['operations', 'super_admin'].includes(profile?.role)

  const months = useMemo(() => [...new Set((sched.data || []).map((r) => r.month))].filter(Boolean), [sched.data])
  const categories = useMemo(
    () => [...new Set((sched.data || []).map((r) => r.course?.category).filter(Boolean))].sort(),
    [sched.data]
  )

  const rows = useMemo(() => {
    if (!sched.data) return []
    return sched.data.filter(
      (r) =>
        (month === 'all' || r.month === month) &&
        (status === 'all' || r.status === status) &&
        (category === 'all' || r.course?.category === category) &&
        (ltype === 'all' || r.modality === ltype)
    )
  }, [sched.data, month, status, category, ltype])

  const perscert = rows.filter((r) => r.course?.training_type === 'PersCert')
  const professional = rows.filter((r) => r.course?.training_type !== 'PersCert')

  if (sched.isLoading || years.isLoading) return <Spinner label="Loading calendar" />
  if (sched.error) return <ErrorNote error={sched.error} />

  const head = (
    <thead>
      <tr>
        <th>Course</th><th>Training type</th><th>Dates</th><th>Learning type</th><th>Fill</th>
        <th>Channels</th><th>Status</th><th>Go</th><th className="right">Fee</th><th className="right">Links</th>
      </tr>
    </thead>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Training calendar</h1>
          <p>{month === 'all' ? `All ${year} sessions` : `${month} ${year}`}, PersCert first then Professional Training, in date order. Click a row to open it.</p>
        </div>
        {canEdit && (
          <div className="toolbar">
            <Link className="btn btn-ghost" to="/course/new">+ New course</Link>
            <Link className="btn" to="/session/new">+ New session</Link>
          </div>
        )}
      </div>

      <div className="filters">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {(years.data || []).map((y) => (<option key={y.year_id} value={y.year}>{y.year}</option>))}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All months</option>
          {months.map((m) => (<option key={m}>{m}</option>))}
          {!months.includes(month) && month !== 'all' && <option>{month}</option>}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {['Tentative', 'Confirmed', 'Running', 'Completed', 'Cancelled'].map((s) => (<option key={s}>{s}</option>))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => (<option key={c}>{c}</option>))}
        </select>
        <select value={ltype} onChange={(e) => setLtype(e.target.value)}>
          <option value="all">All learning types</option>
          <option value="Live Online Training">Virtual Learning</option>
          <option value="Face-to-face">Classroom Training</option>
          <option value="E-learning">E-learning</option>
        </select>
      </div>

      {perscert.length > 0 && (
        <>
          <h3 style={{ margin: '4px 0 8px' }}>PersCert</h3>
          <div className="card" style={{ marginBottom: 20 }}>
            <table>{head}<tbody><SessionRows rows={perscert} pax={pax.data} onOpen={setOpen} canEdit={canEdit} /></tbody></table>
          </div>
        </>
      )}

      {professional.length > 0 && (
        <>
          <h3 style={{ margin: '4px 0 8px' }}>Professional Training</h3>
          <div className="card">
            <table>{head}<tbody><SessionRows rows={professional} pax={pax.data} onOpen={setOpen} canEdit={canEdit} /></tbody></table>
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
