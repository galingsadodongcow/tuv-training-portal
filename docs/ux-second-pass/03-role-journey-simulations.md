# 03 — Role-Journey Simulations (Second Pass)

Covers mega-prompt **Parts 4, 5, 49**: a working-day simulation per role, a role-journey scorecard, and the ideal future-state day per role. Grounded in the current build as of the files named in the task. First-pass baseline is `docs/qa/ux-review/01`–`04`.

## The design test applied to every step
Each operational screen must answer: **(1) What needs my attention? (2) What do I do next? (3) Where do I do it? (4) Who owns the next step? (5) Is it progressing correctly?** Steps below tag each friction point with the question that fails.

## Role → DB reality (the root friction)
There are only four DB roles (`super_admin`, `operations`, `business_owner`, `sales`; `roles.ts`). The eight target jobs collapse onto them, and four of the eight have **no home**:

| Target job | Runs today as | Consequence baked into the sim |
|---|---|---|
| System Administrator | `super_admin` | Also the de-facto auditor and data-quality owner — over-scoped. |
| Marketing/Order Coordinator | **none** — borrows `sales` or `super_admin` | Intake (`Inquiries`, `New sales order`) is gated `['super_admin','sales']`; a coordinator without a `sales_id` can't be an order owner and can't self-serve intake cleanly. |
| Training Operations | `operations` | Locked **out** of `Inquiries` and `New sales order` (NAV gate); can view but not decide `Approvals`. |
| Business Owner | `business_owner` | Exec + operator in one: approves, edits pricing/payment, sets forecast. |
| Sales User | `sales` (non-supervisor) | Real, coherent. Best-served role today. |
| Sales Manager | `sales` + `is_supervisor` **boolean** | Not a role — a flag that widens RLS team→region. No manager surface. |
| Read-only Management | **none** — borrows `business_owner` | No read-only tier: anyone who can see can write. |
| Auditor / Compliance | **none** — `super_admin` | Full write access to audit the system; `audit`/`data-quality` gated `super_admin` only. |

Keep this table in view: half the "role journeys" below are really *a person doing a job the system has no role for*.

---

# Part 4 — A realistic working day, per role

Legend for the five-question check at each friction point: **Q1** attention · **Q2** next · **Q3** where · **Q4** owner · **Q5** progressing.

## 1. System Administrator (`super_admin`)

**Login → landing.** Lands on `/home` (`Home.tsx`). Super-admin attention cards: *Data quality · Duplicate candidates · Orders missing an owner · Pending approvals*. Below the cards Home re-renders a second heading literally titled **"My Work"** (tasks + unread notifications + pending approvals). So `/home` already contains a mini `/my-work`, and `/my-work` (`MyWork.tsx`) then repeats tasks + approvals and adds orders/sessions/SLA. **Q1 answered twice, inconsistently** — the admin must reconcile two exception surfaces that compute overlapping predicates (see brief: "IA redundancy GREW").

**Find work.** Duplicate candidates card → `/duplicates` (real `fn_merge_orders` now). Orders-missing-owner card → `/worklist?who=unassigned`. Good drill-throughs. **Q2/Q3 OK here.**

**Open a record → status/health/owner.** Opens an order via `OrderDetail.tsx`: header shows channel, stage, payment, collection badge, assignee as a plain `fill-label`, `BlockerBar`. No breadcrumb (just a back link), no right rail, long single-column scroll. **Q4 weak**: owner is buried text, not a first-class field; there is no next-owner or due. **Q5 partial**: `BlockerBar` + collection state signal health, but stage is hand-set.

**Exception / audit.** Admin is *also* the auditor. `/audit` shows `changed_fields` as field **names only** — no before/after values (brief). For a "who changed this price and from what" question the app cannot answer; the admin falls back to the DB. **Q5 fails for governance.**

**Config exception.** A stage label or channel needs renaming → there is **no lookups/config console**; stages/methods are string literals in TSX (`Worklist.tsx STAGES`, `Inquiries.tsx STAGES`). Change = code + deploy. **Q3 fails** (nowhere to do it).

**End of day.** Admin cleared duplicates and owner gaps but could not (a) reconcile Home vs My Work, (b) produce an audit-grade trail, (c) self-serve any config. Over-scoped and under-tooled.

