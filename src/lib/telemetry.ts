export type TelemetryPayload = {
  kind: 'error' | 'metric'
  name: string
  value?: number
  message?: string
  context?: string
  path?: string
  timestamp: string
}

// Provider-neutral and privacy-conscious: payloads contain no query variables,
// record IDs, form values, or user identity. Set NEXT_PUBLIC_TELEMETRY_ENDPOINT
// to forward them to an observability collector; otherwise they remain local.
function emit(payload: Omit<TelemetryPayload, 'timestamp' | 'path'>) {
  if (typeof window === 'undefined') return
  const event: TelemetryPayload = {
    ...payload,
    path: window.location.pathname,
    timestamp: new Date().toISOString(),
  }
  window.dispatchEvent(new CustomEvent('portal:telemetry', { detail: event }))

  const endpoint = process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT
  if (endpoint) {
    const body = JSON.stringify(event)
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
    else void fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
  } else if (process.env.NODE_ENV === 'development') {
    console.debug('[telemetry]', event)
  }
}

export function reportError(error: unknown, context = 'application') {
  const e = error instanceof Error ? error : new Error(String(error))
  emit({ kind: 'error', name: e.name || 'Error', message: e.message.slice(0, 500), context })
}

export function reportMetric(name: string, value: number, context?: string) {
  if (Number.isFinite(value)) emit({ kind: 'metric', name, value: Math.round(value), context })
}
