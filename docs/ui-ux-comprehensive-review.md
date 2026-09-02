# Comprehensive UI, UX, and usability review

**Review date:** 12 August 2026  
**Scope:** current repository implementation, route/role matrix, responsive CSS, shared components, data hooks, migrations, QA artefacts, and the unauthenticated browser surface.  
**Method limitation:** the repository has no seeded test credentials or authenticated Playwright state. Findings about authenticated journeys are therefore based on source-level task simulation and the existing UAT evidence, not fresh observation of live users. Click counts are deterministic counts of the shortest visible route; network and human waiting time are excluded.

---

## 1. Executive assessment

The Academy Portal is an internal, role-gated system for the full training lifecycle: catalogue and pricing → inquiry/quote/order → scheduling and resources → participants, attendance, assessment and certificates → receivables, quality and audit. Its strongest product decision is the recent consolidation around **My Work, CRM, Calendar, customer and record detail** rather than database tables. Role navigation is now compact, destructive actions are generally guarded, and shared record/feedback primitives exist.

The product is nevertheless only **moderately mature**. The information architecture is ahead of the interaction detail. Users can usually find the correct area, but cannot always answer, at a glance, “what is blocking this, who acts next, and by when?” My Work, notifications, approvals and exceptions remain separate mental models. Search is powerful but visually secondary. Several legacy redirect routes remain, mobile supports lookup better than execution, and accessibility quality relies on conventions rather than automated regression tests.

### Product and work model

| Dimension | Assessment |
|---|---|
| Primary users | Operations, order coordinators, sales, sales managers, business owners, management, auditors and super administrators |
| High-frequency work | Triage My Work; find customers/orders/sessions; progress commercial and fulfillment stages; review calendar; resolve blockers |
| High-risk work | Cancel/close session, transfer participant, payment/refund changes, attendance/certificate decisions, user/role changes, pricing and annual rollover |
| Rare work | Configuration, duplicates, complaints, audit investigation, rollover |
| Core records | Customer/organization, contact, inquiry, quote, order/line, course, session, participant, trainer/venue, invoice/payment, complaint, communication, audit event |
| Dependencies | Customer/contact precede commercial records; course/price/session feed orders; orders feed participants, delivery and AR; attendance/assessment feed certificates |
| Handoffs | Sales → coordinator/operations; operations → trainer; delivery → certification; finance exception → owner; approval requester → approver |

### What is working

- Role-specific home paths and 2–6 primary concepts for most roles.
- A consolidated CRM and Analytics architecture with compatibility redirects.
- Non-destructive business history and confirmation patterns for risky actions.
- Loading/error/empty primitives, keyboard-aware navigation drawer, skip link, focus return and horizontally scrollable tables.
- Record pages increasingly share header, attention, overview and tab patterns.

### Outcome test

Users can answer **where to start** and **where to find a record**. They cannot yet answer quickly and consistently: **what is overdue, what is the single next action, who owns it, what is blocking it, and whether a background action finished**. Those five questions define the next maturity step.

---

## 2. Overall UI/UX maturity score

**Overall: 72/100 — coherent foundation, inconsistent operational execution.**

| Criterion | /10 | Rationale |
|---|---:|---|
| Learnability | 7 | Work-shaped navigation helps; status vocabulary and hidden contextual actions still require coaching. |
| Efficiency | 7 | Saved queues and record links help; bulk actions, keyboard paths and inline editing are uneven. |
| Clarity | 7 | Strong page shells; ownership/next-step presentation is inconsistent. |
| Navigation | 8 | Role trim is excellent; legacy routes and weak recents/favorites reduce confidence. |
| Forms | 7 | Progressive course/session forms exist; validation, defaults and unsaved-change behavior vary. |
| Tables | 7 | Useful dense work surfaces; column priority and small-screen transformation are inconsistent. |
| Search | 7 | Global search and command palette exist; discoverability, query tolerance and recent results need proof. |
| Feedback | 6 | Toast/error primitives exist; async progress, undo and persistent completion guidance are incomplete. |
| Error prevention | 7 | Confirmations and database constraints help; conflicts and duplicates should be prevented earlier. |
| Accessibility | 6 | Good structural work; no automated axe suite, chart alternatives and field/error association remain risks. |
| Consistency | 7 | Shared primitives exist, but bespoke inline styles and screen-specific patterns remain. |
| Visual hierarchy | 8 | Calm enterprise shell and compact records; dense badges/actions can still compete. |
| Role fit | 8 | Navigation and read/write surfaces are meaningfully role-specific. |
| Cognitive load | 7 | Consolidation helped; users still reconcile task, process status, health and notification concepts. |
| Professional polish | 7 | Purposeful and restrained, but incomplete responsive behavior and feedback prevent “finished” quality. |

Lowest scores are **feedback and accessibility**. Both are systemic: they require shared state contracts and regression tests, not one-screen polish.

---

## 3. Top 20 UI issues

