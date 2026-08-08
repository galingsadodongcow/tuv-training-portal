'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useSchedules, useChannelPax, useYears } from '../hooks/data'
import { useAuth } from '../hooks/useAuth'
import { Spinner, ErrorNote, StatusPill, GoPill, ChannelPill, FillBar } from '../components/ui'
import { php, daysUntil } from '../lib/format'
import { lt, formatSegments, LEARNING_TYPES } from '../lib/labels'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const CURRENT_MONTH = MONTHS[new Date().getMonth()]
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const STATUS_TONE: Record<string, string> = {
  Confirmed: 'confirmed', Tentative: 'tentative', Running: 'running', Completed: 'completed', Cancelled: 'cancelled',
}

function UrgencyPill({ days }: { days: number | null }) {
  if (days == null || days < 0) return null
  if (days === 0) return <span className="pill pill-today">Today</span>
  if (days <= 7) return <span className="pill pill-thisweek">In {days}d</span>
  if (days <= 30) return <span className="pill pill-soon">In {days}d</span>
  return null
}

function riskClass(r: any) {
  if (!['Tentative', 'Confirmed'].includes(r.status)) return ''
  if (r.min_participants <= 0 || r.booked_participants >= r.min_participants) return ''
  const d = daysUntil(r.start_date)
  if (d == null || d < 0) return ''
  return d <= 14 ? 'risk-red' : 'risk-amber'
}

function CopyLink({ url }: { url: string }) {
  const [ok, setOk] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setOk(true)
      setTimeout(() => setOk(false), 1500)
    } catch { /* clipboard unavailable */ }
  }
  return (
    <button className="linkbtn" style={{ padding: 0 }} title="Copy webshop link" onClick={copy}>
      {ok ? 'Copied' : 'Copy'}
    </button>
  )
}