## 2. Marketing / Order Coordinator (no role — the sharpest failure)

This is the role the app is missing, so the sim is "what breaks when the coordinator logs in as `sales` or `super_admin`."

**Login → landing.** There is **no coordinator landing**. If they hold `sales`, Home shows the *sales* cards (Unassigned orders / My open orders / My stalled / Sessions needing pax) — a seller's framing, not an intake-owner's. **Q1 fails**: the coordinator's real queue is *new inquiries to validate and endorse*, which no card names.

**Intake.** Coordinator's core job = capture inquiry → validate → endorse to ops. `Inquiries.tsx` is a kanban with **no detail page**: a lead is a card with ‹ › stage arrows and a "Lost" button (`move()` / `markLost()`). There is **no next_action, no task, no assignee beyond `sales_id`, no convert-to-order-from-lead**. **Q2 fails** (the card can only shuffle stage), **Q4 fails** (inquiry has no owner contract).

**Hand off intake → order.** The lead won it. There is **no convert path**; the coordinator opens `New sales order` (`SalesEntry`) and **retypes every line** — `SalesEntry` doesn't read `quote_line`/`inquiry` (brief). If they only hold a coordinator identity mapped to `operations`, the NAV gate hides both `Inquiries` and `New sales order` entirely — **they cannot do intake at all**. **Q3 fails.**

**Endorse to ops.** They advance an order to *Endorsed to Ops* via the `Worklist` stage dropdown/`advance()`. There is **no completeness gate, no ops accept/return receipt, and the sender's queue does not clear on accept** (brief: "Handoff still dropdown edits"). The coordinator can't tell if ops picked it up. **Q4/Q5 fail** — ownership silently "falls into" the next stage with no receiving party.

**End of day.** The coordinator's entire job runs on borrowed screens with no owned queue, no lead health, no real handoff. This role is the second pass's headline gap.

## 3. Training Operations (`operations`)

**Login → landing.** Home ops cards: *Sessions below minimum · Unstaffed sessions · Awaiting endorsement · Pending cancellations*. Genuinely useful and role-fit. **Q1 mostly answered.** But `My Work` ops view has **no notifications section** (notifications live only on Home + the bell), so ops toggling to `/my-work` loses a stream. Overlap without parity.

**Find/open a session.** `Awaiting endorsement` → `/worklist?...stage=Endorsed to Ops`; a below-min session → Calendar → `SessionDetail.tsx`. SessionDetail is the **strong** screen: `RecordHeader` (status pill, go pill, computed **health pill** from `v_session_health`, private-run, roster-locked), tabs, fill bar, P&L, Go/No-Go panel. **Q1/Q5 answered well** for sessions — this is the pattern to spread.

**Ownership gap.** The session that "needs attention" has **no assignee** — sessions have no owner field anywhere (brief). Ops as a team see it, but *which ops person owns getting this session to go-live* is unanswerable. **Q4 fails** on the entity ops most cares about.

**Perform / confirm.** Ops sets status (Tentative→Confirmed→Running→Completed), closes, or cancels-with-dispositions from the overview "Session status (operations)" panel. Cancellation correctly routes to BO approval (note text on screen). Confirmation via toast. **Q2/Q3 answered.**

**Receive a handoff.** An order was "Endorsed to Ops." Ops has **no accept/return** step — it just appears further along the `Worklist`. No prep-deadline task is auto-created (Phase-4 automation deferred). **Q5 partial.**

**Intake exception.** A customer emails ops directly with a new booking. Ops **cannot open `Inquiries` or `New sales order`** (NAV gate excludes `operations`). They must ask a coordinator/sales to key it. **Q3 fails** — a hard org boundary encoded as a nav gate.

**End of day.** Ops is well-served on *sessions* (health, detail, actions) and blind on *ownership* and *intake*.

## 4. Business Owner (`business_owner`)

**Login → landing.** BO cards: *Sessions below minimum · Pending approvals · Unassigned orders · Performance (View)*. The Performance card is the only route to `/dashboard`. **Q1 answered for approvals + risk.**

