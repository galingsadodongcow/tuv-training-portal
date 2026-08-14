'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface Profile {
  user_id: string
  full_name: string | null
  role: string
  sales_id: string | null
  salesperson?: { name: string; code: string; is_supervisor: boolean } | null
}

interface AuthValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileError: Error | null
  retryProfile: () => void
  signOut: () => Promise<unknown>
}

const AuthCtx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<Error | null>(null)
  const [profileAttempt, setProfileAttempt] = useState(0)
  const userId = session?.user?.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setProfileError(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    setProfileError(null)
    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id, full_name, role, sales_id, salesperson:sales_id(name, code, is_supervisor)')
          .eq('user_id', userId)
          .maybeSingle()
        if (!active) return
        if (error) throw error
        if (!data) throw new Error('Your account does not have an application profile. Contact an administrator.')
        setProfile(data as any)
        setLoading(false)
      } catch (error) {
        if (!active) return
        setProfile(null)
        setProfileError(error instanceof Error ? error : new Error(String(error)))
        setLoading(false)
      }
    }
    void loadProfile()
    return () => {
      active = false
    }
  }, [userId, profileAttempt])

  const signOut = () => supabase.auth.signOut()
  const retryProfile = () => setProfileAttempt((attempt) => attempt + 1)

  return <AuthCtx.Provider value={{ session, profile, loading, profileError, retryProfile, signOut }}>{children}</AuthCtx.Provider>
}

export const useAuth = (): AuthValue => {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
