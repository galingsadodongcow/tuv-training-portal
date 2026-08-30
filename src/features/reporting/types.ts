import type { SessionStatus } from '@/features/delivery/types'

export type ReportingMode = 'live' | 'simulation'

export interface ReportingFilters {
  from: string
  to: string
  customerId: string
  courseId: string
  trainerId: string
  venueId: string
  currency: string
}

export interface ReportMetric {
  label: string
  value: number | string
  detail: string
  format: 'number' | 'percent' | 'currency'
}

export interface MonthlyDeliveryPoint {
  key: string
  label: string
  sessions: number
  enrolled: number
  capacity: number
}

export interface PipelinePoint {
  key: string
  label: string
  count: number
  value: number
}

export interface OutcomePoint {
  key: string
  label: string
  count: number
}

export interface CoursePerformanceRow {
  id: string
  code: string
  title: string
  sessions: number
  enrolled: number
  capacity: number
  utilization: number | null
  completedOutcomes: number
  certificates: number
}

export interface TrainerPerformanceRow {
  id: string
  name: string
  sessions: number
  deliveryHours: number
  enrolled: number
  waitlisted: number
}

export interface DeliveryFollowUp {
  id: string
  sessionNumber: number
  course: string
  startsAt: string
  status: SessionStatus
  enrolled: number
  capacity: number
  waitlisted: number
  pendingOutcomes: number
}

export interface ManagementReport {
  mode: ReportingMode
  currency: string
  availableCurrencies: string[]
  metrics: ReportMetric[]
  monthlyDelivery: MonthlyDeliveryPoint[]
  pipeline: PipelinePoint[]
  outcomes: OutcomePoint[]
  courses: CoursePerformanceRow[]
  trainers: TrainerPerformanceRow[]
  followUps: DeliveryFollowUp[]
  sourceCounts: {
    inquiries: number
    orders: number
    sessions: number
    participants: number
  }
}
