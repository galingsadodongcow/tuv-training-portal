# TÜV Rheinland Academy PH — Training Operations & Sales Hub: Enterprise UX Review

> Part 1 of 5 — Executive assessment, maturity score, top problems/opportunities, current architecture, role model, current journeys, role-by-role findings, cross-role handoffs, and workflow-friction analysis.

## 1. Executive assessment

**What it is.** A single-page, role-gated internal operations portal that runs the Academy's full commercial lifecycle: catalog and pricing (`Courses`, `CourseForm`, `PricingRules`) → calendar and sessions (`Calendar`, `SessionDetail`, `SessionForm`) → demand capture (`Inquiries`, `Quotations`, `QuoteDetail`) → order creation (`SalesEntry`) → fulfillment (`Orders`, `OrderDetail`, `Worklist`) → delivery and certificates (`RosterPanel`, `GoNoGoPanel`, `CloseSession`, `CancelSession`) → AR (`ReceivablePanel`) → analytics and governance (`Dashboard`, `Reports`, `Quality`, `DataQuality`, `AuditLog`). It is Next.js 14 client-rendered against Supabase, with the anon key in the browser and **RLS as the only real access control**. Thirty screens, ~24 shared components, one data layer (`src/hooks/data.ts`).

**Who uses it.** Four database roles — `super_admin`, `operations`, `business_owner`, `sales` — carry eight real jobs. Sales reps live in `Inquiries` → `SalesEntry` → `Worklist(mine)`. A sales supervisor is not a role at all: `salesperson.is_supervisor=true` silently flips the Worklist default from `who=mine` to `who=all` and unlocks `canAssignAny`. Operations run the calendar, staffing, go/no-go, communications, e-learning grants, and rollover. Business owners approve cancellations/forecasts and read dashboards. Super admin holds Admin, Audit, and DataQuality alone.

**Structural strengths.**
- **A genuine derived-health layer.** `src/lib/orderState.ts` is the best thing in the codebase: one place computes `orderBlockers` (`Paid, not yet endorsed`, `No owner assigned`, `No customer feedback`, `Stalled Nd in <stage>`), a `collectionState` clock (`Not due`/`Due soon`/`Overdue` at 23/30 days), a `primaryFlag`, and named `ORDER_VIEWS` — and the same predicates power the orders list, the `Worklist`, and Home. This is workflow-shaped thinking done right.
- **A real "My Work" spine on Home.** Role-specific KPI cards plus three semantically distinct streams — *Tasks* ("someone must act"), *Notifications* ("something happened"), *Approvals* ("a named person must decide") — each with drill-through via `entityHref`.
- **Disposition-gated cancellation.** `CancelSession` refuses to cancel until *every* live booking carries a `Transfer / Refund / Credit / No Action` disposition. Rare discipline.
- **Advisory-not-authoritative go/no-go.** `GoNoGoPanel` translates raw numbers into health sentences ("3 pax below minimum", "₱X below target") and a plain recommendation, then routes the decision through schedule status + the approval queue.
- Remediation already shipped this session (error states, `useConfirm` on destructive paths, focus traps, the payment/SAP write-block trigger for sales, ops owner reassignment).

**Structural weaknesses (the through-line).**
1. **Eight jobs collapsed into four roles.** There is no Marketing/Order-Coordinator, no read-only Management, no Auditor, and no Sales-Manager role — the app fakes the last with a boolean and simply omits the other three. Governance (`AuditLog`) is welded to `super_admin`.
2. **The intake job has no home.** Operations is documented as doing order intake — but `operations` is not in the nav gate for either `Inquiries` (`['super_admin','sales']`) or `New sales order` (`['super_admin','sales']`). The role that supposedly captures demand cannot see the two screens that capture it.
3. **Status is modeled richly but *health* still lives beside it, not above it.** `fulfillment_stage`, `payment_status`, `schedule.status`, `inquiry_status`, `quote.status`, `approval.decision`, plus GoNoGo recommendation, `v_sla_breach`, `v_cancel_readiness`, min/max pax — the operator must mentally union six status vocabularies to know "is this okay." `orderState.ts` proves the pattern but only orders enjoy it; sessions, quotes, and inquiries have no equivalent unified badge.
4. **Handoffs are dropdown edits, not transactions.** "Endorsed to Ops" is just a `<select>` value change in `OrderDetail`/`Worklist`; nothing forces field-completeness, nobody on ops acknowledges receipt, and if it stalls the only backstop is a nightly SLA view.
5. **Re-entry where reuse was one join away.** Converting a quote prefills only the client and links `converted_order_id` — the rep **retypes every line** (course, modality, seats, amount) that the quote already holds.

