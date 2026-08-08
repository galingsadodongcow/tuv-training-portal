import AuditLog from '@/screens/AuditLog'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin']}>
      <AuditLog />
    </Guard>
  )
}