1. Ownership, due date and next action do not occupy one fixed record-header location.
2. Process status and health are visually similar even when semantically different.
3. Header badges can become a scanning burden on complex records.
4. Primary actions are not consistently positioned at the upper right.
5. Overflow menus lack a universal order: progress, edit, communicate, then destructive.
6. Bespoke inline styles weaken theme and component consistency.
7. Dense tables rely on horizontal scrolling instead of role-prioritized responsive columns.
8. Sticky headers and sticky primary identifiers are not guaranteed on all work tables.
9. Filters do not use one consistent bar, chip and reset pattern.
10. Empty states can explain absence but do not always distinguish “no records” from “filters hide records.”
11. Loading feedback is often local and indeterminate for long mutations.
12. Icon meanings and tooltip treatment are not centrally documented.
13. Read-only fields can resemble editable inputs on some detail surfaces.
14. Tabs can hide blockers that should remain above the tab set.
15. Charts and KPI cards sometimes occupy more visual weight than the action they support.
16. Calendar density and color semantics risk overload.
17. Danger actions are not visually isolated consistently from ordinary secondary actions.
18. Long IDs/references lack a uniform monospace/copy treatment.
19. Mobile top-bar search is represented by a keyboard convention that is desktop-centric.
20. Focus, hover, disabled, saving and success states are not demonstrated in a component catalogue.

---

## 4. Top 20 UX issues

1. My Work, notifications, approvals and exceptions are four competing attention channels.
2. “Next owner” and “next due date” are not first-class fields across the lifecycle.
3. Silent status changes can function as handoffs without explicit acceptance or return.
4. Users cannot save/reuse every recurrent search and filter combination.
5. Recent records are absent, increasing repeat navigation.
6. Search is globally available but not the visually obvious fastest route.
7. Legacy routes preserve bookmarks but prolong duplicate product concepts.
8. CRM combines three stages well, but cross-tab context can be lost after drilling into a record.
9. Notifications risk duplicating work already represented in queues.
10. System success often answers “saved” but not “what happens next.”
11. Background communication/report jobs lack durable progress and retry history.
12. Permission-denied experiences may explain access but not who can help.
13. Session close/cancel consequences are distributed across related records.
14. Participant transfer appears in multiple contexts, increasing mental model variance.
15. Finance exceptions are visible in several reporting contexts without one canonical resolution surface.
16. New users need workflow language, not module tours.
17. Management drill-downs can move from aggregate to operational views without retaining filters.
18. Mobile navigation enables access but not a deliberately reduced mobile task set.
19. There is no universal “record completeness” model for missing required downstream data.
20. Role navigation is tailored, but page content can still expose role-irrelevant secondary information.

---

## 5. Top 20 usability issues

1. Users must infer the next action from status, health and record details.
2. Repeated filter construction adds avoidable daily effort.
3. Horizontal table scroll can separate identity from the action column.
4. Keyboard users lack documented shortcuts beyond command search.
5. Form errors may be discovered after submit rather than during entry.
6. Unsaved-change protection is not guaranteed across full-page forms, drawers and modals.
7. Duplicate-customer/participant/order warnings are not consistently preventive.
8. Schedule conflicts should be checked at trainer, venue and session time selection.
9. Required/optional conventions need one consistent presentation.
10. Date/time displays need explicit timezone and locale where scheduling consequences matter.
11. Bulk selection behavior and selection persistence vary by list.
12. Row click versus explicit link/action behavior is not universally predictable.
13. Destructive confirmations need impact summaries, not just an “Are you sure?” question.
14. Disabled actions need a visible reason and path to resolution.
15. Table pagination should preserve filters, sort and scroll position after return.
16. Search results need highlighted match context and clear entity grouping.
17. Empty states need the active filter count and one-click reset.
18. Error messages need a correlation/reference value for support without technical leakage.
19. Touch targets and dense tables are in tension below tablet widths.
20. There is no automated end-to-end coverage of authenticated, role-specific journeys.

---

## 6. Top workflow problems

| # | Current friction | Shortest safe future flow |
|---:|---|---|
| 1 | Sales handoff is inferred from owner/status. | Create order → validate completeness → **Send to Operations** → named queue owner accepts/returns with reason. |
| 2 | Operations reconciles My Work, Calendar and notifications. | One My Work inbox with Tasks, Approvals, Exceptions; calendar is planning, notifications are informational only. |
| 3 | Scheduling conflicts can surface late. | Select course/date → inline availability lookup → reserve trainer/venue → create session. |
| 4 | Participant data can be entered more than once. | Add from contact/customer/order lookup; inherit identity; ask only booking-specific fields. |
| 5 | Closing a session spans attendance, assessment, certificates and finance checks. | Close checklist with blockers, owners and direct fixes; **Close session** only when mandatory gates pass. |
| 6 | Cancellation impact is understood across multiple tabs. | Impact preview lists participants, communications, invoices and replacement action before confirmation. |
| 7 | Quote-to-order context can be re-entered. | **Convert to order** carries customer, contacts, lines, prices, currency and provenance. |
| 8 | AR exceptions are discovered in reports and records. | Canonical Receivables queue with owner, age, next contact date and resolution action. |
| 9 | Approval outcome may be a status rather than a clear handoff. | Request → approver inbox → approve/return with reason → requester notified → history entry. |
| 10 | Duplicate resolution is an off-nav exception screen. | My Work exception opens comparison drawer; merge/keep with impact preview and audit trail. |
| 11 | E-learning provisioning is a saved order view but completion feedback is weak. | Queue → bulk provision → per-row progress → retry failures → durable summary. |
| 12 | Management drill-down can lose selected scope. | KPI → filtered result list with date/team/region retained and shareable URL. |
| 13 | Customer data is split between client and related organization concepts. | One Customer 360 header; organization/account relationship is contextual, not parallel navigation. |
| 14 | User access changes are high risk but operationally terse. | Show effective permissions, scope change, impacted queues and audit reason before activation. |
| 15 | Annual rollover is a rare, consequential operation. | Readiness checks → dry-run diff → explicit approval → progress → reconciliation report. |

