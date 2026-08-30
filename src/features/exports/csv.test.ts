import { describe, expect, it } from 'vitest'
import { safeCsvCell, toCsv } from './csv'

describe('CSV export safety', () => {
  it('escapes commas, quotes, and spreadsheet formulas', () => {
    expect(safeCsvCell('Smith, Jane')).toBe('"Smith, Jane"')
    expect(safeCsvCell('He said "yes"')).toBe('"He said ""yes"""')
    expect(safeCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"')
  })

  it('writes a UTF-8 Excel-friendly CSV', () => {
    expect(toCsv([{ name: 'Jane' }], [{ header: 'Name', value: (row) => row.name }])).toBe('\uFEFFName\r\nJane\r\n')
  })
})
