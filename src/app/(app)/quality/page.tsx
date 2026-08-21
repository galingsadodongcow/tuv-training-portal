import { redirect } from 'next/navigation'

// Feedback and quality folded into the single /analytics area (Quality tab).
// The complaint register moved to /complaints.
export default function Page() {
  redirect('/analytics?tab=quality')
}
