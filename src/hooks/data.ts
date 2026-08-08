import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const sel = async (q: any) => {
  const { data, error } = await q
  if (error) throw error
  return data
}

// True when a PostgREST error is "column does not exist", i.e. a migration
// that adds a column has not been applied yet. Lets a query ask for optional
// new columns and fall back cleanly when they are absent.
const isMissingColumn = (error: any) =>
  !!error && (error.code === '42703' || /column .* does not exist/i.test(error.message || ''))

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
      ).then((rows: any[]) => rows.filter((r) => r.calendar_year?.year === year)),
  })
}

// Single schedule for the record detail route. Same shape as useSchedules so
// the detail screen and the calendar rows read the same fields.
export function useSchedule(scheduleId?: string) {
  return useQuery({
    queryKey: ['schedule', scheduleId],
    enabled: !!scheduleId,
    queryFn: () =>
      sel(
        supabase
          .from('schedule')
          .select(
            'schedule_id, course_id, month, start_date, end_date, date_segments, modality, private_run, price, forecast_revenue, forecast_participants, min_participants, booked_participants, status, go_status, actual_participants, actual_revenue, roster_locked, max_participants, sales_owner, trainer:trainer_id(name, code), venue:venue_id(name, capacity), course:course_id(course_name, training_type, category, url), calendar_year:year_id(year)'
          )
          .eq('schedule_id', scheduleId)
          .single()
      ),
  })
}

export function useChannelPax() {
  return useQuery({
    queryKey: ['channel_pax'],
    queryFn: () => sel(supabase.from('v_schedule_channel_pax').select('*')),
    select: (rows: any[]) => {
      const map: Record<string, Record<string, number>> = {}
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
            'order_id, order_date, channel, payment_status, order_status, fulfillment_stage, sap_order_no, total_seats, total_amount, client:client_id(client_id, name, company, email), lines:order_line(line_id, line_no, seats, amount_php, went_live, line_status, schedule_id, course_id, course:course_id(course_name), schedule:schedule_id(start_date, end_date, date_segments, status)), assignment:order_assignment(sales_id, engagement_status, collection_status, salesperson:sales_id(name, code))'
          )
          .order('order_date', { ascending: false })
          .limit(1000)
      ),
  })
}

const ORDER_DETAIL_SELECT =
  'order_id, order_date, channel, payment_status, order_status, fulfillment_stage, stage_changed_at, sap_order_no, total_seats, total_amount, client:client_id(client_id, name, company, email, phone), lines:order_line(line_id, line_no, seats, amount_php, went_live, line_status, schedule_id, course_id, course:course_id(course_name), schedule:schedule_id(start_date, end_date, date_segments, status)), assignment:order_assignment(sales_id, engagement_status, collection_status, salesperson:sales_id(name, code))'

// Single order for the record detail route. Reads updated_at and deleted_at for
// optimistic concurrency and soft delete, falling back to the base columns when
// that migration has not been applied yet.
export function useOrder(orderId?: string) {
  return useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const full = await supabase.from('orders').select(ORDER_DETAIL_SELECT + ', updated_at, deleted_at').eq('order_id', orderId).single()
      if (!full.error) return full.data
      if (!isMissingColumn(full.error)) throw full.error
      const base = await supabase.from('orders').select(ORDER_DETAIL_SELECT).eq('order_id', orderId).single()
      if (base.error) throw base.error
      return base.data
    },
  })
}

