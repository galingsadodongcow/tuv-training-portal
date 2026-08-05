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
  signOut: () => Promise<unknown>
}

const AuthCtx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) return
    let active = true
    supabase
      .from('profiles')
      .select('user_id, full_name, role, sales_id, salesperson:sales_id(name, code, is_supervisor)')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setProfile(data as any)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [session])

  const signOut = () => supabase.auth.signOut()

  return <AuthCtx.Provider value={{ session, profile, loading, signOut }}>{children}</AuthCtx.Provider>
}

export const useAuth = (): AuthValue => {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
