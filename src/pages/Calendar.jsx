import { useMemo, useState } from 'react'
import { useSchedules, useChannelPax } from '../hooks/data'
import { Spinner, ErrorNote, StatusPill, GoPill, ChannelPill, FillBar } from '../components/ui'
import { dateRange, php, daysUntil } from '../lib/format'

export default function Calendar() {
  const sched = useSchedules(2026)
  const pax = useChannelPax()
  const [month, setMonth] = useState('all')
  const [status, setStatus] = useState('all')
  const [cat, setCat] = useState('all')

  const rows = useMemo(() => {
    if (!sched.data) return []
    return sched.data.filter(
      (r) =>
        (month === 'all' || r.month === month) &&
        (status === 'all' || r.status === status) &&
        (cat === 'all' || r.course?.training_type === cat)
    )
  }, [sched.data, month, status, cat])

  if (sched.isLoading) return <Spinner label="Loading calendar" />
  if (sched.error) return <ErrorNote error={sched.error} />

  const months = [...new Set(sched.data.map((r) => r.month))].filter(Boolean)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Training calendar</h1>
          <p>Every 2026 session with live booked pax split by channel.</p>
        </div>
      </div>

      <div className="filters">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All months</option>
          {months.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {['Tentative', 'Confirmed', 'Running', 'Completed', 'Cancelled'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          <option>PersCert</option>
          <option>Professional</option>
        </select>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Course</th>
              <th>Dates</th>
              <th>Modality</th>
              <th>Fill</th>
              <th>Channels</th>
              <th>Status</th>
              <th>Go</th>
              <th className="right">Fee</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ch = pax.data?.[r.schedule_id] || {}
              const d = daysUntil(r.start_date)
              return (
                <tr key={r.schedule_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.course?.course_name}</div>
                    <div className="fill-label">{r.course?.training_type}</div>
                  </td>
                  <td>
                    {dateRange(r.start_date, r.end_date)}
                    {d != null && d >= 0 && <div className="fill-label">in {d}d</div>}
                  </td>
                  <td>{r.modality}</td>
                  <td style={{ minWidth: 120 }}>
                    <FillBar booked={r.booked_participants} min={r.min_participants} />
                  </td>
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
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No sessions match these filters.</div>}
      </div>
    </>
  )
}
