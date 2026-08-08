import Worklist from '@/screens/Worklist'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'business_owner', 'sales']}>
      <Worklist />
    </Guard>
  )
}
