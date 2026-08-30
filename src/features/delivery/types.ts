import type { LearningType } from '@/features/training/types'

export type SessionStatus = 'scheduled' | 'open' | 'in_progress' | 'completed' | 'cancelled'
export type ParticipantStatus = 'registered' | 'waitlisted' | 'confirmed' | 'transferred' | 'cancelled' | 'completed' | 'no_show'
export type AttendanceStatus = 'pending' | 'present' | 'partial' | 'absent'
export type AssessmentStatus = 'not_required' | 'pending' | 'passed' | 'failed'
export type CertificateStatus = 'not_eligible' | 'eligible' | 'issued' | 'revoked'

export interface DeliverySession {
  id: string
  session_number: number
  order_id: string
  order_line_id: string
  course_id: string
  learning_type: LearningType
  trainer_id: string
  venue_id: string
  operations_owner_id: string
  status: SessionStatus
  starts_at: string
  ends_at: string
  timezone: string
  capacity: number
  notes: string | null
  cancellation_reason: string | null
  created_at: string
}

export interface Participant {
  id: string
  participant_number: number
  session_id: string
  customer_id: string
  full_name: string
  email: string | null
  phone: string | null
  employee_reference: string | null
  status: ParticipantStatus
  attendance_status: AttendanceStatus
  attended_minutes: number | null
  assessment_status: AssessmentStatus
  assessment_score: number | null
  certificate_status: CertificateStatus
  certificate_number: string | null
  certificate_issued_at: string | null
  certificate_note: string | null
  created_at: string
}

export interface DeliveryOrder {
  id: string
  order_number: number
  customer_id: string
  sales_owner_id: string
  operations_owner_id: string | null
  status: string
  requested_start_date: string | null
}

export interface DeliveryOrderLine {
  id: string
  order_id: string
  course_id: string
  learning_type: LearningType
  participant_count: number
}

export interface DeliveryCourse {
  id: string
  code: string
  title: string
  duration_minutes: number
  default_capacity: number
}

export interface DeliveryTrainer {
  id: string
  name: string
  is_active: boolean
}

export interface DeliveryTrainerCourse {
  trainer_id: string
  course_id: string
  qualified_until: string | null
  is_active: boolean
}

export interface DeliveryVenue {
  id: string
  name: string
  venue_type: 'physical' | 'virtual'
  capacity: number | null
  address: string | null
  is_active: boolean
}

export interface DeliveryCustomer {
  id: string
  name: string
}

export interface DeliveryProfile {
  id: string
  full_name: string
}

export interface DeliveryWorkspace {
  sessions: DeliverySession[]
  participants: Participant[]
  orders: DeliveryOrder[]
  orderLines: DeliveryOrderLine[]
  courses: DeliveryCourse[]
  trainers: DeliveryTrainer[]
  trainerCourses: DeliveryTrainerCourse[]
  venues: DeliveryVenue[]
  customers: DeliveryCustomer[]
  profiles: DeliveryProfile[]
}
