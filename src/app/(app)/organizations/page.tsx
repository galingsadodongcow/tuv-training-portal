import Organizations from '@/screens/Organizations'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor']}>
      <Organizations />
    </Guard>
  )
}
