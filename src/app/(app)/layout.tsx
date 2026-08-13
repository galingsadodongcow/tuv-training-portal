'use client'
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Shell from '@/components/Shell'
import CommandPalette from '@/components/CommandPalette'
import { ErrorNote, Spinner } from '@/components/ui'

// Authenticated shell: requires a session (redirects to /login otherwise) and a
// loaded profile before rendering any screen. Per-route role restrictions are
// applied with <Guard> inside the individual route files.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, profile, loading, profileError, retryProfile, signOut } = useAuth()
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
        <div className="card card-pad login-card">
          <h1 style={{ fontSize: 20, marginTop: 0 }}>Unable to load your profile</h1>
          <ErrorNote error={profileError || new Error('No application profile was returned.')} />
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={retryProfile}>Try again</button>
            <button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
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