**Thesis:** *The product is database-shaped where it should be workflow-shaped, and workflow-shaped only where one engineer (orderState.ts) already showed the way. Four roles wear eight hats; status is conflated with health outside the orders module; and the moments that matter most — the handoffs between people — are the least designed part of the system.*

## 2. Overall UX maturity score — **61 / 100**

Rubric across eight dimensions (weighted equally, ~12.5 each):

| Dimension | Score | Justification |
|---|---|---|
| **Information architecture** | 8.5/12.5 | One flat, sensibly ordered `NAV`; good ⌘K `CommandPalette`. But 30 screens in a single list with no grouping, and "Courses and pricing" vs a separate "Pricing rules" item overlap confusingly. |
| **Role fit** | 5/12.5 | The 4-into-8 collapse; ops locked out of intake screens; auditor = super_admin only; no read-only exec view. |
| **Workflow support** | 8/12.5 | `orderState` views + `Worklist` claim/bulk-advance + disposition-gated cancel are strong; but quote→order re-entry, no forced endorsement checklist. |
| **Ownership clarity** | 7/12.5 | `order_assignment`, `isUnowned` flag, ops reassign (remediated), supervisor scope — good for orders; **sessions and inquiries have no owner concept** at all. |
| **Status model** | 6.5/12.5 | Rich per-entity statuses and a real derived-flag layer, but six vocabularies never roll into one health signal outside orders. |
| **Exception handling** | 7.5/12.5 | `v_sla_breach`, `BlockerBar`, escalation migration, GoNoGo "At risk" — but no in-app escalation surface or reassignment-on-breach; SLA is a nightly job, invisible until Home reload. |
| **Consistency** | 7/12.5 | Shared `record.tsx`/`ui.tsx`, `Confirm`, `Toast`, pills — but stage arrays (`STAGES`, `NEXT`) are duplicated across `Worklist` and `OrderDetail`, and pill color semantics vary. |
| **Accessibility** | 5/12.5 | Aria-labels, focus traps, keyboard rows shipped this session; kanban is arrow-button only (fine), but many derived-color signals (amber KPI, tone pills) carry meaning by color alone. |

Sixty-one puts it at **"competent internal tool, pre-product."** The bones (derived health, My Work, disposition gating) are above average for an internal build; the role model and cross-role handoffs are what hold the score down.

## 3. Top 20 problems

