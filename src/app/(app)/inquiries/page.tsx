import Inquiries from '@/screens/Inquiries'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor']}>
      <Inquiries />
    </Guard>
  )
}
