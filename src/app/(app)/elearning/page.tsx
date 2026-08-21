import { redirect } from 'next/navigation'

// E-learning access folded into the CRM Orders tab as the "Awaiting e-learning"
// saved view (third-pass #14). The screen (and its grant actions) is unchanged,
// just reached through Orders now.
export default function Page() {
  redirect('/crm?tab=orders&queue=elearning')
}
