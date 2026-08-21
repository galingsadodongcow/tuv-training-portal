import { describe, expect, it } from 'vitest'
import { healthMeta, healthNeedsAction, signalFromTone } from './health'

describe('shared attention scale', () => {
  it('maps danger and warning tones consistently', () => {
    expect(signalFromTone('danger')).toBe('blocked')
    expect(signalFromTone('warn')).toBe('risk')
  })

  it('marks only actionable session health states', () => {
    expect(healthNeedsAction('Needs Attention')).toBe(true)
    expect(healthNeedsAction('Completed')).toBe(false)
    expect(healthMeta('At Risk')).toMatchObject({ label: 'At risk', signal: 'risk' })
  })
})
