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
            'schedule_id, course_id, month, start_date, end_date, date_segments, modality, private_run, price, forecast_revenue, forecast_participants, min_participants, booked_participants, status, go_status, actual_participants, actual_revenue, roster_locked, max_participants, sales_owner, trainer_id, venue_id, trainer:trainer_id(name, code), venue:venue_id(name, capacity), course:course_id(course_name, training_type, category, url), calendar_year:year_id(year)'
          )
          .order('start_date', { ascending: true })
      ).then((rows: any[]) => rows.filter((r) => r.calendar_year?.year === year)),
  })
}

// Single schedule for the record detail route. Same shape as useSchedules so
// the detail screen and the calendar rows read the same fields.
export function useSchedule(scheduleId?: string) {
  // Base columns always available. Owner embeds (the operations owner from
  // profiles, the sales owner from salesperson) are appended optionally and
  // stripped on error, so an older schema still returns the session.
  const BASE =
    'schedule_id, course_id, month, start_date, end_date, date_segments, modality, private_run, price, forecast_revenue, forecast_participants, min_participants, booked_participants, status, go_status, actual_participants, actual_revenue, roster_locked, max_participants, sales_owner, operations_owner, trainer:trainer_id(name, code), venue:venue_id(name, capacity), course:course_id(course_name, training_type, category, url), calendar_year:year_id(year)'
  const OWNERS = ', salesOwner:sales_owner(name, code), opsOwner:operations_owner(full_name)'
  return useQuery({
    queryKey: ['schedule', scheduleId],
    enabled: !!scheduleId,
    queryFn: async () => {
      const full = await supabase.from('schedule').select(BASE + OWNERS).eq('schedule_id', scheduleId).single()
      if (!full.error) return full.data as any
      // Owner embeds couldn't resolve — fall back to the base select unchanged.
      const base = await supabase.from('schedule').select(BASE).eq('schedule_id', scheduleId).single()
      if (base.error) throw base.error
      return base.data as any
    },
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
    queryFn: async () => {
      const base = 'course_id, course_name, training_type, category, url'
      const full = await supabase.from('course').select(base + ', is_certification, max_pax').eq('active', true).order('course_name')
      if (!full.error) return full.data as any
      if (!isMissingColumn(full.error)) throw full.error
      const b = await supabase.from('course').select(base).eq('active', true).order('course_name')
      if (b.error) throw b.error
      return b.data as any
    },
  })
}

export function useCourseFees() {
  return useQuery({
    queryKey: ['course_fees'],
    queryFn: () => sel(supabase.from('course_fee').select('course_id, modality, fee_php')),
  })
}

// S6: Category → Subcategory hierarchy for the course form. Degrades to [] when
// the tables are not live yet (okOr swallows the missing-object error), so the
// course form falls back to the free-text category field.
export function useCategoryTree() {
  return useQuery({
    queryKey: ['category_tree'],
    queryFn: async () => {
      const cats = await okOr(
        supabase.from('category').select('category_id, name, sort, active').eq('active', true).order('sort').order('name'),
        null
      )
      if (cats === null) return [] // tables not applied yet
      const subs = await okOr(
        supabase.from('subcategory').select('subcategory_id, category_id, name, sort, active').eq('active', true).order('sort').order('name'),
        []
      )
      return (cats || []).map((c: any) => ({
        ...c,
        subcategories: (subs || []).filter((s: any) => s.category_id === c.category_id),
      }))
    },
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
          .select('*, course:course_id(course_name), salesperson:sales_id(name, code)')
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

// ---- Admin console (super_admin) ----
// Every salesperson, active or not, with team and region for access scoping.
export function useAllSalespeople() {
  return useQuery({
    queryKey: ['salespeople_all'],
    queryFn: () =>
      okOr(
        supabase.from('salesperson').select('sales_id, name, code, team, region, is_supervisor, active').order('name'),
        []
      ),
  })
}

// Every user profile with its linked salesperson. RLS already limits reads of
// other users' profiles to super_admin, so this returns just the caller's row
// for anyone else.
export function useAllProfiles() {
  return useQuery({
    queryKey: ['profiles_all'],
    queryFn: () =>
      okOr(
        supabase
          .from('profiles')
          .select('user_id, full_name, role, sales_id, salesperson:sales_id(name, code, team, region)')
          .order('full_name'),
        []
      ),
  })
}

// ---- Pricing, country, and audit (Phase N) ----
export function useDiscountRules() {
  return useQuery({
    queryKey: ['discount_rules'],
    queryFn: () =>
      okOr(
        supabase.from('discount_rule').select('*, course:course_id(course_name)').order('created_at', { ascending: false }),
        []
      ),
  })
}

// Rules applicable to a specific booking, richest first. Advisory only.
export function useApplicableDiscounts(courseId?: string, type?: string, country?: string, seats?: number) {
  return useQuery({
    queryKey: ['applicable_discounts', courseId, type, country, seats],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_applicable_discounts', {
        p_course: courseId, p_type: type ?? null, p_country: country ?? null, p_seats: seats ?? 1,
      })
      return error ? [] : (data || [])
    },
  })
}

