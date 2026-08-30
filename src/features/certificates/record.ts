import type { DeliveryWorkspace, Participant } from '@/features/delivery/types'
import { displaySessionNumber } from '@/features/delivery/rules'

export function certificateRecord(workspace: DeliveryWorkspace, participant: Participant) {
  const session = workspace.sessions.find((item) => item.id === participant.session_id)
  if (!session) return null
  const course = workspace.courses.find((item) => item.id === session.course_id)
  const order = workspace.orders.find((item) => item.id === session.order_id)
  const customer = workspace.customers.find((item) => item.id === order?.customer_id)
  const trainer = workspace.trainers.find((item) => item.id === session.trainer_id)
  if (!course || !customer || !trainer) return null
  const date = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' }).format(new Date(value))
  return {
    participant,
    session,
    course,
    customer,
    trainer,
    sessionNumber: displaySessionNumber(session.session_number),
    completedAt: date(session.ends_at),
    issuedAt: participant.certificate_issued_at ? date(participant.certificate_issued_at) : 'Not yet issued',
  }
}
