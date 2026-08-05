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
            'schedule_id, course_id, month, start_date, end_date, date_segments, modality, private_run, price, forecast_revenue, forecast_participants, min_participants, booked_participants, status, go_status, actual_participants, actual_revenue, roster_locked, max_participants, sales_owner, trainer:trainer_id(name, code), venue:venue_id(name, capacity), course:course_id(course_name, training_type, category, url), calendar_year:year_id(year)'
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
            'order_id, order_date, channel, modality, seats, amount_php, payment_status, order_status, went_live, access_status, schedule_id, course_id, client:client_id(name, company, email), course:course_id(course_name), schedule:schedule_id(start_date, end_date, date_segments, status), assignment:order_assignment(sales_id, engagement_status, collection_status, salesperson:sales_id(name, code))'
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

// ---- Phase 1: roster, capacity, transfer ----
export function useRoster(scheduleId) {
  return useQuery({
    queryKey: ['roster', scheduleId],
    enabled: !!scheduleId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_session_roster', { p_schedule: scheduleId })
      if (error) throw error
      return data
    },
  })
}

export function useSessionOrders(scheduleId) {
  return useQuery({
    queryKey: ['session_orders', scheduleId],
    enabled: !!scheduleId,
    queryFn: () =>
      sel(
        supabase
          .from('orders')
          .select('order_id, order_date, channel, seats, amount_php, payment_status, order_status, client:client_id(name, company, email), assignment:order_assignment(salesperson:sales_id(name, code))')
          .eq('schedule_id', scheduleId)
          .order('order_date', { ascending: false })
      ),
  })
}

export function useTransferTargets(courseId, excludeScheduleId) {
  return useQuery({
    queryKey: ['transfer_targets', courseId],
    enabled: !!courseId,
    queryFn: () =>
      sel(
        supabase
          .from('schedule')
          .select('schedule_id, start_date, end_date, date_segments, modality, status, min_participants, booked_participants, max_participants, course:course_id(course_name)')
          .eq('course_id', courseId)
          .in('status', ['Tentative', 'Confirmed'])
          .order('start_date')
      ).then((rows) => rows.filter((r) => r.schedule_id !== excludeScheduleId)),
  })
}

export function useClientHistory(clientId) {
  return useQuery({
    queryKey: ['client_history', clientId],
    enabled: !!clientId,
    queryFn: () =>
      sel(
        supabase
          .from('orders')
          .select('order_id, order_date, channel, seats, amount_php, payment_status, order_status, course:course_id(course_name), schedule:schedule_id(schedule_id, start_date, end_date, date_segments, status)')
          .eq('client_id', clientId)
          .order('order_date', { ascending: false })
      ),
  })
}

// ---- Phase 2: close and cancel ----
export function useCloseCheck(scheduleId) {
  return useQuery({
    queryKey: ['close_check', scheduleId],
    enabled: !!scheduleId,
    queryFn: () => sel(supabase.from('v_session_close_check').select('*').eq('schedule_id', scheduleId).single()),
  })
}

export function useCancelReadiness(scheduleId) {
  return useQuery({
    queryKey: ['cancel_readiness', scheduleId],
    enabled: !!scheduleId,
    queryFn: () => sel(supabase.from('v_cancel_readiness').select('*').eq('schedule_id', scheduleId)),
  })
}

export function useApprovedCancellation(scheduleId) {
  return useQuery({
    queryKey: ['approved_cancel', scheduleId],
    enabled: !!scheduleId,
    queryFn: () =>
      sel(
        supabase
          .from('approval')
          .select('approval_id, decision')
          .eq('schedule_id', scheduleId)
          .eq('object_type', 'Schedule cancellation')
          .eq('decision', 'Approved')
      ),
  })
}

// ---- Phase 3: trainers, venues, conflicts ----
export function useTrainers(activeOnly = true) {
  return useQuery({
    queryKey: ['trainers', activeOnly],
    queryFn: () => {
      let q = supabase.from('trainer').select('*').order('name')
      if (activeOnly) q = q.eq('active', true)
      return sel(q)
    },
  })
}

export function useVenues(activeOnly = true) {
  return useQuery({
    queryKey: ['venues', activeOnly],
    queryFn: () => {
      let q = supabase.from('venue').select('*').order('name')
      if (activeOnly) q = q.eq('active', true)
      return sel(q)
    },
  })
}

export function useTrainerLoad() {
  return useQuery({
    queryKey: ['trainer_load'],
    queryFn: () => sel(supabase.from('v_trainer_load').select('*').order('training_days', { ascending: false })),
  })
}

export function useUnstaffed() {
  return useQuery({
    queryKey: ['unstaffed'],
    queryFn: () => sel(supabase.from('v_unstaffed_sessions').select('*').order('days_out')),
  })
}

export function useVenueCalendar() {
  return useQuery({
    queryKey: ['venue_calendar'],
    queryFn: () => sel(supabase.from('v_venue_calendar').select('*').order('start_date')),
  })
}

// live conflict preview before saving a session
export async function checkConflicts({ scheduleId, trainerId, venueId, start, end, segments }) {
  const { data, error } = await supabase.rpc('fn_find_conflicts', {
    p_schedule: scheduleId || null,
    p_trainer: trainerId || null,
    p_venue: venueId || null,
    p_start: start,
    p_end: end,
    p_segments: segments && segments.length ? segments : null,
  })
  if (error) throw error
  return data
}
