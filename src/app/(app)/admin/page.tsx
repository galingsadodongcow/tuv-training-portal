import Admin from '@/screens/Admin'
import Guard from '@/components/Guard'

// Operations and sales supervisors manage their own people here; the database
// decides who they may touch (fn_can_manage_member) and which roles they may
// grant, and the screen degrades to a read-only notice for anyone with nothing
// to delegate.
export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'sales_manager']}>
      <Admin />
    </Guard>
  )
}
