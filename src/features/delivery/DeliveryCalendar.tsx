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

interface CalendarOccurrence {
  session: DeliverySession
  starts_at: string
  ends_at: string
}

export interface CalendarFilters {
  trainerId: string
  venueId: string
  status: SessionStatus | ''
  categoryId: string
  courseId: string
  offeringType: '' | 'public' | 'private' | 'internal'
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
  if (filters.categoryId) params.set('category', filters.categoryId)
  if (filters.courseId) params.set('course', filters.courseId)
  if (filters.offeringType) params.set('offering', filters.offeringType)
  return `/training?${params.toString()}`
}

function capacitySignal(session: DeliverySession, workspace: DeliveryWorkspace): 'open' | 'full' | 'waitlist' {
  const seats = sessionSeatSummary(session, workspace.participants, workspace.reservations)
  if (seats.waitlisted) return 'waitlist'
  if (seats.available === 0) return 'full'
  return 'open'
}

function calendarOccurrences(workspace: DeliveryWorkspace, sessions: DeliverySession[]): CalendarOccurrence[] {
  return sessions.flatMap((session) => {
    const blocks = workspace.scheduleBlocks.filter((item) => item.session_id === session.id)
    return blocks.length
      ? blocks.map((block) => ({ session, starts_at: block.starts_at, ends_at: block.ends_at }))
      : [{ session, starts_at: session.starts_at, ends_at: session.ends_at }]
  }).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
}

function CalendarEvent({ occurrence, workspace, compact = false }: { occurrence: CalendarOccurrence; workspace: DeliveryWorkspace; compact?: boolean }) {
  const { session } = occurrence
  const course = workspace.courses.find((item) => item.id === session.course_id)
  const seats = sessionSeatSummary(session, workspace.participants, workspace.reservations)
  const signal = capacitySignal(session, workspace)
  return (
    <Link
      className={`calendar-event calendar-event-${signal}${compact ? ' calendar-event-compact' : ''}`}
      href={`/training/sessions/${session.id}`}
      title={`${displaySessionNumber(session.session_number)} · ${course?.title ?? 'Course unavailable'} · ${seats.occupied}/${session.capacity} seats`}
    >
      <span className="calendar-event-time">{formatSessionTime(occurrence.starts_at)}</span>
      <strong>{course?.code ?? 'Course'}</strong>
      {!compact ? <span>{seats.occupied}/{session.capacity} seats</span> : null}
    </Link>
  )
}

