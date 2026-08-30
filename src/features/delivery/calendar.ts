import type { DeliverySession, SessionStatus } from './types'

export type CalendarView = 'month' | 'week' | 'list'

export const CALENDAR_VIEWS: CalendarView[] = ['month', 'week', 'list']
export const SESSION_STATUSES: SessionStatus[] = ['scheduled', 'open', 'in_progress', 'completed', 'cancelled']
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface DateParts {
  year: number
  month: number
  day: number
}

function dateParts(dateKey: string): DateParts {
  const [year, month, day] = dateKey.split('-').map(Number)
  return { year, month, day }
}

function dateKeyFromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function utcDate(dateKey: string): Date {
  const { year, month, day } = dateParts(dateKey)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

export function isDateKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return dateKeyFromUtc(utcDate(value)) === value
}

export function currentManilaDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function addCalendarDays(dateKey: string, amount: number): string {
  const date = utcDate(dateKey)
  date.setUTCDate(date.getUTCDate() + amount)
  return dateKeyFromUtc(date)
}

export function startOfCalendarWeek(dateKey: string): string {
  const date = utcDate(dateKey)
  const daysSinceMonday = (date.getUTCDay() + 6) % 7
  return addCalendarDays(dateKey, -daysSinceMonday)
}

export function weekCalendarDays(dateKey: string): string[] {
  const start = startOfCalendarWeek(dateKey)
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index))
}

export function monthCalendarDays(dateKey: string): string[] {
  const { year, month } = dateParts(dateKey)
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
  const start = startOfCalendarWeek(firstDay)
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(start, index))
}

export function moveCalendarAnchor(dateKey: string, view: CalendarView, amount: number): string {
  if (view === 'week') return addCalendarDays(dateKey, amount * 7)

  const { year, month, day } = dateParts(dateKey)
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + amount, 1, 12))
  const targetYear = firstOfTarget.getUTCFullYear()
  const targetMonth = firstOfTarget.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0, 12)).getUTCDate()
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export function sessionDateKey(session: Pick<DeliverySession, 'starts_at'>): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(session.starts_at))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function formatCalendarDay(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', ...options }).format(utcDate(dateKey))
}

export function calendarPeriodLabel(dateKey: string, view: CalendarView): string {
  if (view !== 'week') return formatCalendarDay(dateKey, { month: 'long', year: 'numeric' })
  const days = weekCalendarDays(dateKey)
  const start = formatCalendarDay(days[0], { month: 'short', day: 'numeric' })
  const end = formatCalendarDay(days[6], { month: 'short', day: 'numeric', year: 'numeric' })
  return `${start} – ${end}`
}

export function isDateInAnchorMonth(dateKey: string, anchorDate: string): boolean {
  return dateKey.slice(0, 7) === anchorDate.slice(0, 7)
}