### High-frequency click/step analysis

| Journey | Current shortest path | Current interaction estimate | Target |
|---|---|---:|---:|
| Find and open an order | ⌘K → type → result | 2 actions, 1 query, 0 page hunting | Keep; add recent results |
| Triage assigned work | My Work → queue → record → action | 3–5 clicks, 2 screens | 2–3 clicks using preview drawer/quick action |
| Create order from quote | CRM Quotes → quote → convert/create | 4–6 clicks, 2–3 screens, derived fields | 3 clicks, 2 screens, only exception fields |
| Create session | Calendar/Training → create → save | 3–5 clicks, 1 form, 2 required + conditional fields | Same count; add conflict prevention |
| Mark attendance | Session → participants → attendance controls | 3–N actions | 2 setup clicks + bulk/keyboard grid |
| Resolve approval | My Work → approval → decide → confirm | 3–4 clicks | 2–3 clicks with inline impact preview |
| Review overdue AR | Financial/Analytics → receivable → order/customer | 3–5 clicks | 2–3 clicks via canonical AR queue |

---

## 7. Navigation review

The role-filtered sidebar is organized around work and is the application’s strongest usability feature. Management lands on Overview, auditors on Audit, and operational roles on My Work. Admin configuration is separated visually.

**Exact changes:**

1. Keep the current primary nav; do not reintroduce retired list modules.
2. Add a labeled **Search** control on desktop and mobile; keep ⌘/Ctrl+K as an accelerator, not the only cue.
3. Add **Recent records** to search/palette rather than another permanent nav item.
4. Add user-created favorites only for saved views, not arbitrary pages.
5. Preserve tab, filter and scroll state on back navigation.
6. Make every list state deep-linkable: tab, query, filters, sort, page and selected saved view.
7. Display “Admin” as one collapsible destination for super admins if its list grows beyond four items.
8. Remove redirect routes after telemetry shows bookmarks and inbound links have decayed; show an explicit migration message before final retirement.

---

## 8. Information architecture review

### Recommended future architecture

```text
My Work
  Tasks | Approvals | Exceptions
Calendar
CRM
  Pipeline | Quotes | Orders
Customers
Training
Resources
Analytics / Financial / Team (role-specific)
Admin
  Commercial configuration
  Communications
  Annual rollover
  Users & access
Audit
Global Search (utility, not module)
```

Notifications become a utility stream of information; actionable items always link to or are represented in My Work. Orders remain inside CRM for commercial roles, while deep links and search serve operations. Customer/organization is one conceptual area. Complaints remain a record collection, surfaced from Quality analytics and customer/order context. Duplicates and e-learning stay saved exception views, not primary modules.

---

## 9. Role-by-role review

| Role | Prominent | Contextual/read-only | Hide | Primary default view |
|---|---|---|---|---|
| Operations | My Work, Calendar, CRM, Training, Resources | Customer/order finance summary | Pipeline conversion, user access | Today + overdue delivery exceptions |
| Coordinator | My Work, Calendar, CRM, Customers | Training lookup, payment summary | Pricing administration, broad analytics | Unassigned/returned orders |
| Sales | My Work, CRM, Customers, Training | Session availability, own AR risk | Operations/resource editing, global financials | New/aging inquiries and returned work |
| Sales manager | My Work, CRM, Customers, Team, Analytics | Team AR and capacity | System configuration | Unassigned/overdue team queue |
| Business owner | My Work, CRM, Customers, Resources, Analytics | All operational records | User/security internals unless granted | Exceptions, approvals and trend deltas |
| Management | Overview, Customers, Training, Financial, Analytics | Drill-down records read-only | Operational mutation controls | KPI exceptions and trend changes |
| Auditor | Audit, Search | Immutable record snapshots/history | Create/edit/delete and operational queues | Recent high-risk audit events |
| Super admin | Operational essentials + Admin + Audit | All | Nothing by role; dangerous actions still gated | System exceptions and access changes |

Permissions should affect **visibility, enabled state and explanation**, while RLS remains authoritative. Do not render a tempting disabled control when a role will never receive permission; hide it. Disable only when the user normally can act but the record state blocks action, and explain why.

---

## 10. User journey findings

### Sales: inquiry to operations handoff