// Month grid: the roster of trainings for the selected month, placed on their
// start day. Every role reads this to see what runs when.
function MonthGrid({ year, monthName, sessions, onOpen }: { year: number; monthName: string; sessions: any[]; onOpen: (r: any) => void }) {
  const mIdx = MONTHS.indexOf(monthName)
  const startWeekday = new Date(year, mIdx, 1).getDay()
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate()

  const byDay = useMemo(() => {
    const map: Record<number, any[]> = {}
    for (const s of sessions) {
      const d = new Date(s.start_date)
      if (d.getFullYear() === year && d.getMonth() === mIdx) {
        (map[d.getDate()] ||= []).push(s)
      }
    }
    return map
  }, [sessions, year, mIdx])

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const tod=new Date()
  const isToday = (day: number) => tod.getFullYear() === year && tod.getMonth() === mIdx && tod.getDate() === day

  return (
    <div className="cal-grid-wrap">
      <div className="cal-grid">
        {WEEKDAYS.map((w) => (<div key={w} className="cal-grid-head">{w}</div>))}
        {cells.map((day, i) => (
          <div key={i} className={`cal-grid-cell ${day ? '' : 'cal-grid-empty'} ${day && isToday(day) ? 'cal-grid-today' : ''}`}>
            {day && <div className="cal-grid-daynum">{day}</div>}
            {day && (byDay[day] || []).map((s) => (
              <button key={s.schedule_id} className={`cal-event cal-event-${STATUS_TONE[s.status] || 'tentative'}`}
                onClick={() => onOpen(s)} title={`${s.course?.course_name} · ${lt(s.modality)} · ${s.status} · ${s.booked_participants}/${s.min_participants} pax`}>
                <span className="cal-event-name">{s.course?.course_name}</span>
                <span className="cal-event-meta">{lt(s.modality)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SessionRows({ rows, pax, onOpen, canEdit, canSell }: { rows: any[]; pax: any; onOpen: (r: any) => void; canEdit: boolean; canSell: boolean }) {
  return rows.map((r) => {
    const ch = pax?.[r.schedule_id] || {}
    const d = daysUntil(r.start_date)
    return (
      <tr key={r.schedule_id}
          className={`clickable ${riskClass(r)} ${d != null && d >= 0 && d <= 7 ? 'upcoming' : ''}`}
          onClick={() => onOpen(r)}>
        <td data-label="">
          <div style={{ fontWeight: 600 }}>{r.course?.course_name}</div>
          <div className="fill-label">{r.course?.category || '—'}</div>
        </td>
        <td data-label="Training type">
          <span className={`pill ${r.course?.training_type === 'PersCert' ? 'pill-inside' : 'pill-webshop'}`}>
            {r.course?.training_type}
          </span>
        </td>
        <td data-label="Dates">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{formatSegments(r.date_segments, r.start_date, r.end_date)}</span>
            <UrgencyPill days={d} />
          </div>
          {d != null && d > 30 && <div className="fill-label">in {d}d</div>}
          {d != null && d < 0 && <div className="fill-label">past</div>}
        </td>
        <td data-label="Learning type" className="hide-m">
          {lt(r.modality)}
          {!r.trainer && ['Tentative', 'Confirmed'].includes(r.status) && d != null && d >= 0 && (
            <div className="fill-label" style={{ color: d <= 21 ? 'var(--tr-amber)' : 'inherit' }}>No trainer</div>
          )}
        </td>
        <td data-label="Fill" style={{ minWidth: 120 }}><FillBar booked={r.booked_participants} min={r.min_participants} /></td>
        <td data-label="Channels" className="hide-m">
          <div className="chip-row">
            {Object.entries(ch).length === 0 && <span className="muted fill-label">—</span>}
            {Object.entries(ch).map(([c, n]) => (
              <span key={c} className="fill-label" style={{ display: 'inline-flex', gap: 4 }}>
                <ChannelPill value={c} /> {n as any}
              </span>
            ))}
          </div>
        </td>
        <td data-label="Status"><StatusPill value={r.status} /></td>
        <td data-label="Go" className="hide-m"><GoPill value={r.go_status} /></td>
        <td data-label="Fee" className="right hide-m">{php(r.price)}</td>
        <td data-label="Links" className="right" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {r.course?.url ? (
              <>
                <a href={r.course.url} target="_blank" rel="noreferrer">View ↗</a>
                <CopyLink url={r.course.url} />
              </>
            ) : (<span className="muted">—</span>)}
            {canSell && ['Tentative', 'Confirmed'].includes(r.status) && (
              <Link href={`/sales-entry?schedule=${r.schedule_id}`}>Book</Link>
            )}
            {canEdit && <Link href={`/session/${r.schedule_id}/edit`}>Edit</Link>}
            {canEdit && <Link href={`/course/${r.course_id}/edit`} className="muted">Course</Link>}
          </div>
        </td>
      </tr>
    )
  })
}

export default function Calendar() {
  const years = useYears()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const get = (k: string, fb: string) => params.get(k) || fb
  const year = Number(get('year', '2026'))
  const cal = get('cal', 'grid') // grid | list
  const month = get('month', CURRENT_MONTH)
  const status = get('status', 'all')
  const category = get('category', 'all')
  const ltype = get('lt', 'all')
  const q = get('q', '')
  const sortKey = get('sort', 'date')
  const sortDir = get('dir', 'asc')
  const gridMonth = month === 'all' ? CURRENT_MONTH : month

  const setParam = (k: string, v: any) => {
    const next = new URLSearchParams(params.toString())
    if (v === 'all' || v === '' || v == null) next.delete(k)
    else next.set(k, v)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  const sched = useSchedules(year)
  const pax = useChannelPax()
  const { profile } = useAuth()
  const openSession = (r: any) => router.push(`/session/${r.schedule_id}`)
  const canEdit = ['operations', 'super_admin'].includes(profile?.role as string)
  const canSell = ['sales', 'super_admin'].includes(profile?.role as string)

  const categories = useMemo(
    () => [...new Set((sched.data || []).map((r: any) => r.course?.category).filter(Boolean))].sort(),
    [sched.data]
  )

  // Filter by everything except the month; the grid slices by start date and
  // the list applies the month text on top.
  const base = useMemo(() => {
    if (!sched.data) return []
    const term = q.trim().toLowerCase()
    return sched.data.filter(
      (r: any) =>
        (status === 'all' || r.status === status) &&
        (category === 'all' || r.course?.category === category) &&
        (ltype === 'all' || r.modality === ltype) &&
        (!term || r.course?.course_name?.toLowerCase().includes(term))
    )
  }, [sched.data, status, category, ltype, q])

  const rows = useMemo(() => {
    let out = base.filter((r: any) => month === 'all' || r.month === month)
    const val = (r: any) =>
      sortKey === 'fill'
        ? (r.min_participants > 0 ? r.booked_participants / r.min_participants : 99)
        : sortKey === 'fee'
        ? (r.price ?? 0)
        : r.start_date
    out = [...out].sort((a: any, b: any) => {
      const x = val(a), y = val(b)
      const c = x < y ? -1 : x > y ? 1 : 0
      return sortDir === 'asc' ? c : -c
    })
    return out
  }, [base, month, sortKey, sortDir])

  const perscert = rows.filter((r: any) => r.course?.training_type === 'PersCert')
  const professional = rows.filter((r: any) => r.course?.training_type !== 'PersCert')
  const gridCount = base.filter((r: any) => {
    const d = new Date(r.start_date)
    return d.getFullYear() === year && d.getMonth() === MONTHS.indexOf(gridMonth)
  }).length

  if (sched.isLoading || years.isLoading) return <Spinner label="Loading calendar" />
  if (sched.error) return <ErrorNote error={sched.error} />

  const stepMonth = (dir: number) => {
    const i = MONTHS.indexOf(gridMonth)
    setParam('month', MONTHS[(i + dir + 12) % 12])
  }

  const sortBtn = (key: string, label: string, align?: string) => (
    <th className={align} style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => {
        if (sortKey === key) setParam('dir', sortDir === 'asc' ? 'desc' : 'asc')
        else { setParam('sort', key); setParam('dir', 'asc') }
      }}>
      {label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const head = (
    <thead>
      <tr>
        <th>Course</th><th>Training type</th>
        {sortBtn('date', 'Dates')}
        <th className="hide-m">Learning type</th>
        {sortBtn('fill', 'Fill')}
        <th className="hide-m">Channels</th><th>Status</th><th className="hide-m">Go</th>
        {sortBtn('fee', 'Fee', 'right hide-m')}
        <th className="right">Links</th>
      </tr>
    </thead>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Training calendar</h1>
          <p>{cal === 'grid' ? `${gridMonth} ${year}` : month === 'all' ? `All ${year} sessions` : `${month} ${year}`}. The month's roster of trainings. Click a session to open it.</p>
        </div>
        {canEdit && (
          <div className="toolbar">
            <Link className="btn btn-ghost" href="/course/new">+ New course</Link>
            <Link className="btn" href="/session/new">+ New session</Link>
          </div>
        )}
      </div>

      <div className="filters">
        <div className="seg">
          <button className={`seg-btn ${cal === 'grid' ? 'on' : ''}`} onClick={() => setParam('cal', 'grid')}>Month</button>
          <button className={`seg-btn ${cal === 'list' ? 'on' : ''}`} onClick={() => setParam('cal', 'list')}>List</button>
        </div>
        <div className="toolbar" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => stepMonth(-1)} title="Previous month">‹</button>
          <select value={cal === 'grid' ? gridMonth : month} onChange={(e) => setParam('month', e.target.value)}>
            {cal === 'list' && <option value="all">All months</option>}
            {MONTHS.map((m) => (<option key={m}>{m}</option>))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => stepMonth(1)} title="Next month">›</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setParam('month', CURRENT_MONTH)}>Today</button>
        </div>
        <input placeholder="Search course…" value={q} onChange={(e) => setParam('q', e.target.value)} style={{ minWidth: 160 }} />
        <select value={year} onChange={(e) => setParam('year', e.target.value)}>
          {(years.data || []).map((y: any) => (<option key={y.year_id} value={y.year}>{y.year}</option>))}
        </select>
        <select value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="all">All statuses</option>
          {['Tentative', 'Confirmed', 'Running', 'Completed', 'Cancelled'].map((s) => (<option key={s}>{s}</option>))}
        </select>
        <select value={category} onChange={(e) => setParam('category', e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c: any) => (<option key={c}>{c}</option>))}
        </select>
        <select value={ltype} onChange={(e) => setParam('lt', e.target.value)}>
          <option value="all">All learning types</option>
          {LEARNING_TYPES.map((m) => (<option key={m} value={m}>{lt(m)}</option>))}
        </select>
      </div>

      {cal === 'grid' ? (
        <>
          <MonthGrid year={year} monthName={gridMonth} sessions={base} onOpen={openSession} />
          {gridCount === 0 && (
            <div className="card" style={{ marginTop: 12 }}><div className="empty">No sessions in {gridMonth} {year}. Use the arrows or switch month.</div></div>
          )}
        </>
      ) : (
        <>
          {perscert.length > 0 && (
            <>
              <h3 style={{ margin: '4px 0 8px' }}>PersCert ({perscert.length})</h3>
              <div className="card cal-card" style={{ marginBottom: 20 }}>
                <table className="cal-table">{head}<tbody><SessionRows rows={perscert} pax={pax.data} onOpen={openSession} canEdit={canEdit} canSell={canSell} /></tbody></table>
              </div>
            </>
          )}
          {professional.length > 0 && (
            <>
              <h3 style={{ margin: '4px 0 8px' }}>Professional Training ({professional.length})</h3>
              <div className="card cal-card">
                <table className="cal-table">{head}<tbody><SessionRows rows={professional} pax={pax.data} onOpen={openSession} canEdit={canEdit} canSell={canSell} /></tbody></table>
              </div>
            </>
          )}
          {rows.length === 0 && (
            <div className="card"><div className="empty">
              No sessions match. {month !== 'all' && 'Try All months, the arrows, or clear the search.'}
            </div></div>
          )}
        </>
      )}
    </>
  )
}