**Approve/reject.** `Approvals.tsx`: pending list, `decide()` with confirm + reason, history table. Clean. Only two object types exist (forecast sign-off, session cancellation). **Q2/Q3/Q4 answered** — this is the one place ownership of a decision is explicit ("The business owner decides").

**Read performance.** `/dashboard` (`Dashboard.tsx`): 6 KPIs but **only "Sessions at risk" is a link** (→ calendar). Booked revenue, Forecast, Delivered revenue, Pending payments, Cancellation rate are **dead-end tiles** — no drill-through. **Q2 fails** on five of six metrics: the BO sees a number and cannot act on it. One dashboard for all roles; no BO-specific view (brief).

**Operator overreach.** BO can also edit stage/payment/SAP on `OrderDetail`, set forecast on `SessionDetail`, edit pricing. The role conflates *approver* with *operator*. **Q4 muddied** at the org level — the approver can also do the work they approve.

**End of day.** BO decisions flow well; BO *insight* is a wall of unlinked numbers.

## 5. Sales User (`sales`, non-supervisor)

**Login → landing.** Sales cards: *Unassigned orders (Claim these) · My open orders · My stalled orders (>14d) · Sessions needing pax*. Self-framed, actionable. `/my-work` orders section is **self-scoped** (`selfScoped = myCode && !is_supervisor`) — "My orders needing attention." **Q1 answered — this is the best-served role.**

**Claim → work an order.** `Worklist.tsx` defaults a non-supervisor to `who=mine`; the *Claim queue* (`who=unassigned`) offers "Pick up" (`selfAssign`, upsert on `order_assignment`, no race). `primaryFlag()` shows the one flag that matters per row; `advance()` moves stage with optimistic rollback. **Q2/Q3/Q4 answered** — orders are the one entity with a real owner contract.

**Guardrails.** On `OrderDetail`, sales sees payment status and SAP as **read-only** (`isSales`), backed by a DB trigger. Correct least-privilege. **Q4 respected.**

**Exceptions.** Quote won → `New sales order` **retypes every line** (no quote read). SLA breach shows in `/my-work` "Exceptions" and as a `Worklist` banner, but there is **no in-context "you are late" banner on the order record** and no escalation ladder (brief). **Q5 partial** — the rep learns they're late only on the list, not on the record.

**End of day.** Coherent. The gaps are *handoff* and *quote reuse*, not orientation.

## 6. Sales Manager (`sales` + `is_supervisor`)

**Login → landing.** Same `Home` **sales cards** as a rep — there is no manager framing. The only signal they are a manager: the sidebar role pill appends "· Supervisor" (`Shell.tsx`). **Q1 fails for the manager job**: no "my team's pipeline / my reps' stalled orders / who is overloaded" view.

**Scope.** `is_supervisor` flips `selfScoped` off, so `/my-work` and `Worklist` default to the **whole team/region** queue, and they get the bulk-assign owner dropdown (`canAssignAny`). So a manager *can* reassign across the team — but through the same flat `Worklist`, with no per-rep rollup, no team SLA view, no capacity signal. **Q2/Q4 partial**: they can act, but must eyeball a 250-row table to find which rep is drowning.

**Approvals.** Manager cannot decide approvals (BO/super_admin only) — reasonable, but they also have no *team* approval/exception queue of their own.

**End of day.** A supervisor boolean bolted onto a rep UI. The manager job (coach the team, balance load, unblock reps) has no surface.

## 7. Read-only Management (no role — borrows `business_owner`)

**Login → landing.** To see anything meaningful they must hold `business_owner`, which means they can **write** — edit orders, set forecasts, approve. **Q4 fails at the trust boundary**: there is no way to give a VP visibility without also giving them the ability to change records. Least-privilege is impossible today.

**Read.** `/dashboard` is the natural home, and it is exactly the dead-end-KPI wall from role 4 — five of six tiles don't drill. Reports is a separate screen (Analytics is still 3 screens: Dashboard/Reports/Quality, brief). **Q2 fails**: a manager who spots a bad number cannot pivot into the underlying records.

**End of day.** The role that should be the *easiest* to serve (read-only) is unserviceable because there is no read-only tier and the read surface itself is a dead end.

