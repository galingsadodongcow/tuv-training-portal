import QuoteDetail from '@/screens/QuoteDetail'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'business_owner', 'sales']}>
      <QuoteDetail />
    </Guard>
  )
}
