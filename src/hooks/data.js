import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const sel = async (q) => {
  const { data, error } = await q
  if (error) throw error
  return data
}

export function useSchedules(year = 2026) {
  return useQuery({
    queryKey: ['schedules', year],
    queryFn: () =>
      sel(
        supabase
          .from('schedule')
          .select(
            'schedule_id, course_id, month, start_date, end_date, modality, private_run, price, forecast_revenue, forecast_participants, min_participants, booked_participants, status, go_status, actual_participants, actual_revenue, sales_owner, course:course_id(course_name, training_type, category, url), calendar_year:year_id(year)'
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

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: () =>
      sel(supabase.from('course').select('course_id, course_name, training_type, category, url').eq('active', true).order('course_name')),
  })
}

export function useCourseFees() {
  return useQuery({
    queryKey: ['course_fees'],
    queryFn: () => sel(supabase.from('course_fee').select('course_id, modality, fee_php')),
  })
}

export function useActiveYear() {
  return useQuery({
    queryKey: ['active_year'],
    queryFn: () => sel(supabase.from('calendar_year').select('*').eq('status', 'Active').order('year')),
  })
}

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () =>
      sel(
        supabase
          .from('orders')
          .select(
            'order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, went_live, access_status, schedule_id, course_id, client:client_id(name, company, email), course:course_id(course_name), assignment:order_assignment(sales_id, engagement_status, collection_status, salesperson:sales_id(name, code))'
          )
          .order('order_date', { ascending: false })
          .limit(1000)
      ),
  })
}

export function useSalespeople() {
  return useQuery({
    queryKey: ['salespeople'],
    queryFn: () =>
      sel(supabase.from('salesperson').select('sales_id, name, code, is_supervisor, active').eq('active', true)),
  })
}

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

export function useDuplicates() {
  return useQuery({
    queryKey: ['duplicates'],
    queryFn: () => sel(supabase.from('duplicate_candidate').select('*').eq('status', 'Open')),
  })
}

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

export function useYears() {
  return useQuery({
    queryKey: ['years'],
    queryFn: () => sel(supabase.from('calendar_year').select('*').order('year', { ascending: false })),
  })
}

export function useSessionNotes(scheduleId) {
  return useQuery({
    queryKey: ['notes', scheduleId],
    enabled: !!scheduleId,
    queryFn: () =>
      sel(
        supabase
          .from('session_note')
          .select('note_id, note, date, author, profile:author(full_name, role)')
          .eq('schedule_id', scheduleId)
          .order('date', { ascending: false })
      ),
  })
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: () =>
      sel(
        supabase
          .from('client')
          .select('client_id, name, company, contact, email, phone, industry, owner_sales_id, salesperson:owner_sales_id(name, code)')
          .order('company')
          .limit(1000)
      ),
  })
}

export function useAttribution() {
  return useQuery({
    queryKey: ['attribution'],
    queryFn: () =>
      sel(
        supabase
          .from('attribution')
          .select('attribution_id, clients_brought, date_recorded, sales_id, schedule_id, salesperson:sales_id(name, code), schedule:schedule_id(start_date, course:course_id(course_name))')
          .order('date_recorded', { ascending: false })
      ),
  })
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (keys) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}
