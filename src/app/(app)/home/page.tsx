import { redirect } from 'next/navigation'

// Home was consolidated into My Work (the single action surface). Old links and
// bookmarks land there instead.
export default function Page() {
  redirect('/my-work')
}
