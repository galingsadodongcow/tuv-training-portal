# Payments, AR & Money Exceptions

> Second-pass review — **Part 24** (payments/AR) plus the payment-related slices of **Parts 34** (delete-vs-archive) and **35** (exception handling). Grounded in `src/components/ReceivablePanel.tsx`, `src/hooks/data.ts` (`useOrderAr`/`useInvoices`/`usePayments`/`useSlaBreaches`, `useReceivablesAging`), `supabase/migrations/20260808160000_accounts_receivable.sql` (`invoice`, `payment`, `fn_ar_recompute`, `fn_payment_touch`, `v_order_ar`), and `20260808190000_communications.sql` (`fn_queue_reminders` payment reminder). Baseline: `docs/qa/ux-review/04` §6 (payments), `03` §7 (SLA), `05` §3 (automation).

The first pass already designed the immutable-payment / refund / credit-note model at a sketch level (`04` §6). This second pass asks whether it is **now necessary** (it is — the design test fails on money exceptions), then specifies it to build-ready depth: schema, status lifecycle, role authority, AR recompute, and an AR-exceptions board with drill-throughs.

---

## 1. Payment & AR review — what exists today

`ReceivablePanel` is the entire money surface. It renders a five-tile summary (Order total · Invoiced · Paid · Balance · Due) from `v_order_ar`, then invoice and payment tables, with three write paths gated on `canManage = role ∈ {operations, super_admin, business_owner}`.

| Concern | Current behavior | Verdict |
|---|---|---|
| **Payment status** | `orders.payment_status` (`Unpaid`/`Partial`/`Paid`) recomputed by `fn_ar_recompute` from `sum(payment.amount)` vs `total_amount`, fired by `trg_payment_touch` on any payment insert/update/delete. | IMPLEMENTED. Correct as a rollup. But it is a *3-state text*, blind to over/under-payment and to whether money is confirmed. |
| **Amount due / paid / outstanding** | `v_order_ar` exposes `invoiced`, `paid`, `balance = total_amount − sum(payments)`, `due_date = min(non-void invoice due)`. Panel colors Balance amber when `> 0`. | IMPLEMENTED. Note: `balance` is computed off **order total, not invoiced amount** — so an order can be "Paid" (status) while un-invoiced, and overdue days key off invoice due dates. Two different denominators in one panel. |
| **Method / reference** | Free-text `reference`, `method` from a 4-item `METHODS` const in the TSX (`Bank transfer`/`Credit card`/`Cheque`/`Cash`). No format check, no uniqueness, no bank-recon state. | PARTIALLY. Reference is un-validated and non-unique — the same money can be keyed twice with no guard (contrast the participant dedup guard). |
| **Under-payment** | Recording less than balance silently produces `Partial`. No task, no flag, no follow-up handle beyond the collections summary task (30-day age). | PARTIALLY — detection is coarse (age-based, not shortfall-based). |
| **Over-payment** | Soft-confirm dialog ("Payment exceeds the balance … Record it anyway?") then records; leaves a **negative balance** with no disposition (refund? credit? mis-key?). | PARTIALLY — warned, but the resulting negative balance is an untracked exception. |
| **Mismatch / wrong payment** | The only correction is **Remove** — a hard `DELETE` on `payment` with an *optional, un-persisted* reason (`removePayment`, line 72–78). `fn_payment_touch` recomputes AR on delete, so numbers self-heal, but the "why money left the record" is lost. | NOT ACCEPTABLE — see §2. |
| **Sales read-only on money** | `p_payment_w` / `p_invoice_w` restrict writes to ops/BO/super_admin; sales blocked at the DB. `trg_guard_orders_sales_fields` (42501) blocks sales from `payment_status`/`sap_order_no`. Sales still *see* AR on own/team orders via `fn_can_see_order`. | IMPLEMENTED and correct (DB-enforced, not UI-only). |

