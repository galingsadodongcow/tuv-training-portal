import type { CommercialWorkspace, OrderStatus } from '@/features/sales/types'
import type { DeliverySession, DeliveryWorkspace, Participant } from '@/features/delivery/types'
import { sessionDateKey } from '../delivery/calendar'
import type {
  CoursePerformanceRow,
  ManagementReport,
  MonthlyDeliveryPoint,
  PipelinePoint,
  ReportingFilters,
  TrainerPerformanceRow,
} from './types'

const ORDER_STATUS_ORDER: OrderStatus[] = ['draft', 'pending_operations', 'returned', 'with_operations', 'fulfillment', 'completed', 'cancelled']
const ENROLLED_STATUSES = new Set(['registered', 'confirmed', 'completed', 'no_show'])
const COMMITTED_ORDER_STATUSES = new Set(['pending_operations', 'with_operations', 'fulfillment', 'completed'])

function inDateRange(value: string, from: string, to: string): boolean {
  const date = value.slice(0, 10)
  return (!from || date >= from) && (!to || date <= to)
}

function asPercent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function sessionMonthKey(session: DeliverySession): string {
  return sessionDateKey(session).slice(0, 7)
}

function monthLabel(key: string): string {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${key}-01T12:00:00Z`))
}

function participantIsEnrolled(participant: Participant): boolean {
  return ENROLLED_STATUSES.has(participant.status)
}

function participantOutcomeIsComplete(participant: Participant): boolean {
  return participantIsEnrolled(participant)
    && participant.attendance_status !== 'pending'
    && participant.assessment_status !== 'pending'
}

function orderLineValue(participantCount: number, unitPrice: number): number {
  return participantCount * unitPrice
}

function buildMonthlyDelivery(sessions: DeliverySession[], participants: Participant[]): MonthlyDeliveryPoint[] {
  const keys = Array.from(new Set(sessions.map(sessionMonthKey))).sort()
  return keys.map((key) => {
    const monthSessions = sessions.filter((session) => sessionMonthKey(session) === key && session.status !== 'cancelled')
    const sessionIds = new Set(monthSessions.map((session) => session.id))
    return {
      key,
      label: monthLabel(key),
      sessions: monthSessions.length,
      enrolled: participants.filter((participant) => sessionIds.has(participant.session_id) && participantIsEnrolled(participant)).length,
      capacity: monthSessions.reduce((total, session) => total + session.capacity, 0),
    }
  })
}

export function buildManagementReport(
  commercial: CommercialWorkspace,
  delivery: DeliveryWorkspace,
  filters: ReportingFilters,
): ManagementReport {
  const deliveryOrder = new Map(delivery.orders.map((order) => [order.id, order]))
  const commercialOrderLines = commercial.orderLines
  const orderIdsForCourse = new Set(commercialOrderLines.filter((line) => !filters.courseId || line.course_id === filters.courseId).map((line) => line.order_id))

  const sessions = delivery.sessions.filter((session) => {
    const order = session.order_id ? deliveryOrder.get(session.order_id) : undefined
    return inDateRange(sessionDateKey(session), filters.from, filters.to)
      && (!filters.customerId || order?.customer_id === filters.customerId)
      && (!filters.courseId || session.course_id === filters.courseId)
      && (!filters.trainerId || session.trainer_id === filters.trainerId)
      && (!filters.venueId || session.venue_id === filters.venueId)
  })
  const sessionIds = new Set(sessions.map((session) => session.id))
  const linkedOrderIds = new Set(sessions.map((session) => session.order_id).filter((id): id is string => Boolean(id)))
  const participants = delivery.participants.filter((participant) => sessionIds.has(participant.session_id))

  const orders = commercial.orders.filter((order) => {
    const resourceFilterMatches = (!filters.trainerId && !filters.venueId) || linkedOrderIds.has(order.id)
    return inDateRange(order.created_at, filters.from, filters.to)
      && (!filters.customerId || order.customer_id === filters.customerId)
      && (!filters.courseId || orderIdsForCourse.has(order.id))
      && resourceFilterMatches
  })
  const orderIds = new Set(orders.map((order) => order.id))
  const availableCurrencies = Array.from(new Set(commercial.orderLines.filter((line) => orderIds.has(line.order_id)).map((line) => line.currency))).sort()
  const currency = availableCurrencies.includes(filters.currency) ? filters.currency : availableCurrencies[0] ?? 'PHP'
  const orderLines = commercial.orderLines.filter((line) => orderIds.has(line.order_id) && line.currency === currency && (!filters.courseId || line.course_id === filters.courseId))
  const inquiries = commercial.inquiries.filter((inquiry) => inDateRange(inquiry.created_at, filters.from, filters.to) && (!filters.customerId || inquiry.customer_id === filters.customerId) && (!filters.courseId || inquiry.course_id === filters.courseId))

  const enrolledParticipants = participants.filter(participantIsEnrolled)
  const completedOutcomes = participants.filter(participantOutcomeIsComplete)
  const waitlisted = participants.filter((participant) => participant.status === 'waitlisted').length
  const capacity = sessions.filter((session) => session.status !== 'cancelled').reduce((total, session) => total + session.capacity, 0)
  const closedInquiries = inquiries.filter((inquiry) => ['won', 'lost'].includes(inquiry.status))
  const wonInquiries = closedInquiries.filter((inquiry) => inquiry.status === 'won').length
  const committedOrderIds = new Set(orders.filter((order) => COMMITTED_ORDER_STATUSES.has(order.status)).map((order) => order.id))
  const committedValue = orderLines.filter((line) => committedOrderIds.has(line.order_id)).reduce((total, line) => total + orderLineValue(line.participant_count, line.unit_price), 0)
  const activeSessions = sessions.filter((session) => ['scheduled', 'open', 'in_progress'].includes(session.status)).length
  const activeOrders = orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length
  const seatUtilization = asPercent(enrolledParticipants.length, capacity)
  const outcomeCompletion = asPercent(completedOutcomes.length, enrolledParticipants.length)
  const conversionRate = asPercent(wonInquiries, closedInquiries.length)

  const pipeline: PipelinePoint[] = ORDER_STATUS_ORDER.map((status) => {
    const statusOrders = orders.filter((order) => order.status === status)
    const statusOrderIds = new Set(statusOrders.map((order) => order.id))
    return {
      key: status,
      label: status.replaceAll('_', ' '),
      count: statusOrders.length,
      value: orderLines.filter((line) => statusOrderIds.has(line.order_id)).reduce((total, line) => total + orderLineValue(line.participant_count, line.unit_price), 0),
    }
  }).filter((point) => point.count > 0)

  const courses: CoursePerformanceRow[] = delivery.courses.map((course) => {
    const courseSessions = sessions.filter((session) => session.course_id === course.id && session.status !== 'cancelled')
    const courseSessionIds = new Set(courseSessions.map((session) => session.id))
    const courseParticipants = participants.filter((participant) => courseSessionIds.has(participant.session_id))
    const courseEnrolled = courseParticipants.filter(participantIsEnrolled)
    const courseCapacity = courseSessions.reduce((total, session) => total + session.capacity, 0)
    return {
      id: course.id,
      code: course.code,
      title: course.title,
      sessions: courseSessions.length,
      enrolled: courseEnrolled.length,
      capacity: courseCapacity,
      utilization: asPercent(courseEnrolled.length, courseCapacity),
      completedOutcomes: courseParticipants.filter(participantOutcomeIsComplete).length,
      certificates: courseParticipants.filter((participant) => participant.certificate_status === 'issued').length,
    }
  }).filter((row) => row.sessions > 0).sort((a, b) => b.sessions - a.sessions || b.enrolled - a.enrolled)

  const trainers: TrainerPerformanceRow[] = delivery.trainers.map((trainer) => {
    const trainerSessions = sessions.filter((session) => session.trainer_id === trainer.id && session.status !== 'cancelled')
    const trainerSessionIds = new Set(trainerSessions.map((session) => session.id))
    const trainerParticipants = participants.filter((participant) => trainerSessionIds.has(participant.session_id))
    return {
      id: trainer.id,
      name: trainer.name,
      sessions: trainerSessions.length,
      deliveryHours: trainerSessions.reduce((total, session) => total + Math.max(0, new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 3_600_000, 0),
      enrolled: trainerParticipants.filter(participantIsEnrolled).length,
      waitlisted: trainerParticipants.filter((participant) => participant.status === 'waitlisted').length,
    }
  }).filter((row) => row.sessions > 0).sort((a, b) => b.deliveryHours - a.deliveryHours)

  const courseName = new Map(delivery.courses.map((course) => [course.id, course.title]))
  const followUps = sessions.filter((session) => session.status !== 'cancelled').map((session) => {
    const roster = participants.filter((participant) => participant.session_id === session.id)
    return {
      id: session.id,
      sessionNumber: session.session_number,
      course: courseName.get(session.course_id) ?? 'Course unavailable',
      startsAt: session.starts_at,
      status: session.status,
      enrolled: roster.filter(participantIsEnrolled).length,
      capacity: session.capacity,
      waitlisted: roster.filter((participant) => participant.status === 'waitlisted').length,
      pendingOutcomes: roster.filter((participant) => participantIsEnrolled(participant) && !participantOutcomeIsComplete(participant)).length,
    }
  }).filter((item) => item.waitlisted > 0 || item.pendingOutcomes > 0 || item.enrolled >= item.capacity).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).slice(0, 10)

  return {
    mode: 'live',
    currency,
    availableCurrencies,
    metrics: [
      { label: 'Committed value', value: committedValue, detail: `${currency} · accepted and delivered orders`, format: 'currency' },
      { label: 'Active orders', value: activeOrders, detail: `${orders.length} orders in the selected scope`, format: 'number' },
      { label: 'Active sessions', value: activeSessions, detail: `${sessions.length} sessions in the selected scope`, format: 'number' },
      { label: 'Seat utilization', value: seatUtilization ?? '—', detail: `${enrolledParticipants.length} enrolled / ${capacity} seats`, format: 'percent' },
      { label: 'Outcome completion', value: outcomeCompletion ?? '—', detail: `${completedOutcomes.length} of ${enrolledParticipants.length} outcomes finalized`, format: 'percent' },
      { label: 'Inquiry conversion', value: conversionRate ?? '—', detail: `${wonInquiries} won / ${closedInquiries.length} closed inquiries`, format: 'percent' },
    ],
    monthlyDelivery: buildMonthlyDelivery(sessions, participants),
    pipeline,
    outcomes: [
      { key: 'completed', label: 'Outcomes complete', count: completedOutcomes.length },
      { key: 'pending', label: 'Outcomes pending', count: enrolledParticipants.length - completedOutcomes.length },
      { key: 'waitlisted', label: 'Waitlisted', count: waitlisted },
      { key: 'certificates', label: 'Certificates issued', count: participants.filter((participant) => participant.certificate_status === 'issued').length },
    ],
    courses,
    trainers,
    followUps,
    sourceCounts: { inquiries: inquiries.length, orders: orders.length, sessions: sessions.length, participants: participants.length },
  }
}

export function buildSimulationReport(): ManagementReport {
  return {
    mode: 'simulation',
    currency: 'PHP',
    availableCurrencies: ['PHP'],
    metrics: [
      { label: 'Committed value', value: 2_486_000, detail: 'PHP · simulated accepted and delivered orders', format: 'currency' },
      { label: 'Active orders', value: 18, detail: '32 simulated orders in scope', format: 'number' },
      { label: 'Active sessions', value: 11, detail: '26 simulated sessions in scope', format: 'number' },
      { label: 'Seat utilization', value: 0.82, detail: '318 enrolled / 386 seats', format: 'percent' },
      { label: 'Outcome completion', value: 0.88, detail: '280 of 318 outcomes finalized', format: 'percent' },
      { label: 'Inquiry conversion', value: 0.64, detail: '23 won / 36 closed inquiries', format: 'percent' },
    ],
    monthlyDelivery: [
      { key: '2026-04', label: 'Apr 26', sessions: 3, enrolled: 34, capacity: 48 },
      { key: '2026-05', label: 'May 26', sessions: 4, enrolled: 51, capacity: 62 },
      { key: '2026-06', label: 'Jun 26', sessions: 5, enrolled: 63, capacity: 72 },
      { key: '2026-07', label: 'Jul 26', sessions: 4, enrolled: 49, capacity: 58 },
      { key: '2026-08', label: 'Aug 26', sessions: 5, enrolled: 66, capacity: 78 },
      { key: '2026-09', label: 'Sep 26', sessions: 5, enrolled: 55, capacity: 68 },
    ],
    pipeline: [
      { key: 'draft', label: 'draft', count: 5, value: 310_000 },
      { key: 'pending_operations', label: 'pending operations', count: 4, value: 428_000 },
      { key: 'with_operations', label: 'with operations', count: 7, value: 790_000 },
      { key: 'fulfillment', label: 'fulfillment', count: 11, value: 1_036_000 },
      { key: 'completed', label: 'completed', count: 5, value: 660_000 },
    ],
    outcomes: [
      { key: 'completed', label: 'Outcomes complete', count: 280 },
      { key: 'pending', label: 'Outcomes pending', count: 38 },
      { key: 'waitlisted', label: 'Waitlisted', count: 14 },
      { key: 'certificates', label: 'Certificates issued', count: 244 },
    ],
    courses: [
      { id: 'sim-1', code: 'WHS-101', title: 'Workplace Safety Fundamentals', sessions: 8, enrolled: 112, capacity: 128, utilization: 0.875, completedOutcomes: 101, certificates: 93 },
      { id: 'sim-2', code: 'LDR-201', title: 'Frontline Leadership', sessions: 7, enrolled: 84, capacity: 98, utilization: 0.857, completedOutcomes: 76, certificates: 68 },
      { id: 'sim-3', code: 'QMS-110', title: 'Quality Management Essentials', sessions: 6, enrolled: 71, capacity: 90, utilization: 0.789, completedOutcomes: 61, certificates: 55 },
      { id: 'sim-4', code: 'TEC-301', title: 'Technical Trainer Certification', sessions: 5, enrolled: 51, capacity: 70, utilization: 0.729, completedOutcomes: 42, certificates: 28 },
    ],
    trainers: [
      { id: 'sim-t1', name: 'Maria Santos', sessions: 8, deliveryHours: 56, enrolled: 108, waitlisted: 6 },
      { id: 'sim-t2', name: 'Daniel Reyes', sessions: 7, deliveryHours: 49, enrolled: 86, waitlisted: 3 },
      { id: 'sim-t3', name: 'Patricia Lim', sessions: 6, deliveryHours: 42, enrolled: 72, waitlisted: 5 },
      { id: 'sim-t4', name: 'Roberto Cruz', sessions: 5, deliveryHours: 35, enrolled: 52, waitlisted: 0 },
    ],
    followUps: [
      { id: 'sim-s1', sessionNumber: 10021, course: 'Workplace Safety Fundamentals', startsAt: '2026-09-07T01:00:00Z', status: 'open', enrolled: 20, capacity: 20, waitlisted: 4, pendingOutcomes: 20 },
      { id: 'sim-s2', sessionNumber: 10022, course: 'Frontline Leadership', startsAt: '2026-09-12T01:00:00Z', status: 'scheduled', enrolled: 16, capacity: 16, waitlisted: 2, pendingOutcomes: 16 },
      { id: 'sim-s3', sessionNumber: 10018, course: 'Quality Management Essentials', startsAt: '2026-08-28T01:00:00Z', status: 'completed', enrolled: 18, capacity: 20, waitlisted: 0, pendingOutcomes: 3 },
    ],
    sourceCounts: { inquiries: 48, orders: 32, sessions: 26, participants: 332 },
  }
}
