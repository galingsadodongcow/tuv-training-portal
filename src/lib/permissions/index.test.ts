import { describe, expect, it } from 'vitest'
import {
  canApproveDiscount,
  canManageTraining,
  canViewCustomers,
  canViewMyWork,
  canViewOverview,
  canViewSales,
  homePath,
  navigationForRole,
} from './index'
import type { Profile } from '@/types/auth'

describe('permissions', () => {
  it('limits catalogue writes to operations and administrators', () => {
    expect(canManageTraining('administrator')).toBe(true)
    expect(canManageTraining('operations')).toBe(true)
    expect(canManageTraining('sales')).toBe(false)
    expect(canManageTraining('manager')).toBe(false)
    expect(canManageTraining('auditor')).toBe(false)
  })

  it('uses a materially different home for each responsibility', () => {
    expect(homePath('administrator')).toBe('/administration')
    expect(homePath('operations')).toBe('/my-work')
    expect(homePath('sales')).toBe('/my-work')
    expect(homePath('manager')).toBe('/overview')
    expect(homePath('auditor')).toBe('/overview')
  })

  it('keeps role navigation small and authority-aligned', () => {
    expect(navigationForRole('sales').map((item) => item.href)).toEqual(['/my-work', '/sales', '/customers'])
    expect(canViewMyWork('operations')).toBe(true)
    expect(canViewMyWork('sales')).toBe(true)
    expect(canViewSales('sales')).toBe(true)
    expect(canViewSales('auditor')).toBe(false)
    expect(canViewCustomers('operations')).toBe(true)
    expect(canViewOverview('manager')).toBe(true)
    expect(canViewOverview('operations')).toBe(false)
  })

  it('models Sales Supervisor as a scope rather than a sixth role', () => {
    const base = { id: '1', full_name: 'Sales user', role: 'sales', is_active: true } as Profile
    expect(canApproveDiscount({ ...base, is_sales_supervisor: false })).toBe(false)
    expect(canApproveDiscount({ ...base, is_sales_supervisor: true })).toBe(true)
  })
})
