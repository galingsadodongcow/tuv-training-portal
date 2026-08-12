import { redirect } from 'next/navigation'

// Data quality folded into the single /analytics area (Data quality tab,
// super_admin only).
export default function Page() {
  redirect('/analytics?tab=data')
}