## 8. Auditor / Compliance (no role — `super_admin`)

**Login → landing.** Auditor = `super_admin` (brief). To inspect the system they receive **god mode**: they can merge, reassign, edit, delete. **Q4 fails catastrophically for audit independence** — the auditor can mutate the evidence.

**Do the audit.** `/audit` (super-admin only) shows `changed_fields` as **field names, not before/after values**. "Was this refund authorized, by whom, from what amount?" is unanswerable in-app; refunds are a hard payment **DELETE** with an un-persisted reason (brief). **Q5 fails** — the trail is not audit-grade.

**End of day.** The auditor cannot do a real audit and holds far more power than the job requires. Highest-risk role gap after the coordinator.

---

# Part 5 — Role-Journey Scorecard

Scores 1–10 (10 best) for the **current build**, scoring each target job as it is actually experienced today (on its borrowed/real DB role). Justification required for every score ≤ 6.

| Role | Clarity | Ease | Speed | Clicks | Nav effort | Data-entry | Info overload | Workflow fit | Ownership | Error risk | Learnability | Daily productivity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| System Administrator | 5 | 6 | 6 | 5 | 5 | 6 | 4 | 5 | 5 | 4 | 6 | 5 |
| Marketing/Order Coordinator | 2 | 2 | 3 | 3 | 3 | 2 | 4 | 1 | 1 | 3 | 3 | 2 |
| Training Operations | 7 | 6 | 7 | 6 | 6 | 6 | 6 | 6 | 3 | 6 | 7 | 6 |
| Business Owner | 6 | 7 | 6 | 6 | 6 | 7 | 5 | 6 | 4 | 5 | 7 | 6 |
| Sales User | 7 | 8 | 7 | 7 | 7 | 5 | 6 | 7 | 8 | 7 | 7 | 7 |
| Sales Manager | 4 | 5 | 5 | 4 | 5 | 6 | 4 | 3 | 5 | 5 | 5 | 4 |
| Read-only Management | 3 | 4 | 4 | 4 | 5 | — | 4 | 2 | 2 | 2 | 5 | 3 |
| Auditor / Compliance | 3 | 4 | 4 | 4 | 5 | — | 5 | 2 | 1 | 1 | 4 | 3 |

### Justifications (all scores ≤ 6)

**System Administrator** — Clarity 5: Home and My Work present two overlapping exception surfaces to reconcile. Clicks 5 / Nav 5: no config console, so many "changes" are code + deploy, not clicks. Info overload 4: also carries data-quality + audit + duplicate duties in one identity. Workflow fit 5 / Ownership 5: acts as auditor and coordinator without those roles' framing. Error risk 4: full mutate rights while also the audit authority. Daily productivity 5: over-scoped, under-tooled.

**Marketing/Order Coordinator** — every core score low because the role has **no home**: Clarity 2 / Workflow fit 1 / Ownership 1: intake runs on borrowed `sales`/`super_admin` screens; inquiry has no detail page, no owner, no next_action, no convert-to-order (`Inquiries.tsx`). Ease 2 / Data-entry 2: winning a lead means retyping the whole order in `SalesEntry`. Speed 3 / Clicks 3 / Nav 3: if mapped to `operations`, intake nav is hidden entirely. Learnability 3 / Productivity 2: nothing about the UI teaches or supports the intake→validate→endorse flow.

**Training Operations** — Ease 6 / Clicks 6 / Nav 6 / Data-entry 6 / Info overload 6 / Workflow fit 6 / Error risk 6: strong on sessions (SessionDetail health/detail/actions) but forced out of intake by NAV gate and no accept/return on received handoffs. Ownership 3: sessions — the entity ops lives in — have **no assignee**; "which ops person owns this session" is unanswerable. Productivity 6: good session tooling, blind on ownership.

**Business Owner** — Clarity 6 / Ease… (approvals fine): Info overload 5 / Ownership 4: approver and operator conflated (edits pricing/payment/forecast on the same records they approve). Clarity 6 / Clicks 6 / Nav 6 / Workflow fit 6 / Error risk 5: fine for approvals, but Dashboard is one-size-fits-all. Speed 6 / Productivity 6: five of six dashboard KPIs are dead-end tiles (only "Sessions at risk" links), so insight rarely converts to action.

