// Order state, derived from fields the order already carries. No stored state:
// every signal here is computed from payment_status, order_date, the
// fulfillment stage, the SAP number, ownership, and the stage timestamp. This
// keeps one place that answers "what is wrong with this order" so the record
// page, the orders list, and the fulfillment queue read the same rules.
//
// The helpers accept either a full order row (order_date, stage_changed_at,
// assignment) or a fulfillment-queue row (age_days, days_in_stage, owner_code),
// so the same predicates power every screen.

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'
export type FlagKind = 'blocker' | 'collection'

export interface OrderFlag {
  label: string
  tone: Tone
  kind: FlagKind
}

export type CollectionState = 'Paid' | 'Not due' | 'Due soon' | 'Overdue' | 'None'

// Thresholds line up with the nightly escalation rules: overdue at 30 days,
// stalled at 14 days in a stage.
const OVERDUE_DAYS = 30
const DUE_SOON_DAYS = 23
const STALL_DAYS = 14

const NOT_STARTED = ['New', 'In Communication', 'For Order Creation']
const AWAITING_SAP = ['Endorsed to Ops', 'For Order Creation']
const TERMINAL_STAGE = ['SAP Created', 'Cancelled', 'No Feedback']

const rawAge = (d?: string | null): number | null =>
  d ? Math.floor((Date.now() - +new Date(d)) / 86400000) : null

// Prefer a precomputed count from a view; fall back to the timestamp.
const orderAge = (o: any): number | null =>
  typeof o?.age_days === 'number' ? o.age_days : rawAge(o?.order_date)
const stageAge = (o: any): number | null =>
  typeof o?.days_in_stage === 'number' ? o.days_in_stage : rawAge(o?.stage_changed_at)

const isCancelled = (o: any) => o?.order_status === 'Cancelled' || o?.fulfillment_stage === 'Cancelled'
const hasOwner = (o: any) => !!(o?.assignment?.[0]?.sales_id || o?.owner_code || o?.owner)

// ---- predicates, reused by the flags and by the queue views ----
export const isPaidUnendorsed = (o: any) =>
  !isCancelled(o) && o?.payment_status === 'Paid' && NOT_STARTED.includes(o?.fulfillment_stage)
export const isUnowned = (o: any) => !isCancelled(o) && !hasOwner(o)
export const isAwaitingSap = (o: any) =>
  !isCancelled(o) && AWAITING_SAP.includes(o?.fulfillment_stage) && !o?.sap_order_no
export const isNoFeedback = (o: any) => o?.fulfillment_stage === 'No Feedback'
export const isStalled = (o: any) => {
  const a = stageAge(o)
  return a != null && a > STALL_DAYS && !TERMINAL_STAGE.includes(o?.fulfillment_stage) && !isCancelled(o)
}
export const isOverdue = (o: any) => collectionState(o) === 'Overdue'

// Where an unpaid order sits on the collection clock.
export function collectionState(o: any): CollectionState {
  if (!o) return 'None'
  if (isCancelled(o)) return 'None'
  if (o.payment_status === 'Paid') return 'Paid'
  const age = orderAge(o)
  if (age == null) return 'None'
  if (age > OVERDUE_DAYS) return 'Overdue'
  if (age >= DUE_SOON_DAYS) return 'Due soon'
  return 'Not due'
}

const COLLECTION_TONE: Record<CollectionState, Tone> = {
  Paid: 'ok',
  'Not due': 'info',
  'Due soon': 'warn',
  Overdue: 'danger',
  None: 'neutral',
}
export const collectionTone = (s: CollectionState): Tone => COLLECTION_TONE[s]

// Process blockers, most severe first.
export function orderBlockers(o: any): OrderFlag[] {
  if (!o || isCancelled(o)) return []
  const flags: OrderFlag[] = []
  if (isPaidUnendorsed(o)) flags.push({ label: 'Paid, not yet endorsed', tone: 'danger', kind: 'blocker' })
  if (isUnowned(o)) flags.push({ label: 'No owner assigned', tone: 'warn', kind: 'blocker' })
  if (isAwaitingSap(o)) flags.push({ label: 'Awaiting SAP number', tone: 'warn', kind: 'blocker' })
  if (isNoFeedback(o)) flags.push({ label: 'No customer feedback', tone: 'warn', kind: 'blocker' })
  if (isStalled(o)) flags.push({ label: `Stalled ${stageAge(o)}d in ${o.fulfillment_stage}`, tone: 'warn', kind: 'blocker' })
  return flags
}

// The collection state expressed as a flag, when it needs attention.
function collectionFlag(o: any): OrderFlag | null {
  const s = collectionState(o)
  if (s === 'Overdue') return { label: 'Payment overdue', tone: 'danger', kind: 'collection' }
  if (s === 'Due soon') return { label: 'Payment due soon', tone: 'warn', kind: 'collection' }
  return null
}

// Every flag on the order, blockers then collection.
export function orderFlags(o: any): OrderFlag[] {
  const flags = orderBlockers(o)
  const c = collectionFlag(o)
  if (c) flags.push(c)
  return flags
}

const TONE_RANK: Record<Tone, number> = { danger: 0, warn: 1, info: 2, ok: 3, neutral: 4 }

// The single most important flag, for a one-line header or a list badge.
export function primaryFlag(o: any): OrderFlag | null {
  const flags = orderFlags(o)
  if (flags.length === 0) return null
  return [...flags].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])[0]
}

// ---- named work queues, shared by the fulfillment screen and home links ----
export interface OrderView {
  key: string
  label: string
  test: (o: any) => boolean
}
export const ORDER_VIEWS: OrderView[] = [
  { key: 'all', label: 'All work', test: () => true },
  { key: 'overdue', label: 'Overdue collections', test: isOverdue },
  { key: 'awaiting_sap', label: 'Awaiting SAP', test: isAwaitingSap },
  { key: 'paid_unendorsed', label: 'Paid, not endorsed', test: isPaidUnendorsed },
  { key: 'stalled', label: 'Stalled', test: isStalled },
  { key: 'no_feedback', label: 'No feedback', test: isNoFeedback },
]
export const orderView = (key?: string): OrderView =>
  ORDER_VIEWS.find((v) => v.key === key) || ORDER_VIEWS[0]
