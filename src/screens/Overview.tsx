'use client'
import Dashboard from './Dashboard'

// The management KPI landing (third-pass #8). Management has no task queue, so
// "My Work" is the wrong home for it — Overview is the role's landing: the same
// role-scoped KPI dashboard (booked/delivered revenue, pipeline, conversion, AR,
// session health, exceptions), every tile a drill-through. It reuses the
// Dashboard `embedded` (the shell owns the heading), so there is one dashboard
// implementation, surfaced here as a first-class destination rather than a tab.
export default function Overview() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Your key numbers at a glance. Every tile drills through to the detail.</p>
        </div>
      </div>
      <Dashboard embedded />
    </>
  )
}
