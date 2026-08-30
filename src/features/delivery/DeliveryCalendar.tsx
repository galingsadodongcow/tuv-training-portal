import Link from 'next/link'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  CALENDAR_VIEWS,
  SESSION_STATUSES,
  WEEKDAY_LABELS,
  calendarPeriodLabel,
  formatCalendarDay,
  isDateInAnchorMonth,
  monthCalendarDays,
  moveCalendarAnchor,
  sessionDateKey,
  weekCalendarDays,
  type CalendarView,
} from './calendar'
import { displaySessionNumber, formatSessionTime, sessionSeatSummary } from './rules'
import type { DeliveryWorkspace, DeliverySession, SessionStatus } from './types'

export interface CalendarFilters {
  trainerId: string
  venueId: string
  status: SessionStatus | ''
}

interface DeliveryCalendarProps {
  workspace: DeliveryWorkspace
  sessions: DeliverySession[]
  view: CalendarView
  anchorDate: string
  today: string
  filters: CalendarFilters
}

function calendarHref(view: CalendarView, date: string, filters: CalendarFilters): string {
  const params = new URLSearchParams({ view, date })
  if (filters.trainerId) params.set('trainer', filters.trainerId)
  if (filters.venueId) params.set('venue', filters.venueId)
  if (filters.status) params.set('status', filters.status)
  return `/training?${params.toString()}`
}

function capacitySignal(session: DeliverySession, workspace: DeliveryWorkspace): 'open' | 'full' | 'waitlist' {
  const seats = sessionSeatSummary(session, workspace.participants)
  if (seats.waitlisted) return 'waitlist'
  if (seats.available === 0) return 'full'
  return 'open'
}

function CalendarEvent({ session, workspace, compact = false }: { session: DeliverySession; workspace: DeliveryWorkspace; compact?: boolean }) {
  const course = workspace.courses.find((item) => item.id === session.course_id)
  const seats = sessionSeatSummary(session, workspace.participants)
  const signal = capacitySignal(session, workspace)
  return (
    <Link
      className={`calendar-event calendar-event-${signal}${compact ? ' calendar-event-compact' : ''}`}
      href={`/training/sessions/${session.id}`}
      title={`${displaySessionNumber(session.session_number)} · ${course?.title ?? 'Course unavailable'} · ${seats.occupied}/${session.capacity} seats`}
    >
      <span className="calendar-event-time">{formatSessionTime(session.starts_at)}</span>
      <strong>{course?.code ?? 'Course'}</strong>
      {!compact ? <span>{seats.occupied}/{session.capacity} seats</span> : null}
    </Link>
  )
}

