import { CSSProperties } from 'react'

export function Skeleton({ w, h = 14, style }: { w?: number | string; h?: number | string; style?: CSSProperties }) {
  return <span className="skeleton" style={{ width: w ?? '100%', height: h, ...style }} />
}

export function TableSkeleton({ rows = 8, cols = 5, label }: { rows?: number; cols?: number; label?: string }) {
  return (
    <>
      {label && <div className="fill-label" style={{ marginBottom: 12 }}>{label}</div>}
      <div className="card">
        <table>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c}>
                    <Skeleton w={c === 0 ? '55%' : c === cols - 1 ? '40%' : '75%'} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid kpis">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card card-pad kpi">
          <Skeleton w="50%" h={11} />
          <div style={{ marginTop: 10 }}>
            <Skeleton w="70%" h={26} />
          </div>
        </div>
      ))}
    </div>
  )
}
