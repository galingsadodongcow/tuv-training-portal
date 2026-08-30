import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { updateProfileAccessAction } from '@/features/access/actions'
import { getManagedProfiles } from '@/features/access/queries'
import {
  createCategoryAction,
  createCourseAction,
  createPriceAction,
  createQualificationAction,
  createTrainerAction,
  createVenueAction,
  setActiveAction,
} from '@/features/training/actions'
import { getTrainingCatalogue } from '@/features/training/queries'
import { LEARNING_TYPES } from '@/features/training/types'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageTraining } from '@/lib/permissions'
import { ROLES } from '@/types/auth'

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount))

function ActiveToggle({ entity, id, active }: { entity: string; id: string; active: boolean }) {
  return (
    <form action={setActiveAction}>
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="is_active" value={String(!active)} />
      <Button className="button-quiet button-small" type="submit">{active ? 'Deactivate' : 'Activate'}</Button>
    </form>
  )
}

function SectionHeader({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div className="section-heading">
      <div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}

export default async function AdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canManageTraining(profile.role)) redirect('/')

  const [catalogue, notice, managedProfiles] = await Promise.all([
    getTrainingCatalogue(),
    searchParams,
    profile.role === 'administrator' ? getManagedProfiles() : Promise.resolve([]),
  ])
  const categoryName = new Map(catalogue.categories.map((item) => [item.id, item.name]))
  const courseName = new Map(catalogue.courses.map((item) => [item.id, `${item.code} · ${item.title}`]))
  const roots = catalogue.categories.filter((item) => !item.parent_id && item.is_active)
  const activeCategories = catalogue.categories.filter((item) => item.is_active)
  const activeCourses = catalogue.courses.filter((item) => item.is_active)
  const activeTrainers = catalogue.trainers.filter((item) => item.is_active)

  return (
    <AppShell profile={profile} active="administration">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Training catalogue and resources</h1>
          <p>Maintain only the facts Sales and Operations need to sell and schedule training.</p>
        </div>
        <div className="summary-chip">{activeCourses.length} active courses</div>
      </div>

      {notice.message ? <div className="alert alert-success" role="status">{notice.message}</div> : null}
      {notice.error ? <div className="alert alert-error" role="alert">{notice.error}</div> : null}

      <nav className="anchor-nav" aria-label="Administration sections">
        <a href="#categories">Categories</a>
        <a href="#courses">Courses & prices</a>
        <a href="#trainers">Trainers</a>
        <a href="#venues">Venues</a>
        {profile.role === 'administrator' ? <a href="#users">Users & roles</a> : null}
        {profile.role === 'administrator' ? <Link href="/administration/role-preview">Role preview</Link> : null}
      </nav>

      <section className="workspace-section" aria-labelledby="categories">
        <SectionHeader id="categories" title="Categories" description="One hierarchy supports categories and subcategories." />
        <div className="split-layout">
          <div className="table-wrap">
            {catalogue.categories.length === 0 ? <EmptyState>No categories yet.</EmptyState> : (
              <table>
                <thead><tr><th>Name</th><th>Parent</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {catalogue.categories.map((category) => (
                    <tr key={category.id}>
                      <td className="cell-strong">{category.name}</td>
                      <td>{category.parent_id ? categoryName.get(category.parent_id) : 'Top level'}</td>
                      <td><StatusBadge active={category.is_active} /></td>
                      <td className="cell-action"><ActiveToggle entity="categories" id={category.id} active={category.is_active} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <form action={createCategoryAction} className="side-form" aria-label="Create category">
            <h3>New category</h3>
            <label className="field"><span>Name</span><input name="name" maxLength={100} required /></label>
            <label className="field">
              <span>Parent <small>optional</small></span>
              <select name="parent_id" defaultValue="">
                <option value="">Top level</option>
                {roots.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <Button type="submit">Create category</Button>
          </form>
        </div>
      </section>

      <section className="workspace-section" aria-labelledby="courses">
        <SectionHeader id="courses" title="Courses and standard prices" description="Course facts stay stable; prices are recorded by learning type." />
        <div className="table-wrap">
          {catalogue.courses.length === 0 ? <EmptyState>No courses yet. Create a category first, then add a course.</EmptyState> : (
            <table>
              <thead><tr><th>Course</th><th>Category</th><th>Duration</th><th>Capacity</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {catalogue.courses.map((course) => (
                  <tr key={course.id}>
                    <td><span className="code">{course.code}</span><span className="cell-title">{course.title}</span></td>
                    <td>{categoryName.get(course.category_id) ?? '—'}</td>
                    <td>{course.duration_minutes / 60}h</td>
                    <td>{course.default_capacity}</td>
                    <td><StatusBadge active={course.is_active} /></td>
                    <td className="cell-action"><ActiveToggle entity="courses" id={course.id} active={course.is_active} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="form-grid">
          <form action={createCourseAction} className="side-form" aria-label="Create course">
            <h3>New course</h3>
            <div className="field-grid">
              <label className="field"><span>Code</span><input name="code" maxLength={30} placeholder="ISO-9001" required /></label>
              <label className="field"><span>Category</span><select name="category_id" required defaultValue=""><option value="" disabled>Choose category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? `${categoryName.get(category.parent_id)} / ` : ''}{category.name}</option>)}</select></label>
              <label className="field field-wide"><span>Title</span><input name="title" maxLength={160} required /></label>
              <label className="field"><span>Duration (hours)</span><input name="duration_hours" type="number" min="0.5" max="1000" step="0.5" defaultValue="8" required /></label>
              <label className="field"><span>Default capacity</span><input name="default_capacity" type="number" min="1" step="1" defaultValue="20" required /></label>
            </div>
            <Button type="submit" disabled={activeCategories.length === 0}>Create course</Button>
          </form>

          <form action={createPriceAction} className="side-form" aria-label="Add standard price">
            <h3>Add standard price</h3>
            <label className="field"><span>Course</span><select name="course_id" required defaultValue=""><option value="" disabled>Choose course</option>{activeCourses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
            <div className="field-grid">
              <label className="field"><span>Learning type</span><select name="learning_type">{LEARNING_TYPES.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
              <label className="field"><span>Currency</span><input name="currency" defaultValue="PHP" minLength={3} maxLength={3} required /></label>
              <label className="field field-wide"><span>Amount</span><input name="amount" type="number" min="0" step="0.01" required /></label>
            </div>
            <p className="form-help">Deactivate a current price before adding its replacement. Historical prices remain visible.</p>
            <Button type="submit" disabled={activeCourses.length === 0}>Add price</Button>
          </form>
        </div>

        <div className="table-wrap compact-table">
          {catalogue.prices.length === 0 ? <EmptyState>No standard prices yet.</EmptyState> : (
            <table>
              <thead><tr><th>Course</th><th>Learning type</th><th>Price</th><th>Effective</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{catalogue.prices.map((price) => (
                <tr key={price.id}>
                  <td>{courseName.get(price.course_id) ?? '—'}</td>
                  <td className="capitalize">{price.learning_type}</td>
                  <td>{money(price.amount, price.currency)}</td>
                  <td>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(`${price.effective_from}T00:00:00`))}</td>
                  <td><StatusBadge active={price.is_active} /></td>
                  <td className="cell-action"><ActiveToggle entity="course_prices" id={price.id} active={price.is_active} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </section>

      <section className="workspace-section" aria-labelledby="trainers">
        <SectionHeader id="trainers" title="Trainers" description="Record only the competency needed for scheduling." />
        <div className="split-layout">
          <div className="table-wrap">
            {catalogue.trainers.length === 0 ? <EmptyState>No trainers yet.</EmptyState> : (
              <table>
                <thead><tr><th>Trainer</th><th>Qualified courses</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{catalogue.trainers.map((trainer) => {
                  const qualified = catalogue.trainerCourses.filter((item) => item.trainer_id === trainer.id && item.is_active)
                  return (
                    <tr key={trainer.id}>
                      <td className="cell-strong">{trainer.name}</td>
                      <td>{qualified.length ? qualified.map((item) => courseName.get(item.course_id)).join(', ') : 'None recorded'}</td>
                      <td><StatusBadge active={trainer.is_active} /></td>
                      <td className="cell-action"><ActiveToggle entity="trainers" id={trainer.id} active={trainer.is_active} /></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
          </div>
          <div className="form-stack-card">
            <form action={createTrainerAction} className="side-form" aria-label="Create trainer">
              <h3>New trainer</h3>
              <label className="field"><span>Name</span><input name="name" maxLength={120} required /></label>
              <Button type="submit">Create trainer</Button>
            </form>
            <form action={createQualificationAction} className="side-form" aria-label="Add trainer qualification">
              <h3>Add qualification</h3>
              <label className="field"><span>Trainer</span><select name="trainer_id" required defaultValue=""><option value="" disabled>Choose trainer</option>{activeTrainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}</select></label>
              <label className="field"><span>Course</span><select name="course_id" required defaultValue=""><option value="" disabled>Choose course</option>{activeCourses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
              <Button type="submit" disabled={!activeTrainers.length || !activeCourses.length}>Add qualification</Button>
            </form>
          </div>
        </div>
      </section>

      <section className="workspace-section" aria-labelledby="venues">
        <SectionHeader id="venues" title="Venues" description="Physical venues need capacity; virtual venues do not." />
        <div className="split-layout">
          <div className="table-wrap">
            {catalogue.venues.length === 0 ? <EmptyState>No venues yet.</EmptyState> : (
              <table>
                <thead><tr><th>Venue</th><th>Type</th><th>Capacity</th><th>Address / reference</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{catalogue.venues.map((venue) => (
                  <tr key={venue.id}>
                    <td className="cell-strong">{venue.name}</td>
                    <td className="capitalize">{venue.venue_type}</td>
                    <td>{venue.capacity ?? '—'}</td>
                    <td>{venue.address ?? '—'}</td>
                    <td><StatusBadge active={venue.is_active} /></td>
                    <td className="cell-action"><ActiveToggle entity="venues" id={venue.id} active={venue.is_active} /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <form action={createVenueAction} className="side-form" aria-label="Create venue">
            <h3>New venue</h3>
            <label className="field"><span>Name</span><input name="name" maxLength={120} required /></label>
            <label className="field"><span>Type</span><select name="venue_type"><option value="physical">Physical</option><option value="virtual">Virtual</option></select></label>
            <label className="field"><span>Capacity <small>physical only</small></span><input name="capacity" type="number" min="1" step="1" /></label>
            <details>
              <summary>More options</summary>
              <label className="field"><span>Address or joining reference</span><textarea name="address" rows={3} maxLength={500} /></label>
            </details>
            <Button type="submit">Create venue</Button>
          </form>
        </div>
      </section>

      {profile.role === 'administrator' ? (
        <section className="workspace-section" aria-labelledby="users">
          <SectionHeader id="users" title="Users and roles" description="Five roles cover materially different authority; activation and role changes are audited." />
          <div className="table-wrap">
            <table>
              <thead><tr><th>User</th><th>Current authority</th><th>Status</th><th>Access change</th></tr></thead>
              <tbody>{managedProfiles.map((managedProfile) => (
                <tr key={managedProfile.id}>
                  <td className="cell-strong">{managedProfile.full_name}</td>
                  <td className="capitalize">{managedProfile.is_sales_supervisor ? 'Sales supervisor' : managedProfile.role}</td>
                  <td><StatusBadge active={managedProfile.is_active} /></td>
                  <td>
                    <form action={updateProfileAccessAction} className="inline-access-form">
                      <input type="hidden" name="id" value={managedProfile.id} />
                      <label className="sr-only" htmlFor={`role-${managedProfile.id}`}>Role for {managedProfile.full_name}</label>
                      <select id={`role-${managedProfile.id}`} name="role" defaultValue={managedProfile.role}>
                        {ROLES.map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}
                      </select>
                      <label className="sr-only" htmlFor={`scope-${managedProfile.id}`}>Sales scope for {managedProfile.full_name}</label>
                      <select id={`scope-${managedProfile.id}`} name="sales_scope" defaultValue={managedProfile.is_sales_supervisor ? 'supervisor' : 'individual'}>
                        <option value="individual">Individual scope</option>
                        <option value="supervisor">Sales supervisor</option>
                      </select>
                      <label className="sr-only" htmlFor={`status-${managedProfile.id}`}>Status for {managedProfile.full_name}</label>
                      <select id={`status-${managedProfile.id}`} name="status" defaultValue={managedProfile.is_active ? 'active' : 'inactive'}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <Button className="button-quiet button-small" type="submit">Save</Button>
                    </form>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  )
}
