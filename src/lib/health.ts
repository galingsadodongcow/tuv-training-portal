// Shared rendering for the computed session-health signal (v_session_health).
// One place maps the health string to a label, a pill class, and a sort weight,
// so the calendar, session detail, and My Work all read the same.

export type Health = 'Healthy' | 'Needs Attention' | 'At Risk' | 'Blocked' | 'Completed' | 'Cancelled' | string

interface HealthMeta {
  label: string
  cls: string   // pill class defined in globals.css (health-* )
  weight: number // higher = more urgent, for sorting worklists
}

const META: Record<string, HealthMeta> = {
  Blocked: { label: 'Blocked', cls: 'health-blocked', weight: 4 },
  'At Risk': { label: 'At risk', cls: 'health-risk', weight: 3 },
  'Needs Attention': { label: 'Needs attention', cls: 'health-attention', weight: 2 },
  Healthy: { label: 'Healthy', cls: 'health-healthy', weight: 1 },
  Completed: { label: 'Completed', cls: 'health-done', weight: 0 },
  Cancelled: { label: 'Cancelled', cls: 'health-done', weight: 0 },
}

export function healthMeta(h?: Health): HealthMeta {
  return (h && META[h]) || { label: h || '—', cls: 'health-done', weight: 0 }
}

// True for the levels an operator should act on (drives "needs attention" lists).
export function healthNeedsAction(h?: Health): boolean {
  return h === 'Blocked' || h === 'At Risk' || h === 'Needs Attention'
}
