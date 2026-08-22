'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function resetUrl(kind: 'error' | 'message', value: string) {
  return `/reset-password?${kind}=${encodeURIComponent(value)}`
}

export async function requestRecoveryCodeAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) redirect(resetUrl('error', 'Enter your email address.'))

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email)

  if (error) {
    const isRateLimited =
      error.status === 429 ||
      error.code === 'over_email_send_rate_limit' ||
      /rate limit/i.test(error.message)

    if (isRateLimited) {
      redirect(resetUrl('error', 'No recovery email was sent because the email limit has been reached. Wait for the next hourly window, then try once.'))
    }

    redirect(resetUrl('error', 'No recovery email was sent. Please try again later or contact the portal administrator.'))
  }

  // Keep this response deliberately generic to avoid revealing registered accounts.
  redirect(resetUrl('message', 'If that account exists, a recovery email has been sent. Enter the code from the email below.'))
}

export async function updatePasswordWithCodeAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const token = String(formData.get('token') ?? '').replace(/\s/g, '')
  const password = String(formData.get('password') ?? '')
  const confirmation = String(formData.get('confirmation') ?? '')

  if (!email || !token || !password || !confirmation) {
    redirect(resetUrl('error', 'Complete all password reset fields.'))
  }
  if (!/^\d{6,8}$/.test(token)) {
    redirect(resetUrl('error', 'Enter the numeric recovery code from your email.'))
  }
  if (password.length < 8) {
    redirect(resetUrl('error', 'Use a password with at least 8 characters.'))
  }
  if (password !== confirmation) {
    redirect(resetUrl('error', 'The two passwords do not match.'))
  }

  const supabase = await createClient()
  const { error: verificationError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'recovery',
  })
  if (verificationError) {
    redirect(resetUrl('error', 'The recovery code is invalid or expired. Request a new code and try again.'))
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    redirect(resetUrl('error', 'The password could not be updated. Request a new code and try again.'))
  }

  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login?message=Password%20updated.%20Sign%20in%20with%20your%20new%20password.')
}