1. **Ops cannot reach intake.** `Inquiries` and `New sales order` are gated `['super_admin','sales']` in `roles.ts`. The role that "does order intake today" (operations) sees neither screen.
2. **No Coordinator role.** Marketing/order-coordination collapses into `operations` or `sales` with no tailored nav, no Home card set (`cardsByRole` has no coordinator key → falls back to `operations`).
3. **No Auditor role.** `AuditLog` (`fn_audit_search`) is `super_admin`-only. A compliance auditor must be handed super-admin — an over-grant that violates least privilege.
4. **No read-only Management view.** "Just let me look" managers get `business_owner`, which can *decide* approvals and edit `PricingRules`. Read-only is impossible without write power.
5. **Sales-Manager is a boolean, not a role.** `is_supervisor` silently changes `Worklist` default scope and `canAssignAny`; nothing in the UI tells a supervisor why their view differs, and it can't be granted per-team without editing `salesperson`.
6. **Quote→order retypes every line.** `SalesEntry` consumes `?client` and `?quote` (to set `converted_order_id`/`Accepted`) but **not the quote's line items**.
7. **Endorsement is an unguarded dropdown.** Moving to `Endorsed to Ops` in `OrderDetail` enforces no required fields (client contact, SAP-ready data).
8. **No ops acknowledgement of handoff.** Nothing records that ops *received* an endorsed order; the `awaitingEndorsement` KPI counts indefinitely with no accept/reject.
9. **Approvals have no visible due date or escalation.** `Approvals` rows show object/subject/note/decision — no SLA, no "waiting N days", no escalation if BO never acts.
10. **Ops sees Approvals but cannot decide.** `approvals` nav includes `operations`, yet `canDecide` is `['business_owner','super_admin']`. Ops open a screen of buttons they can't use.
11. **Six status vocabularies, no union.** An operator on `SessionDetail` reconciles `schedule.status`, GoNoGo recommendation, pax vs min/max, `v_cancel_readiness`, trainer/venue presence, and per-order `payment_status` by eye. Only orders get `primaryFlag`.
12. **Sessions and inquiries have no owner.** A below-minimum `schedule` or an aging `Inquiries` card belongs to nobody.
13. **Webshop channel is manual re-keying.** `SalesEntry` lists `Webshop` as a channel but there is no ingestion — a webshop order is hand-typed like any other.
14. **SLA breaches are invisible until reload.** `v_sla_breach` + the escalation migration run nightly; per-stage limits never surface as an in-context "you are late" until Home recomputes.
15. **Rollover is a one-shot, irreversible clone.** `fn_rollover_copy` clones every non-cancelled session into the next year and archives the source with no dry-run/preview.
16. **Duplicate stage arrays drift.** `STAGES`/`NEXT` are re-declared in `Worklist` and `OrderDetail`; a stage-model change must be edited in ≥2 files.
17. **`No Feedback` overloads the pipeline.** It's a `fulfillment_stage` that actually means "post-delivery survey missing" — a delivery-quality state masquerading as a fulfillment stage.
18. **E-learning access gated invisibly on payment.** `useElearningPending` keys grants to `order.payment_status`; a learner waits on an AR state they never see.
19. **Home falls back to ops cards for unknown roles.** `cardsByRole[role] || cardsByRole.operations` — any future/edge role sees operations metrics.
20. **Certificate issuance is one-way with no correction path.** `RosterPanel` states certs "cannot be un-issued from here" — a wrong attendance mark before issuance has no in-app remediation.

## 4. Top 20 opportunities

