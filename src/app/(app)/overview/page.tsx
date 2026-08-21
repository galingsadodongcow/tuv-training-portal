import Overview from '@/screens/Overview'
import Guard from '@/components/Guard'

// The management KPI landing (third-pass #8). Gated to management (and
// super_admin for support); the Dashboard it reuses is role-aware regardless.
export default function Page() {
  return (
    <Guard roles={['management', 'super_admin']}>
      <Overview />
    </Guard>
  )
}
