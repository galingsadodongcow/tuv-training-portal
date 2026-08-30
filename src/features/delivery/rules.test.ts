import { describe, expect, it } from 'vitest'
import { hasIncompleteOutcome, sessionSeatSummary } from './rules'
import type { DeliverySession, Participant } from './types'

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

  it('requires final attendance and assessment for active participants only', () => {
    expect(hasIncompleteOutcome(participant('confirmed'))).toBe(true)
    expect(hasIncompleteOutcome(participant('completed', 'present', 'passed'))).toBe(false)
    expect(hasIncompleteOutcome(participant('waitlisted'))).toBe(false)
  })
})
