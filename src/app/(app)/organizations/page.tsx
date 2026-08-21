import { redirect } from 'next/navigation'

// The Organizations book folded into Customer 360 (third-pass #6): a customer's
// parent org and its related accounts live on the customer record now, and org
// records are reached through a customer. The standalone list redirects to the
// customer book; org records stay at /organizations/[id], off-nav.
export default function Page() {
  redirect('/clients')
}
