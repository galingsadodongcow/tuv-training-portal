'use client'
import { orderFlags, primaryFlag, flagClass } from '../lib/orderState'

// A one-line state banner for the order workspace. It leads with the single
// most important problem, then lists the rest as chips. When nothing is wrong
// it says so quietly, so a clean order still reads as deliberately clear.
export default function BlockerBar({ order }: { order: any }) {
  const flags = orderFlags(order)
  const primary = primaryFlag(order)

  if (!primary) {
    return (
      <div className="blockerbar blockerbar-ok">
        <span className="blockerbar-dot" />
        <span>No blockers. This order is on track.</span>
      </div>
    )
  }

  const rest = flags.filter((f) => f !== primary)
  return (
    <div className={`blockerbar blockerbar-${primary.tone}`}>
      <span className="blockerbar-dot" />
      <span className="blockerbar-lead">{primary.label}</span>
      {rest.length > 0 && (
        <span className="blockerbar-rest">
          {rest.map((f, i) => (
            <span key={i} className={`pill ${flagClass(f)}`}>
              {f.label}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
