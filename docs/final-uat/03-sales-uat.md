# 03 — Sales UAT

Method: workflow trace through the actual screens/hooks on `main`. Verdicts: OK / FIX / SIMPLIFY.

## Verdict: Sales feels like a focused training CRM — with two gaps now fixed and a search gap deferred. ✅ (post-fix)

| Scenario | Verdict | Evidence |
|---|---|---|
| **A — New inquiry (lean) → qualify** | FIXED | Capture is lean (Company/Contact/Email/Course + admin salesperson; deal-sizing folds). **Gap found:** there was no way to add qualification (value/probability/close/source) *after* lean creation — no inquiry detail/edit — so the weighted pipeline stayed blank. **Fixed this pass:** an **Edit inquiry** surface on each card writes the qualification fields (RLS-governed, same strip-and-retry). |
| **B — Daily follow-up (My Work)** | PARTIAL → deferred | My Work surfaces tasks (with overdue styling), approvals, orders/sessions needing attention, SLA. **Missing for sales:** open-inquiry queue, quotes-needing-action, and a distinct "returned order" signal (a returned order only shows if also stalled). Adding sales-scoped queues is a follow-up (`08`) — a capability add, kept out of this correction pass. |
| **C — Training search** | SIMPLIFY → deferred | Global search (⌘K) covers order/client/participant/session/organization/course/inquiry. **Gaps:** `course` kind is hidden from sales (client-side role filter), sessions order **newest-first** so "next run" surfaces *past* dates, and category/subcategory aren't searchable. These live in `fn_global_search` (SQL) + one client constant → Supabase-session follow-up (`08`). |
| **D — Quote → order** | OK | `QuoteDetail` "Create order" → `/sales-entry?client=&quote=`; SalesEntry prefills existing customer + lines (course, modality, seats, unit price) from the quote; on save the quote is marked Accepted + linked. Rep only picks the **session per line** (quote lines are course-level, by design) + order no. Conversion is review, not re-entry. |
| **E — Handoff / endorsement** | OK (well-built) | Completeness gate blocks incomplete endorsement in **UI and DB** (`fn_endorse_order` re-runs `fn_order_completeness`, 42501); super_admin override needs a mandatory reason. Return-for-correction requires a reason in UI **and** DB. Ownership + timeline + audit reason all update. |
| **F — Needs Operations admin?** | OK | No sales CRM path forces an ops-only screen. The one legitimate dependency is session scheduling (ops-only); SalesEntry shows "Ask operations to schedule one" rather than trapping the rep. Payment status / SAP no. correctly read-only to sales. |

## Sales success test (UAT §44) — passes in code (post-fix)
My Work → review follow-ups → capture inquiry (lean) → **qualify inquiry (now editable)** → find availability (search — usable but "next run" ordering deferred) → open customer → quotation → convert accepted quote (no retype) → review order → send to Operations → track. No Operations-admin access needed.

## Fixes applied here
- **Inquiry Edit surface** (`Inquiries.tsx`) — qualify a lead after lean capture.
- Inquiry write controls **gated** to super_admin/coordinator/sales/sales_manager (management/auditor were seeing them — see `04`).
