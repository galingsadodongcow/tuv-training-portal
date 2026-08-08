import DataQuality from '@/screens/DataQuality'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin']}>
      <DataQuality />
    </Guard>
  )
}
