export interface CertificatePdfInput {
  certificateNumber: string
  participantName: string
  courseCode: string
  courseTitle: string
  customerName: string
  sessionNumber: string
  trainerName: string
  completedAt: string
  issuedAt: string
  revoked?: boolean
}

function latin1(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?')
}

function pdfText(value: string): string {
  return latin1(value).replace(/([\\()])/g, '\\$1')
}

function centered(value: string, y: number, size: number, font = 'F1'): string {
  const width = latin1(value).length * size * 0.52
  const x = Math.max(54, (842 - width) / 2)
  return `BT /${font} ${size} Tf ${x.toFixed(1)} ${y} Td (${pdfText(value)}) Tj ET`
}

function buildContent(input: CertificatePdfInput): string {
  const statusColor = input.revoked ? '0.65 0.12 0.12' : '0.08 0.34 0.43'
  const lines = [
    'q',
    '0.04 0.16 0.23 RG 3 w 26 26 790 543 re S',
    '0.08 0.34 0.43 RG 1 w 36 36 770 523 re S',
    `${statusColor} rg`,
    centered('ACADEMY PORTAL', 514, 14, 'F2'),
    '0.04 0.16 0.23 rg',
    centered('CERTIFICATE OF COMPLETION', 458, 27, 'F2'),
    '0.30 0.38 0.43 rg',
    centered('This certifies that', 416, 12),
    '0.04 0.16 0.23 rg',
    centered(input.participantName, 364, 29, 'F3'),
    '0.30 0.38 0.43 rg',
    centered('has successfully completed', 326, 12),
    '0.08 0.34 0.43 rg',
    centered(`${input.courseCode} - ${input.courseTitle}`, 286, 20, 'F2'),
    '0.30 0.38 0.43 rg',
    centered(`Delivered for ${input.customerName}`, 250, 11),
    centered(`Completed ${input.completedAt} | Trainer: ${input.trainerName}`, 226, 10),
    '0.04 0.16 0.23 rg',
    `BT /F2 11 Tf 74 126 Td (${pdfText(input.certificateNumber)}) Tj ET`,
    `BT /F1 9 Tf 74 108 Td (Certificate number) Tj ET`,
    `BT /F2 11 Tf 345 126 Td (${pdfText(input.sessionNumber)}) Tj ET`,
    `BT /F1 9 Tf 345 108 Td (Training session) Tj ET`,
    `BT /F2 11 Tf 610 126 Td (${pdfText(input.issuedAt)}) Tj ET`,
    `BT /F1 9 Tf 610 108 Td (Date issued) Tj ET`,
    '0.30 0.38 0.43 rg',
    centered('This document is controlled by the Academy Portal certificate register.', 66, 8),
  ]
  if (input.revoked) {
    lines.push('0.72 0.10 0.10 rg', centered('REVOKED', 184, 32, 'F2'))
  }
  lines.push('Q')
  return lines.join('\n')
}

export function buildCertificatePdf(input: CertificatePdfInput): Uint8Array {
  const content = buildContent(input)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>',
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
  ]
  let output = '%PDF-1.4\n%AcademyPortal\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(new TextEncoder().encode(output).length)
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xref = new TextEncoder().encode(output).length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(output)
}
