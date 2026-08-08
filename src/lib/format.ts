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

// Currency-aware money formatting for the multi-country catalog. Falls back to
// PHP so existing callers and unknown currencies still render sensibly.
const CURRENCY_LOCALE: Record<string, string> = { PHP: 'en-PH', IDR: 'id-ID', USD: 'en-US', SGD: 'en-SG' }
export const money = (n: number | null | undefined, currency = 'PHP'): string =>
  n == null
    ? '—'
    : new Intl.NumberFormat(CURRENCY_LOCALE[currency] || 'en-PH', {
        style: 'currency',
        currency: currency || 'PHP',
        maximumFractionDigits: 0,
      }).format(n)

// The currency a country bills in.
export const COUNTRY_CURRENCY: Record<string, string> = { PH: 'PHP', ID: 'IDR' }
export const currencyForCountry = (country?: string | null): string =>
  (country && COUNTRY_CURRENCY[country]) || 'PHP'

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