- **Start/goal:** My Work or CRM; turn demand into a complete, owned order.
- **Screens:** My Work/CRM → inquiry → quote (optional) → quote detail → new order → order detail.
- **Decisions:** customer/contact, course/session, participants, commercial terms, ownership.
- **Missing assurance:** explicit completeness gate, named receiver, SLA and receipt acknowledgement.
- **Future:** prepopulate known values, run duplicate/pricing checks inline, show “Ready to hand off: 6/6,” then **Send to Operations**. Receiver can accept or **Return for correction** with reason.

### Operations: order to delivered session

- **Start/goal:** My Work; schedule and deliver without resource or participant errors.
- **Screens:** My Work → order/session → calendar/resource lookup → roster → close checklist.
- **Friction:** cross-screen schedule checks, several statuses, tab-hidden blockers.
- **Future:** a single attention bar lists blockers with owner/due date and direct actions. Resource conflicts are prevented before save. Session close is checklist-driven.

### Trainer/certification handoff (managed by operations)

- **Start/goal:** roster complete; record attendance/assessment and issue certificates.
- **Friction:** no trainer login means operations transcribes outcomes, increasing delay/error risk.
- **Future:** do not add a full trainer role without product validation. First offer a scoped, time-limited attendance link or import with operations review, audit and exception handling.

### Finance/management: resolve receivable risk

- **Start/goal:** Financial/Analytics; identify overdue exposure and drive collection.
- **Friction:** metric-to-action ownership is weak.
- **Future:** every aggregate drills to the same Receivables queue. Each row shows customer, order/reference, amount/currency, age, owner, last contact, promised date and next action.

### Auditor: investigate a change

- **Start/goal:** Audit; explain who changed what and why.
- **Friction:** raw events can lack business context and before/after readability.
- **Future:** grouped timeline by record, human-readable field labels, before/after diff, actor, reason, source, timestamp/timezone, and direct read-only record link.

---

## 11. Screen-by-screen findings

| Screen | Purpose / primary user | Keep above fold | Change |
|---|---|---|---|
| My Work | Daily triage / working roles | Queue counts, overdue/blocked first, ownership | Merge tasks/approvals/exceptions; preview drawer; bulk assign where safe |
| Overview | Management landing | exceptions, trend deltas, drill-down | Remove metrics without a decision/action; retain scope on drill-down |
| Calendar | Scheduling / ops | date, view, resource filters, create session | Four core filters; conflict indicators; mobile agenda default |
| CRM | Commercial workspace / sales | saved view, search, stage, primary create action | Preserve state across tabs; quick preview; one canonical order list |
| Customers | Find accounts / commercial roles | search, owner/team, risk, primary contact | Add recents; stable saved views; avoid attribution as competing primary task |
| Customer detail | 360 context | identity, owner, risk, open work, next action | Related organization contextual; collapse low-frequency panels; consistent timeline |
| Order detail | Fulfillment system of record | process status, health, owner, due, blockers, next action | One attention bar; tabs by task; consequences on transitions |
| Session detail | Delivery record | date/timezone, course, owner, capacity, blockers, next action | Close checklist; roster as high-frequency tab; one status control |
| Training | Catalogue lookup/edit | code/title, modality, duration, active price | Read-only and admin modes; progressive advanced configuration |
| Resources | Trainer/venue pool | availability, qualification, conflict | Capacity/calendar context before editing metadata |
| Team | Manager action surface | unassigned, overdue, load imbalance | Assignment preview; workload definition; retained filters |
| Analytics | Analysis / leaders | question-oriented tabs and scope | Every visual has table alternative and drill-through; remove vanity KPIs |
| Financial | AR/revenue / management | overdue value, aging, owner, next collection date | Canonical resolution queue, currency clarity, export scope |
| Search | Universal find / auditor + utility | query, grouped results, match context | Recent searches/records, typo handling, keyboard result navigation |
| Complaints | Quality case list | severity, owner, SLA, related record | Clear resolution workflow, sensitive-data handling, escalation |
| Admin | Governance / super admin | grouped settings and risk warnings | Effective permission preview and audit reason |
| Audit | Investigation / auditor | actor, action, record, reason, time | Human-readable diffs, saved investigations, export watermark |
| Communications | Template/config execution | audience, channel, preview, send state | Separate template edit from send job; test send; durable progress |
| Pricing | Rules / authorized roles | scope, effective dates, conflicts | Prevent overlapping rules; preview impacted courses/orders |
| Annual rollover | Rare batch process | readiness, dry-run, approval, progress | Wizard/full page, never modal; reconciliation and retry |

Screens that should not return as top-level pages: Operations Today, standalone Approvals, Worklist, Duplicates, E-learning, Organizations list, Dashboard, Reports, Quality and Data Quality. Redirects may remain temporarily but should not be presented as product architecture.

---

## 12. Forms review

Use the order users think in: **identity → relationship/context → operational choices → exceptions → review**. Default country/currency/team/owner from customer and user scope. Derive price, capacity, health and status whenever rules permit. Never ask for data already present on quote/customer/course/session.

### Exact form changes

