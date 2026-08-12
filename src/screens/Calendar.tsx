'use client'
import { useMemo, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useSchedules, useChannelPax, useYears, useSessionHealth } from '../hooks/data'
import { useAuth } from '../hooks/useAuth'
import { Spinner, ErrorNote, StatusPill, GoPill, ChannelPill, FillBar } from '../components/ui'
import { php, daysUntil } from '../lib/format'
import { lt, formatSegments, LEARNING_TYPES } from '../lib/labels'
import { healthMeta, healthNeedsAction } from '../lib/health'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const CURRENT_MONTH = MONTHS[new Date().getMonth()]
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// Local ISO (yyyy-mm-dd) for the `date` param — avoids the UTC shift a bare
// toISOString() would introduce for evening-side timezones.
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const sameDay = (iso: string, d: Date) => {
  const s = new Date(iso)
  return s.getFullYear() === d.getFullYear() && s.getMonth() === d.getMonth() && s.getDate() === d.getDate()
}
const shortDate = (d: Date) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`

const STATUS_TONE: Record<string, string> = {
  Confirmed: 'confirmed', Tentative: 'tentative', Running: 'running', Completed: 'completed', Cancelled: 'cancelled',
}

// Short status token shown in the month grid so status isn't signalled by the
// event's colour alone (WCAG 1.4.1). Distinct 1-letter codes avoid the C/C/C
// collision between Confirmed / Completed / Cancelled.
const STATUS_ABBR: Record<string, string> = {
  Confirmed: 'C', Tentative: 'T', Running: 'R', Completed: 'D', Cancelled: 'X',
}

function UrgencyPill({ days }: { days: number | null }) {
  if (days == null || days < 0) return null
  if (days === 0) return <span className="pill pill-today">Today</span>
  if (days <= 7) return <span className="pill pill-thisweek">In {days}d</span>
  if (days <= 30) return <span className="pill pill-soon">In {days}d</span>
  return null
}

// Small at-a-glance cue for sessions that need operator attention (blocked / at
// risk / needs attention). Healthy and terminal sessions show nothing, so the
// calendar stays quiet unless something actually needs eyes. Degrades to null
// when health data is still loading or absent.
function HealthChip({ h, style }: { h?: string; style?: React.CSSProperties }) {
  if (!h || !healthNeedsAction(h)) return null
  const m = healthMeta(h)
  return <span className={`pill ${m.cls}`} style={{ fontSize: 10, padding: '1px 6px', ...style }}>{m.label}</span>
}

// Textual companion to the coloured risk bar on the row's first cell, so an
// at-risk (undersold, start date approaching) session is never signalled by
// colour alone (WCAG 1.4.1). Reuses the danger/warning pill tones.
function RiskTag({ cls }: { cls: string }) {
  if (cls !== 'risk-red' && cls !== 'risk-amber') return null
  return (
    <span className={`pill ${cls === 'risk-red' ? 'pill-today' : 'pill-thisweek'}`}
      title="Undersold with the start date approaching — needs attention"
      style={{ fontSize: 10, padding: '1px 6px', marginTop: 2, alignSelf: 'flex-start' }}>
      ▲ At risk
    </span>
  )
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
function MonthGrid({ year, monthName, sessions, onOpen, healthMap }: { year: number; monthName: string; sessions: any[]; onOpen: (r: any) => void; healthMap?: Map<string, string> }) {
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
                onClick={() => onOpen(s)}
                aria-label={`${s.course?.course_name} · ${lt(s.modality)} · ${s.status} · ${s.booked_participants}/${s.min_participants} pax`}
                title={`${s.course?.course_name} · ${lt(s.modality)} · ${s.status} · ${s.booked_participants}/${s.min_participants} pax`}>
                <span className="cal-event-name">{s.course?.course_name}</span>
                <span className="cal-event-meta">{STATUS_ABBR[s.status] || s.status} · {lt(s.modality)}</span>
                <HealthChip h={healthMap?.get(s.schedule_id)} style={{ marginTop: 2, alignSelf: 'flex-start' }} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Week grid: the seven days (Sun–Sat) around the selected date, each session
// placed on its start day. Reuses the month grid's cells and event chips.
function WeekGrid({ days, sessions, onOpen, healthMap }: { days: Date[]; sessions: any[]; onOpen: (r: any) => void; healthMap?: Map<string, string> }) {
  const tod = new Date()
  const isToday = (d: Date) => tod.getFullYear() === d.getFullYear() && tod.getMonth() === d.getMonth() && tod.getDate() === d.getDate()
  const byDay = useMemo(
    () => days.map((d) => sessions.filter((s) => sameDay(s.start_date, d))),
    [days, sessions]
  )
  return (
    <div className="cal-grid-wrap">
      <div className="cal-grid">
        {days.map((d, i) => (<div key={i} className="cal-grid-head">{WEEKDAYS[d.getDay()]} {d.getDate()}</div>))}
        {days.map((d, i) => (
          <div key={i} className={`cal-grid-cell ${isToday(d) ? 'cal-grid-today' : ''}`}>
            {byDay[i].map((s) => (
              <button key={s.schedule_id} className={`cal-event cal-event-${STATUS_TONE[s.status] || 'tentative'}`}
                onClick={() => onOpen(s)}
                aria-label={`${s.course?.course_name} · ${lt(s.modality)} · ${s.status} · ${s.booked_participants}/${s.min_participants} pax`}
                title={`${s.course?.course_name} · ${lt(s.modality)} · ${s.status} · ${s.booked_participants}/${s.min_participants} pax`}>
                <span className="cal-event-name">{s.course?.course_name}</span>
                <span className="cal-event-meta">{STATUS_ABBR[s.status] || s.status} · {lt(s.modality)}</span>
                <HealthChip h={healthMap?.get(s.schedule_id)} style={{ marginTop: 2, alignSelf: 'flex-start' }} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Slide-in summary of a single session, built entirely from the row already in
// hand (no fetch). Deep-links into the full session page from its primary action.
function SessionDrawer({ r, healthMap, onClose }: { r: any; healthMap?: Map<string, string>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => { ref.current?.querySelector<HTMLElement>('a, button')?.focus() }, [])
  const hm = healthMeta(healthMap?.get(r.schedule_id))
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-label={`Session: ${r.course?.course_name}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
        <div className="drawer-head">
          <div>
            <h3 style={{ margin: 0 }}>{r.course?.course_name}</h3>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>{r.course?.category || '—'} · {r.course?.training_type}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">
          <div className="chip-row" style={{ marginBottom: 16 }}>
            <StatusPill value={r.status} />
            <GoPill value={r.go_status} />
            <span className={`pill ${hm.cls}`}>{hm.label}</span>
          </div>
          <table style={{ marginBottom: 16 }}>
            <tbody>
              <tr><td>Dates</td><td className="right">{formatSegments(r.date_segments, r.start_date, r.end_date)}</td></tr>
              <tr><td>Learning type</td><td className="right">{lt(r.modality)}</td></tr>
              <tr><td>Fee</td><td className="right">{php(r.price)}</td></tr>
              {r.trainer && <tr><td>Trainer</td><td className="right">{r.trainer}</td></tr>}
              {r.venue && <tr><td>Venue</td><td className="right">{r.venue}</td></tr>}
            </tbody>
          </table>
          <div style={{ marginBottom: 20 }}>
            <div className="fill-label" style={{ marginBottom: 6 }}>Fill · {r.booked_participants}/{r.min_participants}</div>
            <FillBar booked={r.booked_participants} min={r.min_participants} />
          </div>
          <Link href={`/session/${r.schedule_id}`} className="btn">Open full session →</Link>
        </div>
      </div>
    </div>
  )
}