export function useCountryRevenue() {
  return useQuery({
    queryKey: ['country_revenue'],
    queryFn: () => okOr(supabase.from('v_country_revenue').select('*'), []),
  })
}

export function useAuditSearch(filters: Record<string, any>) {
  return useQuery({
    queryKey: ['audit_search', filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_audit_search', {
        p_table: filters.table || null,
        p_action: filters.action || null,
        p_role: filters.role || null,
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_search: filters.search || null,
        p_limit: filters.limit || 200,
      })
      if (error) return { error, rows: [] as any[] }
      return { error: null, rows: (data || []) as any[] }
    },
  })
}

// ---- Feedback and quality ----
export function useNpsSummary() {
  return useQuery({
    queryKey: ['nps_summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_nps_summary')
      if (error) return null
      return data && data.length ? data[0] : null
    },
  })
}

export function useTrainerQuality() {
  return useQuery({
    queryKey: ['trainer_quality'],
    queryFn: () => okOr(supabase.from('v_trainer_quality').select('*').order('avg_trainer', { ascending: false, nullsFirst: false }), []),
  })
}

export function useSessionFeedback(scheduleId?: string) {
  return useQuery({
    queryKey: ['session_feedback', scheduleId],
    enabled: !!scheduleId,
    queryFn: () => okOr(supabase.from('feedback').select('*').eq('schedule_id', scheduleId).order('submitted_at', { ascending: false }), []),
  })
}