function MonthView({ workspace, sessions, anchorDate, today }: Omit<DeliveryCalendarProps, 'view' | 'filters'>) {
  const days = monthCalendarDays(anchorDate)
  const occurrences = calendarOccurrences(workspace, sessions)
  const occurrencesByDay = new Map(days.map((day) => [day, occurrences.filter((item) => sessionDateKey(item) === day)]))
  return (
    <div className="calendar-scroll" tabIndex={0} aria-label="Monthly training calendar">
      <div className="month-calendar">
        <div className="calendar-weekdays" aria-hidden="true">{WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-month-grid">
          {days.map((day) => {
            const dayOccurrences = occurrencesByDay.get(day) ?? []
            const isToday = day === today
            return (
              <div className={`calendar-day${isDateInAnchorMonth(day, anchorDate) ? '' : ' calendar-day-muted'}${isToday ? ' calendar-day-today' : ''}`} key={day}>
                <div className="calendar-day-header">
                  <span className={isToday ? 'calendar-today-number' : ''}>{formatCalendarDay(day, { day: 'numeric' })}</span>
                  {dayOccurrences.length ? <span>{dayOccurrences.length}</span> : null}
                </div>
                <div className="calendar-events">
                  {dayOccurrences.slice(0, 3).map((occurrence) => <CalendarEvent occurrence={occurrence} workspace={workspace} compact key={`${occurrence.session.id}-${occurrence.starts_at}`} />)}
                  {dayOccurrences.length > 3 ? <span className="calendar-more">+{dayOccurrences.length - 3} more</span> : null}
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
  const occurrences = calendarOccurrences(workspace, sessions)
  return (
    <div className="calendar-scroll" tabIndex={0} aria-label="Weekly training calendar">
      <div className="calendar-week-grid">
        {days.map((day) => {
          const dayOccurrences = occurrences.filter((item) => sessionDateKey(item) === day)
          return (
            <section className={`calendar-week-day${day === today ? ' calendar-day-today' : ''}`} key={day}>
              <header><span>{formatCalendarDay(day, { weekday: 'short' })}</span><strong className={day === today ? 'calendar-today-number' : ''}>{formatCalendarDay(day, { day: 'numeric' })}</strong></header>
              <div className="calendar-week-events">
                {dayOccurrences.length ? dayOccurrences.map((occurrence) => <CalendarEvent occurrence={occurrence} workspace={workspace} key={`${occurrence.session.id}-${occurrence.starts_at}`} />) : <span className="calendar-no-session">No sessions</span>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ListView({ workspace, sessions, anchorDate }: Omit<DeliveryCalendarProps, 'view' | 'today' | 'filters'>) {
  const monthOccurrences = calendarOccurrences(workspace, sessions).filter((item) => isDateInAnchorMonth(sessionDateKey(item), anchorDate))
  const groups = Array.from(new Set(monthOccurrences.map(sessionDateKey))).sort()
  if (!groups.length) return <EmptyState>No sessions match these filters in this month.</EmptyState>

  return (
    <div className="calendar-list">
      {groups.map((day) => (
        <section className="calendar-list-group" key={day}>
          <div className="calendar-list-date"><strong>{formatCalendarDay(day, { weekday: 'long' })}</strong><span>{formatCalendarDay(day, { month: 'short', day: 'numeric' })}</span></div>
          <div className="calendar-list-sessions">
            {monthOccurrences.filter((occurrence) => sessionDateKey(occurrence) === day).map((occurrence) => {
              const { session } = occurrence
              const course = workspace.courses.find((item) => item.id === session.course_id)
              const trainer = workspace.trainers.find((item) => item.id === session.trainer_id)
              const venue = workspace.venues.find((item) => item.id === session.venue_id)
              const seats = sessionSeatSummary(session, workspace.participants, workspace.reservations)
              return (
                <Link className={`calendar-list-session calendar-event-${capacitySignal(session, workspace)}`} href={`/training/sessions/${session.id}`} key={`${session.id}-${occurrence.starts_at}`}>
                  <div><span className="code">{displaySessionNumber(session.session_number)}</span><strong>{course?.title ?? 'Course unavailable'}</strong><span>{formatSessionTime(occurrence.starts_at)}–{formatSessionTime(occurrence.ends_at)} · {trainer?.name} · {venue?.name}</span></div>
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
  const occurrences = calendarOccurrences(workspace, sessions)
  const visibleCount = view === 'week'
    ? occurrences.filter((item) => weekCalendarDays(anchorDate).includes(sessionDateKey(item))).length
    : occurrences.filter((item) => isDateInAnchorMonth(sessionDateKey(item), anchorDate)).length

  return (
    <>
      <form className="calendar-filters" method="get">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={anchorDate} />
        <label className="field"><span>Trainer</span><select name="trainer" defaultValue={filters.trainerId}><option value="">All trainers</option>{workspace.trainers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Venue</span><select name="venue" defaultValue={filters.venueId}><option value="">All venues</option>{workspace.venues.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Status</span><select name="status" defaultValue={filters.status}><option value="">All statuses</option>{SESSION_STATUSES.map((status) => <option value={status} key={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
        <label className="field"><span>Category</span><select name="category" defaultValue={filters.categoryId}><option value="">All categories</option>{workspace.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Course</span><select name="course" defaultValue={filters.courseId}><option value="">All courses</option>{workspace.courses.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.title}</option>)}</select></label>
        <label className="field"><span>Offering</span><select name="offering" defaultValue={filters.offeringType}><option value="">All offerings</option><option value="public">Public</option><option value="private">Private</option><option value="internal">Internal</option></select></label>
        <button className="button button-secondary" type="submit">Apply filters</button>
        <Link className="button button-quiet" href={calendarHref(view, anchorDate, { trainerId: '', venueId: '', status: '', categoryId: '', courseId: '', offeringType: '' })}>Clear</Link>
      </form>

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <Link className="button button-quiet" href={calendarHref(view, previousDate, filters)} aria-label="Previous period">←</Link>
          <Link className="button button-quiet" href={calendarHref(view, today, filters)}>Today</Link>
          <Link className="button button-quiet" href={calendarHref(view, nextDate, filters)} aria-label="Next period">→</Link>
        </div>
        <div className="calendar-period"><strong>{calendarPeriodLabel(anchorDate, view)}</strong><span>{visibleCount} schedule block{visibleCount === 1 ? '' : 's'}</span></div>
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
