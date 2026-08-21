import Resources from '@/screens/Resources'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'business_owner', 'management']}>
      <Resources />
    </Guard>
  )
}
