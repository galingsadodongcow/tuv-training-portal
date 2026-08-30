import { describe, expect, it } from 'vitest'
import { parseParticipantCsv } from './participantCsv'

describe('participant CSV import', () => {
  it('supports quoted fields and the documented optional columns', () => {
    const result = parseParticipantCsv('full_name,email,phone,employee_reference\r\n"Santos, Alex",alex@example.com,0917,EMP-1')
    expect(result.fileErrors).toEqual([])
    expect(result.rows[0]).toMatchObject({ full_name: 'Santos, Alex', email: 'alex@example.com', employee_reference: 'EMP-1', errors: [] })
  })

  it('rejects missing required headers and detects duplicates', () => {
    expect(parseParticipantCsv('email\na@example.com').fileErrors[0]).toContain('full_name')
    const result = parseParticipantCsv('full_name,email\nAlex,a@example.com\nJamie,a@example.com')
    expect(result.rows[1].errors).toContain('Duplicate email in this CSV.')
  })

  it('does not interpret spreadsheet-like participant values', () => {
    const result = parseParticipantCsv('full_name,employee_reference\nAlex,=A1')
    expect(result.rows[0].employee_reference).toBe('=A1')
  })
})