1. **Ship a `coordinator` role** with a nav slice (`Inquiries`, `New sales order`, `Orders`, `Clients`) and a Home card set (`unassigned intake`, `webshop to confirm`, `orders missing SAP data`) — and fix the intake gate.
2. **Split `business_owner` into `management_readonly` + `approver`.** Give management the dashboards/reports/quality with every write disabled; keep decisions on the approver.
3. **Promote `is_supervisor` to a real `sales_manager` role** (or an explicit team-scope grant surfaced in `Admin`), with manager Home cards (`team stalled`, `team overdue collections`, `unassigned in my region`).
4. **A scoped `auditor` role** that opens `AuditLog` (and read-only DataQuality) without super-admin — an RLS policy on `fn_audit_search` keyed to a new role.
5. **Prefill order lines from the quote.** In `SalesEntry`, read the quote's `quote_line` on `?quote` and populate `lines[]` — turning double entry into a review step and guaranteeing price parity.
6. **Endorsement checklist gate.** Block the `Endorsed to Ops` transition until required fields pass — reuse the `orderBlockers` pattern as a pre-flight.
7. **Two-sided handoff receipt.** Add `accept`/`bounce-back` on ops's side of endorsement, writing an `activity` entry and clearing the sales owner's queue only on accept.
8. **Unify status into one `recordHealth()` for every entity**, mirroring `orderState.ts`: a `primaryFlag` + tone for `schedule`, `inquiry`, `quote`.
9. **The universal handoff header.** Every order/session/inquiry/quote detail shows a fixed strip: *Owner now · Next action · Next owner · Due · Blocker*.
10. **Give sessions and inquiries an owner.** Route below-minimum and aging-lead alerts to that person's My Work instead of an anonymous count.
11. **In-app SLA surfacing.** Render `v_sla_breach` as a live `BlockerBar` banner on the record and a "Late" pill in `Worklist`.
12. **Escalation on breach.** When an approval or stage passes its SLA, auto-create a `task` for the supervisor/BO (the `task` table and `useMyTasks` already exist).
13. **Rollover dry-run.** A preview step listing session count, bookings carried, and conflicts before `fn_rollover_copy` commits; make archive reversible for a grace window.
14. **Webshop ingestion.** An import/queue that lands webshop orders as `New` + `Unpaid` for a coordinator to confirm, eliminating manual re-keying.
15. **Reclassify `No Feedback`** off the fulfillment axis into a delivery-quality flag, so the pipeline reads as a clean linear stage model.
16. **Consolidate the stage model** into `src/lib/orderState.ts` (`STAGES`, `NEXT`, terminal set) and import everywhere, killing the `Worklist`/`OrderDetail` drift.
17. **Explain e-learning gating.** On `Elearning`, show the blocking reason ("Awaiting payment — order Unpaid") and a one-click "grant anyway with reason."
18. **Certificate correction path.** A super-admin "void & reissue" with reason on `RosterPanel`, recorded to `AuditLog`.
19. **Group the 30-item nav** into sections (Sell / Deliver / Manage / Govern) so each role's slice reads as a workflow.
20. **Role-aware empty Home.** Replace the `|| cardsByRole.operations` fallback with an explicit "no cards configured for your role" + request-access link.

## 5. Current application architecture

**Module map (by workflow band).**
- **Sell:** `Inquiries` (kanban) → `Quotations`/`QuoteDetail` → `SalesEntry` → `Clients`/`ClientDetail` (Customer 360), `Organizations`/`OrganizationDetail`, `Duplicates`.
- **Deliver:** `Calendar` → `SessionDetail`/`SessionForm` with panels `GoNoGoPanel`, `RosterPanel`, `CloseSession`, `CancelSession`, `AttachmentsPanel`, `ContactsPanel`, `FeedbackPanel`; `Resources` (trainers & venues), `Elearning`.
- **Fulfill / AR:** `Orders`/`OrderDetail` (with `ReceivablePanel`, `TransferOrder`, `ActivityTimeline`), `Worklist` (the fulfillment queue).
- **Manage:** `Courses`/`CourseForm`, `PricingRules`, `Communications`, `Rollover`, `Approvals`, `Dashboard`, `Reports`, `Quality`.
- **Govern:** `Admin`, `AuditLog`, `DataQuality`.
- **Cross-cutting:** `CommandPalette` (⌘K global search), `BlockerBar`, `Confirm`, `Toast`, `Guard`.

**Data origins.** Everything flows through `src/hooks/data.ts` over Supabase. Reads split between **base tables** (`order`, `order_line`, `schedule`, `client`, `inquiry`, `quote`, `approval`, `participant`, `salesperson`, `task`, `notification`) and **DB views** that pre-derive workflow state: `v_fulfillment_queue`, `v_sla_breach`, `v_cancel_readiness`, `v_schedule_channel_pax`, `v_order_ar`, `v_country_revenue`, `v_trainer_quality`, `v_nps`. Writes are direct mutations plus RPCs for consequential operations: `fn_issue_certificate(s_for_session)`, `fn_rollover_copy`, cancel/disposition functions, `fn_audit_search`. The `okOr`/`sel` helpers let the UI degrade when a migration isn't live.

