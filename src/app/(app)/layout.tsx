'use client'
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Shell from '@/components/Shell'
import CommandPalette from '@/components/CommandPalette'
import { Spinner } from '@/components/ui'

// Authenticated shell: requires a session (redirects to /login otherwise) and a
// loaded profile before rendering any screen. Per-route role restrictions are
// applied with <Guard> inside the individual route files.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !session) router.replace('/login')
  }, [loading, session, router])

  if (loading || !session) {
    return (
      <div className="login-wrap">
        <Spinner label="Loading" />
      </div>
    )
  }
  if (!profile) {
    return (
      <div className="login-wrap">
        <Spinner label="Loading profile" />
      </div>
    )
  }
  return (
    <>
      <Shell>{children}</Shell>
      <CommandPalette />
    </>
  )
}
