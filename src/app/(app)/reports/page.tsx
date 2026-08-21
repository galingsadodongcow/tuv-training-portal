import { redirect } from 'next/navigation'

// Reports folded into the single /analytics area (Revenue / Receivables /
// Certificates / Profitability / Pipeline tabs). Old links land on Revenue.
export default function Page() {
  redirect('/analytics?tab=revenue')
}