function SessionRows({ rows, pax, onOpen, canEdit, canSell, healthMap }: { rows: any[]; pax: any; onOpen: (r: any) => void; canEdit: boolean; canSell: boolean; healthMap?: Map<string, string> }) {
  return rows.map((r) => {
    const ch = pax?.[r.schedule_id] || {}
    const d = daysUntil(r.start_date)
    const risk = riskClass(r)
    return (
      <tr key={r.schedule_id}
          className={`clickable ${risk} ${d != null && d >= 0 && d <= 7 ? 'upcoming' : ''}`}
          onClick={() => onOpen(r)}>
        <td data-label="">
          <div style={{ fontWeight: 600 }}>{r.course?.course_name}</div>
          <div className="fill-label">{r.course?.category || '—'}</div>
          <RiskTag cls={risk} />
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
        <td data-label="Status">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <StatusPill value={r.status} />
            <HealthChip h={healthMap?.get(r.schedule_id)} />
          </div>
        </td>
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
  const cal = get('cal', 'grid') // grid | week | day | list
  const month = get('month', CURRENT_MONTH)
  const dateStr = get('date', toISO(new Date())) // week/day anchor (yyyy-mm-dd)
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
  const health = useSessionHealth()
  const healthMap = useMemo(
    () => new Map<string, string>((health.data || []).map((h: any) => [h.schedule_id, h.health])),
    [health.data]
  )
  const { profile } = useAuth()
  const [drawer, setDrawer] = useState<any | null>(null)
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

  // Week/day anchor and the seven Sun–Sat days around it.
  const anchor = new Date(`${dateStr}T00:00:00`)
  const weekDays = useMemo(() => {
    const start = new Date(anchor)
    start.setDate(anchor.getDate() - anchor.getDay())
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [dateStr])
  const weekLabel = `${shortDate(weekDays[0])} – ${shortDate(weekDays[6])}, ${weekDays[6].getFullYear()}`
  const dayLabel = `${WEEKDAYS[anchor.getDay()]}, ${shortDate(anchor)}, ${anchor.getFullYear()}`
  const weekCount = useMemo(() => base.filter((r: any) => weekDays.some((d) => sameDay(r.start_date, d))).length, [base, weekDays])
  const dayRows = useMemo(
    () => base.filter((r: any) => sameDay(r.start_date, anchor)).sort((a: any, b: any) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0)),
    [base, dateStr]
  )

  if (sched.isLoading || years.isLoading) return <Spinner label="Loading calendar" />
  if (sched.error) return <ErrorNote error={sched.error} />

  const stepMonth = (dir: number) => {
    const i = MONTHS.indexOf(gridMonth)
    setParam('month', MONTHS[(i + dir + 12) % 12])
  }

  const stepDate = (deltaDays: number) => {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + deltaDays)
    setParam('date', toISO(d))
  }

  const sortBtn = (key: string, label: string, align?: string) => {
    const toggleSort = () => {
      if (sortKey === key) setParam('dir', sortDir === 'asc' ? 'desc' : 'asc')
      else { setParam('sort', key); setParam('dir', 'asc') }
    }
    const ariaSort = sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
    return (
      <th className={align} style={{ cursor: 'pointer', userSelect: 'none' }}
        role="button" tabIndex={0} aria-sort={ariaSort as any}
        onClick={toggleSort}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort() } }}>
        {label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

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
          <p>{cal === 'grid' ? `${gridMonth} ${year}` : cal === 'week' ? `Week of ${weekLabel}` : cal === 'day' ? dayLabel : month === 'all' ? `All ${year} sessions` : `${month} ${year}`}. The roster of trainings. Click a session to open it.</p>
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
          <button className={`seg-btn ${cal === 'week' ? 'on' : ''}`} onClick={() => setParam('cal', 'week')}>Week</button>
          <button className={`seg-btn ${cal === 'day' ? 'on' : ''}`} onClick={() => setParam('cal', 'day')}>Day</button>
          <button className={`seg-btn ${cal === 'list' ? 'on' : ''}`} onClick={() => setParam('cal', 'list')}>List</button>
        </div>
        {cal === 'week' || cal === 'day' ? (
          <div className="toolbar" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => stepDate(cal === 'week' ? -7 : -1)} title={cal === 'week' ? 'Previous week' : 'Previous day'}>‹</button>
            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 150, textAlign: 'center' }}>{cal === 'week' ? weekLabel : dayLabel}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => stepDate(cal === 'week' ? 7 : 1)} title={cal === 'week' ? 'Next week' : 'Next day'}>›</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setParam('date', toISO(new Date()))}>Today</button>
          </div>
        ) : (
          <div className="toolbar" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => stepMonth(-1)} title="Previous month">‹</button>
            <select value={cal === 'grid' ? gridMonth : month} onChange={(e) => setParam('month', e.target.value)}>
              {cal === 'list' && <option value="all">All months</option>}
              {MONTHS.map((m) => (<option key={m}>{m}</option>))}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => stepMonth(1)} title="Next month">›</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setParam('month', CURRENT_MONTH)}>Today</button>
          </div>
        )}
        <input placeholder="Search course…" aria-label="Search sessions by course name" value={q} onChange={(e) => setParam('q', e.target.value)} style={{ minWidth: 160 }} />
        <select value={year} aria-label="Filter by year" onChange={(e) => setParam('year', e.target.value)}>
          {/* Degrade quietly if the year list fails to load — keep the current year selectable. */}
          {(years.data?.length ? years.data : [{ year_id: year, year }]).map((y: any) => (<option key={y.year_id} value={y.year}>{y.year}</option>))}
        </select>
        <select value={status} aria-label="Filter by status" onChange={(e) => setParam('status', e.target.value)}>
          <option value="all">All statuses</option>
          {['Tentative', 'Confirmed', 'Running', 'Completed', 'Cancelled'].map((s) => (<option key={s}>{s}</option>))}
        </select>
        <select value={category} aria-label="Filter by category" onChange={(e) => setParam('category', e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c: any) => (<option key={c}>{c}</option>))}
        </select>
        <select value={ltype} aria-label="Filter by learning type" onChange={(e) => setParam('lt', e.target.value)}>
          <option value="all">All learning types</option>
          {LEARNING_TYPES.map((m) => (<option key={m} value={m}>{lt(m)}</option>))}
        </select>
      </div>

      {cal === 'grid' && (
        <>
          <MonthGrid year={year} monthName={gridMonth} sessions={base} onOpen={setDrawer} healthMap={healthMap} />
          {gridCount === 0 && (
            <div className="card" style={{ marginTop: 12 }}><div className="empty">No sessions in {gridMonth} {year}. Use the arrows or switch month.</div></div>
          )}
        </>
      )}

      {cal === 'week' && (
        <>
          <WeekGrid days={weekDays} sessions={base} onOpen={setDrawer} healthMap={healthMap} />
          {weekCount === 0 && (
            <div className="card" style={{ marginTop: 12 }}><div className="empty">No sessions this week. Use the arrows or jump to Today.</div></div>
          )}
        </>
      )}

      {cal === 'day' && (
        dayRows.length > 0 ? (
          <div className="card cal-card">
            <table className="cal-table">{head}<tbody><SessionRows rows={dayRows} pax={pax.data} onOpen={setDrawer} canEdit={canEdit} canSell={canSell} healthMap={healthMap} /></tbody></table>
          </div>
        ) : (
          <div className="card"><div className="empty">No sessions on {dayLabel}. Use the arrows or jump to Today.</div></div>
        )
      )}

      {cal === 'list' && (
        <>
          {perscert.length > 0 && (
            <>
              <h3 style={{ margin: '4px 0 8px' }}>PersCert ({perscert.length})</h3>
              <div className="card cal-card" style={{ marginBottom: 20 }}>
                <table className="cal-table">{head}<tbody><SessionRows rows={perscert} pax={pax.data} onOpen={setDrawer} canEdit={canEdit} canSell={canSell} healthMap={healthMap} /></tbody></table>
              </div>
            </>
          )}
          {professional.length > 0 && (
            <>
              <h3 style={{ margin: '4px 0 8px' }}>Professional Training ({professional.length})</h3>
              <div className="card cal-card">
                <table className="cal-table">{head}<tbody><SessionRows rows={professional} pax={pax.data} onOpen={setDrawer} canEdit={canEdit} canSell={canSell} healthMap={healthMap} /></tbody></table>
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

      {drawer && <SessionDrawer r={drawer} healthMap={healthMap} onClose={() => setDrawer(null)} />}
    </>
  )
}
