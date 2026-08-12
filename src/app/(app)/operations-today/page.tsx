import { redirect } from 'next/navigation'

// Operations today was retired: its read-only aggregator sections are covered by
// My Work (exceptions/tasks) and Calendar (today/this week). Old links land there.
export default function Page() {
  redirect('/my-work')
}
