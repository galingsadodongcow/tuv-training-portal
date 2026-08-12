import { redirect } from 'next/navigation'

// Orders folded into the single /crm area (Orders tab) — third-pass #7. Forward
// the list filters (q/stage/pay) that drill-throughs pass so deep links keep
// working. The order record route (/orders/[id]) is unchanged.
export default function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams || {})) {
    if (typeof v === 'string') qs.set(k, v)
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x))
  }
  qs.set('tab', 'orders')
  redirect(`/crm?${qs.toString()}`)
}
