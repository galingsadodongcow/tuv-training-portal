import PricingRules from '@/screens/PricingRules'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'business_owner']}>
      <PricingRules />
    </Guard>
  )
}
