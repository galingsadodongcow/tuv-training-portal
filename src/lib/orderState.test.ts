import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectionState, isPaidUnendorsed, isStalled, orderBlockers, primaryFlag, stageLabel } from './orderState'

describe('order state', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-08-14T00:00:00Z')))

  it('uses clear display labels without changing stored stage values', () => {
    expect(stageLabel('For Order Creation')).toBe('Ready to create order')
    expect(stageLabel('Custom stage')).toBe('Custom stage')
  })

  it('classifies the collection clock at its boundaries', () => {
    expect(collectionState({ order_date: '2026-07-22', payment_status: 'Unpaid' })).toBe('Due soon')
    expect(collectionState({ order_date: '2026-07-14', payment_status: 'Unpaid' })).toBe('Overdue')
    expect(collectionState({ order_date: '2026-01-01', payment_status: 'Paid' })).toBe('Paid')
  })

  it('does not flag cancelled work and prioritizes a paid-unendorsed blocker', () => {
    const cancelled = { order_status: 'Cancelled', age_days: 90, days_in_stage: 90 }
    expect(orderBlockers(cancelled)).toEqual([])
    expect(isStalled(cancelled)).toBe(false)

    const open = { payment_status: 'Paid', fulfillment_stage: 'New', owner_code: null, days_in_stage: 20 }
    expect(isPaidUnendorsed(open)).toBe(true)
    expect(primaryFlag(open)?.label).toBe('Paid, not yet endorsed')
  })
})
