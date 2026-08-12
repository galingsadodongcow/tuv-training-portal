import Financial from '@/screens/Financial'
import Guard from '@/components/Guard'

// Receivables + revenue for the oversight roles (third-pass #8). The Reports
// data it reuses is read-only for these roles; RLS stays authoritative.
export default function Page() {
  return (
    <Guard roles={['management', 'business_owner', 'operations', 'super_admin']}>
      <Financial />
    </Guard>
  )
}
