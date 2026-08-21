'use client'

import { useEffect } from 'react'
import { reportError, reportMetric } from '@/lib/telemetry'

export default function Observability() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError(event.error || event.message, 'window.error')
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason, 'unhandledrejection')
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    const observers: PerformanceObserver[] = []
    if ('PerformanceObserver' in window) {
      try {
        const lcp = new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1)
          if (last) reportMetric('largest-contentful-paint', last.startTime)
        })
        lcp.observe({ type: 'largest-contentful-paint', buffered: true })
        observers.push(lcp)
      } catch { /* unsupported entry type */ }

      try {
        const longTasks = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) reportMetric('long-task', entry.duration)
        })
        longTasks.observe({ type: 'longtask', buffered: true })
        observers.push(longTasks)
      } catch { /* unsupported entry type */ }
    }

    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav) reportMetric('dom-interactive', nav.domInteractive)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      observers.forEach((observer) => observer.disconnect())
    }
  }, [])

  return null
}
