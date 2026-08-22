import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { requestRecoveryCodeAction, updatePasswordWithCodeAction } from './actions'

type ResetSearchParams = Promise<{ error?: string; message?: string }>

export default async function ResetPasswordPage({ searchParams }: { searchParams: ResetSearchParams }) {
  const { error, message } = await searchParams

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-title">
        <div className="auth-brand"><span className="brand-mark">AP</span></div>
        <p className="eyebrow">Account recovery</p>
        <h1 id="reset-title">Reset your password</h1>
        <p className="muted">Use a recovery code instead of the email link. This prevents corporate link scanners from consuming your reset request.</p>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {message ? <div className="alert alert-success" role="status">{message}</div> : null}

        <form action={requestRecoveryCodeAction} className="form-stack auth-section">
          <h2>1. Request a code</h2>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <Button type="submit" className="button-secondary">Send recovery code</Button>
        </form>

        <form action={updatePasswordWithCodeAction} className="form-stack auth-section">
          <h2>2. Set a new password</h2>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Recovery code</span>
            <input name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required />
          </label>
          <label className="field">
            <span>New password</span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input name="confirmation" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <Button type="submit">Update password</Button>
        </form>

        <p className="auth-footer"><Link href="/login">Back to sign in</Link></p>
      </section>
    </main>
  )
}
