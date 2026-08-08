import Admin from '@/screens/Admin'
import Guard from '@/components/Guard'

export default function Page() {
  return (
    <Guard roles={['super_admin']}>
      <Admin />
    </Guard>
  )
}
