import { createClient } from '@/lib/supabase/server'
import type { CommercialWorkspace } from './types'

export async function getCommercialWorkspace(): Promise<CommercialWorkspace> {
  const supabase = await createClient()
  const results = await Promise.all([
    supabase.from('customers').select('id, name, email_domain, industry, address, status').order('name'),
    supabase.from('contacts').select('id, customer_id, full_name, job_title, email, phone, is_active').order('full_name'),
    supabase.from('inquiries').select('id, inquiry_number, customer_id, contact_id, course_id, owner_id, status, requirement_summary, participant_estimate, next_action, follow_up_on, created_at').order('created_at', { ascending: false }),
    supabase.from('quotations').select('id, quotation_number, inquiry_id, customer_id, contact_id, owner_id, status, discount_percent, approval_status, approved_by, approved_at, issued_at, valid_until, created_at').order('created_at', { ascending: false }),
    supabase.from('quotation_lines').select('id, quotation_id, course_id, learning_type, participant_count, unit_price, currency, delivery_intent, session_id'),
    supabase.from('orders').select('id, order_number, quotation_id, inquiry_id, customer_id, contact_id, sales_owner_id, operations_owner_id, operations_target_id, status, requested_start_date, delivery_notes, operations_note, handoff_sent_at, reviewed_at, created_at').order('created_at', { ascending: false }),
    supabase.from('order_lines').select('id, order_id, course_id, learning_type, participant_count, unit_price, currency, delivery_intent, session_id'),
    supabase.from('profiles').select('id, full_name, role, is_sales_supervisor').eq('is_active', true).order('full_name'),
    supabase.from('courses').select('id, code, title').eq('is_active', true).order('title'),
    supabase.from('course_prices').select('course_id, learning_type, amount, currency').eq('is_active', true),
    supabase.from('sessions').select('id, session_number, course_id, learning_type, starts_at, capacity, minimum_participants, status, offering_type, publication_status').order('starts_at'),
    supabase.from('session_reservations').select('id, session_id, order_line_id, requested_seats, confirmed_seats, waitlisted_seats, status'),
  ])

  const failed = results.find((result) => result.error)
  if (failed?.error) throw new Error('Commercial workspace data could not be loaded.')

  return {
    customers: (results[0].data ?? []) as CommercialWorkspace['customers'],
    contacts: (results[1].data ?? []) as CommercialWorkspace['contacts'],
    inquiries: (results[2].data ?? []) as CommercialWorkspace['inquiries'],
    quotations: (results[3].data ?? []) as CommercialWorkspace['quotations'],
    quotationLines: (results[4].data ?? []) as CommercialWorkspace['quotationLines'],
    orders: (results[5].data ?? []) as CommercialWorkspace['orders'],
    orderLines: (results[6].data ?? []) as CommercialWorkspace['orderLines'],
    profiles: (results[7].data ?? []) as CommercialWorkspace['profiles'],
    courses: (results[8].data ?? []) as CommercialWorkspace['courses'],
    prices: (results[9].data ?? []) as CommercialWorkspace['prices'],
    sessions: (results[10].data ?? []) as CommercialWorkspace['sessions'],
    reservations: (results[11].data ?? []) as CommercialWorkspace['reservations'],
  }
}
