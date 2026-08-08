import Communications from '@/screens/Communications'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations']}>
      <Communications />
    </Guard>
  )
}
