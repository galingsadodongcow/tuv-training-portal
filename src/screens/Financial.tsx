'use client'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Reports from './Reports'

// The management "Financial" destination (third-pass #8): receivables + revenue
// in one place, so those numbers get a first-class home instead of being buried
// among the Analytics tabs. Each view reuses the existing Reports screen
// `embedded` with a fixed section — one revenue/AR implementation, surfaced here
// for the oversight roles. Deep-linkable via ?view=. RLS stays authoritative.
interface View { key: string; label: string; section: 'revenue' | 'receivables' }
const VIEWS: View[] = [
  { key: 'receivables', label: 'Receivables', section: 'receivables' },
  { key: 'revenue', label: 'Revenue', section: 'revenue' },
]

export default function Financial() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const requested = params.get('view') || 'receivables'
  const active = VIEWS.find((v) => v.key === requested) || VIEWS[0]
  const setView = (k: string) => router.replace(k === 'receivables' ? pathname : `${pathname}?view=${k}`, { scroll: false })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Financial</h1>
          <p>Where the money is — outstanding receivables and the revenue book.</p>
        </div>
      </div>

      <div className="tabbar" role="tablist" aria-label="Financial">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={active.key === v.key}
            className={`tab ${active.key === v.key ? 'tab-on' : ''}`}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <Reports embedded section={active.section} />
    </>
  )
}
