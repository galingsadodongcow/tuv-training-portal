import Rollover from '@/screens/Rollover'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations']}>
      <Rollover />
    </Guard>
  )
}
