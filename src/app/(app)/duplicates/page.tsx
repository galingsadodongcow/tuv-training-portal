import Duplicates from '@/screens/Duplicates'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'coordinator']}>
      <Duplicates />
    </Guard>
  )
}
