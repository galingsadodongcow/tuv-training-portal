import { describe, expect, it } from 'vitest'
import { displayNumber, isOverdueInquiry, quotationTotals } from './rules'
import type { Inquiry, QuotationLine } from './types'

describe('sales workflow rules', () => {
  it('calculates a quotation discount from immutable line snapshots', () => {
    const lines = [
      { unit_price: 1000, participant_count: 10 },
      { unit_price: 500, participant_count: 4 },
    ] as QuotationLine[]
    expect(quotationTotals(lines, 10)).toEqual({ subtotal: 12000, discount: 1200, total: 10800 })
  })

  it('keeps only unresolved past follow-ups in My Work', () => {
    const inquiry = { follow_up_on: '2026-08-20', status: 'qualified' } as Inquiry
    expect(isOverdueInquiry(inquiry, '2026-08-22')).toBe(true)
    expect(isOverdueInquiry({ ...inquiry, status: 'won' }, '2026-08-22')).toBe(false)
  })

  it('formats stable human-readable workflow references', () => {
    expect(displayNumber('ORD', 42)).toBe('ORD-00042')
  })
})