**Bottom line:** the *arithmetic* is sound and DB-driven. The *lifecycle* is missing: a payment is born final, has no confirmation state, cannot be voided-with-trace, and over/under-payments have no disposition. Against the five-question design test, money exceptions fail Q1 (what needs attention — a negative balance surfaces nowhere), Q4 (who owns the next step — no owner on a shortfall), and Q5 (is it progressing — no pending→confirmed clock).

---

## 2. Refund / void / credit model — **NEEDS PRODUCT DECISION → then build**

**Is the deferred model now necessary? Yes.** In the first pass this was `DEFERRED (DB/architecture)`. Nothing since has touched it — `ReceivablePanel.removePayment` is still a hard `DELETE`. It is now the single largest correctness-and-audit gap on the money path, and it blocks three things the rest of the portal already assumes exist: (a) an audit-grade trail (Part audit work wants before/after + persisted reasons; a deleted row has neither), (b) the soft-delete-everywhere stance of `docs/qa/ux-review/04` §"Delete vs Archive" (payments are the last hard-delete on a financial object), and (c) any AR exceptions board (you cannot age or reconcile rows you delete). **Recommendation: promote from DEFERRED to the next DB phase.**

### 2.1 Schema

Payments become **immutable and append-only**. Corrections are new rows, never deletes.

```sql
-- payment gains a lifecycle status; rows are never deleted.
alter table public.payment
  add column if not exists status text not null default 'Confirmed'
    check (status in ('Pending','Confirmed','Voided')),
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid,
  add column if not exists voided_at    timestamptz,
  add column if not exists voided_by     uuid,
  add column if not exists void_reason   text;      -- persisted, mandatory on void

-- money leaving the org, linked to the payment it reverses.
create table if not exists public.refund (
  refund_id   uuid primary key default gen_random_uuid(),
  order_id    text not null references public.orders(order_id) on delete cascade,
  payment_id  uuid references public.payment(payment_id),  -- what it reverses (nullable = goodwill)
  amount      numeric(14,2) not null check (amount > 0),
  method      text, reference text,
  reason      text not null,                                -- mandatory
  status      text not null default 'Pending'
              check (status in ('Pending','Approved','Paid','Rejected')),
  requested_by uuid, approved_by uuid, refund_date date,
  created_at  timestamptz not null default now()
);

-- store credit that applies against a future order.
create table if not exists public.credit_note (
  credit_id     uuid primary key default gen_random_uuid(),
  client_id     uuid references public.client(client_id),
  source_order  text references public.orders(order_id),    -- where the credit came from
  applied_order text references public.orders(order_id),    -- where it was consumed (nullable)
  amount        numeric(14,2) not null check (amount > 0),
  reason        text not null,
  status        text not null default 'Open'
                check (status in ('Open','Applied','Expired','Cancelled')),
  created_by uuid, created_at timestamptz not null default now()
);
```

### 2.2 Status lifecycle

```
payment:   Pending ──confirm──▶ Confirmed ──void(reason)──▶ Voided
                                    │
                                    └── over/under-payment detected → AR exception
refund:    Pending ──approve──▶ Approved ──pay──▶ Paid   (│ Rejected)
credit:    Open ──apply(order)──▶ Applied   (│ Expired │ Cancelled)
```

- **Pending** covers the real gap today: a cheque keyed but not cleared, a bank transfer awaiting recon. It stops "Paid" status from flipping on unconfirmed money.
- **Void** replaces the hard delete: the row stays, `void_reason` is mandatory and persisted (fixes `04` §6 "reason not persisted"), and AR excludes it.

### 2.3 AR recompute (the one function that must change)

`fn_ar_recompute` currently sums *all* `payment.amount`. It must sum **confirmed payments − paid refunds + applied credits**, and stop counting voided/pending money:

