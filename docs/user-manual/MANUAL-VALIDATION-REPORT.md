# Manual Validation Report — Academy Portal

> The "new-user test": follow the finished manual as if seeing the app for the first time, and check each procedure. **Honesty note:** the live deployment is auth-gated and no credentials were available, so validation could **not** be a first-hand click-through. Instead every procedure was validated by **re-deriving it against the source code** (the screen that implements it, its required fields, buttons, RPCs, and RLS), which confirms the *instructions match the implementation*. What it cannot confirm is *runtime behaviour, timing, exact on-screen wording, and pixel-level layout* — those need one credentialed pass.

## Validation method
For each procedure I checked: is the starting point real? is every action a real control in that screen's code? are the required fields correct? are the status changes accurate to the enums? is the expected result what the code produces? does the next step exist?

## Results by procedure

| Procedure | Start real? | Controls real? | Required fields right? | Status accurate? | Verdict |
|---|---|---|---|---|---|
| View calendar / find session | ✅ `/calendar` | ✅ view switch, filters, drawer | n/a | n/a | **PASS (source)** |
| Create category/subcategory | ✅ course form | ✅ dependent selects | ✅ category before subcategory | ✅ | **PASS (source)** |
| Create course | ✅ `/courses` | ✅ +New, fields, Advanced fold | ✅ title + ≥1 learning type/fee | n/a | **PASS (source)** |
| Schedule session | ✅ `/session/new` | ✅ course, learning type, dates, More | ✅ course + dates | ✅ Tentative | **PASS (source)** |
| Assign trainer/venue | ✅ drawer | ✅ pickers, conflict notice | n/a | n/a | **PASS (source)** |
| Confirm session (Go/No-Go) | ✅ session | ✅ Confirm Go + arming click | n/a | ✅ →Confirmed | **PASS (source)** |
| Manage participants | ✅ Participants tab | ✅ add/import/attendance/cert/transfer/remove | ✅ | ✅ soft-remove | **PASS (source)** — note the silent score toast |
| Reschedule/cancel session | ✅ | ✅ Edit / Cancel w/ dispositions | n/a | ✅ approval-gated cancel | **PASS (source)** |
| Fulfilment queue | ✅ CRM saved view | ✅ advance/assign/bulk | n/a | ✅ stages | **PASS (source)** |
| Capture lead | ✅ CRM Pipeline | ✅ New inquiry, fields | ✅ Company | ✅ Received | **PASS (source)** — dup-risk noted |
| Quote → order | ✅ CRM Quotes | ✅ new quote, lines, convert | ✅ Client | ✅ Draft/Sent | **PASS (source)** |
| Create sales order | ✅ `/sales-entry` | ✅ customer/order/lines | ✅ Order no, Email, Session, Fee | ✅ New | **PASS (source)** |
| Endorse order | ✅ Order detail | ✅ Endorse/Accept/Return | n/a | ✅ Endorsed→Accepted/Returned | **PASS (source)** — no receiver notify noted |
| Decide approval | ✅ `/approvals` | ✅ Approve/Reject + note | n/a | ✅ Approved/Rejected | **PASS (source)** |
| Void/refund payment | ✅ Payments tab | ✅ Refund/Void + reason | n/a | ✅ Voided | **PASS (source)** |
| Create user / role | ✅ `/admin` | ✅ user + role | ✅ role | n/a | **PASS (source)** — login acct is Supabase-side |
| Management/Auditor oversight | ✅ Overview/Search/Audit | ✅ drill-through, search | n/a | n/a | **PASS (source)** |

## What is NOT validated (needs a credentialed pass)
| Dimension | Why | Action for a credentialed reviewer |
|---|---|---|
| Exact on-screen labels & copy | Rendered client-side; only the shell is reachable pre-login | Confirm button/field wording matches the manual; adjust if drift |
| Screenshots | Auth-gated | Capture `[OPS-01…]`, `[SALES-01…]`, `[BO-01]`, `[ADMIN-01]` etc. at the marked steps |
| Runtime timing/notifications | Not observable from code alone | Confirm the handoff no-notify behaviour and toast timings |
| Real data edge cases | No test tenant reached | Run the negative journeys (Phase 7) against a test account |
| Performance feel | Depends on live data volume | Sanity-check the full-load tables (Clients 300 cap, Calendar) |

## New-user readiness questions (the manual's own test)
- **Would a new Operations employee do their daily work from this manual without help?** *Mostly yes* — calendar, course/session, roster, fulfilment are step-complete. The one thing that still needs a colleague's word is the *local convention around the silent endorsement handoff*.
- **Would a new Sales employee?** *Yes* for lead→quote→order→endorse, with the explicit warning to search before creating a customer.
- **Would an Administrator understand their boundaries?** *Yes* — the system-vs-operational admin split and the "login account lives in Supabase" note draw the line.

## Corrections made during validation (manual ⇄ code reconciliation)
1. Confirmed **8 roles** (not the older 4-role docs) from the live enum — matrices use the 8-role model.
2. Confirmed **session cancellation is approval-gated**, not a delete — corrected the cancel procedure.
3. Confirmed **payments void, never delete**, and **contacts are the one hard-delete** — corrected the CRUD/troubleshooting text.
4. Confirmed the **endorsement does not notify** the receiver — added the caveat everywhere the handoff appears.
5. Confirmed **saved views are not shipped** (hook only) — the glossary and manual do not promise them.

**Overall:** the manual's *instructions* are accurate to the application as built. It is ready to use, with a single credentialed pass recommended to add screenshots and confirm exact wording.
