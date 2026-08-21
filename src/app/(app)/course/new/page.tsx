import { redirect } from 'next/navigation'

// Course create/edit unified into the Training catalogue edit-drawer (#13).
// This route redirects into the catalogue with the "new" drawer open.
export default function Page() {
  redirect('/courses?new')
}
