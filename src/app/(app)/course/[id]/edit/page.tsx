import { redirect } from 'next/navigation'

// Course editing unified into the Training catalogue edit-drawer (#13). This
// route redirects into the catalogue with the edit drawer open for this course.
export default function Page({ params }: { params: { id: string } }) {
  redirect(`/courses?edit=${params.id}`)
}
