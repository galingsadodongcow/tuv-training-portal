'use client'
import { useMemo, useState } from 'react'

export interface SortState {
  key: string | null
  dir: 'asc' | 'desc'
}

// Lightweight client-side sort for table screens. `accessor` maps a row + key
// to a comparable value; pass one when a column isn't a top-level field.
export function useSort<T>(rows: T[], accessor?: (row: T, key: string) => unknown, initial?: SortState) {
  const [sort, setSort] = useState<SortState>(initial ?? { key: null, dir: 'asc' })

  const sorted = useMemo(() => {
    if (!sort.key) return rows
    const get = accessor ?? ((r: any, k: string) => r?.[k])
    const out = [...rows].sort((a, b) => {
      const x = get(a, sort.key as string)
      const y = get(b, sort.key as string)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      if (typeof x === 'number' && typeof y === 'number') return x - y
      return String(x).localeCompare(String(y), undefined, { numeric: true })
    })
    return sort.dir === 'asc' ? out : out.reverse()
  }, [rows, sort, accessor])

  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const indicator = (key: string) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '')

  return { sorted, sort, toggle, indicator }
}
