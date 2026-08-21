import { describe, expect, it } from 'vitest'
import { updateUrlParams } from './urlParams'

describe('updateUrlParams', () => {
  it('applies related changes atomically without losing existing values', () => {
    const next = updateUrlParams(new URLSearchParams('page=4&sort=amount'), { stage: 'SAP Created', page: 0 })
    expect(next.toString()).toBe('page=0&sort=amount&stage=SAP+Created')
  })

  it('removes empty, all, null, and undefined filters', () => {
    const next = updateUrlParams(new URLSearchParams('q=old&stage=New&pay=Paid&owner=abc'), {
      q: '', stage: 'all', pay: null, owner: undefined,
    })
    expect(next.toString()).toBe('')
  })
})
