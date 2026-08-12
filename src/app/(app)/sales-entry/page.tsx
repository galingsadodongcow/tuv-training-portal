import SalesEntry from '@/screens/SalesEntry'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'sales', 'coordinator']}>
      <SalesEntry />
    </Guard>
  )
}
