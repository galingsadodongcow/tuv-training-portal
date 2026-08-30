import { describe, expect, it } from 'vitest'
import type { DeliveryWorkspace } from '@/features/delivery/types'
import type { CommercialWorkspace } from '@/features/sales/types'
import { buildManagementReport, buildSimulationReport } from './derive'

const commercial = {
  customers: [{ id: 'customer-1', name: 'Sample Customer' }],
  contacts: [],
  inquiries: [
    { id: 'inquiry-1', customer_id: 'customer-1', course_id: 'course-1', status: 'won', created_at: '2026-08-01T00:00:00Z' },
    { id: 'inquiry-2', customer_id: 'customer-1', course_id: 'course-1', status: 'lost', created_at: '2026-08-02T00:00:00Z' },
  ],
  quotations: [],
  quotationLines: [],
  orders: [{ id: 'order-1', customer_id: 'customer-1', status: 'fulfillment', created_at: '2026-08-03T00:00:00Z' }],
  orderLines: [{ id: 'line-1', order_id: 'order-1', course_id: 'course-1', participant_count: 2, unit_price: 10_000, currency: 'PHP' }],
  profiles: [],
  courses: [{ id: 'course-1', code: 'SAFE-101', title: 'Safety' }],
  prices: [],
} as unknown as CommercialWorkspace

const delivery = {
  sessions: [{ id: 'session-1', session_number: 1, order_id: 'order-1', course_id: 'course-1', trainer_id: 'trainer-1', venue_id: 'venue-1', status: 'open', starts_at: '2026-09-07T01:00:00Z', ends_at: '2026-09-07T09:00:00Z', capacity: 2 }],
  participants: [
    { id: 'participant-1', session_id: 'session-1', status: 'completed', attendance_status: 'present', assessment_status: 'passed', certificate_status: 'issued' },
    { id: 'participant-2', session_id: 'session-1', status: 'waitlisted', attendance_status: 'pending', assessment_status: 'pending', certificate_status: 'not_eligible' },
  ],
  orders: [{ id: 'order-1', customer_id: 'customer-1' }],
  orderLines: [],
  courses: [{ id: 'course-1', code: 'SAFE-101', title: 'Safety', duration_minutes: 480, default_capacity: 20 }],
  trainers: [{ id: 'trainer-1', name: 'Trainer One', is_active: true }],
  trainerCourses: [],
  venues: [{ id: 'venue-1', name: 'Room One', venue_type: 'physical', capacity: 20, address: null, is_active: true }],
  customers: [{ id: 'customer-1', name: 'Sample Customer' }],
  profiles: [],
} as unknown as DeliveryWorkspace

const filters = { from: '', to: '', customerId: '', courseId: '', trainerId: '', venueId: '', currency: 'PHP' }

describe('management reporting', () => {
  it('reconciles committed value, utilization, outcomes, and conversion', () => {
    const report = buildManagementReport(commercial, delivery, filters)
    expect(report.metrics.map((metric) => metric.value)).toEqual([20_000, 1, 1, 0.5, 1, 0.5])
    expect(report.monthlyDelivery).toEqual([{ key: '2026-09', label: 'Sep 26', sessions: 1, enrolled: 1, capacity: 2 }])
    expect(report.courses[0]).toMatchObject({ enrolled: 1, capacity: 2, completedOutcomes: 1, certificates: 1 })
    expect(report.followUps[0]).toMatchObject({ waitlisted: 1, pendingOutcomes: 0 })
  })

  it('applies date and dimension filters consistently', () => {
    expect(buildManagementReport(commercial, delivery, { ...filters, from: '2026-10-01' }).sourceCounts).toEqual({ inquiries: 0, orders: 0, sessions: 0, participants: 0 })
    expect(buildManagementReport(commercial, delivery, { ...filters, trainerId: 'another-trainer' }).sourceCounts.sessions).toBe(0)
  })

  it('keeps the simulation explicitly isolated from live calculations', () => {
    const report = buildSimulationReport()
    expect(report.mode).toBe('simulation')
    expect(report.monthlyDelivery).toHaveLength(6)
    expect(report.sourceCounts.sessions).toBe(26)
  })
})
