import { redirect } from 'next/navigation'

// Fulfillment folded into the CRM Orders tab as the "Needs fulfillment" saved
// view (third-pass #5). Forward the queue's own filters (who/view/stage) so
// drill-throughs keep working; the fulfillment queue is ?queue=fulfillment,
// distinct from the shell's ?tab.
export default function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams || {})) {
    if (typeof v === 'string') qs.set(k, v)
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x))
  }
  qs.set('tab', 'orders')
  qs.set('queue', 'fulfillment')
  redirect(`/crm?${qs.toString()}`)
}
