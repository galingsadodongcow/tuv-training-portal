# Enterprise UX Review & Redesign Blueprint — TÜV Rheinland Academy PH Training Operations & Sales Hub

A complete, code-grounded, end-to-end review of the internal Academy Training Operations & Sales Hub, produced as a senior product-design / UX-strategy / business-analysis / solution-architecture / QA engagement. Every claim is grounded in the actual codebase (`src/screens/*`, `src/components/*`, `src/lib/*`, `src/hooks/data.ts`, `supabase/migrations/*`) at merge commit on `main`.

> **Scope note.** This is the **review + redesign blueprint** — the deliverable the brief asks for ("produce your final review using this structure"). It is *not* an executed full-application rewrite: the structural recommendations (new IA, My Work center, status/health split, notification/task/approval engines, role dashboards, central customer record) are a phased roadmap to implement with sign-off, not an overnight auto-merge into a live production app. Many of the *quick wins* were already implemented in the preceding remediation work this session (error states, destructive-action confirms, modal focus traps, sales-AR write guard, ops reassignment, `okOr` error surfacing, a11y labels) — those are marked "done" throughout.

## The five parts

| Part | File | Covers |
|---|---|---|
| 1 | [`01-assessment-and-journeys.md`](./01-assessment-and-journeys.md) | Executive assessment · UX maturity score (61/100) · top 20 problems · top 20 opportunities · current architecture · current role model · current journeys · role-by-role findings · cross-role handoffs · workflow-friction analysis + highest-friction journeys |
| 2 | [`02-ia-navigation-my-work-screens.md`](./02-ia-navigation-my-work-screens.md) | Navigation audit · recommended information architecture · My Work center · role-specific dashboards · global search (⌘K) · screen-by-screen review · major screen redesigns · record-detail page standard · table & list review |
| 3 | [`03-forms-status-workflow-frameworks.md`](./03-forms-status-workflow-frameworks.md) | Form review + minimize manual entry · status framework (process vs health) · session-health model · notification framework · task framework · approval framework · SLA & escalation · calendar & scheduling · workflow state machines · exception design · training-prep checklist |
| 4 | [`04-roles-permissions-records.md`](./04-roles-permissions-records.md) | Customer / sales / order / operations / participant / payment reviews · management / administrator / auditor experiences · recommended permission matrix · data visibility · delete-vs-archive · activity/audit framework |
| 5 | [`05-quality-automation-design-roadmap.md`](./05-quality-automation-design-roadmap.md) | Data-quality risks · duplicate detection · error prevention · automation opportunities · responsive review · accessibility review · enterprise UI audit · design system · redundancy & consolidation · terminology · quick wins · structural changes · priority backlog (30) · roadmap (4 phases) · acceptance criteria · final action plan |

## Executive summary

**Maturity: 61/100 — a competent internal tool, pre-product.** The bones are above average for an internal build: a genuine derived-health layer (`orderState.ts`), a real "My Work" spine on Home, disposition-gated cancellation, an advisory Go/No-Go, and a strong server-side automation scaffold (digest views, SLA engine, task generator, reminders). The score is held down by the **role model** and the **cross-role handoffs**.

**The through-line:** *the product is database-shaped where it should be workflow-shaped, and workflow-shaped only where one module (`orderState.ts`) already showed the way. Four DB roles wear eight real jobs; status is conflated with health outside the orders module; and the handoffs between people — the moments that matter most — are the least-designed part of the system.*

