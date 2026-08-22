'use client'

import { Button } from '@/components/ui/Button'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="center-page">
      <section className="message-card">
        <p className="eyebrow">Something went wrong</p>
        <h1>The page could not be loaded</h1>
        <p className="muted">Try again. If the problem continues, ask an administrator to check the deployment and database connection.</p>
        <Button onClick={reset}>Try again</Button>
      </section>
    </main>
  )
}
