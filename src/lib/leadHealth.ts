// Client-side derived attention signals for leads and quotes.
//
// Unlike session health (v_session_health) and order health, inquiries and
// quotes carry no computed health column, so we derive a small badge here from
// the fields the list already loads. Pure functions, no DB call. Each returns
// a {label, cls} on the **shared attention scale** (health.ts) — the same
// blocked/risk/ok/done colours session and order health use — or null when
// there's nothing worth flagging so the UI stays quiet.

import { daysUntil } from './format'
import { signalMeta } from './health'

export interface LeadBadge {
  label: string
  cls: string // a shared health-* class in globals.css
}

// The three tones this module speaks, resolved from the one scale.
const BLOCKED = signalMeta('blocked').cls
const RISK = signalMeta('risk').cls
const DONE = signalMeta('done').cls

// Whole days elapsed since a date (positive for past dates). null if no date.
const daysSince = (d?: string | null): number | null => {
  const u = daysUntil(d)
  return u == null ? null : -u
}

// Open inquiry stages — a lead here is still in play and can go stale.
const OPEN_STAGES = ['Received', 'Responded', 'RFQ or P Sent', 'Awaiting Feedback']

// Day thresholds for an untouched open lead. inquiry has no updated_at, so we
// age off inquiry_date (the only reliable activity date on the row).
const AGE_WARN = 3   // > 3 days with no movement → "Ageing"
const AGE_DANGER = 7 // > 7 days → "Stalled"

export function inquiryHealth(inq: any): LeadBadge | null {
  if (!inq) return null
  const status: string = inq.status
  if (status === 'Closed Won') return { label: 'Won', cls: DONE }
  if (status === 'Closed Lost') return { label: 'Lost', cls: DONE }
  if (!OPEN_STAGES.includes(status)) return null

  const age = daysSince(inq.inquiry_date)
  if (age == null) return null // no date to age off → stay quiet
  if (age > AGE_DANGER) return { label: 'Stalled', cls: BLOCKED }
  if (age > AGE_WARN) return { label: 'Ageing', cls: RISK }
  return null // fresh
}

// Quote statuses still open enough that validity matters.
const OPEN_QUOTE = ['Draft', 'Sent']
const EXPIRY_WARN = 3 // valid_until within 3 days → "Expiring"

export function quoteHealth(q: any): LeadBadge | null {
  if (!q) return null
  const status: string = q.status
  if (status === 'Accepted' || q.converted_order_id) return { label: 'Accepted', cls: DONE }
  if (!OPEN_QUOTE.includes(status)) return null

  const left = daysUntil(q.valid_until)
  if (left == null) return null // no validity date → stay quiet
  if (left < 0) return { label: 'Expired', cls: BLOCKED }
  if (left <= EXPIRY_WARN) return { label: 'Expiring', cls: RISK }
  return null
}
