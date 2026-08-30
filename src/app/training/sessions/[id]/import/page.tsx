import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { ParticipantImportForm } from '@/features/imports/ParticipantImportForm'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displaySessionNumber } from '@/features/delivery/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageDelivery } from '@/lib/permissions'

export default async function ParticipantImportPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canManageDelivery(profile.role)) redirect('/training')
  const [{ id }, workspace] = await Promise.all([params, getDeliveryWorkspace()])
  const session = workspace.sessions.find((item) => item.id === id)
  if (!session) notFound()
  const course = workspace.courses.find((item) => item.id === session.course_id)
  return <AppShell profile={profile} active="training">
    <div className="breadcrumb"><Link href={`/training/sessions/${id}`}>{displaySessionNumber(session.session_number)}</Link><span>/</span><span>Participant import</span></div>
    <div className="page-heading"><div><p className="eyebrow">Dry-run data import</p><h1>Import participants</h1><p>{course?.title} · Validate the complete file before adding any registration.</p></div><a className="button button-secondary" href="/participant-import-template.csv" download>Download template</a></div>
    <section className="workspace-section"><div className="section-heading"><div><h2>Upload and verify</h2><p>Validation catches format errors and duplicates already on this session roster. Database capacity and waitlist controls still apply during import.</p></div></div><ParticipantImportForm sessionId={id} /></section>
  </AppShell>
}
