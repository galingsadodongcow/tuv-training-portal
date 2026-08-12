import { ReactNode } from 'react'
import { Empty } from './ui'

export type ChartColumn = { key: string; label: string; align?: 'right' }

// Accessible data-table alternative to a chart. Callers pass the same array that
// feeds the chart, with each cell value pre-formatted (php / num / shortDate), so
// screen-reader and keyboard users get the numbers a canvas chart hides.
export default function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: ChartColumn[]
  rows: any[]
}) {
  if (!rows.length) return <Empty title="No data" />
  return (
    <div className="scroll-x">
      <table>
        {/* No .sr-only token in globals; a muted visible caption doubles as the chart's label. */}
        <caption className="k-label" style={{ textAlign: 'left', marginBottom: 8 }}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'right' ? 'right' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'right' : undefined}>{r[c.key] as ReactNode}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Small toggle that flips a chart card between its chart and its data table.
export function ChartTableToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button className="linkbtn" aria-pressed={on} onClick={onToggle}>
      {on ? 'View as chart' : 'View as table'}
    </button>
  )
}