export function useComplaints() {
  return useQuery({
    queryKey: ['complaints'],
    queryFn: () =>
      okOr(
        supabase
          .from('complaint')
          .select('*, client:client_id(company), schedule:schedule_id(start_date, course:course_id(course_name))')
          .order('opened_at', { ascending: false })
          .limit(500),
        []
      ),
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

// Order comments, same shape as session notes. Tolerant of the table not
// existing yet so the order page still loads before the migration.
export function useOrderNotes(orderId?: string) {
  return useQuery({
    queryKey: ['order_notes', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_note')
        .select('note_id, note, date, author, profile:author(full_name, role)')
        .eq('order_id', orderId)
        .order('date', { ascending: false })
      return error ? [] : (data || [])
    },
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
// Possible-duplicate lookup for SalesEntry: existing clients that already carry
// this email. RLS-scoped, so it only returns customers the user may already see;
// it warns at capture time without blocking (the batch duplicate_candidate job
// remains the authoritative cross-order detector). Disabled until an email that
// looks complete is entered, and kept cheap with a small limit.
export function usePossibleDuplicateClients(email?: string) {
  const clean = (email || '').trim().toLowerCase()
  const enabled = clean.length > 4 && clean.includes('@')
  return useQuery({
    queryKey: ['dup_clients', clean],
    enabled,
    queryFn: () =>
      okOr(
        supabase
          .from('client')
          .select('client_id, name, company, email, owner_sales_id, salesperson:owner_sales_id(name, code)')
          .ilike('email', clean)
          .limit(5),
        []
      ),
  })
}

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
    queryFn: () => sel(supabase.from('organization').select('org_id, name, industry, country, notes').eq('org_id', orgId).single()),
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

// ---- Phase 9: reports and digest ----
// The operational digest: the same at-risk lists the nightly job watches, read
// straight from the digest views. Each view is optional, so a missing one
// simply yields an empty list.
export function useDigest() {
  return useQuery({
    queryKey: ['digest'],
    queryFn: async () => {
      const [atRisk, rosterGaps, stalled, unstaffed, elearning] = await Promise.all([
        supabase.from('v_digest_at_risk').select('*'),
        supabase.from('v_digest_roster_gaps').select('*'),
        supabase.from('v_digest_stalled_orders').select('*'),
        supabase.from('v_digest_unstaffed').select('*'),
        supabase.from('v_digest_elearning_waiting').select('*'),
      ])
      const pick = (r: any) => (r.error ? [] : r.data || [])
      return {
        atRisk: pick(atRisk),
        rosterGaps: pick(rosterGaps),
        stalled: pick(stalled),
        unstaffed: pick(unstaffed),
        elearning: pick(elearning),
      }
    },
  })
}

// Order facts for the revenue report, one row per order with month, channel,
// course, seats, amount, and who sold it.
export function useOrderFacts() {
  return useQuery({
    queryKey: ['order_facts'],
    queryFn: () =>
      sel(
        supabase
          .from('v_order_fact')
          .select('order_id, order_date, order_month, channel, modality, seats, amount_php, payment_status, order_status, course_name, category, sales_name')
          .order('order_date', { ascending: false })
          .limit(5000)
      ),
  })
}

// True when a PostgREST error means the table/view/column/function isn't there
// yet — i.e. a migration hasn't been applied. Those degrade to a fallback so the
// UI survives ahead of a migration. Any OTHER error is a real failure and must
// surface (so a panel's error state can render instead of showing empty data).
const isMissingObject = (error: any) =>
  !!error && (
    error.code === '42P01' || // undefined_table / view
    error.code === '42703' || // undefined_column
    error.code === '42883' || // undefined_function
    error.code === 'PGRST202' || error.code === 'PGRST205' || // PostgREST: not in schema cache
    /does not exist|could not find the (table|function)|not found in the schema cache/i.test(error.message || '')
  )

// ---- Accounts receivable ----
// Degrade to `fallback` only when the object is missing (migration not yet
// applied); re-throw real errors so React Query sets `.error` and the caller's
// error branch renders rather than silently showing the fallback.
const okOr = async (q: any, fallback: any) => {
  const { data, error } = await q
  if (!error) return data
  if (isMissingObject(error)) return fallback
  throw error
}

export function useOrderAr(orderId?: string) {
  return useQuery({
    queryKey: ['order_ar', orderId],
    enabled: !!orderId,
    queryFn: () => okOr(supabase.from('v_order_ar').select('*').eq('order_id', orderId).single(), null),
  })
}

export function useInvoices(orderId?: string) {
  return useQuery({
    queryKey: ['invoices', orderId],
    enabled: !!orderId,
    queryFn: () => okOr(supabase.from('invoice').select('*').eq('order_id', orderId).order('issue_date', { ascending: false }), []),
  })
}

export function usePayments(orderId?: string) {
  return useQuery({
    queryKey: ['payments', orderId],
    enabled: !!orderId,
    queryFn: () => okOr(supabase.from('payment').select('*').eq('order_id', orderId).order('paid_date', { ascending: false }), []),
  })
}

export function useRefunds(orderId?: string) {
  return useQuery({
    queryKey: ['refunds', orderId],
    enabled: !!orderId,
    queryFn: () => okOr(supabase.from('refund').select('*').eq('order_id', orderId).order('created_at', { ascending: false }), []),
  })
}

// Keys to refresh after any money movement so AR, the order, and queues re-read.
const MONEY_KEYS = ['payments', 'refunds', 'order_ar', 'order', 'orders', 'fulfillment_queue', 'receivables']

// Void a payment (business_owner / super_admin only; enforced in the DB). The
// payment is never deleted — its status becomes Voided with a persisted reason.
export function useVoidPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) => {
      const { error } = await supabase.rpc('fn_void_payment', { p_payment: paymentId, p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  })
}

// Refund against a confirmed payment (business_owner / super_admin only). Writes
// an immutable refund row; AR recomputes as confirmed − refunds + applied credits.
export function useRefundPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentId, amount, reason }: { paymentId: string; amount: number; reason: string }) => {
      const { data, error } = await supabase.rpc('fn_refund_payment', { p_payment: paymentId, p_amount: amount, p_reason: reason })
      if (error) throw error
      return data as string
    },
    onSuccess: () => MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  })
}

