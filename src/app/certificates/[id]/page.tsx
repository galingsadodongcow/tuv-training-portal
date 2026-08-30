import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { certificateRecord } from '@/features/certificates/record'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewDelivery } from '@/lib/permissions'

export default async function CertificateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewDelivery(profile.role)) redirect('/')
  const [{ id }, workspace] = await Promise.all([params, getDeliveryWorkspace()])
  const participant = workspace.participants.find((item) => item.id === id && ['issued', 'revoked'].includes(item.certificate_status))
  const record = participant ? certificateRecord(workspace, participant) : null
  if (!participant || !record || !participant.certificate_number) notFound()
  return <AppShell profile={profile} active="participants">
    <div className="breadcrumb"><Link href="/certificates">Certificate register</Link><span>/</span><span>{participant.certificate_number}</span></div>
      <div className="page-heading"><div><p className="eyebrow">Controlled certificate document</p><h1>{participant.certificate_number}</h1><p>Issued from a completed, eligible training record.</p></div><Link prefetch={false} className="button" href={`/api/certificates/${participant.id}/pdf`} download>Download PDF</Link></div>
    {participant.certificate_status === 'revoked' ? <div className="alert alert-error">This certificate is revoked. The PDF is retained with a revoked mark for audit evidence and must not be presented as valid.</div> : null}
    <section className={`certificate-sheet ${participant.certificate_status === 'revoked' ? 'certificate-revoked' : ''}`} aria-label="Certificate preview">
      <div className="certificate-inner"><p className="certificate-brand">ACADEMY PORTAL</p><h2>Certificate of Completion</h2><p>This certifies that</p><strong>{participant.full_name}</strong><p>has successfully completed</p><h3>{record.course.code} · {record.course.title}</h3><p>Delivered for {record.customer.name}</p><div className="certificate-facts"><span><b>{participant.certificate_number}</b>Certificate number</span><span><b>{record.sessionNumber}</b>Training session</span><span><b>{record.issuedAt}</b>Date issued</span></div>{participant.certificate_status === 'revoked' ? <div className="certificate-watermark">REVOKED</div> : null}</div>
    </section>
    <section className="workspace-section"><div className="section-heading"><div><h2>Compliance evidence</h2><p>Document facts are derived directly from the participant, session, and issuance audit record.</p></div></div><dl className="detail-grid"><div><dt>Participant</dt><dd>{participant.full_name}</dd></div><div><dt>Status</dt><dd className="capitalize">{participant.certificate_status}</dd></div><div><dt>Course</dt><dd>{record.course.code}<br />{record.course.title}</dd></div><div><dt>Customer</dt><dd>{record.customer.name}</dd></div><div><dt>Completed</dt><dd>{record.completedAt}</dd></div><div><dt>Trainer</dt><dd>{record.trainer.name}</dd></div><div className="detail-wide"><dt>Compliance note</dt><dd>{participant.certificate_note ?? 'No exception note recorded.'}</dd></div></dl></section>
  </AppShell>
}
