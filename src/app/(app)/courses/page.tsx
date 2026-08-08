import Courses from '@/screens/Courses'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations']}>
      <Courses />
    </Guard>
  )
}
