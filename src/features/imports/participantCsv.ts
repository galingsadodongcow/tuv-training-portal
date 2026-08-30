export const PARTICIPANT_IMPORT_HEADERS = ['full_name', 'email', 'phone', 'employee_reference'] as const

export interface ParticipantImportRow {
  line: number
  full_name: string
  email: string
  phone: string
  employee_reference: string
  errors: string[]
}

function parseRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"' && cell.length === 0) quoted = true
    else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  if (quoted) throw new Error('A quoted CSV field was not closed.')
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value.trim()))
}

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

export function parseParticipantCsv(csv: string): { rows: ParticipantImportRow[]; fileErrors: string[] } {
  if (new TextEncoder().encode(csv).length > 250_000) return { rows: [], fileErrors: ['CSV data must be 250 KB or smaller.'] }
  let source: string[][]
  try {
    source = parseRows(csv.replace(/^\uFEFF/, ''))
  } catch (error) {
    return { rows: [], fileErrors: [error instanceof Error ? error.message : 'The CSV could not be read.'] }
  }
  if (!source.length) return { rows: [], fileErrors: ['Paste or choose a CSV file with a header row.'] }
  const headers = source[0].map(normalized)
  if (!headers.includes('full_name')) return { rows: [], fileErrors: ['The header row must contain full_name.'] }
  const unknown = headers.filter((header) => header && !PARTICIPANT_IMPORT_HEADERS.includes(header as typeof PARTICIPANT_IMPORT_HEADERS[number]))
  if (unknown.length) return { rows: [], fileErrors: [`Unsupported columns: ${unknown.join(', ')}.`] }
  if (source.length - 1 > 200) return { rows: [], fileErrors: ['Import a maximum of 200 participants at a time.'] }
  const index = (name: string) => headers.indexOf(name)
  const rows = source.slice(1).map((cells, offset): ParticipantImportRow => {
    const get = (name: string) => index(name) < 0 ? '' : (cells[index(name)] ?? '').trim()
    const row: ParticipantImportRow = {
      line: offset + 2,
      full_name: get('full_name'),
      email: get('email'),
      phone: get('phone'),
      employee_reference: get('employee_reference'),
      errors: [],
    }
    if (row.full_name.length < 2 || row.full_name.length > 160) row.errors.push('Full name must be 2–160 characters.')
    if (row.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) || row.email.length > 254)) row.errors.push('Enter a valid email address.')
    if (row.phone.length > 40) row.errors.push('Phone must be 40 characters or fewer.')
    if (row.employee_reference.length > 80) row.errors.push('Employee reference must be 80 characters or fewer.')
    return row
  })
  const duplicate = (field: 'email' | 'employee_reference', label: string) => {
    const seen = new Set<string>()
    for (const row of rows) {
      const key = normalized(row[field])
      if (!key) continue
      if (seen.has(key)) row.errors.push(`Duplicate ${label} in this CSV.`)
      seen.add(key)
    }
  }
  duplicate('email', 'email')
  duplicate('employee_reference', 'employee reference')
  return { rows, fileErrors: [] }
}
