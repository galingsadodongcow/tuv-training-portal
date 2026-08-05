export const php = (n: number | null | undefined): string =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 0,
      }).format(n)

export const num = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('en-PH').format(n)

export const shortDate = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'

export const dateRange = (a?: string | null, b?: string | null): string => {
  if (!a) return '—'
  if (!b || a === b) return shortDate(a)
  return `${shortDate(a)} – ${shortDate(b)}`
}

export const daysUntil = (d: string | null | undefined): number | null => {
  if (!d) return null
  const ms = +new Date(d) - +new Date()
  return Math.ceil(ms / 86400000)
}
