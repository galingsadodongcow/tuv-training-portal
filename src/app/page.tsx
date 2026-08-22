import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/profile'
import { homePath } from '@/lib/permissions'
import { logoutAction } from './login/actions'
import { Button } from '@/components/ui/Button'

export default async function HomePage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  if (!profile.is_active) {
    return (
      <main className="center-page">
        <section className="message-card">
          <p className="eyebrow">Access pending</p>
          <h1>Your account is not active yet</h1>
          <p className="muted">Ask an Academy Portal administrator to review your role and activate access.</p>
          <form action={logoutAction}><Button type="submit">Sign out</Button></form>
        </section>
      </main>
    )
  }

  redirect(homePath(profile.role))
}