// Sales inquiry pipeline. RLS scopes rows to the owning salesperson, or all for
// the super admin.
export function useInquiries() {
  return useQuery({
    queryKey: ['inquiries'],
    queryFn: () =>
      sel(
        supabase
          .from('inquiry')
          .select('inquiry_id, inquiry_date, sales_id, course_id, company, contact, email, phone, offering_type, pax, status, converted_order_id, course:course_id(course_name), salesperson:sales_id(name, code)')
          .order('inquiry_date', { ascending: false })
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
      ).then((rows: any[]) => rows.filter((r) => r.calendar_year?.year === year)),
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

// ---- Step 3: My Work streams ----
// Open tasks assigned to the signed-in user. RLS also lets admins read wider,
// so scope to assigned_to explicitly for the personal queue.
export function useMyTasks(userId?: string) {
  return useQuery({
    queryKey: ['my_tasks', userId],
    enabled: !!userId,
    queryFn: () =>
      sel(
        supabase
          .from('task')
          .select('task_id, title, detail, entity_type, entity_id, status, priority, due_date, reason, source, created_at')
          .eq('assigned_to', userId)
          .in('status', ['open', 'in_progress', 'blocked'])
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
      ),
  })
}

// Unread notifications for the signed-in user.
export function useMyNotifications(userId?: string) {
  return useQuery({
    queryKey: ['my_notifications', userId],
    enabled: !!userId,
    queryFn: () =>
      sel(
        supabase
          .from('notification')
          .select('notif_id, kind, title, body, entity_type, entity_id, actor_id, is_read, created_at')
          .eq('recipient_id', userId)
          .eq('is_read', false)
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
          .from('order_line')
          .select('line_id, access_status, access_granted_date, course:course_id(course_name), order:order_id(order_id, order_date, payment_status, client:client_id(name, company, email))')
          .eq('modality', 'E-learning')
          .order('created_at', { ascending: false })
      ),
  })
}

export function useYears() {
  return useQuery({
    queryKey: ['years'],
    queryFn: () => sel(supabase.from('calendar_year').select('*').order('year', { ascending: false })),
  })
}

// Every approval tied to one schedule, newest first. Feeds the Go/No-Go
// panel's prior-decisions list (cancellations, no-go proposals, reviews).
export function useScheduleApprovals(scheduleId?: string) {
  return useQuery({
    queryKey: ['schedule_approvals', scheduleId],
    enabled: !!scheduleId,
    queryFn: () =>
      sel(
        supabase
          .from('approval')
          .select('approval_id, object_type, decision, decision_date, note, requested_by, created_at')
          .eq('schedule_id', scheduleId)
          .order('created_at', { ascending: false })
      ),
  })
}

// System tasks and notifications tied to one entity, for the activity timeline.
// Defensive: RLS scopes rows to what the caller may see, and a missing column
// or table yields an empty list rather than breaking the record page.
export function useEntityActivity(entityType?: string, entityId?: string) {
  return useQuery({
    queryKey: ['entity_activity', entityType, entityId],
    enabled: !!entityType && !!entityId,
    queryFn: async () => {
      const eid = String(entityId)
      const safe = async (q: any) => {
        const { data, error } = await q
        return error ? [] : (data || [])
      }
      const [tasks, notifs] = await Promise.all([
        safe(
          supabase.from('task')
            .select('task_id, title, detail, reason, status, priority, source, created_at, completed_at')
            .eq('entity_type', entityType).eq('entity_id', eid)
            .order('created_at', { ascending: false })
        ),
        safe(
          supabase.from('notification')
            .select('notif_id, kind, title, body, created_at')
            .eq('entity_type', entityType).eq('entity_id', eid)
            .order('created_at', { ascending: false })
        ),
      ])
      return { tasks, notifs }
    },
  })
}

// Audit trail for one row, when an audit_log table is present. Fully defensive:
// if the table or columns are absent, or RLS hides the rows, it returns an
// empty list so the timeline simply shows the other sources.
export function useAuditTrail(tableName?: string, rowPk?: string) {
  return useQuery({
    queryKey: ['audit_trail', tableName, rowPk],
    enabled: !!tableName && !!rowPk,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('audit_id, table_name, row_pk, action, actor_role, changed_at, changed_fields')
        .eq('table_name', tableName)
        .eq('row_pk', String(rowPk))
        .order('changed_at', { ascending: false })
        .limit(100)
      return error ? [] : (data || [])
    },
  })
}

export function useSessionNotes(scheduleId?: string) {
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
    queryFn: async () => {
      const base = 'client_id, name, company, contact, email, phone, industry, owner_sales_id, salesperson:owner_sales_id(name, code)'
      const full = await supabase.from('client').select(base + ', deleted_at, org_id').order('company').limit(1000)
      if (!full.error) return full.data
      if (!isMissingColumn(full.error)) throw full.error
      const b = await supabase.from('client').select(base).order('company').limit(1000)
      if (b.error) throw b.error
      return b.data
    },
  })
}

const CLIENT_DETAIL_SELECT =
  'client_id, name, company, contact, email, phone, industry, owner_sales_id, salesperson:owner_sales_id(name, code)'

// Single client for the Customer 360 route. Reads updated_at and deleted_at
// when present, falling back to the base columns before the migration.
export function useClient(clientId?: string) {
  return useQuery({
    queryKey: ['client', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const full = await supabase.from('client').select(CLIENT_DETAIL_SELECT + ', updated_at, deleted_at, org_id').eq('client_id', clientId).single()
      if (!full.error) return full.data
      if (!isMissingColumn(full.error)) throw full.error
      const base = await supabase.from('client').select(CLIENT_DETAIL_SELECT).eq('client_id', clientId).single()
      if (base.error) throw base.error
      return base.data
    },
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

// ---- Phase 6: organizations ----
// Every organization with its rolled-up counts. Returns [] before the migration
// so the screen renders an empty state instead of an error.
export function useOrgSummary() {
  return useQuery({
    queryKey: ['org_summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_org_summary')
      if (error) {
        if (/function .*fn_org_summary/i.test(error.message || '')) return []
        throw error
      }
      return data || []
    },
  })
}

// Plain id + name list for the organization pickers. Tolerant of the table not
// existing yet.
export function useOrgOptions() {
  return useQuery({
    queryKey: ['org_options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organization').select('org_id, name').order('name')
      if (error) return []
      return data || []
    },
  })
}

export function useOrganization(orgId?: string) {
  return useQuery({
    queryKey: ['organization', orgId],
    enabled: !!orgId,
    queryFn: () => sel(supabase.from('organization').select('org_id, name, industry, country, notes, created_at').eq('org_id', orgId).single()),
  })
}

// Clients that belong to one organization.
export function useOrgClients(orgId?: string) {
  return useQuery({
    queryKey: ['org_clients', orgId],
    enabled: !!orgId,
    queryFn: () =>
      sel(
        supabase
          .from('client')
          .select('client_id, name, company, contact, email, phone, industry, owner_sales_id, salesperson:owner_sales_id(name, code)')
          .eq('org_id', orgId)
          .order('company')
      ),
  })
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

// ---- Phase 1: roster, capacity, transfer ----
export function useRoster(scheduleId?: string) {
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

export function useSessionOrders(scheduleId?: string) {
  return useQuery({
    queryKey: ['session_orders', scheduleId],
    enabled: !!scheduleId,
    queryFn: () =>
      sel(
        supabase
          .from('order_line')
          .select('line_id, seats, amount_php, line_status, order:order_id(order_id, order_date, channel, payment_status, order_status, client:client_id(name, company, email))')
          .eq('schedule_id', scheduleId)
          .order('created_at', { ascending: false })
      ),
  })
}

export function useTransferTargets(courseId?: string, excludeScheduleId?: string) {
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
      ).then((rows: any[]) => rows.filter((r) => r.schedule_id !== excludeScheduleId)),
  })
}

