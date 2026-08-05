'use client'
import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { session, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && session) router.replace('/dashboard')
  }, [loading, session, router])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <div className="card card-pad login-card">
        <div className="brand">
          <span className="brand-mark">Academy Portal</span>
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
          Academy Training Portal
        </p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Work email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <div className="notice notice-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted" style={{ fontSize: 12, marginTop: 16, textAlign: 'center' }}>
          Accounts are created by the Super Admin in Supabase. Ask Alan for access.
        </p>
      </div>
    </div>
  )
}