// ---- Endorsement handoff (Sales/Coordinator -> Operations) ----
// The D2 completeness contract as data: { ok, hard: [...], warn: [...] }.
export function useOrderCompleteness(orderId?: string) {
  return useQuery({
    queryKey: ['order_completeness', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_order_completeness', { p_order: orderId })
      if (error) { if (isMissingObject(error)) return null; throw error }
      return data
    },
  })
}

export function useOrderHandoff(orderId?: string) {
  return useQuery({
    queryKey: ['order_handoff', orderId],
    enabled: !!orderId,
    queryFn: () => okOr(supabase.from('order_handoff').select('*').eq('order_id', orderId).maybeSingle(), null),
  })
}

const HANDOFF_KEYS = ['order', 'orders', 'order_handoff', 'order_completeness', 'fulfillment_queue', 'worklist']

// Endorse an order to Operations. Refused unless complete (super_admin may pass
// an override reason). Enforced in the DB by fn_endorse_order.
export function useEndorseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, overrideReason }: { orderId: string; overrideReason?: string }) => {
      const { data, error } = await supabase.rpc('fn_endorse_order', { p_order: orderId, p_override_reason: overrideReason ?? null })
      if (error) throw error
      return data
    },
    onSuccess: () => HANDOFF_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  })
}

// Operations accepts the endorsement — the two-sided close of the handoff.
export function useAcceptEndorsement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('fn_accept_endorsement', { p_order: orderId })
      if (error) throw error
    },
    onSuccess: () => HANDOFF_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  })
}

// Return an order for correction (regresses the stage), with a required reason.
export function useReturnForCorrection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { error } = await supabase.rpc('fn_return_for_correction', { p_order: orderId, p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => HANDOFF_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  })
}

// ---- Customer 360 ----
// Org-level rollup (clients / contacts / active orders / booked / linked leads).
export function useCustomer360(orgId?: string) {
  return useQuery({
    queryKey: ['customer_360', orgId],
    enabled: !!orgId,
    queryFn: () => okOr(supabase.from('v_customer_360').select('*').eq('org_id', orgId).maybeSingle(), null),
  })
}

// ---- Analytics ----
export function useFunnel() {
  return useQuery({
    queryKey: ['funnel'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_funnel')
      if (error) return null
      return data && data.length ? data[0] : null
    },
  })
}

export function useForecastVsActual() {
  return useQuery({
    queryKey: ['forecast_actual'],
    queryFn: () => okOr(supabase.from('v_session_forecast').select('*').order('start_date', { ascending: false }).limit(1000), []),
  })
}

// ---- SLA ----
export function useSlaBreaches() {
  return useQuery({
    queryKey: ['sla_breaches'],
    queryFn: () => okOr(supabase.from('v_sla_breach').select('*').limit(1000), []),
  })
}

// ---- Session profitability ----
export function useSessionPnl(scheduleId?: string) {
  return useQuery({
    queryKey: ['session_pnl', scheduleId],
    enabled: !!scheduleId,
    queryFn: () => okOr(supabase.from('v_session_pnl').select('*').eq('schedule_id', scheduleId).single(), null),
  })
}