- **Inquiry:** customer/contact lookup first; prefill owner, email, phone, country; show advanced commercial data only after course interest.
- **Order:** inherit quote/customer/contact/currency/lines; ask the user only to confirm exceptions. Inline duplicate participant/order warnings before submit.
- **Session:** require course and start; derive duration/end/capacity; show trainer/venue only after modality; live conflict checks.
- **Course:** title/code/core delivery fields first; fees and advanced certification rules in named sections; show effective dates.
- **Payment:** select invoice/order, show outstanding amount and currency, default received date, validate overpayment/reference duplication.
- **User access:** identity → role → scope → effective permissions preview → reason → confirmation.

All forms need field-level validation on blur/change, an error summary linked to fields after submit, preserved values after failure, explicit optional labels, save progress, and unsaved-change protection. Use full pages for long/high-risk workflows, drawers for contextual edits, modals only for short decisions.

---

## 13. Table review

### Role-specific default columns

| Work surface | Default columns in order |
|---|---|
| Sales inquiries | Customer · inquiry/topic · stage · age · owner · next action due |
| Sales quotes | Quote/reference · customer · amount/currency · status · valid until · owner |
| Operations orders | Order/reference · customer · course/session · fulfillment status · health/blocker · owner · due |
| Calendar list | Date/time · course/session · modality/location · trainer · booked/capacity · health |
| Coordinator queue | Age/due · order · customer · missing item/blocker · current owner · next action |
| Receivables | Age bucket · customer · order/invoice · outstanding/currency · due · owner · next contact |
| Team workload | Owner · open · overdue · blocked · oldest age · capacity indicator |
| Audit | Timestamp/timezone · actor · action · entity/reference · reason/source |

Requirements: sticky header; sticky first identifier on wide tables; predictable row link; right-aligned numbers; explicit currency; sortable columns with announced state; filter/sort in URL; 25/50/100 page size only where volume warrants; CSV export describes active scope; bulk actions appear only after selection; selection summary persists while paging only if explicitly supported. On mobile, replace operational tables with priority card rows or a 3-column compact list plus detail drawer—do not merely shrink text.

---

## 14. Search and filter review

Search must match customer/name, contact email/phone, record ID, order/reference, session, participant, trainer and certificate. Use case-insensitive partial matching, normalized phone/email, exact-reference boost and modest typo tolerance for names. Group results by type, show permission-safe match context, highlight the matched fragment, and support arrows/Enter/Escape.

One shared filter bar should provide: up to four quick filters, **More filters**, applied chips with individual removal, visible result count, **Clear all**, and **Save view**. Recommended views include My overdue work, Blocked, Unassigned, Returned for correction, This week, Awaiting participant data, Awaiting e-learning, Certificate exceptions, Overdue receivables and My team. Never persist a surprising filter silently; label the active saved view.

---

## 15. Dashboard review

Operational dashboards should be queues, not scoreboards. Each tile must answer a decision and drill to underlying records. Prioritize overdue, blocked, unassigned, today/next seven days and SLA risk. Management may see trends, revenue, capacity and quality, but all values need scope, comparison period, definition and drill-down. Remove totals that cannot trigger a decision. Show “data refreshed” and partial-data warnings.

---

## 16. Status and health review

Keep two explicit dimensions:

- **Process status:** where the record is in its valid lifecycle (for example Draft, Ready for handoff, In fulfillment, Delivered, Closed, Cancelled).
- **Health:** whether attention is required (**On track, At risk, Blocked**; Complete only when the process ends).

Health must be derived wherever possible from missing prerequisites, age, due date and conflicts. Users may resolve the underlying cause, not manually paint a record green. Every transition must define permitted roles, prerequisites, side effects, receiver, notifications and audit event. Display one process badge, one health badge, owner and due date; reveal secondary statuses in details.

---

## 17. Feedback and error handling

Every action must answer: **Did it work? What changed? What happens next?** Use immediate button progress and disable duplicate submission; optimistic updates only when rollback is safe; a concise toast for completion; persistent inline state for background jobs; and an activity event for business-significant changes.

Errors should say what failed, the likely user-fixable cause, what data was preserved, and the next action. Provide Retry for transient failures and a support reference for unexpected failures. Session expiry should preserve unsaved work locally where safe, request sign-in, then return to context. Permission errors should name the required capability or responsible role without exposing policy internals.

---

## 18. Notifications, tasks and approvals

Define the concepts in the UI:

- **Task:** work the user must complete; has owner and due date.
- **Approval:** a decision; has requester, approver, impact and due date.
- **Exception:** abnormal state; has severity, cause and resolution path.
- **Notification:** information; can be read/dismissed and never substitutes for a task.
- **Mention:** a request for attention in context; becomes a task only if explicitly assigned.

Notification center should group by record/event, prioritize mentions and decision outcomes, deep-link to context, and allow mark-read. Do not duplicate every My Work item. Approval cards require impact summary, evidence, Approve and Return for correction, mandatory reason on return/high-risk approval, and full history.

---

## 19. Ownership and handoffs

Every operational record header should display **Current owner · Next owner · Due · Blocker** in the same order. A handoff is an event, not a status edit: sender selects/validates receiver, receiver is notified and can accept or return, SLA begins visibly, reason is recorded, and sender sees the outcome. Auto-assignment may suggest an owner from team/load/region, but humans must override with reason when capacity or expertise matters.

---

## 20. Responsive review

