// Learning Type: friendly labels over the stored enum values.
// The database keeps its canonical enum; the interface speaks the team's language.
export const LEARNING_TYPE_LABEL: Record<string, string> = {
  'Live Online Training': 'Virtual Classroom',
  'Face-to-face': 'Classroom Training',
  'E-learning': 'E-learning',
}
export const LEARNING_TYPES = Object.keys(LEARNING_TYPE_LABEL)
export const lt = (v: string): string => LEARNING_TYPE_LABEL[v] || v

export interface DateSegment {
  start: string
  end: string
}

// Staggered date segments -> "Sep 11–14 & 17"
const md = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
const dOnly = (d: string) => new Date(d).getDate()
export function formatSegments(
  segments: DateSegment[] | null | undefined,
  start?: string | null,
  end?: string | null
): string {
  if (!segments || segments.length === 0) {
    if (!start) return '—'
    if (!end || start === end) return md(start)
    return `${md(start)} – ${md(end)}`
  }
  const parts = segments.map((s, i) => {
    const a =
      i === 0
        ? md(s.start)
        : new Date(s.start).getMonth() === new Date(segments[0].start).getMonth()
        ? dOnly(s.start)
        : md(s.start)
    if (s.start === s.end) return `${a}`
    const b = new Date(s.end).getMonth() === new Date(s.start).getMonth() ? dOnly(s.end) : md(s.end)
    return `${a}–${b}`
  })
  return parts.join(' & ')
}

export function segmentsDays(segments: DateSegment[] | null | undefined): number | null {
  if (!segments || segments.length === 0) return null
  return segments.reduce((n, s) => n + Math.round((+new Date(s.end) - +new Date(s.start)) / 86400000) + 1, 0)
}
