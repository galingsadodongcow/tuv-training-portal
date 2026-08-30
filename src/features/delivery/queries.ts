import { createClient } from '@/lib/supabase/server'
import type { DeliveryWorkspace } from './types'

export async function getDeliveryWorkspace(): Promise<DeliveryWorkspace> {
  const supabase = await createClient()
  const results = await Promise.all([
    supabase.from('sessions').select('id, session_number, order_id, order_line_id, course_id, learning_type, trainer_id, venue_id, room_id, operations_owner_id, status, starts_at, ends_at, timezone, capacity, minimum_participants, offering_type, publication_status, go_status, go_decided_by, go_decided_at, go_reason, notes, cancellation_reason, created_at').order('starts_at'),
    supabase.rpc('list_participants'),
    supabase.from('orders').select('id, order_number, customer_id, sales_owner_id, operations_owner_id, operations_target_id, status, requested_start_date').order('order_number'),
    supabase.from('order_lines').select('id, order_id, course_id, learning_type, participant_count, delivery_intent, session_id'),
    supabase.from('courses').select('id, category_id, code, title, duration_minutes, default_capacity, default_min_participants').order('title'),
    supabase.from('trainers').select('id, name, is_active').eq('is_active', true).order('name'),
    supabase.from('trainer_courses').select('trainer_id, course_id, qualified_until, is_active').eq('is_active', true),
    supabase.from('venues').select('id, name, venue_type, capacity, address, is_active').eq('is_active', true).order('name'),
    supabase.from('customers').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('venue_rooms').select('id, venue_id, name, capacity, equipment, is_active').eq('is_active', true).order('name'),
    supabase.from('session_schedule_blocks').select('id, session_id, block_number, trainer_id, venue_id, room_id, starts_at, ends_at').order('starts_at'),
    supabase.from('session_reservations').select('id, session_id, order_line_id, requested_seats, confirmed_seats, waitlisted_seats, status').neq('status', 'released'),
    supabase.from('categories').select('id, parent_id, name').order('name'),
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
    rooms: (results[10].data ?? []) as DeliveryWorkspace['rooms'],
    scheduleBlocks: (results[11].data ?? []) as DeliveryWorkspace['scheduleBlocks'],
    reservations: (results[12].data ?? []) as DeliveryWorkspace['reservations'],
    categories: (results[13].data ?? []) as DeliveryWorkspace['categories'],
  }
}