function MonthView({ workspace, sessions, anchorDate, today }: Omit<DeliveryCalendarProps, 'view' | 'filters'>) {
  const days = monthCalendarDays(anchorDate)
  const sessionsByDay = new Map(days.map((day) => [day, sessions.filter((session) => sessionDateKey(session) === day)]))
  return (
    <div className="calendar-scroll" tabIndex={0} aria-label="Monthly training calendar">
      <div className="month-calendar">
        <div className="calendar-weekdays" aria-hidden="true">{WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-month-grid">
          {days.map((day) => {
            const daySessions = sessionsByDay.get(day) ?? []
            const isToday = day === today
            return (
              <div className={`calendar-day${isDateInAnchorMonth(day, anchorDate) ? '' : ' calendar-day-muted'}${isToday ? ' calendar-day-today' : ''}`} key={day}>
                <div className="calendar-day-header">
                  <span className={isToday ? 'calendar-today-number' : ''}>{formatCalendarDay(day, { day: 'numeric' })}</span>
                  {daySessions.length ? <span>{daySessions.length}</span> : null}
                </div>
                <div className="calendar-events">
                  {daySessions.slice(0, 3).map((session) => <CalendarEvent session={session} workspace={workspace} compact key={session.id} />)}
                  {daySessions.length > 3 ? <span className="calendar-more">+{daySessions.length - 3} more</span> : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeekView({ workspace, sessions, anchorDate, today }: Omit<DeliveryCalendarProps, 'view' | 'filters'>) {
  const days = weekCalendarDays(anchorDate)
  return (
    <div className="calendar-scroll" tabIndex={0} aria-label="Weekly training calendar">
      <div className="calendar-week-grid">
        {days.map((day) => {
          const daySessions = sessions.filter((session) => sessionDateKey(session) === day)
          return (
            <section className={`calendar-week-day${day === today ? ' calendar-day-today' : ''}`} key={day}>
              <header><span>{formatCalendarDay(day, { weekday: 'short' })}</span><strong className={day === today ? 'calendar-today-number' : ''}>{formatCalendarDay(day, { day: 'numeric' })}</strong></header>
              <div className="calendar-week-events">
                {daySessions.length ? daySessions.map((session) => <CalendarEvent session={session} workspace={workspace} key={session.id} />) : <span className="calendar-no-session">No sessions</span>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ListView({ workspace, sessions, anchorDate }: Omit<DeliveryCalendarProps, 'view' | 'today' | 'filters'>) {
  const monthSessions = sessions.filter((session) => isDateInAnchorMonth(sessionDateKey(session), anchorDate))
  const groups = Array.from(new Set(monthSessions.map(sessionDateKey))).sort()
  if (!groups.length) return <EmptyState>No sessions match these filters in this month.</EmptyState>

  return (
    <div className="calendar-list">
      {groups.map((day) => (
        <section className="calendar-list-group" key={day}>
          <div className="calendar-list-date"><strong>{formatCalendarDay(day, { weekday: 'long' })}</strong><span>{formatCalendarDay(day, { month: 'short', day: 'numeric' })}</span></div>
          <div className="calendar-list-sessions">
            {monthSessions.filter((session) => sessionDateKey(session) === day).map((session) => {
              const course = workspace.courses.find((item) => item.id === session.course_id)
              const trainer = workspace.trainers.find((item) => item.id === session.trainer_id)
              const venue = workspace.venues.find((item) => item.id === session.venue_id)
              const seats = sessionSeatSummary(session, workspace.participants)
              return (
                <Link className={`calendar-list-session calendar-event-${capacitySignal(session, workspace)}`} href={`/training/sessions/${session.id}`} key={session.id}>
                  <div><span className="code">{displaySessionNumber(session.session_number)}</span><strong>{course?.title ?? 'Course unavailable'}</strong><span>{formatSessionTime(session.starts_at)}–{formatSessionTime(session.ends_at)} · {trainer?.name} · {venue?.name}</span></div>
                  <div className="calendar-list-meta"><span className={`workflow-status status-${session.status}`}>{session.status.replaceAll('_', ' ')}</span><span>{seats.occupied}/{session.capacity} seats{seats.waitlisted ? ` · ${seats.waitlisted} waiting` : ''}</span></div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function DeliveryCalendar({ workspace, sessions, view, anchorDate, today, filters }: DeliveryCalendarProps) {
  const previousDate = moveCalendarAnchor(anchorDate, view, -1)
  const nextDate = moveCalendarAnchor(anchorDate, view, 1)
  const visibleCount = view === 'week'
    ? sessions.filter((session) => weekCalendarDays(anchorDate).includes(sessionDateKey(session))).length
    : sessions.filter((session) => isDateInAnchorMonth(sessionDateKey(session), anchorDate)).length

  return (
    <>
      <form className="calendar-filters" method="get">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={anchorDate} />
        <label className="field"><span>Trainer</span><select name="trainer" defaultValue={filters.trainerId}><option value="">All trainers</option>{workspace.trainers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Venue</span><select name="venue" defaultValue={filters.venueId}><option value="">All venues</option>{workspace.venues.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Status</span><select name="status" defaultValue={filters.status}><option value="">All statuses</option>{SESSION_STATUSES.map((status) => <option value={status} key={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
        <button className="button button-secondary" type="submit">Apply filters</button>
        <Link className="button button-quiet" href={calendarHref(view, anchorDate, { trainerId: '', venueId: '', status: '' })}>Clear</Link>
      </form>

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <Link className="button button-quiet" href={calendarHref(view, previousDate, filters)} aria-label="Previous period">←</Link>
          <Link className="button button-quiet" href={calendarHref(view, today, filters)}>Today</Link>
          <Link className="button button-quiet" href={calendarHref(view, nextDate, filters)} aria-label="Next period">→</Link>
        </div>
        <div className="calendar-period"><strong>{calendarPeriodLabel(anchorDate, view)}</strong><span>{visibleCount} session{visibleCount === 1 ? '' : 's'}</span></div>
        <nav className="calendar-view-switch" aria-label="Calendar view">
          {CALENDAR_VIEWS.map((item) => <Link className={item === view ? 'active' : ''} href={calendarHref(item, anchorDate, filters)} key={item} aria-current={item === view ? 'page' : undefined}>{item}</Link>)}
        </nav>
      </div>

      <div className="calendar-legend" aria-label="Capacity legend"><span><i className="legend-open" />Seats available</span><span><i className="legend-full" />Full</span><span><i className="legend-waitlist" />Waitlist</span></div>

      {sessions.length === 0 ? <EmptyState>No sessions match these filters.</EmptyState> : null}
      {sessions.length > 0 && view === 'month' ? <MonthView workspace={workspace} sessions={sessions} anchorDate={anchorDate} today={today} /> : null}
      {sessions.length > 0 && view === 'week' ? <WeekView workspace={workspace} sessions={sessions} anchorDate={anchorDate} today={today} /> : null}
      {sessions.length > 0 && view === 'list' ? <ListView workspace={workspace} sessions={sessions} anchorDate={anchorDate} /> : null}
    </>
  )
}
