'use client'
import { useEffect } from 'react'
import { reportError } from '@/lib/telemetry'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, 'app-error-boundary')
  }, [error])

  return (
    <div className="empty" style={{ maxWidth: 520, margin: '48px auto' }}>
      <h3>Something went wrong</h3>
      <p className="muted" style={{ marginBottom: 18 }}>
        {error?.message || 'An unexpected error occurred while loading this screen.'}
      </p>
      <div className="toolbar" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => reset()}>Try again</button>
      </div>
    </div>
  )
}
