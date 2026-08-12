import Elearning from '@/screens/Elearning'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'coordinator']}>
      <Elearning />
    </Guard>
  )
}
