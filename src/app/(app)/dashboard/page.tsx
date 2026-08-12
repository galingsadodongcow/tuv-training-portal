import { redirect } from 'next/navigation'

// The five analytics destinations were consolidated into one /analytics area
// (third-pass simplification #2). Old links land on the Overview tab.
export default function Page() {
  redirect('/analytics')
}