```sql
-- inside fn_ar_recompute, replace the paid sum:
select coalesce(sum(amount),0) into v_paid
  from payment where order_id = p_order and status = 'Confirmed';
select coalesce(sum(amount),0) into v_refunded
  from refund  where order_id = p_order and status = 'Paid';
select coalesce(sum(amount),0) into v_credit
  from credit_note where applied_order = p_order and status = 'Applied';
v_net := v_paid - v_refunded + v_credit;
update orders set payment_status =
  (case when v_total > 0 and v_net >= v_total then 'Paid'
        when v_net > 0 then 'Partial' else 'Unpaid' end)::payment_status_t
where order_id = p_order;
```

`trg_payment_touch` extends to also fire `after insert/update on refund, credit_note`. `v_order_ar.paid` and `.balance` change denominators to the same net figure so the panel and the recompute agree (fixing the two-denominator issue in §1).

### 2.4 Role authority

| Action | Coordinator / Operations | Business Owner | Super Admin | Sales |
|---|---|---|---|---|
| Record payment (→ Pending) | ✔ | ✔ | ✔ | ✕ (DB-blocked, keep) |
| Confirm payment (Pending→Confirmed) | ✔ | ✔ | ✔ | ✕ |
| **Void payment** (reason required) | ✕ | ✔ | ✔ | ✕ |
| **Request refund** | ✔ (request only) | ✔ | ✔ | ✕ |
| **Approve refund / issue credit** | ✕ | ✔ | ✔ | ✕ |
| Raise / void invoice | ✔ | ✔ | ✔ | ✕ |

Rule, matching the brief's "automate paperwork, never judgment": **recording and confirming money is clerical (Coordinator); making money leave the record — void or refund — is judgment, so it is BO/super_admin only and always behind a persisted reason.** Enforce in RLS (a `p_payment_void` policy keyed on `fn_current_role() in ('business_owner','super_admin')` for the void columns; refund/credit `_w` policies likewise), not in the panel.

### 2.5 UI change to `ReceivablePanel`

- Payment table gains a **Status** column (Pending/Confirmed/Voided pill) and per-row actions gated by role: Coordinator sees **Confirm**; BO/super_admin see **Void** (opens the `useConfirm` danger dialog with `reason: 'required'`, then writes `void_reason` — no more DELETE).
- Over-payment soft-confirm additionally offers **"Record as credit note"** (writes `credit_note` instead of a negative-balance payment).
- A **Refund** action (BO/super_admin) opens a request form (amount/method/reason, optional `payment_id` link).

---

## 3. Payment SLA + money exceptions

### 3.1 Payment-review SLA

Today the only collection clock is `fn_generate_worklist_tasks` step 2 — a per-owner "chase overdue collections" summary keyed on `order_date < now() − 30d` and `payment_status in (Unpaid, Partial)`. That is a blunt age gate, not a per-invoice SLA. Extend the existing `sla_policy` engine (which already drives `v_sla_breach` for fulfillment stages) with **payment stages** rather than inventing a parallel mechanism:

| Clock | Start | Target | Breach action |
|---|---|---|---|
| **Payment confirmation** | payment inserted as `Pending` | 2 days | task to Coordinator "confirm/clear payment" |
| **Invoice → payment** | invoice `due_date` | 0 (overdue at due) | already queued as `payment_reminder` email; add owner task at +7d |
| **Refund fulfillment** | refund `Approved` | 5 days | task to Finance/BO "refund not paid" |

`v_sla_breach` is order-fulfillment-only today; add a `v_payment_sla_breach` view on the same `sla_policy` pattern so the My Work "Exceptions / SLA breaches" section (already wired via `useSlaBreaches`) can union payment breaches in.

### 3.2 The four money exceptions and where each surfaces

