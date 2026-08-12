import { redirect } from 'next/navigation'

// Inquiries folded into the single /crm area (Pipeline tab) — third-pass #7.
export default function Page() {
  redirect('/crm?tab=pipeline')
}