### The five structural themes
1. **Eight jobs, four roles.** No Order Coordinator, no read-only Management, no Auditor; Sales Manager is a boolean (`is_supervisor`), not a role; the Auditor must be handed super-admin to read the audit log (the worst least-privilege violation).
2. **Intake has no home.** `operations` — documented as doing order intake — is *not* in the nav gate for Inquiries or New-sales-order; webshop orders are hand-re-keyed.
3. **Status ≠ health, everywhere but orders.** Six status vocabularies; only orders get a unified `primaryFlag`. Sessions, inquiries, and quotes have no equivalent badge, and session health lives scattered across GoNoGo strings, `v_cancel_readiness`, `v_sla_breach`, and `go_status`.
4. **Handoffs are dropdown edits, not transactions.** "Endorsed to Ops" is a `<select>` value with no completeness gate, no acknowledgement, no SLA visible until a nightly recompute.
5. **Re-entry where reuse was one join away.** Quote→order retypes every line; the CRM's `inquiry` has no `client_id`, so a lead never resolves to its customer.

### The highest-value fixes (P0 — correctness/trust)
- **Fix the broken duplicate "merge"** — today it only flags, leaving both orders live (seats + revenue double-counted, feeding go/no-go and Reports). Build `fn_merge_orders`; relabel the button meanwhile.
- **Wire `fn_queue_reminders` into the nightly job** — it is fully coded but never scheduled, so participant + payment reminders never send. One line.
- **Enforce the stage state machine in the DB** — the `NEXT` map is UI-only; a bulk op or API call can set any stage.
- **Add a unique participant index** `(schedule_id, lower(email))` — duplicate roster entries double seats and break certs.
- **Fix SessionForm** — it disables the min/max inputs and hard-sends course-derived pax, *silently defeating the shipped per-session-cap migration*; and it lets a user hand-set `Completed`, bypassing `fn_close_session`'s roster-lock/actuals.

### The biggest structural bets (P1–P2)
Unify **Home + Worklist + DataQuality into a single "My Work"** operational center; make **Dashboard role-specific with every KPI drill-through**; **standardize record pages** on the SessionDetail tabbed pattern (OrderDetail and ClientDetail are the outliers); split **process status from computed health** and add a stored **session-health model**; introduce the missing **roles** (Order Coordinator, Management, Auditor) and a real **Sales Manager** surface; build a **central customer record** unifying Client + Organization + Inquiry; and a proper **refund/void/credit** model (today "refund" is a hard payment delete with an un-persisted reason).

## Mapping to the requested 55-section output structure

| Requested section | Where |
|---|---|
| 1 Executive assessment · 2 Maturity score · 3 Top-20 problems · 4 Top-20 opportunities | Part 1 §1–4 |
| 5 Current architecture · 6 Current role model · 7 Current journeys · 8 Role-by-role · 9 Handoffs · 10–11 Friction | Part 1 §5–10 |
| 12 Navigation · 13 Recommended IA · 14 My Work · 15 Role dashboards · 16 Global search | Part 2 §1–5 |
| 17 Screen-by-screen · 18 Major redesigns · 19 Record standard · 20 Tables | Part 2 §6–9 |
| 21 Forms · 22 Status framework · 23 Session-health · 24 Notifications · 25 Tasks · 26 Approvals · 27 SLA · 28 Calendar | Part 3 §1–8 |
| 77 State machine · 76 Exceptions · 78 Prep checklist | Part 3 §9 |
| 29 Customer · 30 Sales · 31 Order · 32 Ops · 33 Participant · 34 Payment | Part 4 §1–6 |
| 35 Management · 36 Administrator · 37 Auditor · 38 Permission matrix · 39 Activity/audit | Part 4 §7–10 |
| 40 Data-quality · 21 Duplicate detection · 41 Error prevention · 42 Automation | Part 5 §1–3 |
| 43 Responsive · 44 Accessibility · 45 UI audit · 46 Design system | Part 5 §4–7 |
| 47 Redundancy · 48 Terminology · 49 Quick wins · 50 Structural · 51 Backlog · 52 Roadmap · 53 Acceptance criteria · 54 Future architecture · 55 Future journeys · 56 Action plan | Part 5 §8–10 |

## Recommended reading order
1. This summary → 2. Part 1 (the "why") → 3. Part 5 §10 (the backlog + roadmap + acceptance criteria: the "what to do") → 4. Parts 2–4 for the detailed design of each area as you pick it up.
