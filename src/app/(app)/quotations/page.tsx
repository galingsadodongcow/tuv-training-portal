import Quotations from '@/screens/Quotations'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'business_owner', 'sales']}>
      <Quotations />
    </Guard>
  )
}