**Sales User** — Data-entry 5: quote→order retypes every line; no `fn_create_order` transaction. Info overload 6: `Worklist` can show 250 rows with only URL-param filters, no saved views/sort. All other scores ≥ 7: this is the role the current model actually fits.

**Sales Manager** — Clarity 4 / Workflow fit 3: served the identical rep `Home`; no team pipeline, per-rep rollup, or capacity view — only the sidebar "· Supervisor" tag differs. Clicks 4 / Speed 5 / Nav 5 / Info overload 4: reassigning across the team means scanning a flat 250-row `Worklist`. Ownership 5 / Error risk 5 / Learnability 5 / Productivity 4: `is_supervisor` widens RLS but adds no manager surface.

**Read-only Management** — Clarity 3 / Ease 4 / Speed 4 / Clicks 4: only real read surface is the dead-end Dashboard. Info overload 4 / Workflow fit 2 / Ownership 2 / Error risk 2: **no read-only tier** — to see data they must hold `business_owner`, i.e. write access; visibility cannot be granted without mutate rights. Learnability 5 / Productivity 3: dashboard numbers don't drill into records.

**Auditor / Compliance** — Clarity 3 / Ease 4 / Speed 4 / Clicks 4: audit lives in one super-admin-only screen. Info overload 5 / Workflow fit 2 / Learnability 4 / Productivity 3: `audit` shows field **names only**, no before/after; refunds are hard deletes with un-persisted reason — not audit-grade. Ownership 1 / Error risk 1: auditor = `super_admin` with full mutate rights over the very records and evidence they audit.

**Reading the table:** Sales User is the ceiling the model was built for; every job the model doesn't name (Coordinator, Manager, Read-only Mgmt, Auditor) sits at the floor. The three levers are the same in each low row: **a real role, an ownership contract, and a drill-through/handoff that closes the loop.**

---

# Part 49 — Ideal future-state daily journey, per role

Consistent with the brief's future-state anchors: **My Work is the primary operating surface** (Home absorbed, overlap retired); **every transactional record carries a stored ownership contract** (Owner · Team · Assigned · Due · Next action · Next owner · Blocking reason · Escalation · History); **handoff is a transaction** (trigger → completeness check → send → Accept/Return-for-correction → transfer + activity + SLA); **status and health stay separate** for every entity; the **SessionDetail record standard** spreads to Order and Client; IA is organized around workflows. Every proposed metric names its drill-through.

## 1. System Administrator
- **Landing:** `My Work` → *Platform health* lane (RLS-drift alerts, failed nightly jobs, unowned records count → drills to the offending list).
- **Morning:** clears the *config* queue in a new **Admin → Lookups** console (stages/methods/channels/SLA targets as data, not TSX literals — retires the deploy-to-rename problem).
- **Main tasks:** provision/deactivate auth users (real invite flow); assign roles from the 8-role model; never touch business records.
- **Search → handoff:** global search covers email/phone/participant/trainer/cert; admin resolves an access request and hands the record's *data-quality* exceptions to the owning role via task, not by fixing it himself.
- **End of day:** zero unowned records, zero failed jobs; admin has changed **config and access only**, never business data.

## 2. Marketing / Order Coordinator (new role, owns intake)
- **Landing:** `My Work` → *New inquiries to validate* + *leads aging past SLA* (inquiry gains a **health** signal, mirroring order `primaryFlag`).
- **Morning:** opens an **Inquiry detail page** (SessionDetail-standard: header status+health+owner+due, attention area for missing fields, Tasks/Activity tabs). Validates completeness against a gate.
- **Main flow:** *Convert to order* button reads `quote_line`/inquiry into `SalesEntry` (no retyping) via an `fn_create_order` transaction; then **Endorse to Ops** fires the handoff transaction — completeness check → ops receives an Accept/Return card; coordinator's queue clears **only on Accept**.
- **Exception:** ops returns-for-correction with a reason → the item reappears in coordinator's My Work with the reason attached.
- **End of day:** every inquiry has an owner, a next action, and a due; endorsed orders are provably received.

