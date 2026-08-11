# Customer, Sales, Order, Operations, Participant, Payment, Management, Admin, Auditor & Permission Matrix

> Part 4 of 5 — grounded in `src/screens/*`, `src/components/*`, `src/hooks/data.ts`, `supabase/migrations/*`. DB roles: `super_admin`, `operations`, `business_owner`, `sales`; "Sales Manager" = `salesperson.is_supervisor` (widens RLS from team to region via `fn_can_see_order`). There is **no** Order Coordinator, Management, or Auditor role.

**Constants used throughout.** Stages: `New → In Communication → For Order Creation → Endorsed to Ops → SAP Created → No Feedback → Cancelled`. Inquiry: `Received → Responded → RFQ or P Sent → Awaiting Feedback → Closed Won → Closed Lost`. Payment: `Unpaid/Partial/Paid`. Attendance: `Registered/Attended/No Show`. Result: `Pending/Pass/Fail`. Channels: `Inside Sales / Field Sales / In-house Request / Webshop`. `fn_can_see_order` = role ∈ (super_admin, operations, business_owner) OR `created_by = auth.uid()` OR assigned salesperson shares caller `team` (or `region` for supervisors).

## 1. Customer management review

**What ClientDetail consolidates (the strongest record screen):** a lifetime KPI band (Bookings, Seats, LTV, Collected, Outstanding, Overdue), an identity card (contact/email/phone/industry/owner/Organization picker), Orders, Sessions booked, Contacts & interactions, Files, and an Activity timeline merging tasks+notifications+audit; plus Archive/Restore soft-delete gated to super_admin/BO/owning-sales.

**Fragmentation — four unlinked customer concepts:** (1) `client` (transactional), (2) `organization` (flat one-level grouping via `org_id`/`fn_org_summary` — no parent-org, no consolidated org-level AR on the client page), (3) `contact` (multiple per client, separate from the scalar `client.contact`/`client.email` that SalesEntry writes/dedupes on), (4) **`inquiry` — the real fragmentation:** it carries its own free-text `company/contact/email/phone` with **no `client_id` FK**, so a lead never resolves to its customer; ClientDetail never shows inquiries, and a won inquiry doesn't become an order/client. No distinct "notes" (interactions double as notes); no reassign-owner control on the client.

**Future:** add `inquiry.client_id` (resolved via the same email-dedup); surface an Inquiries section + a "Start order" deep-link on ClientDetail; give `organization` a `parent_org_id` and an org-level rolled-up LTV/outstanding banner; add an explicit owner-reassignment control (super_admin/owning-sales/supervisor) logged to the timeline; split internal notes from interactions; one consolidated timeline folding interactions/inquiries/quotes/orders.

## 2. Sales workflow review

**Today:** Inquiries kanban (est_value/probability/weighted pipeline/source/lost_reason) → Quotations/QuoteDetail (convert writes `converted_order_id`+`Accepted`) → SalesEntry → Worklist (own queue) → ClientDetail/OrderDetail.

**Breakdowns:** no follow-up/task/next-action engine on inquiries (the `task` table isn't wired to inquiries — a rep can't schedule "call back Tuesday"); the lead never becomes a customer (no `client_id`, no convert action, orphaned contact history); reps are pushed into operational screens (OrderDetail `canEdit` includes sales → they see the full fulfillment editor, AR panel, session-transfer, SAP field — now read-only via `trg_guard_orders_sales_fields`); handoff to ops is a dropdown value, not an event; manager visibility is thin (team Worklist only — no per-rep pipeline/aging/target).

