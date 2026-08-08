// Order state, derived from fields the order already carries. No stored state:
// every signal here is computed from payment_status, order_date, the
// fulfillment stage, the SAP number, ownership, and the stage timestamp. This
// keeps one place that answers "what is wrong with this order" so the record
// page and the list read the same rules.

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

const ageDays = (d?: string | null): number | null =>
  d ? Math.floor((Date.now() - +new Date(d)) / 86400000) : null

const isCancelled = (o: any) => o?.order_status === 'Cancelled' || o?.fulfillment_stage === 'Cancelled'
const hasOwner = (o: any) => !!(o?.assignment?.[0]?.sales_id || o?.owner_code || o?.owner)

// Where an unpaid order sits on the collection clock.
export function collectionState(o: any): CollectionState {
  if (!o) return 'None'
  if (isCancelled(o)) return 'None'
  if (o.payment_status === 'Paid') return 'Paid'
  const age = ageDays(o.order_date)
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

// Process blockers, most severe first within each severity band.
export function orderBlockers(o: any): OrderFlag[] {
  if (!o || isCancelled(o)) return []
  const flags: OrderFlag[] = []
  const stage = o.fulfillment_stage
  const paid = o.payment_status === 'Paid'

  if (paid && NOT_STARTED.includes(stage)) {
    flags.push({ label: 'Paid, not yet endorsed', tone: 'danger', kind: 'blocker' })
  }
  if (!hasOwner(o)) {
    flags.push({ label: 'No owner assigned', tone: 'warn', kind: 'blocker' })
  }
  if (AWAITING_SAP.includes(stage) && !o.sap_order_no) {
    flags.push({ label: 'Awaiting SAP number', tone: 'warn', kind: 'blocker' })
  }
  if (stage === 'No Feedback') {
    flags.push({ label: 'No customer feedback', tone: 'warn', kind: 'blocker' })
  }
  const stageAge = ageDays(o.stage_changed_at)
  if (stageAge != null && stageAge > STALL_DAYS && !TERMINAL_STAGE.includes(stage)) {
    flags.push({ label: `Stalled ${stageAge}d in ${stage}`, tone: 'warn', kind: 'blocker' })
  }
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