- **≥1440 px:** fixed sidebar, dense table, optional record right rail.
- **1366 px:** preserve task-critical columns; collapse secondary header metadata before shrinking typography.
- **Tablet:** off-canvas nav, two-column forms, list/table hybrid, drawer becomes near-full-width.
- **Mobile:** agenda calendar, search/lookup, approvals, notifications, simple status updates and contact actions only.

Do not force pricing grids, bulk roster management, analytics authoring, rollover or complex order creation onto phones. Dialogs must fit the viewport, trap/restore focus, keep actions visible without covering fields, and warn on unsaved close. Avoid nested modals; use a drawer for record preview and a full page for multi-section editing.

---

## 21. Accessibility review

Target WCAG 2.2 AA. Existing skip navigation, drawer focus management and labeling conventions are good. Add automated axe checks for login plus one authenticated page per pattern; keyboard journey tests; semantic table captions/headers; announced sort/filter/result counts; `aria-describedby` field errors; dialog names; 44×44 CSS-pixel touch targets where practical; visible 3:1 focus indicators; non-color text/icons for health; reduced motion; and a data table/summary for every chart. Validate light/dark contrast and 200% zoom at 1280 CSS pixels. Treat accessibility failures in create, handoff, payment and attendance as release blockers.

---

## 22. Design-system review

The CSS token and shared-component base is useful but not yet governed as a system. Establish documented primitives for PageHeader, RecordHeader, AttentionBar, Button, IconButton, Field, Lookup, DateTime, FilterBar, SavedView, DataTable, StatusBadge, HealthBadge, EmptyState, ErrorState, Skeleton, Toast, Dialog, Drawer, Tabs and Timeline. Specify variants, content rules, responsive behavior and all interaction states. Replace inline layout/color styles with tokens and components as touched. Add a development-only component gallery and screenshot/axe regression checks.

Professional direction: calm neutral surfaces, restrained semantic color, 4/8 px spacing rhythm, compact 14–16 px body type, one card per meaningful region, separators rather than nested cards, and no decorative gradient or badge proliferation.

---

## 23. Terminology review

| Prefer | Avoid / clarify | Rule |
|---|---|---|
| Customer | Client / organization used interchangeably | “Customer” is the business account; “related organization” is a relationship. |
| Session | Schedule/event | Session is a delivery instance; Calendar is the view. |
| Order coordinator | Coordinator/operations ambiguity | Use the full role on assignment and permission messages. |
| Send to Operations | Submit/process/proceed | Action labels name outcome and receiver. |
| Return for correction | Reject | Indicates recoverable next step. |
| Mark attendance | Update/submit | Name the saved business action. |
| Close session | Complete/process | Reserve Close for validated terminal transition. |
| Outstanding amount | Balance where ambiguous | Always include currency. |
| On track / At risk / Blocked | Healthy/aging/stalled mix | One health vocabulary globally. |
| Archive / Cancel / Void | Delete | Use lifecycle-specific, auditable verbs. |

Use sentence case for headings/actions, consistent singular entity names, and plain-language status help. Maintain the glossary alongside enums and UI label maps.

---

## 24. Redundancy and consolidation

Continue the existing retirement strategy. One queue owns action, one record owns truth, one analytics surface owns aggregation, and search owns cross-entity retrieval. Consolidate participant transfer into one shared interaction invoked from contextual entry points. Consolidate receivable resolution in Financial, while other pages show summary and link. Consolidate customer/organization identity and contacts in Customer 360. Retire compatibility redirects after usage review. Do not duplicate a metric in My Work and Analytics unless one is an action count and the other a longitudinal analysis with clearly different labels.

---

## 25. Automation opportunities

| Manual process | Trigger | System action | Human decision / exception | Benefit |
|---|---|---|---|---|
| Assign new work | Ready-for-handoff | Suggest owner from role/scope/load | Confirm/override; no eligible owner | Faster explicit handoff |
| Re-enter quote data | Convert quote | Copy customer, terms, lines, currency, provenance | Resolve stale price/conflict | Less typing/error |
| Check resource clashes | Date/trainer/venue change | Live availability and overlap check | Override only with authority/reason | Prevent scheduling errors |
| Chase prerequisites | Due date approaches | Reminder to owner; escalate on SLA | Snooze/change due with reason | Fewer late sessions |
| Determine health | Relevant data changes | Recompute risk/blockers | User resolves cause; authorized override audited | Consistent prioritization |
| Provision e-learning | Eligible paid/confirmed order | Queue provisioning job | Retry failed identities | Faster, observable fulfillment |
| Certificate readiness | Attendance/assessment saved | Validate and queue issuance | Review exceptions | Fewer incorrect certificates |
| Find duplicates | Customer/participant entry | Similarity warning | Merge/keep separate | Earlier prevention |
| AR follow-up | Invoice overdue/promise date | Create owner task/reminder | Record outcome/new promise | Clear collection ownership |
| Rollover | Admin starts dry run | Diff and validate configuration | Approve exceptions | Safer rare operation |

Do not automate approval, cancellation, refund, merge or access decisions; automate detection, evidence and preparation.

---

## 26. Quick wins

