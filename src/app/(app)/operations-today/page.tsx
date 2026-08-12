import OperationsToday from '@/screens/OperationsToday'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'business_owner']}>
      <OperationsToday />
    </Guard>
  )
}