export function useProfitability() {
  return useQuery({
    queryKey: ['profitability'],
    queryFn: () => okOr(supabase.from('v_session_pnl').select('*').order('start_date', { ascending: false }).limit(2000), []),
  })
}

// ---- Trainer management ----
export function useTrainerCourseMap() {
  return useQuery({
    queryKey: ['trainer_course_map'],
    queryFn: () => okOr(supabase.from('trainer_course').select('trainer_id, course_id'), []),
  })
}

export function useTrainerCourses(trainerId?: string) {
  return useQuery({
    queryKey: ['trainer_courses', trainerId],
    enabled: !!trainerId,
    queryFn: () => okOr(supabase.from('trainer_course').select('course_id').eq('trainer_id', trainerId), []),
  })
}

export function useTrainerAvailability(trainerId?: string) {
  return useQuery({
    queryKey: ['trainer_availability', trainerId],
    enabled: !!trainerId,
    queryFn: () => okOr(supabase.from('trainer_availability').select('*').eq('trainer_id', trainerId).order('start_date', { ascending: false }), []),
  })
}

export function useSessionTrainers(scheduleId?: string) {
  return useQuery({
    queryKey: ['session_trainers', scheduleId],
    enabled: !!scheduleId,
    queryFn: () => okOr(supabase.from('session_trainer').select('*, trainer:trainer_id(name)').eq('schedule_id', scheduleId), []),
  })
}

// ---- CRM: contacts and interactions ----
export function useContacts(clientId?: string) {
  return useQuery({
    queryKey: ['contacts', clientId],
    enabled: !!clientId,
    queryFn: () => okOr(supabase.from('contact').select('*').eq('client_id', clientId).order('is_primary', { ascending: false }), []),
  })
}

export function useClientInteractions(clientId?: string) {
  return useQuery({
    queryKey: ['interactions', clientId],
    enabled: !!clientId,
    queryFn: () => okOr(supabase.from('client_interaction').select('*, salesperson:sales_id(name)').eq('client_id', clientId).order('date', { ascending: false }), []),
  })
}

// ---- Quotations ----
export function useQuotes() {
  return useQuery({
    queryKey: ['quotes'],
    queryFn: () => okOr(
      supabase.from('quote').select('*, client:client_id(company, name), salesperson:sales_id(name)').order('created_at', { ascending: false }).limit(1000),
      []
    ),
  })
}

export function useQuote(quoteId?: string) {
  return useQuery({
    queryKey: ['quote', quoteId],
    enabled: !!quoteId,
    queryFn: () => okOr(supabase.from('quote').select('*, client:client_id(client_id, company, name, email), salesperson:sales_id(name)').eq('quote_id', quoteId).single(), null),
  })
}

export function useQuoteLines(quoteId?: string) {
  return useQuery({
    queryKey: ['quote_lines', quoteId],
    enabled: !!quoteId,
    queryFn: () => okOr(supabase.from('quote_line').select('*, course:course_id(course_name)').eq('quote_id', quoteId).order('created_at'), []),
  })
}

export function useQuoteTotal(quoteId?: string) {
  return useQuery({
    queryKey: ['quote_total', quoteId],
    enabled: !!quoteId,
    queryFn: () => okOr(supabase.from('v_quote_total').select('*').eq('quote_id', quoteId).single(), null),
  })
}

// ---- Communications ----
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => okOr(supabase.from('message_template').select('*').order('name'), []),
  })
}

export function useCommsLog() {
  return useQuery({
    queryKey: ['comms_log'],
    queryFn: () => okOr(supabase.from('comms_log').select('*').order('created_at', { ascending: false }).limit(200), []),
  })
}

// Files attached to a record.
export function useAttachments(entityType?: string, entityId?: string) {
  return useQuery({
    queryKey: ['attachments', entityType, entityId],
    enabled: !!entityType && !!entityId,
    queryFn: () => okOr(
      supabase.from('attachment').select('*').eq('entity_type', entityType).eq('entity_id', String(entityId)).order('created_at', { ascending: false }),
      []
    ),
  })
}

