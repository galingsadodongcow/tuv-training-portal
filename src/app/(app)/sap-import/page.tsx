import SapImport from '@/screens/SapImport'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations']}>
      <SapImport />
    </Guard>
  )
}