export function useClientHistory(clientId?: string) {
  return useQuery({
    queryKey: ['client_history', clientId],
    enabled: !!clientId,
    queryFn: () =>
      sel(
        supabase
          .from('orders')
          .select('order_id, order_date, channel, payment_status, order_status, total_seats, total_amount, fulfillment_stage, lines:order_line(line_id, seats, amount_php, schedule_id, course:course_id(course_name), schedule:schedule_id(start_date, end_date, date_segments, status))')
          .eq('client_id', clientId)
          .order('order_date', { ascending: false })
      ),
  })
}

// ---- Phase 2: close and cancel ----
export function useCloseCheck(scheduleId?: string) {
  return useQuery({
    queryKey: ['close_check', scheduleId],
    enabled: !!scheduleId,
    queryFn: () => sel(supabase.from('v_session_close_check').select('*').eq('schedule_id', scheduleId).single()),
  })
}

export function useCancelReadiness(scheduleId?: string) {
  return useQuery({
    queryKey: ['cancel_readiness', scheduleId],
    enabled: !!scheduleId,
    queryFn: () => sel(supabase.from('v_cancel_readiness').select('*').eq('schedule_id', scheduleId)),
  })
}

export function useApprovedCancellation(scheduleId?: string) {
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
export async function checkConflicts({
  scheduleId,
  trainerId,
  venueId,
  start,
  end,
  segments,
}: {
  scheduleId?: string | null
  trainerId?: string | null
  venueId?: string | null
  start: string
  end: string
  segments?: { start: string; end: string }[] | null
}) {
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

// ---- Phase 4: fulfillment queue ----
export function useFulfillmentQueue() {
  return useQuery({
    queryKey: ['fulfillment_queue'],
    queryFn: () => sel(supabase.from('v_fulfillment_queue').select('*').order('age_days', { ascending: false })),
  })
}

export function useSessionsForCourse(courseId?: string) {
  return useQuery({
    queryKey: ['sessions_for_course', courseId],
    enabled: !!courseId,
    queryFn: () =>
      sel(
        supabase
          .from('schedule')
          .select('schedule_id, start_date, end_date, date_segments, modality, price, min_participants, booked_participants, max_participants, status')
          .eq('course_id', courseId)
          .in('status', ['Tentative', 'Confirmed'])
          .order('start_date')
      ),
  })
}

// Server-side paged orders: filters and paging run in the database,
// so the screen stays fast as the table grows.
export function useOrdersPaged({ page = 0, pageSize = 50, q = '', stage = 'all', pay = 'all' }: {
  page?: number
  pageSize?: number
  q?: string
  stage?: string
  pay?: string
}) {
  return useQuery({
    queryKey: ['orders_paged', page, pageSize, q, stage, pay],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(
          'order_id, order_date, channel, payment_status, order_status, fulfillment_stage, stage_changed_at, sap_order_no, total_seats, total_amount, client:client_id(client_id, name, company, email), lines:order_line(line_id, line_no, seats, amount_php, went_live, line_status, schedule_id, course_id, course:course_id(course_name), schedule:schedule_id(start_date, end_date, date_segments, status)), assignment:order_assignment(sales_id, engagement_status, collection_status, salesperson:sales_id(name, code))',
          { count: 'exact' }
        )
        .order('order_date', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1)

      if (stage !== 'all') query = query.eq('fulfillment_stage', stage)
      if (pay !== 'all') query = query.eq('payment_status', pay)
      if (q.trim()) {
        // Strip PostgREST-significant characters before interpolating user input
        // into an or() filter string, so a search term can't break out of the
        // pattern or inject extra filter clauses.
        const t = q.trim().replace(/[,()*%\\]/g, ' ').trim()
        if (t) query = query.or(`order_id.ilike.%${t}%,sap_order_no.ilike.%${t}%`)
      }
      const { data, error, count } = await query
      if (error) throw error
      return { rows: data, count: count ?? 0 }
    },
  })
}
