import Search from '@/screens/Search'
import Guard from '@/components/Guard'

// Global record search — available to every authenticated role (the DB scopes
// what each user can actually open). Surfaced in nav for the auditor; every other
// role also reaches it via the ⌘K palette.
export default function Page() {
  return (
    <Guard>
      <Search />
    </Guard>
  )
}
