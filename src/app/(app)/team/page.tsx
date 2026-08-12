import Team from '@/screens/Team'
import Guard from '@/components/Guard'

// The sales manager's queue (third-pass #8). Gated to the manager (and
// super_admin for support); RLS scopes every underlying query to the team.
export default function Page() {
  return (
    <Guard roles={['sales_manager', 'super_admin']}>
      <Team />
    </Guard>
  )
}
