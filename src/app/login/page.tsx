import Link from 'next/link'
import { loginAction } from './actions'
import { Button } from '@/components/ui/Button'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { error, message } = await searchParams
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand"><span className="brand-mark">AP</span></div>
        <p className="eyebrow">Internal training operations</p>
        <h1 id="login-title">Sign in to Academy Portal</h1>
        <p className="muted">Use the account issued by your administrator.</p>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {message ? <div className="alert alert-success" role="status">{message}</div> : null}
        <form action={loginAction} className="form-stack">
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required autoFocus />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <Button type="submit">Sign in</Button>
        </form>
        <p className="auth-footer"><Link href="/reset-password">Forgot your password?</Link></p>
      </section>
    </main>
  )
}
