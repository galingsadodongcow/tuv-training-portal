import { redirect } from 'next/navigation'

// Quotations folded into the single /crm area (Quotes tab) — third-pass #7.
// The quote record route (/quotations/[id]) is unchanged.
export default function Page() {
  redirect('/crm?tab=quotes')
}