**Dependencies & derivation.** `orderState.ts` is pure client-side derivation over fields the row already carries — no stored workflow state, so orders list / `Worklist` / Home read identical rules. `GoNoGoPanel` derives recommendation and health from `schedule` + its `order_line`s.

**Re-entry vs reuse.** *Reused well:* client dedup by email in `SalesEntry`; `orderState` predicates; `entityHref` drill-through; shared primitives. *Re-entered:* **quote line items** into an order; **webshop orders** typed by hand; **SAP reference** manually keyed; stage arrays duplicated in code.

## 6. Current role model

The `Role` union in `src/lib/roles.ts` is exactly four: `super_admin | operations | business_owner | sales`. `NAV` gates screens; `Guard` enforces the cosmetic UI layer; RLS is authoritative.

**The collapse, job by job:**
- **System Admin → `super_admin`.** Clean 1:1. Also the *only* holder of `Admin`, `AuditLog`, `DataQuality`.
- **Training Operations → `operations`.** Real but mis-scoped: gets Courses/Pricing/Resources/Elearning/Communications/Rollover/Reports/Quality and read-only Approvals — yet **lacks Inquiries and New sales order**.
- **Marketing / Order Coordinator → nothing.** No enum value, no nav slice, no Home card.
- **Business Owner → `business_owner`.** Conflates *approver* and *read-only management*.
- **Sales User → `sales`.** Clean, RLS-scoped to own + team orders.
- **Sales Manager → `is_supervisor` boolean.** A pseudo-role: flips `Worklist` default scope and grants `canAssignAny`; invisible, ungrantable per-team from `Admin`.
- **Read-only Management → nothing.**
- **Auditor → nothing** (closest: `super_admin`, a gross over-grant).

Net: **two clean roles, one mis-scoped, one boolean pseudo-role, and three jobs with no representation** — three of which force an over-privileged assignment to function.

## 7. Current user journeys (as they work today)

**A. Inquiry → quote → order → ops → delivery → certificate.** A rep works `Inquiries` as a kanban (`Received → Responded → RFQ/P Sent → Awaiting Feedback → Closed Won/Lost`). To quote, they open `QuoteDetail` (`Draft → Sent → Accepted → Declined → Expired`). On acceptance they click **Create order**, landing in `SalesEntry?client=…&quote=…`. **Friction:** the quote's lines don't come across — they retype course/modality/seats/amount; on submit, `converted_order_id` and quote `Accepted` are stamped. The order enters at `New`; the rep advances it to `Endorsed to Ops` via dropdown. **Friction:** no completeness gate; ops never acknowledges. Ops pick it from `Worklist`, key SAP reference, move to `SAP Created`. Delivery: `GoNoGoPanel` recommends; on the day, `RosterPanel` marks attendance/result then issues certs. **Friction:** a mis-marked attendance before issuance has no in-app undo.

**B. Webshop order intake + payment.** Journey A minus the quote: open `New sales order`, pick channel **Webshop**, hand-type client + lines, set payment status separately. **Friction:** pure re-keying; the coordinator who should own it has no role, and `operations` can't open the screen. E-learning lines sit blocked until `payment_status='Paid'`.

**C. Session cancellation with dispositions.** Ops open `CancelSession`; it refuses to proceed until each live booking has a disposition (`Transfer`/`Refund`/`Credit`/`No Action`). Then a reason, then cancel, which routes through the approval queue. **Friction:** the approval has no due date or escalation.

**D. Business-owner approval round.** BO opens `Approvals`, Approves/Rejects via `useConfirm` with an optional note. **Friction:** no ordering by urgency/age, no SLA, and ops see the same screen with dead buttons.

**E. Annual rollover.** Ops open `Rollover` (source = highest year, target = next), confirm the irreversible clone, call `fn_rollover_copy`. **Friction:** no dry-run/preview; a mistake is year-wide.

## 8. Role-by-role findings

