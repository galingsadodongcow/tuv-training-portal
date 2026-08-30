import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displayParticipantNumber, displaySessionNumber } from '@/features/delivery/rules'
import { toCsv } from '@/features/exports/csv'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewDelivery } from '@/lib/permissions'

function download(csv: string, name: string) {
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' } })
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) return new Response('Authentication required.', { status: 401 })
  if (!canViewDelivery(profile.role)) return new Response('Not permitted.', { status: 403 })
  const [{ kind }, workspace] = await Promise.all([params, getDeliveryWorkspace()])
  const requestedSession = new URL(request.url).searchParams.get('session')
  const sessions = new Map(workspace.sessions.map((item) => [item.id, item]))
  const courses = new Map(workspace.courses.map((item) => [item.id, item]))
  const customers = new Map(workspace.customers.map((item) => [item.id, item]))
  const orders = new Map(workspace.orders.map((item) => [item.id, item]))
  const trainers = new Map(workspace.trainers.map((item) => [item.id, item]))
  if (kind === 'participants') {
    const rows = requestedSession ? workspace.participants.filter((item) => item.session_id === requestedSession && sessions.has(requestedSession)) : workspace.participants
    return download(toCsv(rows, [
      { header: 'Participant number', value: (row) => displayParticipantNumber(row.participant_number) },
      { header: 'Full name', value: (row) => row.full_name }, { header: 'Email', value: (row) => row.email },
      { header: 'Phone', value: (row) => row.phone }, { header: 'Employee reference', value: (row) => row.employee_reference },
      { header: 'Session number', value: (row) => displaySessionNumber(sessions.get(row.session_id)?.session_number ?? 0) },
      { header: 'Registration status', value: (row) => row.status }, { header: 'Attendance', value: (row) => row.attendance_status },
      { header: 'Assessment', value: (row) => row.assessment_status }, { header: 'Score', value: (row) => row.assessment_score },
      { header: 'Certificate status', value: (row) => row.certificate_status }, { header: 'Certificate number', value: (row) => row.certificate_number },
    ]), requestedSession ? `session-${displaySessionNumber(sessions.get(requestedSession)?.session_number ?? 0)}-roster.csv` : 'participant-register.csv')
  }
  if (kind === 'sessions') {
    return download(toCsv(workspace.sessions, [
      { header: 'Session number', value: (row) => displaySessionNumber(row.session_number) },
      { header: 'Course', value: (row) => `${courses.get(row.course_id)?.code ?? ''} ${courses.get(row.course_id)?.title ?? ''}`.trim() },
      { header: 'Customer', value: (row) => customers.get(orders.get(row.order_id)?.customer_id ?? '')?.name },
      { header: 'Trainer', value: (row) => trainers.get(row.trainer_id)?.name }, { header: 'Status', value: (row) => row.status },
      { header: 'Starts at', value: (row) => row.starts_at }, { header: 'Ends at', value: (row) => row.ends_at },
      { header: 'Capacity', value: (row) => row.capacity }, { header: 'Registered', value: (row) => workspace.participants.filter((item) => item.session_id === row.id && !['cancelled', 'transferred'].includes(item.status)).length },
    ]), 'training-sessions.csv')
  }
  if (kind === 'certificates') {
    const rows = workspace.participants.filter((item) => ['eligible', 'issued', 'revoked'].includes(item.certificate_status))
    return download(toCsv(rows, [
      { header: 'Certificate number', value: (row) => row.certificate_number }, { header: 'Participant', value: (row) => row.full_name },
      { header: 'Session number', value: (row) => displaySessionNumber(sessions.get(row.session_id)?.session_number ?? 0) },
      { header: 'Course', value: (row) => { const course = courses.get(sessions.get(row.session_id)?.course_id ?? ''); return `${course?.code ?? ''} ${course?.title ?? ''}`.trim() } },
      { header: 'Status', value: (row) => row.certificate_status }, { header: 'Issued at', value: (row) => row.certificate_issued_at },
      { header: 'Compliance note', value: (row) => row.certificate_note },
    ]), 'certificate-register.csv')
  }
  return new Response('Export not found.', { status: 404 })
}