1. Label top-bar search “Search” and display Ctrl+K as well as ⌘K.
2. Add recent records to the command palette.
3. Standardize record header owner/due/blocker order.
4. Add active-filter count and Clear all to every empty filtered list.
5. Explain every disabled business action.
6. Persist list state in URL/back navigation.
7. Add copy buttons for order/session/customer references.
8. Add timezone labels to session and audit timestamps.
9. Put destructive actions last and separated in overflow menus.
10. Add “what happens next” to success toasts for handoffs.
11. Add error summaries linked to invalid fields.
12. Add unsaved-change guards to all edit surfaces.
13. Standardize exact-match boost in global search.
14. Add table captions and announced sort state.
15. Give charts a table alternative.
16. Add human-readable permission-denied guidance.
17. Add one-click saved views for overdue/blocked/unassigned.
18. Add skeletons matching final record/table layout.
19. Add per-row retry to background job failures.
20. Add automated accessibility checks to smoke tests.

---

## 27. Structural recommendations

1. Build a shared work-item model powering Tasks, Approvals and Exceptions.
2. Make handoff ownership/SLA/history a first-class domain event.
3. Establish canonical receivables resolution rather than report-only exposure.
4. Introduce a shared record completeness/blocker service.
5. Finish redirect-route retirement with telemetry and communications.
6. Create signed-in role fixtures and journey automation.
7. Govern the design system with a component gallery and visual/a11y regression.
8. Formalize status transition matrices in code and product documentation.
9. Make all list state shareable and restorable.
10. Define a constrained mobile product surface instead of responsive parity.

### Top 10 screens to redesign

My Work, Order detail, Session detail, Calendar, CRM Orders, Financial, Search, Admin user access, Communications send flow, Annual rollover.

### Top 10 screens to simplify

Analytics, Customer detail, Training admin, Resources, Team, Complaints, Quote detail, Sales entry, Audit, Notification center.

### Merge / retire

- **Merge:** actionable approvals/exceptions into My Work; organization identity into Customer 360; receivable actions into Financial; participant transfer implementations into one component.
- **Retire after transition:** standalone Operations Today, Approvals, Worklist, Duplicates, E-learning, Organizations list, Dashboard, Reports, Quality and Data Quality routes.

---

## 28. Future-state navigation

| Role | Target navigation |
|---|---|
| Operations | My Work · Calendar · CRM · Training · Resources · Analytics · Admin (if authorized) |
| Coordinator | My Work · Calendar · CRM · Customers |
| Sales | My Work · CRM · Customers · Training |
| Sales manager | My Work · CRM · Customers · Team · Analytics |
| Business owner | My Work · CRM · Customers · Resources · Analytics · Admin (business config) |
| Management | Overview · Customers · Training · Financial · Analytics |
| Auditor | Audit · Search |
| Super admin | My Work · Calendar · CRM · Customers · Training · Resources · Analytics · Admin · Audit |

Global utilities in the top bar: Search, Notifications, Help, Theme/Profile. Keep utilities out of the business nav.

---

## 29. Major screen redesigns (text wireframes)

### My Work

```text
[My Work]                                      [Search work] [Saved view ▾]
Due/ownership summary: 8 overdue · 3 blocked · 4 unassigned
[Tasks 18] [Approvals 3] [Exceptions 7]
Quick filters: [Mine] [Overdue] [Blocked] [Due this week]  [More] [Clear]
┌ Priority | Due | Record + customer | Required action | Owner | Status ┐
│ Blocked  | 2d  | ORD-1042 · Acme   | Add participant | Me    | ...    │
└──────────────────────────────────────────────────────────────────────┘
Selected row preview drawer: context · blocker · activity · [Complete action]
```

### Order detail

```text
[← CRM]  ORD-1042 · Acme                     [Send to Operations] [More ▾]
In fulfillment · At risk | Owner: Ana | Next: Operations | Due: 14 Aug
[Attention] 2 participants missing email  [Fix participant data]
Commercial summary: value/currency · quote · salesperson · payment
[Overview] [Participants] [Fulfillment] [Finance] [Activity & files]
Overview: next milestone · session booking · completeness checklist
```

### Session detail

```text
[← Calendar] ISO 9001 · 19 Aug, 09:00 PHT      [Mark attendance] [More ▾]
Confirmed · On track | Owner | Trainer | Venue | 14/20 booked
[Attention / conflict / prerequisite bar — absent when clear]
[Overview] [Participants] [Delivery] [Orders] [Activity & files]
Overview: next action · readiness checklist · key contacts
Right rail (desktop): timeline and upcoming deadline
```

### Calendar

```text
[Calendar]                  [Today] [‹]  August 2026 [›] [Create session]
[Month | Week | Day | Agenda] [Course] [Trainer] [Venue] [Health] [More]
Desktop: time grid / month; conflicts have icon + text, not color alone
Mobile default: agenda cards with date, course, location, trainer, capacity, health
Session preview drawer: essentials · conflicts · [Open session]
```

### Customer 360

```text
[← Customers] Acme Philippines                         [Create order] [More]
Owner · segment · primary contact · open risk · outstanding amount/currency
[Attention] 1 overdue invoice  [Open receivable]
[Overview] [Contacts] [Commercial] [Delivery] [Finance] [Activity & files]
Overview: next interaction · open work · related organizations · recent activity
```