**Future lean sales cockpit:** a "My Book" home (today's follow-ups, open pipeline by stage/weighted value, unassigned to claim, my stalled); `next_action_at`/`next_action_note` on inquiry feeding the task/Home stream; one-click Inquiry→client→SalesEntry convert carrying interaction history; a sales *view* of OrderDetail (status read-only, commercial fields foregrounded, AR/transfer hidden); a real Sales Manager surface (per-rep pipeline, coverage vs quota, aging leads, win/loss from the captured-but-unreported `lost_reason`).

## 3. Order workflow review

**Intake today:** SalesEntry is the only path, manual for every channel including **Webshop** (no ingestion — the webshop/reference number is hand-typed into `head.order_id`). Customer matching is email-exact only (with a friendly `23505` catch); duplicate detection is a separate after-the-fact screen; no payment check at intake; missing-info handling requires only an order number, ≥1 line, a session for scheduled lines, and a fee — not a validated customer, reference format, or billing contact. Waitlist logic exists (`line_status='Waitlist'`). Endorsement = setting `fulfillment_stage='Endorsed to Ops'` (Home surfaces "Awaiting endorsement" but nothing is pushed).

**The Order Coordinator gap:** no role owns order integrity (matching, dedup, completeness, deposit check, formal endorsement) — exactly the missing role.

**Future:** structured intake with live fuzzy customer match (company+email+phone) surfacing `duplicate_candidate` at save time; a completeness gate before "For Order Creation"; a real endorsement *event* (task/notification to a named ops owner + state snapshot + who-endorsed); introduce the Order Coordinator as owner of intake→validate→endorse (Create/Edit orders, no financial approval, no fulfillment authority).

## 4. Training Operations review

**No single cockpit.** The closest is Home's ops attention cards (below-min, unstaffed ≤21d, awaiting endorsement, pending cancellations). Beyond that, ops hop across Calendar, SessionDetail (the true operational record — RosterPanel/GoNoGoPanel/CloseSession/CancelSession/TrainerManage/FeedbackPanel/notes/P&L; conflict checking only in the save form), Worklist, Resources (load/unstaffed), Elearning, Communications. **The digest views already model the command center** (`v_digest_at_risk`, `v_digest_roster_gaps`, `v_digest_stalled_orders`, `v_digest_unstaffed`, `v_digest_elearning_waiting`) — but they feed only the nightly job, not an ops dashboard.

**Gaps:** no "today/this week" time-boxed view; no consolidated at-risk board; prep/readiness scattered (`v_session_close_check`, `v_cancel_readiness`, roster completeness, staffing, materials each in different panels — no per-session checklist); materials are only generic attachments; rescheduling is line-level (`fn_transfer_line`) — no whole-session reschedule with customer fan-out.

**Future:** render the digest views as an **Operations Today** screen with three lanes (Today/This week with readiness chips; At risk unifying the digest views; Decisions queue with inline reschedule/cancel); add whole-session reschedule + a persisted prep checklist.

## 5. Participant workflow review

**RosterPanel today:** create one at a time; inline attendance; score+result; issue-one/bulk-issue certs (irreversible from UI); CSV export (injection-hardened); "names vs seats" completeness signal.

**Gaps:** **no bulk upload/import** (every name typed — the single biggest ops pain); **no duplicate detection** (same person can be added twice); **`remove` is a hard DELETE** (the confirm admits it destroys attendance/assessment/cert history — contradicts the app's own soft-delete stance and is a PII hazard); no single-participant transfer/cancel/substitute (participants move only when the whole line transfers); no participant history/privacy view (emails/names broadly readable via `fn_can_see_order`); no bulk attendance actions.

**Future:** bulk upload with column mapping + dedupe/preview validated against seats; soft-cancel + substitute + single-participant transfer preserving history (add `status` Active/Cancelled/Substituted); a lightweight person key for cross-session rollup + a privacy/consent flag + PII masking; bulk attendance for "everyone showed up."

## 6. Payment workflow review

**ReceivablePanel today:** reads `v_order_ar`/`invoice`/`payment`; writes (ops/super_admin/BO) add-invoice/record-payment/remove-payment; `sales` read-only on money (DB-enforced by `p_payment_w` + `trg_guard_orders_sales_fields`), but sales **can** see AR on own/team orders; overpay/underpay soft-confirm; recording recomputes `payment_status` via `fn_ar_recompute`.

**Under-designed:** **refund/credit/void don't exist** — the only "refund" is `removePayment`, a hard DELETE with an **un-persisted** reason; no refund object, credit note, void state, linkage, method/date, or audit of why money left; no discrepancy/confirmation lifecycle (a payment is immediately final — no pending→confirmed/bounced, no bank-recon state); no structured payment notes; overpayment leaves a negative balance with no disposition.

**Proposed:** immutable payments (never delete) + `payment.status` (Pending→Confirmed→Voided) + a separate `refund` object (amount/method/date/reason/`refunds_payment_id`) + `credit_note` (applies to future orders); recompute AR from confirmed payments − refunds + applied credits; authority split (Coordinator records/confirms; **only BO/super_admin** voids/refunds behind a mandatory persisted reason); an AR exceptions board (overdue by aging bucket from `v_order_ar`, overpayments, pending-confirmation, refunded) for BO/Finance.

## 7. Management experience

`business_owner` is the de-facto exec role with good read surfaces (Home cards, Dashboard, Reports, Quality, full order/AR/customer visibility) — but it is **not read-only**: BO decides approvals (`canDecide`), writes payments (`p_payment_w`), edits pricing rules, and edits clients (`20260808070000`). So there's no true look-but-don't-touch management role. Gaps: no consolidated exec view (KPIs+trends+**targets**[none exist]+exceptions on one screen); no funnel-by-rep, win/loss (`lost_reason` captured but unreported), capacity/utilization roll-up, or customer-trend (new vs repeat/churn).

**Recommendation:** add a scoped `management` role (or a strict read-only mode for BO) — SELECT-only across orders/AR/sessions/customers, no approvals/payments/pricing; build a Management cockpit oriented to exception (revenue vs forecast, funnel+pipeline+win/loss, AR aging+overpayments, capacity/utilization, quality, top-exceptions strip); keep decision authority on BO/super_admin.

## 8. Administrator experience

**Admin.tsx today:** Users (set role — now behind a danger confirm spelling out super_admin grants and clearing stale `sales_id` in the same write; can't change own role; link to salesperson) and Salespeople (add; inline-edit team/region/is_supervisor/active). The role-change confirmation and stale-link clearing are real safety wins.

**Missing:** no reference/lookup-data management (stages, methods, sources, channels, attendance/result values are string literals in TSX — changing a stage needs a code deploy); no status/workflow config (stage transitions, SLA thresholds, go/no-go rules hardcoded); no notification config (recipients/triggers/cadence); no feature flags (the app uses graceful-degradation as a de-facto flag); can't provision/invite/deactivate auth users (only reassign role).

**Recommendations:** an admin lookups console backing the hardcoded enums (with active/sort); config surfaces for SLA thresholds/stage transitions/notification cadence/feature flags; extend the danger-confirm pattern to salesperson deactivation (it silently narrows visibility) and lookup deletion (prefer deactivate); a "cannot remove the last super_admin" guard.

## 9. Auditor experience

**Today: super_admin only, field-names only.** `AuditLog` is `super_admin`-gated (`fn_audit_search` hard-filters the role); `audit_log` exists only on the live DB. **Critical limitation — no before/after:** `changed_fields` is consumed as *only a list of field names* (`Object.keys(v).join(', ')`); `useAuditTrail` selects the same with no old/new values. So the audit answers *which fields changed*, never *from what to what* — not audit-grade.

**Recommendations:** add an `auditor` role (read-only, broad SELECT + `audit_log`, no writes; relax `fn_audit_search` to `role ∈ (super_admin, auditor)`); capture before/after (`{field:{old,new}}`) + actor + a **source** flag (trigger/system vs user); persist reasons currently only toasted (payment removal, role change, mark-lost) into the audit payload; a record-level **History** tab unifying status/owner/approval/payment history + comments + attachments with old→new deltas and system-vs-manual labels.

## 10. Recommended permission matrix

**Legend:** V=View, C=Create, E=Edit, D=Delete (prefer soft), As=Assign, Ap=Approve, X=Export, $=Financial visibility, Au=Audit, Adm=Admin. ✔=full, ●=scoped, ▲=read-only, ✖=none. **New roles bold.**

| Module | super_admin | operations | **Order Coordinator** | business_owner | sales | Sales Manager | **Management** | **Auditor** |
|---|---|---|---|---|---|---|---|---|
| Customers/Clients | V✔ C✔ E✔ D(archive)✔ As✔ | V✔ E✔ As✔ | V✔ C✔ E✔ As● | V✔ E✔ As✔ | V● C✔ E● D(archive)● | V●(region) As● | V▲ | V▲ |
| Organizations | ✔ | V✔ E✔ | V✔ E● | V✔ E✔ | V▲ set-org● | V● | V▲ | V▲ |
| Inquiries/Leads | ✔ | V✔ | V✔ C✔ | V✔ | V● C● E●(own) | V●(team) | V▲ | V▲ |
| Quotations | ✔ | V✔ | V✔ C✔ E✔ | V✔ | V● C● E●(own) | V● | V▲ | V▲ |
| Orders (intake/edit) | ✔ | V✔ E✔ As✔ | V✔ **C✔ E✔** As✔ | V✔ E✔ | V● C✔ E●(stage only) | V● As● | V▲ | V▲ |
| Order → Endorse | ✔ | receive | **✔ (owns it)** | ✔ | ●(advance) | ● | ✖ | ✖ |
| Fulfillment/Sessions | ✔ | **✔ (owner)** | V▲ | V✔ Ap✔ | V● | V● | V▲ | V▲ |
| Participants/Roster | ✔ | C✔ E✔ D(soft)✔ cert✔ | ✖ | V✔ | C● E●(attendance) | V● | V▲(masked) | V▲ |
| Payments/AR | ✔ | C✔ E✔ | **C✔ E✔**(no void) | V✔ C✔ E✔ Ap(refund)✔ | **▲**(own/team) | ▲● | $▲ | $▲ |
| Refund/Void/Credit | ✔ | ✖ | ✖ | **Ap✔** | ✖ | ✖ | ✖ | V▲ |
| Approvals | Ap✔ | request | request | **Ap✔** | ✖ | ✖ | V▲ | V▲ |
| Pricing rules | ✔ | E✔ | ✖ | E✔ | ✖ | ✖ | V▲ | V▲ |
| Trainers/Venues/E-learn/Comms | ✔ | ✔ | ✖ | V▲ | ✖ | ✖ | V▲ | V▲ |
| Reports/Dashboard/Quality | ✔ X✔ | V✔ X✔ | V● | V✔ X✔ | V●(own perf) | V●(team) | **V✔ X✔** | V▲ X✔ |
| Audit log (values) | Au✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | **Au✔** |
| Admin/config | Adm✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |

**UI-gate vs RLS divergences to reconcile:** OrderDetail shows the fulfillment editor to sales/BO via `canEdit` while AR writes are DB-blocked for sales → formalize sales = stage-only edit and hide AR/transfer from sales; ReceivablePanel `canManage` includes BO (fine) but refund/void should be BO-only and payments immutable (today "remove" is a hard delete even for ops); `is_supervisor` grants region visibility with no matching UI concept — a real Sales Manager surface is missing; ops reassign (`p_asg_ops`, 20260811040000) is now in RLS but not surfaced clearly in Worklist.

**Data visibility (least-privilege):** PII scoped to own/team customers for sales; masked for Management/reporting; values for Auditor (read-only, logged). Financial scoped by `fn_can_see_order` (correct); refund/credit details limited to BO/super_admin/Auditor. Sales performance: own (rep) / team (manager) / all (Management/BO). Audit values: auditor + super_admin only.

**Delete vs Archive (make soft-delete universal):** clients already soft-delete — extend to participants (cancel/substitute + status), payments (void not delete), salespeople/users (deactivate; block removing the last super_admin), lookups (deactivate). Reserve hard delete for audited super_admin data-repair.

**Activity/audit framework (two layers, one source):** Layer 1 — record timeline (everyone, scoped) via `ActivityTimeline` fed by task/notification/order_note/client_interaction + audit rows, human-readable. Layer 2 — value-level `audit_log` (auditor/super_admin) with old→new + actor + source. One capture pipeline feeds both (trigger writes the audit row; timeline renders a friendly projection), so history is never reconstructed by hand and the two layers can't disagree.

### Load-bearing findings
1. `inquiry` has no `client_id` — leads never resolve to customers.
2. `audit_log.changed_fields` is field-names-only — no before/after; not audit-grade.
3. Participant `remove` is a hard, irreversible DELETE — contradicts soft-delete stance.
4. Refund = payment DELETE, reason not persisted — no refund/void/credit objects.
5. No Order Coordinator, Management, or Auditor role — sales pushed into ops screens; BO is exec-plus-operator.
6. `is_supervisor` widens RLS but has no manager UI.
7. Hardcoded enums block admin config without a deploy.
8. The ops command center already exists as `v_digest_*` views, only consumed by the nightly job.
