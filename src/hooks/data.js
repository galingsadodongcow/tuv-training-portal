import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const sel = async (q) => {
  const { data, error } = await q
  if (error) throw error
  return data
}

// ---- Schedules with course + channel pax ----
export function useSchedules(year = 2026) {
  return useQuery({
    queryKey: ['schedules', year],
    queryFn: () =>
      sel(
        supabase
          .from('schedule')
          .select(
            'schedule_id, month, start_date, end_date, modality, private_run, price, forecast_revenue, min_participants, booked_participants, status, go_status, actual_participants, actual_revenue, sales_owner, course:course_id(course_name, training_type, category), calendar_year:year_id(year)'
          )
          .order('start_date', { ascending: true })
      ).then((rows) => rows.filter((r) => r.calendar_year?.year === year)),
  })
}

export function useChannelPax() {
  return useQuery({
    queryKey: ['channel_pax'],
    queryFn: () => sel(supabase.from('v_schedule_channel_pax').select('*')),
    select: (rows) => {
      const map = {}
      for (const r of rows) {
        map[r.schedule_id] = map[r.schedule_id] || {}
        map[r.schedule_id][r.channel] = r.pax
      }
      return map
    },
  })
}

// ---- Orders ----
export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () =>
      sel(
        supabase
          .from('orders')
          .select(
            'order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, went_live, access_status, schedule_id, course_id, client:client_id(name, company, email), course:course_id(course_name)'
          )
          .order('order_date', { ascending: false })
          .limit(1000)
      ),
  })
}

// ---- Salespeople (for entry + assignment) ----
export function useSalespeople() {
  return useQuery({
    queryKey: ['salespeople'],
    queryFn: () =>
      sel(supabase.from('salesperson').select('sales_id, name, code, is_supervisor, active').eq('active', true)),
  })
}

// ---- Courses & schedules for the sales entry dropdowns ----
export function useOpenSchedules(year = 2026) {
  return useQuery({
    queryKey: ['open_schedules', year],
    queryFn: () =>
      sel(
        supabase
          .from('schedule')
          .select('schedule_id, start_date, end_date, modality, price, status, course:course_id(course_name), calendar_year:year_id(year)')
          .in('status', ['Tentative', 'Confirmed'])
          .order('start_date')
      ).then((rows) => rows.filter((r) => r.calendar_year?.year === year)),
  })
}

// ---- Duplicate queue ----
export function useDuplicates() {
  return useQuery({
    queryKey: ['duplicates'],
    queryFn: () =>
      sel(supabase.from('duplicate_candidate').select('*').eq('status', 'Open')),
  })
}

// ---- Approvals ----
export function useApprovals() {
  return useQuery({
    queryKey: ['approvals'],
    queryFn: () =>
      sel(
        supabase
          .from('approval')
          .select('*, schedule:schedule_id(start_date, course:course_id(course_name))')
          .order('created_at', { ascending: false })
      ),
  })
}

// ---- E-learning pending access ----
export function useElearningPending() {
  return useQuery({
    queryKey: ['elearning_pending'],
    queryFn: () =>
      sel(
        supabase
          .from('orders')
          .select('order_id, order_date, payment_status, access_status, client:client_id(name, company, email), course:course_id(course_name)')
          .eq('modality', 'E-learning')
          .order('order_date', { ascending: false })
      ),
  })
}

// ---- Calendar years ----
export function useYears() {
  return useQuery({
    queryKey: ['years'],
    queryFn: () => sel(supabase.from('calendar_year').select('*').order('year', { ascending: false })),
  })
}

// ---- Mutations ----
export function useMutate(invalidateKeys = []) {
  const qc = useQueryClient()
  return (fn) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
    })
}
