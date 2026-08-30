import { describe, expect, it } from 'vitest'
import { monthCalendarDays, moveCalendarAnchor, sessionDateKey, weekCalendarDays } from './calendar'
import { hasIncompleteOutcome, sessionSeatSummary } from './rules'
import type { DeliverySession, Participant, SessionReservation } from './types'

const session = { id: 's1', capacity: 2 } as DeliverySession
const participant = (status: Participant['status'], attendance_status: Participant['attendance_status'] = 'pending', assessment_status: Participant['assessment_status'] = 'pending') => ({
  session_id: 's1', status, attendance_status, assessment_status,
}) as Participant

describe('delivery rules', () => {
  it('counts active seats without treating waitlisted records as occupied', () => {
    expect(sessionSeatSummary(session, [participant('confirmed'), participant('registered'), participant('waitlisted')])).toEqual({
      occupied: 2,
      waitlisted: 1,
      available: 0,
    })
  })

  it('does not double-count named participants already covered by a commercial reservation', () => {
    const allocated = { ...participant('confirmed'), order_line_id: 'line-1' } as Participant
    const reservation = {
      session_id: 's1',
      order_line_id: 'line-1',
      confirmed_seats: 2,
      waitlisted_seats: 1,
      status: 'partial',
    } as SessionReservation

    expect(sessionSeatSummary({ ...session, capacity: 5 }, [allocated], [reservation])).toEqual({
      occupied: 2,
      waitlisted: 1,
      available: 3,
    })
  })

  it('requires final attendance and assessment for active participants only', () => {
    expect(hasIncompleteOutcome(participant('confirmed'))).toBe(true)
    expect(hasIncompleteOutcome(participant('completed', 'present', 'passed'))).toBe(false)
    expect(hasIncompleteOutcome(participant('waitlisted'))).toBe(false)
  })

  it('builds a stable Monday-first six-week month grid', () => {
    const days = monthCalendarDays('2026-09-15')
    expect(days).toHaveLength(42)
    expect(days[0]).toBe('2026-08-31')
    expect(days[41]).toBe('2026-10-11')
  })

  it('builds Monday-first weeks and moves between periods', () => {
    expect(weekCalendarDays('2026-09-09')).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ])
    expect(moveCalendarAnchor('2026-01-31', 'month', 1)).toBe('2026-02-28')
    expect(moveCalendarAnchor('2026-09-09', 'week', -1)).toBe('2026-09-02')
  })

  it('places sessions on their Asia/Manila calendar date', () => {
    expect(sessionDateKey({ starts_at: '2026-09-07T16:30:00.000Z' })).toBe('2026-09-08')
  })
})
