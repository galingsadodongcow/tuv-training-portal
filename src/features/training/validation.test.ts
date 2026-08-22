import { describe, expect, it } from 'vitest'
import { parseCourse, parsePrice, parseVenue } from './validation'

function form(values: Record<string, string>) {
  const data = new FormData()
  Object.entries(values).forEach(([key, value]) => data.set(key, value))
  return data
}

describe('training validation', () => {
  it('normalizes a valid course code and duration', () => {
    const result = parseCourse(form({ category_id: 'cat', code: ' iso-9001 ', title: 'Lead Auditor', duration_hours: '8', default_capacity: '20' }))
    expect(result).toEqual({
      ok: true,
      value: { category_id: 'cat', code: 'ISO-9001', title: 'Lead Auditor', duration_minutes: 480, default_capacity: 20 },
    })
  })

  it('rejects non-whole capacity', () => {
    const result = parseCourse(form({ category_id: 'cat', code: 'C-1', title: 'Course', duration_hours: '8', default_capacity: '2.5' }))
    expect(result.ok).toBe(false)
  })

  it('accepts zero-priced training but rejects malformed currency', () => {
    expect(parsePrice(form({ course_id: 'course', learning_type: 'virtual', amount: '0', currency: 'php' })).ok).toBe(true)
    expect(parsePrice(form({ course_id: 'course', learning_type: 'virtual', amount: '10', currency: 'peso' })).ok).toBe(false)
  })

  it('requires capacity only for physical venues', () => {
    expect(parseVenue(form({ name: 'Teams', venue_type: 'virtual', capacity: '' })).ok).toBe(true)
    expect(parseVenue(form({ name: 'Room A', venue_type: 'physical', capacity: '' })).ok).toBe(false)
  })
})

