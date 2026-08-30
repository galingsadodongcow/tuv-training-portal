import { buildCertificatePdf } from '@/features/certificates/pdf'
import { certificateRecord } from '@/features/certificates/record'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewDelivery } from '@/lib/permissions'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) return new Response('Authentication required.', { status: 401 })
  if (!canViewDelivery(profile.role)) return new Response('Not permitted.', { status: 403 })
  const [{ id }, workspace] = await Promise.all([params, getDeliveryWorkspace()])
  const participant = workspace.participants.find((item) => item.id === id && ['issued', 'revoked'].includes(item.certificate_status))
  const record = participant ? certificateRecord(workspace, participant) : null
  if (!record || !participant?.certificate_number) return new Response('Certificate not found.', { status: 404 })
  const bytes = buildCertificatePdf({
    certificateNumber: participant.certificate_number,
    participantName: participant.full_name,
    courseCode: record.course.code,
    courseTitle: record.course.title,
    customerName: record.customer.name,
    sessionNumber: record.sessionNumber,
    trainerName: record.trainer.name,
    completedAt: record.completedAt,
    issuedAt: record.issuedAt,
    revoked: participant.certificate_status === 'revoked',
  })
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Response(body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${participant.certificate_number}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
