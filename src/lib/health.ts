// The one attention scale for the whole app.
//
// Session health (v_session_health), order flags (orderState.ts), and
// lead/quote badges (leadHealth.ts) all collapse onto a single three-level
// scale — **blocked · risk · ok** — plus a terminal **done** for
// completed/cancelled/accepted records that need no eyes. One vocabulary, one
// set of colours, reused on every screen, so a colour means the same thing
// everywhere. `orderState` and `leadHealth` map their raw signals onto this
// scale here rather than carrying their own pill classes.

export type Signal = 'blocked' | 'risk' | 'ok' | 'done'

interface SignalMeta {
  cls: string    // pill class defined in globals.css (health-*)
  weight: number // higher = more urgent, for sorting worklists
}

const SIGNAL: Record<Signal, SignalMeta> = {
  blocked: { cls: 'health-blocked', weight: 3 },
  risk:    { cls: 'health-risk',    weight: 2 },
  ok:      { cls: 'health-ok',      weight: 1 },
  done:    { cls: 'health-done',    weight: 0 },
}

export const signalMeta = (s: Signal): SignalMeta => SIGNAL[s]

// Map an orderState Tone (danger/warn/ok/info/neutral) onto the shared scale,
// so order blockers and collection flags render in the same colours as health.
export function signalFromTone(t?: string): Signal {
  if (t === 'danger') return 'blocked'
  if (t === 'warn') return 'risk'
  if (t === 'ok') return 'ok'
  return 'done' // info / neutral → quiet
}

// ---- session health (v_session_health) mapped onto the scale ----

export type Health = 'Healthy' | 'Needs Attention' | 'At Risk' | 'Blocked' | 'Completed' | 'Cancelled' | string

interface HealthMeta {
  label: string
  cls: string    // one of the shared health-* classes
  weight: number
  signal: Signal
}

// Blocked stays blocked; At Risk and Needs Attention both read as `risk` (the
// label keeps the distinction, the colour does not); Healthy is ok; terminal
// states are done.
const HEALTH_SIGNAL: Record<string, Signal> = {
  Blocked: 'blocked',
  'At Risk': 'risk',
  'Needs Attention': 'risk',
  Healthy: 'ok',
  Completed: 'done',
  Cancelled: 'done',
}

const HEALTH_LABEL: Record<string, string> = {
  Blocked: 'Blocked',
  'At Risk': 'At risk',
  'Needs Attention': 'Needs attention',
  Healthy: 'Healthy',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
}

export function healthMeta(h?: Health): HealthMeta {
  const signal: Signal = (h && HEALTH_SIGNAL[h]) || 'done'
  const m = SIGNAL[signal]
  return { label: (h && HEALTH_LABEL[h]) || h || '—', cls: m.cls, weight: m.weight, signal }
}

// True for the levels an operator should act on (drives "needs attention" lists).
export function healthNeedsAction(h?: Health): boolean {
  return h === 'Blocked' || h === 'At Risk' || h === 'Needs Attention'
}
