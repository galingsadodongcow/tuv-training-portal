import SessionForm from '@/screens/SessionForm'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations']}>
      <SessionForm />
    </Guard>
  )
}
