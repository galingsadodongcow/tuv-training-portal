# Product Decisions Required (Part 47)

These are **business decisions, not technical ones** — they gate the role model, the handoff architecture, and the money model, and no amount of design can resolve them without the business owner. Each is stated as a question, with options, the recommendation, and what it unblocks. Ordered by how much they block.

> Rule this pass followed: **do not hide an unclear business rule inside a technical recommendation.** Every ambiguity that needs a human is surfaced here.

## Blocking decisions (nothing downstream can be built cleanly until these are set)

### D1. Who owns webshop and manual order intake?
**Why it matters.** Today no role owns intake integrity (matching, dedup, completeness, deposit check, endorsement). `operations` is documented as doing intake but is NAV-gated out of `Inquiries` and `New sales order` (`roles.ts`). Webshop orders are hand-re-keyed.
**Options.** (a) A new **Order/Marketing Coordinator** role owns intake end-to-end; (b) **Operations** owns intake (open the gates, no new role); (c) **Sales** continues to self-serve intake.
**Recommendation: (a) Order Coordinator.** It is the single missing role that most of the workflow gaps trace back to. If headcount can't justify a role, (b) with an explicit "intake" responsibility is the fallback — but define ownership boundaries either way.
**Unblocks.** Role model, endorsement handoff, webshop ingestion, duplicate-at-source ownership.

### D2. What must be complete before an order can be endorsed to Operations?
**Why it matters.** Endorsement is a dropdown with no completeness gate; Operations receives incomplete orders and can't reject them.
**Decision needed.** The **required-field contract**: validated customer (not free text), billing contact, reference/SAP format, ≥1 line with a session for scheduled lines, a fee, a payment/deposit state, country. Which are hard blocks vs warnings?
**Recommendation.** Hard-block on: matched customer, ≥1 line, session-for-scheduled-lines, fee, reference format. Warn on: deposit unpaid. Super-admin override with reason.
**Unblocks.** The completeness gate and the Accept/Return handoff.

### D3. Who may confirm a payment, and who may refund / void / credit?
**Why it matters.** "Refund" is currently a hard `DELETE` of a payment row with an un-persisted reason; there is no void, credit note, or confirmation lifecycle.
**Decision needed.** The authority split. Proposed: **Coordinator/Operations record and confirm** payments; **only Business Owner / super-admin void or refund**, behind a mandatory persisted reason; payments become **immutable** (never deleted).
**Recommendation.** Adopt the proposed split; add `payment.status` (Pending→Confirmed→Voided), a `refund` object, and a `credit_note` object.
**Unblocks.** The money model, the AR exceptions board, audit-grade financial history.

### D4. Is Management strictly read-only?
**Why it matters.** `business_owner` today is exec **and** operator — it decides approvals, writes payments, edits pricing and clients. There is no look-but-don't-touch role.
**Options.** (a) Split into **`management` (read-only)** + keep `business_owner` as the **approver**; (b) add a read-only *mode* to `business_owner`; (c) leave as-is.
**Recommendation: (a).** A scoped read-only Management role is the clean least-privilege answer and enables the executive dashboard without write risk.
**Unblocks.** Management dashboard, permission matrix, least-privilege posture.

### D5. Does the Customer entity represent the company, the contact, or both?
**Why it matters.** `client`, `organization`, `contact`, and `inquiry` are four unlinked concepts; `inquiry` has no `client_id`, so a lead never resolves to a customer.
**Decision needed.** The canonical customer model: **Organization (company) → Contact (person) → transactional Client**, with `inquiry.client_id` resolving leads to customers.
**Recommendation.** Organization = company; Contact = person; unify the transactional `client` under Organization; add `inquiry.client_id` via the existing email-dedup. This is a data-model change — only proceed with D5 agreed, because Customer 360 depends on it.
**Unblocks.** Customer 360, lead-to-customer resolution, org-level AR rollup.

## Ownership & authority decisions

### D6. Who owns a training session, and does Sales retain ownership after Operations accepts the order?
**Why it matters.** Sessions have no owner; after endorsement it's unclear whether Sales still owns the customer relationship / AR while Operations owns delivery.
**Recommendation.** **Dual ownership, modelled explicitly:** Operations owns the session/fulfillment; Sales retains the customer + AR relationship. Add `schedule.owner` (ops) and keep the order's sales owner; show both on the record.
**Unblocks.** Session ownership, My Work routing for ops, AR follow-up ownership.

### D7. Should an Auditor role exist, and do we capture before/after values?
**Why it matters.** `AuditLog` is super-admin-only; `changed_fields` stores field *names* only, never old→new. Not audit-grade; forces an over-grant.
**Recommendation.** Add a read-only **`auditor`** role (broad SELECT + audit_log, no writes); capture `{field:{old,new}}` + actor + a source flag (system vs user); persist reasons currently only toasted.
**Unblocks.** Governance, compliance, the Auditor experience.

### D8. Should the Sales Manager be a real role with team scope?
**Why it matters.** `is_supervisor` is an invisible boolean that widens RLS with no manager UI and no per-team grant.
**Recommendation.** Promote to a real **`sales_manager`** role (or an explicit team-scope grant surfaced in Admin) with a manager surface (team pipeline, unassigned, overdue, reassign, escalate).
**Unblocks.** Sales Manager dashboard, reassignment authority, team SLA.

## Configuration & policy decisions

### D9. Should workflow reference data be admin-configurable?
Stages, payment methods, channels, sources, attendance/result values are string literals in TSX — changing one needs a deploy. **Recommendation:** back them with an admin lookups console (active/sort), so policy changes don't need engineering. *(Lower urgency; enables self-service later.)*

### D10. What are the SLA targets per stage/process?
The engine exists (`sla_policy`, `v_sla_breach`); the **numbers** are a business policy. Confirm targets/warn/overdue per: inquiry response, sales follow-up, order validation, payment review, ops acceptance, session prep, approval, certificate. *(See `05-handoffs-and-ownership.md` for a proposed table to ratify.)*

### D11. Currency: commit to PHP-only, or model multi-currency?
Phase 3 committed to **PHP-only + explicit labelling** (no `currency` column). If the Academy bills other countries in local currency, this needs revisiting (`amount_php` + `php()` are hard-coded). **Recommendation:** stay PHP-only until a real multi-currency billing requirement is confirmed; if confirmed, add `currency`+`fx_rate` and migrate `money()` (the helper already exists in `format.ts`).

### D12. Does a won inquiry auto-create an order, or offer a one-click convert?
`Closed Won` dead-ends today. **Recommendation:** one-click "Create order from lead" carrying company/course/pax + linkage (not silent auto-creation — keep the human in the loop).

---

**How to use this list.** Phase A of the roadmap (`16-implementation-roadmap.md`) is *resolving D1–D8*. D1, D2, D3, D5 are the true blockers — a 60-minute decision session on those four unblocks the majority of Phases B–E.
