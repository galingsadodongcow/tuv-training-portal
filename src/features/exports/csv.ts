export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

export function safeCsvCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((column) => safeCsvCell(column.header)).join(',')]
  for (const row of rows) lines.push(columns.map((column) => safeCsvCell(column.value(row))).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
