'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { homePathForRole } from '@/lib/roles'
import { Spinner } from '@/components/ui'

// Root entry: send an authenticated user to their own home surface (management →
// Overview, auditor → Audit, everyone else → My Work), and anyone without a
// session to login. Role-aware so the home isn't the shared My Work queue for
// roles that don't have one.
export default function Root() {
  const { session, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!session) { router.replace('/login'); return }
    if (profile) router.replace(homePathForRole(profile.role))
  }, [loading, session, profile, router])

  return (
    <div className="login-wrap">
      <Spinner label="Loading" />
    </div>
  )
}
