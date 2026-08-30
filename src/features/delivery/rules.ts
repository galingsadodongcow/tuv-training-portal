import type { DeliverySession, Participant } from './types'

export const ACTIVE_SEAT_STATUSES = ['registered', 'confirmed'] as const

export function displaySessionNumber(value: number): string {
  return `SES-${String(value).padStart(5, '0')}`
}

export function displayParticipantNumber(value: number): string {
  return `P-${String(value).padStart(5, '0')}`
}

export function sessionSeatSummary(session: DeliverySession, participants: Participant[]) {
  const roster = participants.filter((item) => item.session_id === session.id)
  const occupied = roster.filter((item) => ACTIVE_SEAT_STATUSES.includes(item.status as (typeof ACTIVE_SEAT_STATUSES)[number])).length
  const waitlisted = roster.filter((item) => item.status === 'waitlisted').length
  return { occupied, waitlisted, available: Math.max(0, session.capacity - occupied) }
}

export function hasIncompleteOutcome(participant: Participant): boolean {
  return !['waitlisted', 'cancelled', 'transferred'].includes(participant.status)
    && (participant.attendance_status === 'pending' || participant.assessment_status === 'pending')
}

export function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
  }).format(new Date(value))
}

export function formatSessionTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
