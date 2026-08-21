# Workflow Matrix — End-to-End Business Workflows & Handoffs

> **Evidence:** **VERIFIED** from the screen logic, RPCs, and status enums. Sequence reflects how the records actually move; timing/notification behaviour noted where the app differs from what a user would expect.

Legend for **Next owner** = the role that must act after this stage.

---

## WF-1 · Lead → Order → Fulfilment → Delivery (the spine)

| # | Stage | Responsible | Supporting | System action | Record created/updated | Status after | Next owner |
|---|---|---|---|---|---|---|---|
| 1 | Capture lead | Sales | — | Insert inquiry (`createInquiry`) | **Inquiry** | Received | Sales |
| 2 | Qualify | Sales | Sales manager | Update inquiry (value, probability, close) | Inquiry | Responded → RFQ/P Sent | Sales |
| 3 | Quote | Sales / Coordinator | — | Create quote + lines; discount hints | **Quote** | Draft → Sent | Customer |
| 4 | Win | Sales | — | Mark inquiry Closed Won; convert quote | Inquiry, Quote | Closed Won / Accepted | Coordinator |
| 5 | Create order | Coordinator / Sales | — | `sales-entry` insert order + lines (session per line) | **Order**, order lines | New | Coordinator |
| 6 | Work order | Coordinator | — | Advance fulfilment stage | Order | In Communication → For Order Creation | Coordinator |
| 7 | **Endorse** | Coordinator / Sales | — | `fn_endorse_order` (blocked if completeness fails; super_admin may override w/ reason) | Order, **handoff** | Endorsed to Ops / handoff **Endorsed** | **Operations** |
| 8 | **Accept** | Operations | — | `fn_accept_endorsement` | handoff | **Accepted** | Operations |
|   | *(or Return)* | Ops / Coordinator / BO | — | `fn_return_for_correction` (**reason required**) | handoff | **Returned** → For Order Creation | Coordinator |
| 9 | Book in SAP | Operations | — | Set SAP ref + stage | Order | SAP Created | Operations |
| 10 | Ensure session | Operations | — | Session exists / create it (WF-2) | Session | Tentative | Operations |
| 11 | Enrol participants | Operations / Coordinator | — | Add/import roster (`fn_*`) | **Participant** | Active | Operations |
| 12 | Confirm session | Operations | Business owner (if below min) | Go/No-Go **Confirm Go** | Session | Confirmed | Operations |
| 13 | Deliver | Operations | Trainer (offline) | Set Running → Completed | Session | Running → Completed | Operations |
| 14 | Attendance | Operations | — | Mark attendance | Participant | attended | Operations |
| 15 | Certify | Operations | — | Issue certificate (single/bulk) | **Certificate** | issued | — |
| 16 | Collect payment | Coordinator / Ops / BO | — | Record payment; trigger updates status | **Payment**, Invoice | Partial → Paid | Business owner (AR) |
| 17 | Report | Management / BO | — | Analytics / Financial (read) | — | — | — |

> **⚠ Handoff gap (verified):** at step 7→8 the receiver (**Operations**) gets **no in-app notification** — Ops discovers the endorsed order only when the fulfilment queue refreshes. The acting user gets a toast; the receiver does not. See Friction Log FR-HANDOFF-1.

---

## WF-2 · Course → Session → Delivery (Operations, catalogue side)

| # | Stage | Responsible | System action | Record | Status | Next owner |
|---|---|---|---|---|---|---|
| 1 | Ensure category/subcategory | Ops / super_admin | Create category + subcategory | Category, Subcategory | active | Ops |
| 2 | Create course | Ops / super_admin | Course + fees per learning type | **Course** | active | Ops |
| 3 | Schedule session | Operations | New session (course, learning type, dates) | **Session** | Tentative | Operations |
| 4 | Assign trainer | Operations | Inline on calendar drawer / session edit; **conflict check runs** | Session | Tentative | Operations |
| 5 | Assign venue | Operations | Inline on calendar drawer / session edit | Session | Tentative | Operations |
| 6 | Confirm | Operations | Go/No-Go Confirm Go | Session | Confirmed | Operations |
| 7 | Run & complete | Operations | Status → Running → Completed | Session | Completed | — |
| 8 | Cancel *(if needed)* | Operations → **Business owner approves** | Cancel with dispositions → files an approval | Session, Approval | Cancelled (pending approval) | Business owner |

---

## WF-3 · Payment & AR (money side)

| # | Stage | Responsible | System action | Record | Status | Next owner |
|---|---|---|---|---|---|---|
| 1 | Raise invoice | Coordinator / Ops / BO | Add invoice on order Payments tab | **Invoice** | issued | Customer |
| 2 | Record payment | Coordinator / Ops / BO | Insert payment; trigger recomputes order `payment_status` | **Payment** | Confirmed | — |
| 3 | Overpayment/refund | **Business owner / super_admin** | Refund (reason req.) / Void (reason req.) | Refund / Payment(Voided) | — | — |
| 4 | Chase overdue | Owner (sales/ops) | Follow the "overdue collections" card | Order | collection: Overdue | Owner |

---

## WF-4 · Exceptions

| Workflow | Responsible | System action | Outcome |
|---|---|---|---|
| **Duplicate order** | super_admin / operations / coordinator | `fn_merge_orders` (keep one, cancel other) or dismiss | Merged / Dismissed |
| **E-learning access** | operations | Grant on payment; "Grant anyway" (reason) before payment | Granted |
| **SLA breach** | order owner | Notify owners button (ops/super_admin) | notification sent |
| **Approval** | business_owner / super_admin | Approve/reject with note | Approved / Rejected |

---

## Cross-role responsibility summary

| Responsibility boundary | Ends with | Begins with |
|---|---|---|
| **Sales → Coordinator** | Inquiry won, quote accepted | Order creation |
| **Coordinator → Operations** | Order **endorsed** (handoff: Endorsed) | Operations **accepts** the endorsement |
| **Operations → Business owner** | Session cancellation **proposed**; forecast filed | Business owner **approves/rejects** |
| **Operations → (customer/close)** | Session Completed, certificates issued | AR collection continues in parallel |
| **Everyone → Management/Auditor** | Any record change | Read-only oversight + audit reconstruction |

**The single most important handoff to get right** is Coordinator→Operations (WF-1 step 7–8): it is where ownership legally moves, and it is the one the UI currently under-signals (no receiver notification, ownership transfer implied rather than shown).
