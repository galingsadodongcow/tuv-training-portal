# Role Model & Permissions — Second Pass

> Second-pass review, Parts 3, 20, 21, 32, 33. Grounded in `src/lib/roles.ts`, `src/components/Guard.tsx`, `src/hooks/useAuth.tsx`, `src/screens/Admin.tsx`, `src/screens/Approvals.tsx`, `src/screens/AuditLog.tsx`, and the RLS helpers described in `CLAUDE.md`. Builds on the first-pass matrix in `docs/qa/ux-review/04-roles-permissions-records.md` — that doc named the target roles; this one designs them, reconciles them against the *current* code, and states what is still true after Phases 1–4.
>
> **Classification tags:** IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / DEFERRED / NEEDS PRODUCT DECISION / NEEDS TECHNICAL VALIDATION.

---

## 1. Current vs needed role model

The system ships **four** DB roles (`user_role` enum: `super_admin`, `operations`, `business_owner`, `sales` — `roles.ts:1`) plus one boolean modifier (`salesperson.is_supervisor`, widening RLS team→region). The organisation runs **eight** distinct jobs. Every gap below is still open after Phases 1–4; the remediation phases hardened *enforcement* (RLS enabled, sales field guards, stage guard) but added **no new role**.

| # | Real job | Mapped onto today | The mismatch | Still true post-remediation? |
|---|---|---|---|---|
| 1 | System Administrator | `super_admin` | Admin identity is fused with an all-bypass operational superuser. `super_admin` bypasses `fn_orders_stage_guard`, RLS, and every write guard. | **Yes.** No separation of admin-of-record from god-mode. |
| 2 | Marketing / Order Coordinator | *(none)* — split between `sales` and `operations` | The role that should own intake→validate→endorse does not exist. `sales` types the order; `operations` cannot even open intake (see #3). No one owns order integrity. | **Yes.** Biggest single gap. |
| 3 | Training Operations | `operations` | Ops owns fulfillment but is **locked out of intake**: `/inquiries` and `/sales-entry` are gated `['super_admin','sales']` (`roles.ts:29,31`). Ops can't create an order or an inquiry. | **Yes.** Gate unchanged. NEEDS PRODUCT DECISION on who owns intake. |
| 4 | Business Owner (approver) | `business_owner` | BO is **exec + operator**: it decides approvals (`Approvals.tsx:21` `canDecide`), writes payments (`p_payment_w`), edits pricing rules and clients. No read-only exec exists. | **Yes.** BO still holds write authority on money and pricing. |
| 5 | Sales User | `sales` | Closest fit, but pushed into operational screens — OrderDetail `canEdit` includes `sales` (fields since made read-only by `trg_guard_orders_sales_fields`, not hidden). | **Partially.** Writes are DB-blocked (IMPLEMENTED); the UI still shows the ops editor. |
| 6 | Sales Manager | `is_supervisor` boolean | A boolean that silently widens RLS from team to region (`fn_current_region`/`fn_can_see_order`). **No role, no UI, no manager surface.** A manager cannot reassign, escalate, or see per-rep aging. | **Yes.** Still a boolean with zero UI. |
| 7 | Read-only Management | *(none)* — approximated by `business_owner` | Management gets exec dashboards, but only by borrowing the write-capable BO login. No look-but-don't-touch tier. | **Yes.** |
| 8 | Auditor / Compliance | `super_admin` only | `/audit` is `['super_admin']` (`roles.ts:55`); `fn_audit_search` hard-filters the role. To audit you must hold the most privileged write account — the opposite of least-privilege. | **Yes.** And the log is field-names-only (§5). |

**Net:** three roles missing entirely (Coordinator, Management, Auditor), one degraded to a boolean (Sales Manager), one overloaded (BO), one locked out of half its job (Operations at intake). This is a **product + DB decision**, not a UI change — new roles need `user_role` enum values, RLS helper updates, and re-simulation as each role per `CLAUDE.md`.

---

## 2. The 8-role target model

Least-privilege throughout; Auditor and Management are **read-only, never `super_admin`**. Scope tokens: **own / team / region / all**.

### 2.1 System Administrator (`super_admin`, re-scoped)
- **Purpose:** own identities, roles, reference data, config — *not* daily operations.
- **Primary:** provision/invite/deactivate users, assign roles, manage lookups & feature flags. **Secondary:** break-glass data repair (audited).
- **Cadence:** occasional (onboarding, config change); rarely daily.
- **Records:** creates/edits users, salespeople, lookup rows; owns none transactional; monitors admin/audit surface.
- **Needs:** user directory, audit of admin actions, "last super_admin" guard.
- **Visibility:** all, incl. audit values.
- **Prohibited:** *should not* be the default operator (today it is — it bypasses every guard). NEEDS PRODUCT DECISION: keep god-mode or split a non-bypass "admin".
- **Depends on / handoff:** receives access requests; hands operational work to Coordinator/Ops.

### 2.2 Marketing / Order Coordinator *(new)* — see §3
- **Purpose:** own the order from intake to a clean, validated endorsement.
- **Primary:** capture/import intake (incl. Webshop), match to customer, dedupe, completeness + deposit check, formal endorsement to Ops. **Secondary:** create inquiries/quotes, record & confirm payments (no void).
- **Cadence:** daily intake queue; frequent dedupe/validation; critical = month-end endorsement backlog.
- **Records:** **creates/edits orders & lines** (this is the role's core), inquiries, quotes, invoices, payments; owns the order until Accept by Ops; assigns the ops receiver at endorsement.
- **Needs:** an intake worklist ("to validate", "to endorse", "returned by ops"), duplicate-candidate feed, endorsement completeness gate.
- **Visibility:** customers/orders all (or by market); financial C/E, **no refund/void**; no fulfillment authority.
- **Prohibited:** running sessions, issuing certs, approving, refunding, pricing rules, admin.
- **Depends on:** Sales (lead/quote), Ops (accepts endorsement). **Handoff:** endorsement = transaction (§3), not a dropdown.

### 2.3 Training Operations (`operations`, +intake read)
- **Purpose:** own the session lifecycle from accepted endorsement to closed + certs.
- **Primary:** staffing, roster, go/no-go, attendance, certs, close/cancel, reschedule. **Secondary:** venue/trainer pool, e-learning access, comms.
- **Cadence:** daily (today/this-week board); critical = go/no-go decisions, prep deadlines.
- **Records:** owns `schedule`/sessions (once schedule gets an assignee — DEFERRED); creates/edits participants (soft-delete target); monitors digest views.
- **Needs:** **Operations Today** command center (the `v_digest_*` views already exist, feed only the nightly job); per-session readiness checklist; roster CSV import.
- **Visibility:** fulfillment all; participants full; AR read; **no pricing, no approvals**.
- **Prohibited today:** intake (`/inquiries`, `/sales-entry` gated out — NOT IMPLEMENTED fix); pricing; approvals authority.
- **Depends on:** Coordinator (accepts/returns endorsement). **Handoff:** Accept clears the Coordinator's queue; Return-for-correction with reason bounces it back.

### 2.4 Business Owner (`business_owner`, approver)
- **Purpose:** judgment calls — approvals, refund/void authority, forecast sign-off.
- **Primary:** approve/reject (`Approvals.tsx`), authorise refund/void/credit (model NOT IMPLEMENTED), sign off quarterly forecast. **Secondary:** pricing rules.
- **Cadence:** frequent approvals; weekly forecast; occasional pricing.
- **Records:** approves cancellations & forecasts; owns refund/void decisions; edits pricing.
- **Needs:** approvals queue with context, refund/AR-exceptions board.
- **Visibility:** all + financial.
- **Prohibited (target):** should *not* be the routine operator/data-entry clerk — carve its read-only reporting into Management (§2.7) so BO is decisions-only.
- **Depends on:** Coordinator/Ops raise requests. **Handoff:** decision → task/notification back to requester.

### 2.5 Sales User (`sales`)
- **Purpose:** work leads → quotes → won orders for own book.
- **Primary:** manage inquiries, quotes, create orders, advance own pipeline. **Secondary:** maintain own customers/contacts.
- **Cadence:** daily follow-ups; frequent quoting.
- **Records:** creates inquiries/quotes/orders (own); edits own; owns own pipeline; monitors own AR (read).
- **Needs:** a "My Book" (today's follow-ups, open pipeline by stage, unassigned to claim, stalled) — `next_action_at` on inquiry is DEFERRED.
- **Visibility:** own + team (region if supervisor) via `fn_can_see_order`; AR read on visible orders; **no payment writes** (DB-enforced, IMPLEMENTED).
- **Prohibited:** fulfillment writes, approvals, pricing, admin, refunds.
- **Depends on:** Coordinator to validate/endorse. **Handoff:** hand order to Coordinator (today: a dropdown stage change).

### 2.6 Sales Manager *(new)* — see §4
- **Purpose:** manage the team's pipeline by exception; own reassignment & escalation.
- **Primary:** watch unassigned/overdue/stalled, reassign leads & orders, escalate. **Secondary:** coverage vs quota, win/loss review.
- **Cadence:** daily exception scan; weekly pipeline/quota review.
- **Records:** reassigns owners (needs a guarded RPC beyond `fn_transfer_line`); monitors team; approves nothing financial.
- **Needs:** per-rep pipeline/aging/coverage board; reassignment control; escalation inbox.
- **Visibility:** team/region across pipeline, orders, AR (read); reports team-scoped.
- **Prohibited:** payments, pricing, approvals, admin.
- **Depends on:** reps (execution), Coordinator (intake). **Handoff:** reassign away from a rep is a judgment action — stays human.

### 2.7 Read-only Management *(new)*
- **Purpose:** exec visibility with zero write surface.
- **Primary:** revenue vs forecast, funnel, AR aging, capacity/utilisation, quality. **Secondary:** drill into exceptions (read-only).
- **Cadence:** weekly/monthly.
- **Records:** none; monitors everything.
- **Needs:** a **Management cockpit** (role-specific dashboard; today Dashboard is one view for all — NOT IMPLEMENTED); every KPI drills through.
- **Visibility:** all read-only; PII masked; financial read; **no approvals/payments/pricing**.
- **Prohibited:** every write.
- **Depends on:** BO for decisions. **Handoff:** flags exceptions to BO/Managers (comment, not edit).

### 2.8 Auditor / Compliance *(new)* — see §5
- **Purpose:** reconstruct any transaction independently, without operational power.
- **Primary:** review before/after change history, actor, source. **Secondary:** export audit evidence.
- **Cadence:** occasional/critical (incident, review).
- **Records:** none; monitors audit + record timelines.
- **Needs:** value-level audit (`{field:{old,new}}`), record History tab, `fn_audit_search` relaxed to `role ∈ (super_admin, auditor)`.
- **Visibility:** broad SELECT + `audit_log` values; **no writes at all**.
- **Prohibited:** every write; never `super_admin`.
- **Depends on:** the capture pipeline. **Handoff:** findings → BO/Admin (out of band).

---

## 3. Marketing / Order Coordinator — deep design (Part 21)

The single biggest missing role. Today its work is smeared across `sales` (who type the order in `SalesEntry`) and `operations` (who can't reach intake at all). No one owns order integrity — customer matching, dedupe, completeness, deposit check, formal endorsement. First-pass §3 named this gap; here is the ownership contract.

**Ownership timeline (where it begins and ends):**

```
 Sales                 │ COORDINATOR OWNS               │ Operations
 ─────────────────────────────────────────────────────────────────────
 lead → qualify →      │ intake (capture/import) →      │ Accept →
 quote → "hand off"    │ match customer → dedupe →      │ run session →
                       │ completeness + deposit check → │ roster → certs →
                       │ ENDORSE ──────────────────────▶│ close
                       │◀── Return-for-correction ──────│
```

- **Begins:** the moment an order needs to exist — a won quote, a Webshop order (today hand-typed into `head.order_id`, no ingestion), an in-house request. Coordinator captures/imports and becomes **Owner now**.
- **Ends:** on Ops **Accept** of the endorsement. Until then the order sits in the Coordinator's queue; a Return-for-correction bounces ownership back with a reason.

**Belongs to Coordinator (not Sales, not Ops):**
- Customer match & dedupe at save (live fuzzy match on company+email+phone; today email-exact only with a `23505` catch — `SalesEntry`).
- Completeness gate before `For Order Creation` (validated customer, reference format, billing contact, ≥1 line, fee) — today only order-no + a line + a fee are required.
- Deposit/payment presence check.
- The **endorsement event** itself (§ handoff-as-transaction, NOT IMPLEMENTED).

**Belongs to Sales, not Coordinator:** the commercial relationship — lead, quote, negotiated price, the decision to *win*. Coordinator never re-prices.

**Belongs to Ops, not Coordinator:** everything after Accept — staffing, roster, certs, close. Coordinator has **read-only** on fulfillment.

**Avoiding shared-ownership ambiguity:** exactly one **Owner now** at any time, stored on the order (not derived). The stage machine (`fn_orders_stage_guard`, IMPLEMENTED) already orders the transitions; what's missing is that a transition should also **move ownership and clear the sender's queue** — today it's a bare `fulfillment_stage` dropdown edit with no receipt (DEFERRED). One owner + one endorsement transaction removes the "is this mine or ops'?" ambiguity that the current dropdown creates.

**Permissions:** Create/Edit orders & lines (the only non-super role that *creates* orders besides sales); record & confirm payments; **no** refund/void, **no** fulfillment writes, **no** approvals, **no** pricing.

---

## 4. Sales Manager — deep design (Part 20)

**Is `is_supervisor` sufficient? No.** It is a single boolean on `salesperson` toggled in `Admin.tsx:179`. Its *entire* effect is widening `fn_can_see_order` from team to region via `fn_current_region`. It has **no screen, no action, no signal**. A supervisor can *see* more rows but cannot *do* anything a rep can't: no reassignment, no escalation, no per-rep aging, no coverage view. It is a visibility flag masquerading as a role.

**What a real Sales Manager needs (management by exception):**

| Need | Today | Target |
|---|---|---|
| Team workload | Team Worklist only (row list) | Per-rep board: open pipeline, weighted value, load |
| Unassigned leads | none | "Unassigned" lane to claim/assign |
| Overdue follow-ups | none (`next_action_at` DEFERRED) | Aging leads past next-action date, drill → inquiry |
| Stalled pipeline | none | Stalled-by-stage list (no movement N days), drill → inquiry |
| Reassignment | `fn_transfer_line` moves an order line's owner; no lead/bulk reassign | Guarded reassign RPC for inquiries + orders, logged to timeline |
| Escalation | none (SLA breaches surfaced in My Work, no ladder) | Escalation inbox: owner→manager→BO ladder, auto-task on breach |
| Coverage vs quota | no targets exist anywhere | Coverage/quota tiles (needs a `target` model — NOT IMPLEMENTED) |
| Win/loss | `lost_reason` captured, **never reported** | Win/loss by rep from captured reason |

**Every metric drills through:** unassigned → claim modal; overdue → inquiry detail; stalled → inquiry detail; breach → the breaching record. Reassignment *away from a rep* is judgment — it stays a human action, but the manager needs the control (today there is none in the UI).

**Verdict:** promote `is_supervisor` to a real `sales_manager` role with team/region scope, or at minimum back it with a Manager surface + reassign/escalate RPCs. Keeping it a boolean is the gap. NEEDS PRODUCT DECISION (role vs. flag+screen).

---

## 5. Auditor experience (Part 32)

**Can an auditor reconstruct a transaction without `super_admin` today? No — twice over.**

1. **Access:** `/audit` is gated `['super_admin']` (`roles.ts:55`) and `fn_audit_search` hard-filters the role. There is no non-super account that can read the log at all.
2. **Content:** even with access, the log is **field-names only**. `AuditLog.tsx:21-26` `changedText` renders an object as `Object.keys(v).join(', ')` — it lists *which* fields changed, never *from what to what*. `useAuditTrail` selects the same shape. So the CSV export (`AuditLog.tsx:43`) and the table both answer "these fields changed on this row by this role at this time" — the **before/after gap**. That is not audit-grade: you cannot prove a price went 10,000 → 1,000, only that `fee` changed.

Additional loss: reasons that *are* captured are only **toasted, not persisted** — role change (`Admin.tsx` confirm `reason`), payment removal, mark-lost. The "why" evaporates.

**Minimum read-only governance surface:**
- Add an `auditor` role: broad SELECT + `audit_log`, **zero writes**; relax `fn_audit_search` to `role ∈ (super_admin, auditor)`.
- Capture **before/after** as `{field:{old,new}}` + actor + a **source** flag (trigger/system vs user) so system automation is distinguishable from human edits.
- Persist the currently-toasted reasons into the audit payload.
- A record-level **History / Audit tab** (the record-page standard's Audit tab) rendering old→new deltas with system-vs-manual labels — one capture pipeline feeds both the friendly timeline (everyone, scoped) and the value-level log (auditor/super_admin), so the two layers can never disagree.

Classification: role + relaxed search = NOT IMPLEMENTED; before/after capture = NOT IMPLEMENTED (DB/architecture, DEFERRED). NEEDS TECHNICAL VALIDATION: `audit_log` exists only on the live DB, not in pre-`20260809` migrations — confirm its current column shape before extending.

---

## 6. Administrator experience (Part 33)

`Admin.tsx` today does two things well and stops: **Users** (set role behind a danger-confirm that spells out super_admin grants and clears a stale `sales_id` in the same write — `Admin.tsx:25-55`, real safety wins; can't change own role) and **Salespeople** (add; inline-edit team/region/`is_supervisor`/`active`). That is identity + team topology. It is **not** an administration console.

**Keep admin separate from operational work.** Today `super_admin` is both the config authority *and* the all-bypass operator (bypasses stage guard, RLS, field guards). Target: admin manages *the system* (users, roles, reference data, config, flags); it should not be the default hands-on operator. NEEDS PRODUCT DECISION on whether to split a non-bypass admin from break-glass super_admin.

**Current gaps (all NOT IMPLEMENTED):**
- **Hardcoded enums.** Stages, methods, channels, attendance/result, and the role list itself are string literals in TSX — `Admin.tsx:11` `ROLES`, `AuditLog.tsx:8-9` `ACTIONS`/`ROLES`. Changing a stage or channel needs a **code deploy**. No lookups/config console.
- **No user provisioning.** New sign-ins only *appear* after they self-authenticate (`Admin.tsx:115` notice); an admin can reassign a role but **cannot invite or deactivate** an auth user. Deactivation of a salesperson silently narrows visibility with no confirm (`active` checkbox, `Admin.tsx:182`).
- **No config surfaces:** SLA thresholds, stage-transition rules, go/no-go rules, notification recipients/cadence, feature flags — all hardcoded (the app uses graceful-degradation as a de-facto flag).
- **No "cannot remove the last super_admin" guard.**

**Target admin console:** lookups editor (active/sort, deactivate-not-delete) backing every hardcoded enum; config for SLA/transitions/notification cadence/flags; user invite + deactivate; the danger-confirm pattern extended to salesperson deactivation and lookup removal; last-super_admin guard.

---

## 7. Updated permission matrix (8 roles)

**Cells:** V=View · C=Create · E=Edit · D=Delete(prefer soft) · As=Assign · Ap=Approve · X=Export · $=Financial visibility · Au=Audit values · **✖**=none. **Scope:** ✔ all · ● team/region · ▲ read-only · ✖ none. New roles **bold**. This reconciles the UI gate (`roles.ts`) against RLS (`fn_can_see_order` and the field guards); divergences are footnoted.

| Module | Sys Admin | **Order Coordinator** | Training Ops | Business Owner | Sales User | **Sales Manager** | **Management** | **Auditor** |
|---|---|---|---|---|---|---|---|---|
| Customers / Clients | V✔ C✔ E✔ D✔ As✔ | V✔ C✔ E✔ As● | V✔ E✔ As✔ | V✔ E✔ As✔ | V● C✔ E● D(archive)● | V● As● | V▲ | V▲ |
| Organizations | V✔ E✔ | V✔ E● | V✔ E✔ | V✔ E✔ | V▲ set-org● | V● | V▲ | V▲ |
| Inquiries / Leads | V✔ | V✔ C✔ E✔ As✔ | V▲ ¹ | V✔ | V● C● E●(own) | V● As● | V▲ | V▲ |
| Quotations | V✔ | V✔ C✔ E✔ | V✔ | V✔ | V● C● E●(own) | V● | V▲ | V▲ |
| Orders (intake / edit) | V✔ E✔ | V✔ **C✔ E✔** As✔ | V✔ E✔ As✔ ¹ | V✔ E✔ | V● C✔ E●(stage only) ² | V● As● | V▲ | V▲ |
| Order → Endorse | ✔ | **✔ (owns)** | Accept / Return ³ | ✔ | ●(advance) | ● | ✖ | ✖ |
| Fulfillment / Sessions | V✔ | V▲ | **✔ (owner)** | V✔ Ap✔ | V● | V● | V▲ | V▲ |
| Participants / Roster | V✔ | ✖ | C✔ E✔ D(soft)✔ cert✔ ⁴ | V✔ | C● E●(attendance) | V● | V▲(masked) | V▲ |
| Payments / AR | V✔ | **C✔ E✔** (no void) | C✔ E✔ ⁵ | V✔ C✔ E✔ Ap(refund)✔ | **$▲**(own/team) ² | $▲● | $▲ | $▲ |
| Refund / Void / Credit | V✔ | ✖ | ✖ | **Ap✔** ⁶ | ✖ | ✖ | ✖ | V▲ |
| Approvals | Ap✔ | request | request | **Ap✔** ⁷ | ✖ | ✖ | V▲ | V▲ |
| Pricing rules | V✔ | ✖ | E✔ ⁸ | E✔ | ✖ | ✖ | V▲ | V▲ |
| Trainers / Venues / E-learn / Comms | V✔ | ✖ | ✔ | V▲ | ✖ | ✖ | V▲ | V▲ |
| Reports / Dashboard / Quality | V✔ X✔ | V● | V✔ X✔ | V✔ X✔ | V●(own perf) | V●(team) | **V✔ X✔** | V▲ X✔ |
| Audit log (values) | Au✔ | ✖ | ✖ | ✖ ⁹ | ✖ | ✖ | ✖ | **Au✔** |
| Admin / config | Adm✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |

**UI-gate vs RLS divergences to reconcile (current code):**
1. **Ops locked out of intake.** `/inquiries` + `/sales-entry` are `['super_admin','sales']` (`roles.ts:29,31`) — Ops (and any future Coordinator) can't open them. The matrix assigns intake to Coordinator/Ops; the gate must change. NOT IMPLEMENTED.
2. **Sales sees the ops editor.** OrderDetail `canEdit` includes `sales`, so a rep sees the fulfillment editor, AR panel, transfer, SAP field; writes are DB-blocked by `trg_guard_orders_sales_fields`/`p_payment_w` (IMPLEMENTED) but the UI still *shows* controls it will reject. Target: sales = **stage-only** edit; hide AR/transfer. PARTIALLY IMPLEMENTED (blocked, not hidden).
3. **Endorsement is a dropdown, not a transaction.** `fn_orders_stage_guard` orders transitions (IMPLEMENTED) but there is no completeness gate, no Accept/Return receipt, and the sender's queue never clears. DEFERRED.
4. **Participant remove is a hard DELETE** (`RosterPanel`), contradicting the soft-delete stance — matrix shows D(soft) as the target. NOT IMPLEMENTED.
5. **"Remove payment" is a hard DELETE** even for ops, with an un-persisted reason (`ReceivablePanel`) — payments should be immutable + `status` Void. NOT IMPLEMENTED.
6. **Refund/void/credit objects don't exist** — BO's `Ap✔` here is the *target*; today the only "refund" is the payment DELETE above. DEFERRED (DB/architecture).
7. **`canDecide` = `['business_owner','super_admin']`** (`Approvals.tsx:21`) — matches the matrix; no change needed.
8. Ops editing pricing is current behaviour (`/pricing` roles include `operations`, `roles.ts:51`); confirm whether Ops *should* price. NEEDS PRODUCT DECISION.
9. **BO cannot read the audit log** (`/audit` is super_admin-only) — correct under least-privilege; the audit tier belongs to the new Auditor, not BO.

**Data visibility (least-privilege):** PII scoped own/team for sales, masked for Management/reporting, full values for Auditor (read-only, logged). Financial scoped by `fn_can_see_order` (correct today). Sales performance: own (rep) / team (manager) / all (Management, BO). Audit values: Auditor + super_admin only.

**Soft-delete universally:** clients already soft-delete — extend to participants (status Active/Cancelled/Substituted), payments (Void not delete), salespeople/users (deactivate + last-super_admin guard), lookups (deactivate). Reserve hard delete for audited super_admin repair.