**System Admin (`super_admin`).** Owns users/access, governance, data hygiene. Sees everything, incl. sell/deliver screens they rarely need. Pain: dumping ground for every un-modeled job (auditor, read-only).

**Training Operations (`operations`).** Owns calendar, staffing, go/no-go, comms, e-learning, rollover, catalog/pricing. Shouldn't-but-does: opens `Approvals` with dead buttons. Should-but-can't: `Inquiries`, `New sales order`. Pain: below-minimum/unstaffed sessions arrive as anonymous counts with no owner.

**Marketing / Order Coordinator (no role).** Should own webshop/in-house intake + order confirmation. Reality: no nav, no cards, forced into `sales` or `super_admin`. Pain: the whole job is undesigned; webshop is manual re-keying.

**Business Owner (`business_owner`).** Owns approvals, pricing sign-off, oversight. Pain: can't delegate read-only; approvals unsorted by urgency.

**Sales User (`sales`).** Owns own+team orders, leads, quotes. Shouldn't edit payment/SAP — now blocked by trigger (remediated). Pain: quote→order re-entry; stalled/overdue flags self-served, no manager push.

**Sales Manager (`is_supervisor` boolean).** Owns team/region queue via widened Worklist. Pain: role invisible — no manager cards, no per-team grant UI, region scope is RLS magic.

**Read-only Management (no role).** Handed `business_owner` (can approve, edit pricing) or `super_admin`. Pain: no least-privilege "just look."

**Auditor (no role).** `AuditLog` is super-admin-only, so an auditor must be super admin — the single worst least-privilege violation in the model.

## 9. Cross-role handoff analysis

Each handoff below: *trigger / owner before→after / required fields / acknowledgement / no-op consequence / SLA gap.*

- **Coordinator → Sales (intake).** Trigger: order needs an owner. Before: nobody; after: `sales` via claim in `Worklist(who=unassigned)`. Required: none. Ack: claim sets `owner_code`. No-op: order sits `unowned` indefinitely. SLA gap: `New` 3-day rule, nightly-only.
- **Sales → Ops (endorsement).** Trigger: rep sets `Endorsed to Ops`. Before: sales; after: ops (implicit, no assignee change). Required: none validated. Ack: **none**. No-op: counts in `awaitingEndorsement` forever. SLA gap: `Endorsed to Ops` 5-day, nightly, no escalation.
- **Ops → BO (approval).** Trigger: `GoNoGoPanel`/`CancelSession` inserts an `approval`. Before: ops; after: BO/super. Ack: decision writes `decided_by`. No-op: session/forecast frozen. SLA gap: approvals carry no due date or escalation.
- **Ops → Sales (fill a session).** Trigger: `belowMin`/GoNoGo "at risk". Before/after: nobody→nobody. No-op: silent no-go risk until 14-day lead.
- **Ops → Learner (e-learning).** Gate: `payment_status='Paid'` (hidden). No-op: learner waits on an invisible AR state.

**Recommended future handoff model.** One contract every transactional record satisfies, rendered as a fixed detail-header strip and stored (not just derived):

> **Owner now · Next action · Next owner · Due · Blocker**

Concretely: (1) give `schedule` and `inquiry` an assignee like `order_assignment`; (2) make each stage transition write who it's waiting on + a due date from the per-stage SLA table (`New` 3 / `In Communication` 5 / `For Order Creation` 3 / `Endorsed to Ops` 5 / `No Feedback` 7); (3) require the receiving role to **accept or bounce**, writing an `activity` entry; (4) on SLA breach auto-create a `task` for the next owner's supervisor using the existing `task`/`useMyTasks` machinery, so escalation is in-app and same-day, not a nightly recompute.

## 10. Workflow friction analysis + highest-friction journeys

Scored 1–10 (10 = frictionless). Clicks = rough estimates from screen entry to task done.

