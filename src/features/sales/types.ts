export type InquiryStatus = 'new' | 'qualified' | 'quoted' | 'won' | 'lost'
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected'
export type OrderStatus = 'draft' | 'pending_operations' | 'returned' | 'with_operations' | 'fulfillment' | 'completed' | 'cancelled'
export type LearningType = 'classroom' | 'virtual' | 'onsite'
export type DeliveryIntent = 'existing_session' | 'private_session' | 'operations_to_assign'

export interface Customer {
  id: string
  name: string
  email_domain: string | null
  industry: string | null
  address: string | null
  status: 'active' | 'archived'
}

export interface Contact {
  id: string
  customer_id: string
  full_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  is_active: boolean
}

export interface Inquiry {
  id: string
  inquiry_number: number
  customer_id: string
  contact_id: string | null
  course_id: string | null
  owner_id: string
  status: InquiryStatus
  requirement_summary: string
  participant_estimate: number | null
  next_action: string | null
  follow_up_on: string | null
  created_at: string
}

export interface Quotation {
  id: string
  quotation_number: number
  inquiry_id: string
  customer_id: string
  contact_id: string | null
  owner_id: string
  status: QuotationStatus
  discount_percent: number
  approval_status: ApprovalStatus
  approved_by: string | null
  approved_at: string | null
  issued_at: string | null
  valid_until: string | null
  created_at: string
}

export interface QuotationLine {
  id: string
  quotation_id: string
  course_id: string
  learning_type: LearningType
  participant_count: number
  unit_price: number
  currency: string
  delivery_intent: DeliveryIntent
  session_id: string | null
}

export interface SalesOrder {
  id: string
  order_number: number
  quotation_id: string | null
  inquiry_id: string
  customer_id: string
  contact_id: string | null
  sales_owner_id: string
  operations_owner_id: string | null
  operations_target_id: string | null
  status: OrderStatus
  requested_start_date: string | null
  delivery_notes: string | null
  operations_note: string | null
  handoff_sent_at: string | null
  reviewed_at: string | null
  created_at: string
}

export interface OrderLine {
  id: string
  order_id: string
  course_id: string
  learning_type: LearningType
  participant_count: number
  unit_price: number
  currency: string
  delivery_intent: DeliveryIntent
  session_id: string | null
}

export interface PublicSessionOption {
  id: string
  session_number: number
  course_id: string
  learning_type: LearningType
  starts_at: string
  capacity: number
  minimum_participants: number
  status: string
  offering_type: 'public' | 'private' | 'internal'
  publication_status: 'draft' | 'published' | 'closed'
}

export interface CommercialReservation {
  id: string
  session_id: string
  order_line_id: string
  requested_seats: number
  confirmed_seats: number
  waitlisted_seats: number
  status: 'confirmed' | 'partial' | 'waitlisted' | 'released'
}

export interface CommercialProfile {
  id: string
  full_name: string
  role: string
  is_sales_supervisor: boolean
}

export interface CourseOption {
  id: string
  code: string
  title: string
}

export interface PriceOption {
  course_id: string
  learning_type: LearningType
  amount: number
  currency: string
}

export interface CommercialWorkspace {
  customers: Customer[]
  contacts: Contact[]
  inquiries: Inquiry[]
  quotations: Quotation[]
  quotationLines: QuotationLine[]
  orders: SalesOrder[]
  orderLines: OrderLine[]
  profiles: CommercialProfile[]
  courses: CourseOption[]
  prices: PriceOption[]
  sessions: PublicSessionOption[]
  reservations: CommercialReservation[]
}