| Exception | Detection rule | My Work | Record (`ReceivablePanel`) | Notification |
|---|---|---|---|---|
| **Over-payment** | `net_paid > total_amount` (or `balance < 0`) | "Money exceptions" row, drill → `/orders/{id}` | Balance tile turns red + "Overpaid ₱X — resolve (refund / credit)" banner | `kind='ar'` to order owner + BO |
| **Under-payment** | `Partial` and `balance > 0` past invoice due | folds into existing collections task | Balance amber (exists) + days-overdue (exists) | `payment_reminder` email (queued today, **not sent** — see below) |
| **Missing / bad reference** | payment `status='Confirmed'` with null/blank/duplicate `reference` | "Money exceptions" row | Reference cell flagged; Confirm blocked until keyed | task to Coordinator |
| **Payment on cancelled order** | payment exists where `order_status='Cancelled'` | "Money exceptions" row | banner "Payment on a cancelled order — refund or reallocate" | `kind='ar'` to BO |
| **Pending too long** | payment `status='Pending'` > SLA | Exceptions/SLA section | Status pill "Pending 3d" | task to Coordinator |

All five are pure **detection** — none decides. The disposition (refund vs credit vs write-off) stays a human judgment routed to BO, per the automation contract.

> ⚠️ **Live gap that undercuts §3.1–3.2 today:** `fn_queue_reminders` writes `payment_reminder` rows into `comms_log`, and `fn_nightly_hygiene` now calls it (`20260812000000`), but **`send-comms` is never scheduled** — `supabase/schedule.sql` crons only `weekly-digest` and `nightly-hygiene`. Payment reminders therefore *queue and never send*. Wiring the cron is a one-line prerequisite (covered in `13-automation-and-sla.md` §1).

### 3.3 AR-exceptions board — **NOT IMPLEMENTED**

There is a `useReceivablesAging` hook (`v_order_ar` where `balance > 0`, ordered by `due_date`) but **no screen renders it** — it is a dead query. Stand up a **Finance / AR** board (BO + super_admin + a future Finance/Coordinator role), fed entirely by views already present or trivially added:

```
┌─ Accounts Receivable ─────────────────────────────────────────────┐
│  Aging buckets   │ Current │ 1–30 │ 31–60 │ 61–90 │ 90+ │  Total   │  ← v_order_ar by due_date
│  Outstanding ₱   │   …     │  …   │   …   │   …   │  …  │   …      │
├───────────────────────────────────────────────────────────────────┤
│  Money exceptions                                                  │
│   • Overpayments (balance < 0)        drill → /orders/{id}         │
│   • Pending-confirmation payments      drill → /orders/{id}#ar     │
│   • Payments on cancelled orders       drill → /orders/{id}        │
│   • Refunds awaiting approval / payout drill → /orders/{id}#ar     │
├───────────────────────────────────────────────────────────────────┤
│  Overdue collections (owner · days over · ₱)   drill → /orders/{id}│  ← v_payment_sla_breach
└───────────────────────────────────────────────────────────────────┘
```

Every tile states its drill-through (per the brief's dashboard rule). This board is the money counterpart to My Work: it answers Q1 (what money needs attention) and Q4 (who owns the shortfall) for the finance-facing roles, and it is the natural home for the refund/credit dispositions from §2.

---

## Classification summary

| Item | Status |
|---|---|
| AR arithmetic, `fn_ar_recompute`, sales-blocked-on-money | IMPLEMENTED (keep) |
| Over-payment soft-confirm | PARTIALLY IMPLEMENTED (warns, leaves untracked negative balance) |
| Immutable payments + `payment.status` (Pending/Confirmed/Voided) | NOT IMPLEMENTED → promote from DEFERRED |
| `refund` + `credit_note` objects, AR from confirmed − refunds + credits | NOT IMPLEMENTED → build with §2 |
| Void-with-persisted-reason replacing hard DELETE | NOT IMPLEMENTED (P1 — audit + data-integrity) |
| BO/super_admin-only void/refund authority | NEEDS PRODUCT DECISION (role split) then RLS |
| Payment-review SLA + `v_payment_sla_breach` | NOT IMPLEMENTED (extends existing `sla_policy`) |
| Money-exception detection (5 rules) | NOT IMPLEMENTED (detection only, judgment stays human) |
| AR-exceptions board | NOT IMPLEMENTED (`useReceivablesAging` exists but unrendered) |
| Payment reminders actually sending | NOT IMPLEMENTED (`send-comms` uncronned — see automation doc) |