| # | Journey | Screen(s) | Ease | Steps | Clarity | Error-risk | Role-fit | Clicks | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Quote → order (retype lines) | QuoteDetail→SalesEntry | 3 | 3 | 5 | 2 | 6 | ~18 | Every line retyped; price transcription risk |
| 2 | Webshop order intake | SalesEntry | 3 | 3 | 4 | 3 | 2 | ~16 | Manual re-key; owning role can't open screen |
| 3 | Endorse order to ops | OrderDetail/Worklist | 5 | 4 | 5 | 3 | 5 | 2–4 | Unguarded dropdown; no completeness gate/ack |
| 4 | Session cancellation w/ dispositions | CancelSession | 6 | 6 | 8 | 6 | 7 | ~2/booking+3 | Disciplined, but downstream approval has no SLA |
| 5 | BO approval sweep | Approvals | 6 | 5 | 6 | 5 | 8 | 2/item | No sort by urgency, no age/SLA |
| 6 | Ops opens Approvals (can't act) | Approvals | 2 | 2 | 3 | 5 | 2 | — | Dead buttons; wrong affordance |
| 7 | Annual rollover | Rollover | 4 | 5 | 6 | 2 | 6 | ~5 | Irreversible, no dry-run |
| 8 | Fill a below-minimum session | Home→Calendar→SessionDetail | 5 | 6 | 5 | 5 | 4 | ~8 | No owner; anonymous count |
| 9 | Certificate correction (pre-issue mistake) | RosterPanel | 2 | — | 4 | 3 | 3 | — | No in-app undo/void |
| 10 | E-learning grant blocked on payment | Elearning | 4 | 3 | 3 | 5 | 6 | ~4 | Blocking reason hidden |
| 11 | Claim + advance in fulfillment | Worklist | 7 | 3 | 7 | 6 | 8 | 2–3 | Strong; bulk advance/assign works |
| 12 | Inquiry kanban progression | Inquiries | 7 | 2 | 8 | 7 | 8 | 1/move | Arrow buttons, clean |
| 13 | Reassign an owner (ops) | Worklist/OrderDetail | 6 | 3 | 6 | 6 | 7 | 2–3 | Remediated; now possible |
| 14 | Go/no-go decision | GoNoGoPanel | 7 | 4 | 8 | 6 | 8 | 3–5 | Best-designed flow; health sentences |
| 15 | Find "is this order okay?" | Orders/OrderDetail | 7 | 1 | 8 | 8 | 7 | 1 | `primaryFlag` badge — the model to copy |
| 16 | Find "is this *session* okay?" | SessionDetail | 4 | 3 | 4 | 5 | 5 | — | No unified badge; reconcile 5 signals |
| 17 | Supervisor loads team queue | Worklist | 5 | 2 | 4 | 6 | 5 | 1 | Works but role invisible; no manager cards |
| 18 | Auditor reviews audit log | AuditLog | 3 | 2 | 6 | 4 | 1 | — | Requires super-admin grant |
| 19 | Grant read-only mgmt access | Admin | 3 | 3 | 4 | 4 | 2 | ~4 | Impossible without write power |
| 20 | New client during order | SalesEntry | 7 | 3 | 7 | 6 | 8 | ~5 | Email dedup reuse — done well |

**The ~15 worst (lowest composite first):** #6 ops-can't-act Approvals · #9 certificate correction · #18 auditor access · #19 read-only mgmt · #2 webshop intake · #1 quote→order retype · #7 rollover · #10 e-learning gate · #16 session health union · #3 endorsement gate · #8 fill below-minimum · #17 supervisor role visibility · #5 approval sweep sorting · #4 cancellation (good, SLA-blind downstream) · #13 reassign (now acceptable).

**Best-designed, keep and replicate:** #15 order `primaryFlag`, #14 `GoNoGoPanel`, #12 `Inquiries` kanban, #11 `Worklist`, #20 client dedup. The consistent lesson: **wherever `orderState.ts`'s derived-health/ownership discipline reaches, friction drops into the 7–8 band; wherever it doesn't (sessions, inquiries as records, handoffs, the missing roles), it collapses into the 2–4 band.**
