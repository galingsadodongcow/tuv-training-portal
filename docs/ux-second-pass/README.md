# Second-Pass Enterprise UX Review — TÜV Rheinland Academy PH Training Operations & Sales Hub

**Master report.** A post-remediation review of the live application (https://tuv-training-portal.netlify.app) and the codebase on `claude/app-code-review-oyrttm`, written after the first-pass review (`docs/qa/ux-review/`) and its four implementation phases. This is a **design and prioritization deliverable, not an implementation** — no application code was changed in this pass.

> **How to read this.** Start here (verdict + top-10s + future architecture). Then `01-post-qa-gap-analysis.md` (what got done, what's left), `14-product-decisions.md` (the business questions that gate everything), and `16-implementation-roadmap.md` (the sequence). Parts 02–13 and `wireframes/` are the detailed design of each area.

## Document map

| File | Covers |
|---|---|
| `01-post-qa-gap-analysis.md` | Baseline recommendation ledger, post-remediation gaps, redundancy, top-20 friction, quick wins |
| `02-role-model-and-permissions.md` | 8-role target model, Coordinator/Manager/Auditor/Admin designs, permission matrix |
| `03-role-journey-simulations.md` | A working day per role, role scorecards, ideal future journeys |
| `04-end-to-end-workflows.md` | Inquiry→cert, current-vs-ideal per workflow, exception flows |
| `05-handoffs-and-ownership.md` | Ownership contract, handoff-as-transaction, tasks/notifications/approvals, SLA |
| `06-information-architecture.md` | Nav critique, screen consolidation, global search, future IA |
| `07-my-work-and-dashboards.md` | My Work as primary surface, role-specific dashboards |
| `08-screen-redesigns.md` | Record-page standard, tables, forms, reduce-manual-entry, responsive |
| `09-customer-sales-orders.md` | Sales cockpit, Customer 360, order lifecycle |
| `10-training-operations.md` | Session-health critique, Operations command center |
| `11-payments-exceptions.md` | Payment/AR, refund/void/credit model, AR exceptions |
| `12-ui-design-system.md` | Status-vs-health, activity timeline, UI review, design system, a11y, terminology |
| `13-automation-and-sla.md` | Automation inventory + remaining automation, SLA/escalation |
| `14-product-decisions.md` | Business-owner decisions required before build |
| `15-prioritized-backlog.md` | Full backlog (P0–P3) with acceptance criteria |
| `16-implementation-roadmap.md` | Phased sequence A–G with acceptance criteria |
| `wireframes/README.md` | Text wireframes for 14 future-state screens |

---

## 1. Executive verdict

**The remediation did what it should have: it fixed the things that were *wrong*, and deferred the things that are *structural*.** Phases 1–4 closed every P0 correctness-and-trust defect (the duplicate "merge" that double-counted seats and revenue; the unenforced stage machine; the SessionForm bugs that defeated per-session caps and let users hand-set `Completed`; dead reminder code; participant duplication) and rebuilt the accessibility and design-system layer (contrast, focus rings, status-not-by-colour, chart data-tables, required-field validation). It also shipped three genuine structural seeds — **My Work**, a **notification centre**, and a **computed session-health model** surfaced consistently across the calendar, the session record, and My Work.

**But the product is still database-shaped in exactly the places the first review named, because those were correctly held for business sign-off.** Four database roles still wear eight real jobs. The two most important handoffs in the business — Sales→Operations and intake→everyone — are still dropdown edits with no completeness gate and no receipt. Sessions and inquiries still belong to nobody. The customer is still four unlinked records. And the refund path is still a hard `DELETE` of a payment row.

**One new, self-inflicted problem emerged from the remediation itself:** My Work and grouped navigation were added *additively*, without retiring **Home**, **Worklist**, or **Data Quality** — so a user now has *four* overlapping "here is your operational work" surfaces (Home, My Work, Worklist, Data Quality) that compute the same predicates. The first review's #1 IA recommendation was to *unify* those; the remediation *added a unifier next to the things it was meant to replace*. That must be resolved before any further surface is added.

**Verdict: a competent internal tool that has crossed into early-product on correctness and accessibility, still held below "product" by an unresolved role model, undesigned handoffs, and entity ownership that stops at the order boundary. The remaining work is now overwhelmingly product-decision and workflow-architecture work, not bug-fixing.** The single highest-leverage move is not a screen — it is deciding **who owns order intake** and giving that role, plus sessions and inquiries, a real owner. Everything else composes off that.

## 2. What changed since the first UX review

| Area | First-pass state | Now |
|---|---|---|
| Duplicate merge | Flag-only; seats/revenue double-counted | `fn_merge_orders` reconciles (cancels dup + lines); Duplicates screen has a keep/cancel chooser |
| Stage transitions | UI-only `NEXT` map; any value writable | `fn_orders_stage_guard` DB trigger enforces the legal graph |
| Participant duplication | No uniqueness | `fn_participant_dedup_guard` blocks same-email-per-session |
| Reminders | Coded but never called | Wired into `fn_nightly_hygiene` (queue-only; `send-comms` still unscheduled) |
| Session health | Re-derived per surface or omitted | `v_session_health` computed; surfaced on Calendar, SessionDetail, My Work |
| SessionForm | Defeated per-session pax; `Completed` hand-settable | Pax editable + submitted; picker restricted; date-range validated |
| My Work | Did not exist | `/my-work` with tasks, approvals, orders, sessions, SLA breaches |
| Notifications | Only on Home | Header bell + unread + dropdown + deep-links |
| Navigation | 23 flat items | Grouped into 8 sections |
| Accessibility | ~5/12.5 (colour-only signals, no focus rings, failing contrast) | Contrast AA, shared focus ring, status-not-by-colour, chart data-tables, required markers |
| Quote auto-expire, SAP-format check, inline dup-client warning | none | shipped |

## 3. What has improved

- **Correctness/trust is now solid.** The financial and roster integrity holes are closed at the database, not the UI — the right layer.
- **Accessibility went from the weakest dimension to a strength.** This is real and measurable (WCAG-AA contrast, keyboard focus, non-colour status).
- **A derived-health discipline now reaches sessions**, not just orders — `v_session_health` is the session analogue of `orderState.ts`, and it is surfaced consistently.
- **There is now a single place to see "my work"** and a persistent notification affordance — the seeds of an action-oriented product.
- **The design system is more coherent** (tokenised pills, one focus ring, PHP labelling, sticky identifier columns on laptops).

## 4. What remains structurally weak

1. **Role model (unchanged).** Still four roles for eight jobs. No Order/Marketing Coordinator, no Auditor, no read-only Management, no real Sales Manager. Auditor still requires super-admin — the worst least-privilege violation, still open.
2. **Intake has no home (unchanged).** `operations` still cannot open `Inquiries` or `New sales order`; webshop orders are still hand-re-keyed.
3. **Handoffs are still dropdowns (mostly unchanged).** The stage *order* is now DB-enforced, but there is still no completeness gate on endorsement and no Operations accept/return receipt. The most important business transaction is still a `<select>`.
4. **Ownership stops at the order.** Sessions and inquiries still have no assignee; an at-risk session or an ageing lead belongs to nobody's My Work.
5. **Four operational surfaces overlap (new, worse).** Home, My Work, Worklist, Data Quality all answer "what needs attention" with the same predicates.
6. **The customer is four unlinked records.** `inquiry` still has no `client_id`; a lead never resolves to a customer; ClientDetail never shows inquiries.
7. **Records are inconsistent.** OrderDetail and ClientDetail are long single-column scrolls; SessionDetail is the tabbed standard nobody else adopted.
8. **Dashboard is one-size-fits-all** with mostly dead-end KPIs.
9. **Money is one-directional.** No refund/void/credit objects; "refund" is a destructive delete with an un-persisted reason.
10. **Governance is not audit-grade.** `audit_log.changed_fields` records field *names*, never before/after values.

## 5. Updated UX maturity score — **68 / 100** (first pass: 61)

| Dimension | First pass | Now | Why it moved |
|---|---|---|---|
| Information architecture | 8.5 | 8.5 | Grouping helped; additive My Work/Home/Worklist/DataQuality overlap cancelled the gain |
| Role fit | 5 | 5 | **Unchanged — now the binding constraint** |
| Workflow support | 8 | 9 | Enforced stage machine, merge RPC, session health, My Work, form validation |
| Ownership clarity | 7 | 7 | Orders still the only owned entity |
| Status model | 6.5 | 8 | Session health computed + surfaced; inquiry/quote still have none |
| Exception handling | 7.5 | 8 | SLA breaches + dedup + health in My Work; escalation still nightly |
| Consistency | 7 | 8 | Tokenised pills, shared health lib, focus ring; record pages still diverge |
| Accessibility | 5 | 9 | Contrast, focus, non-colour status, chart tables, required markers |

**+7 points, entirely on correctness, workflow, status, and accessibility. Zero movement on role fit and ownership — which is exactly why the next phase must be the role model and the handoff/ownership architecture, not more screens.**

## 6. Top 10 remaining product problems

1. **No Order/Marketing Coordinator role** — nobody owns intake integrity (matching, dedup, completeness, deposit check, endorsement). *P0.*
2. **Intake screens are closed to Operations** — the role documented as doing intake can't open Inquiries or New order. *P0 (also a decision).*
3. **Auditor = super-admin** — governance requires an over-grant; audit isn't before/after. *P0.*
4. **Sessions and inquiries have no owner** — accountability ends at the order. *P0.*
5. **Refund/void/credit doesn't exist** — money leaves via a hard delete with an un-persisted reason. *P1.*
6. **Customer is fragmented** — `inquiry.client_id` missing; Client/Org/Contact/Inquiry unlinked; no Customer 360. *P1.*
7. **Read-only Management is impossible** — "just let me look" requires `business_owner`, which can decide approvals and edit pricing. *P1.*
8. **Sales Manager is a boolean** — no manager surface, no per-team grant, region scope is invisible RLS. *P1.*
9. **Webshop intake is manual re-keying** — a channel with no ingestion. *P2.*
10. **Admin config is hardcoded** — stages/methods/channels are string literals; changing one needs a deploy. *P2.*

## 7. Top 10 remaining UX problems

1. **Four overlapping operational surfaces** (Home / My Work / Worklist / Data Quality). *P1.*
2. **Dashboard is generic and mostly non-drill-through** — five of six KPIs are dead ends. *P1.*
3. **OrderDetail & ClientDetail are long scrolls**, not the tabbed record standard SessionDetail already proves. *P1.*
4. **Inquiry has no detail page** — a lead can't hold activity, a next-action, or a one-click convert. *P1.*
5. **Inquiry and quote have no health signal** — only order and session do. *P2.*
6. **Saved views are ephemeral URL params** — no persisted "My Follow-ups Today". *P2.*
7. **Global search is title/name only** — no email/phone/participant/trainer/cert, no typo tolerance, no recents/preview. *P2.*
8. **Tables lack column sort** on Orders/Worklist; bulk only in Worklist. *P2.*
9. **Calendar has no week/day view and no session drawer** — editing leaves the calendar. *P2.*
10. **No breadcrumbs**; record orientation relies on a single back-link. *P3.*

## 8. Top 10 remaining workflow problems

1. **Endorsement has no completeness gate and no receipt** — Sales→Ops is a dropdown; Ops never accepts. *P0.*
2. **Quote→order retypes every line** — `quote_line` isn't read on conversion; price-transcription risk. *P1.*
3. **SalesEntry is a non-transactional 4-write saga** — no `fn_create_order` RPC; partial-failure states. *P1.*
4. **Roster is typed by hand** — no CSV import; the single biggest ops data-entry cost. *P1.*
5. **Participant remove is a hard delete** — destroys attendance/cert history; contradicts soft-delete stance. *P1.*
6. **No return-for-correction anywhere** — a bad handoff or approval can only be accepted or rejected, not bounced with a reason. *P1.*
7. **SLA breaches don't escalate in-app** — no owner→supervisor→BO ladder; nightly only. *P2.*
8. **Won inquiry doesn't become an order** — `Closed Won` dead-ends; no linkage. *P2.*
9. **No whole-session reschedule** — only line-level transfer; no customer fan-out. *P2.*
10. **E-learning access is gated on an invisible payment state** — the learner waits on AR they can't see. *P3.*

## 9. Top 10 recommended changes (highest leverage first)

1. **Resolve intake ownership and introduce the Order Coordinator role** (decision → permission → workflow). Unlocks #2, #6, endorsement.
2. **Make the handoff a transaction:** completeness gate → send → Accept/Return-for-correction → ownership transfer + activity event + SLA start; sender's queue clears only on accept.
3. **Give sessions and inquiries an owner** (`schedule.owner`, `inquiry.owner` + `inquiry.client_id`), and route their exceptions into that person's My Work.
4. **Collapse the four operational surfaces into one My Work** (absorb Home; fold Data Quality/Duplicates into an Exceptions filter; keep Worklist's engine inside My Work).
5. **Ship the real role model** — Coordinator, Auditor (read-only, before/after audit), Management (read-only), Sales Manager (team scope) — with a DB-verified permission matrix.
6. **Standardise the record page** (breadcrumb → header with status/health/owner/due → attention → summary → tabs → right rail) and bring OrderDetail + ClientDetail onto it.
7. **Build Customer 360** on `inquiry.client_id` + org rollup; one customer, one page, all history.
8. **Make dashboards role-specific and 100% drill-through.**
9. **Design the money model** — immutable payments + refund/void/credit objects + AR exceptions board.
10. **Ship the Operations command center** ("Operations Today" from the existing `v_digest_*` views) and Calendar week/day + session drawer.

## 10. Decisions requiring business-owner input

The full list with options is in `14-product-decisions.md`. The blocking ones:
- **Who owns webshop/manual intake** — Coordinator, Operations, or Sales? (Gates the role model and the endorsement handoff.)
- **What must be complete before an order can be endorsed** to Operations? (Defines the completeness gate.)
- **Who may confirm payment, and who may refund/void/credit?** (Defines the money model and authority split.)
- **Is Management strictly read-only?** (Splits `business_owner` into approver vs read-only.)
- **Does the Customer entity represent the company, the contact, or both?** (Gates Customer 360 and `inquiry.client_id`.)
- **Who owns a training session** operationally, and does Sales retain any ownership after Operations accepts the order? (Defines dual ownership.)
- **Should an Auditor exist as a read-only role**, and do we capture before/after values? (Gates governance.)

## 11. Recommended future application architecture

Organised around **employee work**, not database tables. Primary rail (role-filtered):

```
MY WORK            The single action surface (absorbs Home, Worklist, Data Quality → Exceptions)
SALES              Inquiries · Quotations · Orders            [+ New order]
CUSTOMERS          Customer 360 (Clients + Organizations unified)
ORDERS             Order book + fulfillment (Worklist engine folded in)
TRAINING OPS       Operations Today (command center) · Calendar (week/day + drawer) · Sessions · Resources
FINANCE            Receivables · Payments (refund/void/credit) · Approvals
ANALYTICS          Overview · Reports · Feedback (Dashboard+Reports+Quality unified, role-specific, drill-through)
ADMINISTRATION     Users & Access · Courses & Fees · Pricing · Communications · Lookups/Config · Audit
```

- **My Work** is the landing page for Coordinator, Sales, Sales Manager, and Operations. **Analytics** is the landing page for Management/BO. **Administration** is separated from operational work.
- **Global search (⌘K)** and the **notification centre** are cross-cutting, not rail items.
- Every record uses one page standard; every handoff is a transaction; every transactional record carries the ownership contract (Owner now · Next action · Next owner · Due · Blocker). See `06-information-architecture.md` and `05-handoffs-and-ownership.md`.

## 12. Recommended implementation sequence

Detailed in `16-implementation-roadmap.md`. Reassessed against the current build — **not** a continuation of the old Phase 1–4 numbering:

- **Phase A — Decisions & role ownership.** Resolve `14-product-decisions.md`; agree the 8-role model and intake ownership. *(No code; unblocks everything.)*
- **Phase B — Role model, permissions, ownership & handoff architecture.** New roles + RLS + DB-verified matrix; owners for sessions/inquiries; the accept/return handoff transaction with a completeness gate; ownership contract on every record.
- **Phase C — IA consolidation & record standard.** Collapse the four operational surfaces into My Work; standardise OrderDetail/ClientDetail; Customer 360 on `inquiry.client_id`.
- **Phase D — My Work, role dashboards & Operations command center.** Role-specific drill-through dashboards; Operations Today; Calendar week/day + drawer.
- **Phase E — Customer 360 depth, payments & money model.** Refund/void/credit; immutable payments; AR exceptions; roster import + participant soft-delete/transfer.
- **Phase F — Automation, SLA & management intelligence.** The deferred Phase-4 automation (validated against live schema), escalation ladder, management cockpit, before/after audit + Auditor role.
- **Phase G — Final UI consistency, accessibility & responsive.** Design-system convergence, remaining a11y, laptop/mobile optimisation, terminology dictionary.

Each carries acceptance criteria in `16-implementation-roadmap.md` and `15-prioritized-backlog.md`.

---

## Success test (how we know the redesign worked)

**Every operational employee can immediately answer:** What needs my attention? What first? What's overdue? What's at risk? What do I own? What's missing? What next? Where do I act? Who gets it after me? What am I waiting for? What's blocking? Did my action succeed? Is it finished?

**Management:** What's performing? What's behind? What's at risk? Where does intervention matter? Where is work piling up?

**Auditors:** Who did it? When? What changed? From what value? What was approved? What happened after?

**Administrators:** Who has access? Why? What permissions apply? What configuration controls the workflow?

Today the app answers most of the operational questions *for orders* and *for sessions in My Work*, few of them for inquiries, quotes, or the customer, and almost none of the auditor/admin questions. The roadmap above closes that gap in dependency order.