## 3. Training Operations (owns sessions)
- **Landing:** `My Work` → *Sessions I own needing attention* (schedule now has an **assignee**), *handoffs to accept*, *prep deadlines* (auto-tasks).
- **Morning:** accepts endorsed orders (Accept/Return); each accept auto-creates prep-deadline tasks and a session-owner assignment.
- **Main screen:** `SessionDetail` (already the standard) gains owner/next-owner/due in a right rail and the missing inputs (meeting link, materials_ready, special_requirements) that feed `v_session_health`.
- **Actions/approvals:** status transitions, close, cancel-with-dispositions (still routes to BO); Go/No-Go unchanged.
- **Reports:** "Operations Today" command center fed by the existing `v_digest_*` views (not just the nightly job).
- **End of day:** every live session has a named owner, a health state, and no silent handoffs.

## 4. Business Owner (approver only)
- **Landing:** `My Work` → *Approvals to decide* (the one thing only they can do), each with full context inline.
- **Morning:** decides cancellations/forecast sign-offs; operator powers (edit pricing/payment/forecast) move to ops/coordinator so the approver stops approving their own work.
- **Reports:** a **BO dashboard** where every KPI drills: Booked-vs-forecast → the orders behind the gap; Delivered revenue → completed sessions; Pending payments → the AR list; Cancellation rate → the cancelled orders. No dead tiles.
- **End of day:** decisions logged with reason to an audit-grade trail; BO never edited a record they will later approve.

## 5. Sales User
- **Landing:** `My Work` → *My orders needing attention* + *my quotes* + *my won leads to convert* (keeps today's strong self-scoping).
- **Morning:** claims from the *unassigned* queue; works orders with `primaryFlag`.
- **Main flow:** quote→order is one transactional action (reads lines); the order record shows an **in-context "you are late" banner** when its SLA is breached (not just on the list) with a one-click escalate.
- **Handoff:** endorse-to-ops as a transaction with confirmation of receipt.
- **End of day:** no retyping, no silent late orders, clear receipt on every handoff.

## 6. Sales Manager (real role, team scope)
- **Landing:** a **team `My Work`**: per-rep rollup (open pipeline, stalled orders, SLA breaches by owner), capacity/overload signal → each cell drills to that rep's filtered `Worklist`.
- **Morning:** rebalances load with bulk reassign (already possible) but *driven by* the rollup, not a 250-row scan; unblocks reps flagged by escalation.
- **Approvals:** owns a team-level exception/escalation queue (owner→supervisor rung of the SLA ladder) before things reach BO.
- **End of day:** team load balanced from a purpose-built surface, not inferred from a flat table.

## 7. Read-only Management
- **Landing:** a **read-only** dashboard tier (new least-privilege role — sees, never writes).
- **Day:** every KPI drills into read-only record views (same drill targets as the BO dashboard, minus the edit affordances); Analytics consolidated to one screen with tabs (Dashboard/Reports/Quality) and a global date-range control.
- **End of day:** full visibility, zero mutate capability — the trust boundary the current build cannot express.

## 8. Auditor / Compliance
- **Landing:** a **read-only auditor** role with access to an **audit-grade** trail: `changed_fields` carries **before/after values**, refunds/voids/credits are modeled (no hard deletes), every approval and reassignment is immutable and attributable.
- **Day:** reconstructs "who changed what, from what, when, and was it authorized" entirely in-app; exports for compliance.
- **End of day:** the auditor has read everything and changed nothing — independence guaranteed by the role, not by convention.

---

### Cross-cutting future-state moves that unblock most of the table
1. **Ship the 8-role model** (adds Coordinator, real Sales Manager, Read-only Management, Auditor; splits BO approver/operator). Fixes the four floor-scoring rows at the source.
2. **Store the ownership contract on order, schedule, and inquiry.** Answers Q4 everywhere it currently fails.
3. **Handoff-as-transaction with Accept/Return.** Answers Q5 across coordinator→ops and sales→ops.
4. **Make every dashboard KPI drill** and give inquiry/quote a health signal. Answers Q2 for BO and Management.
5. **Retire Home; make My Work the single operating surface** and spread the SessionDetail record standard to Order/Client. Removes the double-attention-surface friction hitting every role.
