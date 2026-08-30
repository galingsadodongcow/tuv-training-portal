import { describe, expect, it } from 'vitest'
import { buildCertificatePdf } from './pdf'

describe('certificate PDF', () => {
  it('creates a single-page PDF and safely escapes dynamic text', () => {
    const bytes = buildCertificatePdf({
      certificateNumber: 'CERT-000123',
      participantName: 'Alex (QA) \\ Santos',
      courseCode: 'ISO-9001',
      courseTitle: 'Internal Auditor',
      customerName: 'Example Manufacturing',
      sessionNumber: 'SES-000042',
      trainerName: 'Jamie Trainer',
      completedAt: '31 August 2026',
      issuedAt: '31 August 2026',
    })
    const pdf = new TextDecoder().decode(bytes)
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('/Count 1')
    expect(pdf).toContain('Alex \\(QA\\) \\\\ Santos')
    expect(pdf).toContain('xref')
    expect(pdf.endsWith('%%EOF\n')).toBe(true)
  })

  it('marks revoked documents', () => {
    const pdf = new TextDecoder().decode(buildCertificatePdf({
      certificateNumber: 'CERT-REVOKED', participantName: 'Test User', courseCode: 'QA', courseTitle: 'Quality',
      customerName: 'Test Customer', sessionNumber: 'SES-1', trainerName: 'Trainer', completedAt: '1 August 2026',
      issuedAt: '2 August 2026', revoked: true,
    }))
    expect(pdf).toContain('(REVOKED)')
  })
})
