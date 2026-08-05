'use client'
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from './ui'
import type { Role } from '@/lib/roles'

// Client-side role gate. Note: this is UX only — the real enforcement is the
// database's Row-Level Security policies. It redirects unauthorized roles home.
export default function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const allowed = !roles || (profile ? roles.includes(profile.role as Role) : false)

  useEffect(() => {
    if (!loading && profile && !allowed) router.replace('/dashboard')
  }, [loading, profile, allowed, router])

  if (loading || !profile) return <Spinner label="Loading" />
  if (!allowed) return <Spinner label="Redirecting" />
  return <>{children}</>
}