### Financial

```text
[Financial] Scope: Philippines · Q3 2026          [Export current view]
Overdue amount | Due this week | Promises missed | Unassigned
[Receivables] [Revenue]
Views: [Overdue] [Promise missed] [Unassigned] [My saved view]
Age | Customer | Invoice/order | Outstanding | Owner | Next contact | Action
```

### Search

```text
[Search all records________________________________]
Recent: ORD-1042 · Acme · ISO 9001 Aug session
Results grouped: Orders (4), Customers (2), Sessions (3), Participants (1)
Each result: primary label · reference · matched context · status/health · owner
[↑↓ navigate] [Enter open] [Esc close]
```

### Admin

```text
[Admin]
Commercial configuration | Communications | Annual rollover | Users & access
System health / pending jobs / last successful rollover
Selected area uses full page; high-risk actions show effective-impact preview
Audit trail is linked, never embedded as an editable panel
```

---

## 30. Prioritized backlog

| Priority | Issue / affected role & screen | Recommended change | Benefit | Complexity |
|---|---|---|---|---|
| P0 | No authenticated journey regression / all roles | Add seeded safe accounts/storage states and core Playwright journeys | Prevent role/workflow regressions | L |
| P0 | Accessibility unverified / all core screens | Axe + keyboard + zoom gates for page patterns | Prevent exclusion and compliance risk | M |
| P0 | High-risk transitions / ops, finance, admin | Central prerequisite/impact confirmation contract | Prevent cancellation/payment/access errors | L |
| P1 | Fragmented attention / working roles, My Work | Unified Tasks/Approvals/Exceptions model | One reliable starting point | L |
| P1 | Ambiguous handoff / sales→ops | Explicit send/accept/return event with SLA/history | Clear ownership and fewer stalled orders | L |
| P1 | Weak next-step visibility / record pages | Standard header and attention bar | Faster, safer decisions | M |
| P1 | Schedule conflicts / Session form | Live trainer/venue/time prevention | Avoid delivery disruption | M |
| P1 | AR action fragmentation / management/owners | Canonical Receivables queue | Clear collection accountability | M |
| P1 | Form failure recovery / all editors | Inline validation, summary, preserved state, unsaved guard | Fewer lost edits and support calls | M |
| P1 | Mobile table friction / field users | Agenda/cards for chosen mobile tasks | Useful phone experience | L |
| P1 | Notification duplication / all workers | Keep actionable work in My Work; notification grouping | Less noise and missed work | M |
| P2 | Rebuilt filters / frequent users | Universal saved views + URL state | Faster repeat work | M |
| P2 | Search discoverability / all users | Labeled search + recents + match context | Less navigation time | M |
| P2 | Table inconsistency / all roles | Shared DataTable contract and role defaults | Scan speed and consistency | L |
| P2 | Status comprehension / all records | Publish transition matrix and help text | Lower training burden | M |
| P2 | Background job ambiguity / ops/admin | Durable progress, failure rows and retry | Confidence and recovery | M |
| P2 | Duplicate prevention / sales/ops | Inline similarity checks during entry | Less cleanup | M |
| P2 | Analytics dead ends / leaders | Preserve scope on drill-through | Turn insight into action | M |
| P2 | Legacy route ambiguity / all | Telemetry-led route retirement | Cleaner product model | S |
| P3 | Component drift / engineering/design | Gallery + screenshot regression + remove inline styling | Professional polish | M |
| P3 | Expert efficiency / frequent users | Add only validated shortcuts/bulk actions | Reduced task time | M |

---

## 31. Final action plan

### 0–30 days: confidence and clarity

Instrument task success and route usage; establish authenticated role fixtures; add accessibility smoke coverage; standardize owner/next owner/due/blocker in record headers; label search; fix filter empty states; and document process-status versus health.

### 31–60 days: operational model

Unify Tasks/Approvals/Exceptions, implement explicit handoffs, create the canonical receivables queue, add session conflict checks, and standardize form validation/unsaved recovery.

### 61–90 days: efficiency and responsive quality

Ship saved views and restorable list state, recent records, role-default table columns, mobile agenda/approval/lookup experiences, durable background-job progress, and analytics drill-through state.

### 90+ days: consolidation and governance

Retire proven-unused redirects, consolidate shared interactions, publish the component gallery, add visual regression, validate workflow terminology with each role, and quarterly-review task analytics and accessibility.

### Success measures

- ≥90% of users identify their next owned action in under 10 seconds.
- ≥95% of handoffs have named sender, receiver, due date and outcome.
- 30% reduction in median clicks for My Work resolution and AR follow-up.
- 50% reduction in duplicate/invalid participant and schedule-conflict corrections.
- ≥95% successful recovery from a failed save without re-entry.
- Zero critical axe violations and complete keyboard success on core journeys.
- Search or recent records opens repeated records in ≤3 interactions.
- Notification volume falls while overdue-task completion improves.

The product should be considered excellent when every operational record exposes one truthful status, one derived health signal, one owner, one due date, one blocker and one obvious next action—and every completed action makes the resulting owner and next step explicit.
