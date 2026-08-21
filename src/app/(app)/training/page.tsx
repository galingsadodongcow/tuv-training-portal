import Courses from '@/screens/Courses'
import Guard from '@/components/Guard'

// Read-only training catalogue (third-pass #8): a catalogue lookup for the
// sales/oversight roles, distinct from /courses (the super_admin/operations edit
// screen). This entry never widens write access — it renders the directory with
// the create/edit affordances removed; RLS is authoritative regardless.
export default function Page() {
  return (
    <Guard roles={['super_admin', 'operations', 'sales', 'coordinator', 'sales_manager', 'business_owner', 'management']}>
      <Courses readOnly />
    </Guard>
  )
}
