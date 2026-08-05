'use client'

// Catches errors thrown in the root layout itself. Must render its own
// <html>/<body> because it replaces the root layout when it fires.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: 20 }}>{error?.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={() => reset()}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #171717', background: '#171717', color: '#fff', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
