import { createClient } from '@/lib/supabase/server'
import type { DeliveryWorkspace } from './types'

export async function getDeliveryWorkspace(): Promise<DeliveryWorkspace> {
  const supabase = await createClient()
  const results = await Promise.all([
    supabase.from('sessions').select('id, session_number, order_id, order_line_id, course_id, learning_type, trainer_id, venue_id, operations_owner_id, status, starts_at, ends_at, timezone, capacity, notes, cancellation_reason, created_at').order('starts_at'),
    supabase.rpc('list_participants'),
    supabase.from('orders').select('id, order_number, customer_id, sales_owner_id, operations_owner_id, status, requested_start_date').order('order_number'),
    supabase.from('order_lines').select('id, order_id, course_id, learning_type, participant_count'),
    supabase.from('courses').select('id, code, title, duration_minutes, default_capacity').order('title'),
    supabase.from('trainers').select('id, name, is_active').eq('is_active', true).order('name'),
    supabase.from('trainer_courses').select('trainer_id, course_id, qualified_until, is_active').eq('is_active', true),
    supabase.from('venues').select('id, name, venue_type, capacity, address, is_active').eq('is_active', true).order('name'),
    supabase.from('customers').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  const failed = results.find((result) => result.error)
  if (failed?.error) throw new Error('Training delivery data could not be loaded.')

  return {
    sessions: (results[0].data ?? []) as DeliveryWorkspace['sessions'],
    participants: (results[1].data ?? []) as DeliveryWorkspace['participants'],
    orders: (results[2].data ?? []) as DeliveryWorkspace['orders'],
    orderLines: (results[3].data ?? []) as DeliveryWorkspace['orderLines'],
    courses: (results[4].data ?? []) as DeliveryWorkspace['courses'],
    trainers: (results[5].data ?? []) as DeliveryWorkspace['trainers'],
    trainerCourses: (results[6].data ?? []) as DeliveryWorkspace['trainerCourses'],
    venues: (results[7].data ?? []) as DeliveryWorkspace['venues'],
    customers: (results[8].data ?? []) as DeliveryWorkspace['customers'],
    profiles: (results[9].data ?? []) as DeliveryWorkspace['profiles'],
  }
}