// Certificates expiring soon (or already expired).
export function useCertsExpiring() {
  return useQuery({
    queryKey: ['certs_expiring'],
    queryFn: () => okOr(supabase.from('v_cert_expiring').select('*').limit(500), []),
  })
}

// Open receivables for the aging report: orders with a positive balance.
export function useReceivables() {
  return useQuery({
    queryKey: ['receivables'],
    queryFn: () => okOr(supabase.from('v_order_ar').select('*').gt('balance', 0).order('due_date', { ascending: true }).limit(2000), []),
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

// ROS01: soft-remove a participant (keeps history) and transfer to another
// session. Both are DB-enforced to ops/coordinator/super_admin.
export function useRemoveParticipant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ participantId, reason }: { participantId: string; reason?: string }) => {
      const { error } = await supabase.rpc('fn_remove_participant', { p_participant: participantId, p_reason: reason ?? null })
      if (error) throw error
    },
    onSuccess: () => ['roster', 'session_orders', 'schedules'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  })
}

export function useTransferParticipant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ participantId, newScheduleId, reason }: { participantId: string; newScheduleId: string; reason?: string }) => {
      const { error } = await supabase.rpc('fn_transfer_participant', { p_participant: participantId, p_new_schedule: newScheduleId, p_reason: reason ?? null })
      if (error) throw error
    },
    onSuccess: () => ['roster', 'session_orders', 'schedules'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  })
}

// SV01: server-persisted saved views. Returns the caller's own views for a
// surface plus any role-default published for their role.
export function useSavedViews(surface?: string) {
  return useQuery({
    queryKey: ['saved_views', surface],
    enabled: !!surface,
    queryFn: () => okOr(
      supabase.from('saved_view').select('*').eq('surface', surface).order('is_default', { ascending: false }).order('name'),
      []
    ),
  })
}

export function useUpsertSavedView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (view: { view_id?: string; owner_id: string; surface: string; name: string; config: any; is_default?: boolean }) => {
      const { error } = await supabase.from('saved_view').upsert(view, { onConflict: 'view_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved_views'] }),
  })
}

export function useDeleteSavedView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (viewId: string) => {
      const { error } = await supabase.from('saved_view').delete().eq('view_id', viewId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved_views'] }),
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

// ---- Phase 1/2: session health, order merge, notification center ----
// Computed health per session (v_session_health). Consumers usually build a
// Map<schedule_id, health> for O(1) lookup on the calendar / lists.
export function useSessionHealth() {
  return useQuery({
    queryKey: ['session_health'],
    queryFn: () => okOr(supabase.from('v_session_health').select('schedule_id, health'), []),
  })
}

// Reconcile a duplicate order into a surviving one (ops/super_admin only).
export function useMergeOrders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ keep, dup, reason }: { keep: string; dup: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('fn_merge_orders', { p_keep: keep, p_dup: dup, p_reason: reason ?? null })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      ;['duplicates', 'orders', 'orders_paged', 'fulfillment_queue', 'order_facts'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })
      )
    },
  })
}

// All notifications (read + unread) for the notification center.
export function useAllNotifications(userId?: string, limit = 50) {
  return useQuery({
    queryKey: ['all_notifications', userId],
    enabled: !!userId,
    queryFn: () =>
      okOr(
        supabase
          .from('notification')
          .select('notif_id, kind, title, body, entity_type, entity_id, actor_id, is_read, created_at')
          .eq('recipient_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit),
        []
      ),
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notifId: string) => {
      const { error } = await supabase.from('notification').update({ is_read: true }).eq('notif_id', notifId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all_notifications'] })
      qc.invalidateQueries({ queryKey: ['my_notifications'] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('notification').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all_notifications'] })
      qc.invalidateQueries({ queryKey: ['my_notifications'] })
    },
  })
}
