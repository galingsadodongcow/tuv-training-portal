# Status Dictionary — Academy Portal

> **Evidence:** every status vocabulary below is **VERIFIED** against the live Supabase database (enum definitions queried directly from `pg_enum`, project `ruwuqzwtwngpcauzbrqj`) and cross-checked against `src/lib/orderState.ts`, `src/lib/leadHealth.ts`, `src/lib/health.ts`. Where a status is *derived* (computed, not stored) it is marked **(derived)**.

The portal deliberately separates **process status** (where a record is in its workflow) from **health / risk** (whether it needs attention). Never read them as one thing — a session can be `Confirmed` (process) and `At risk` (health) at the same time.

---

## 1. Health / risk scale (unified, cross-object)

One scale, defined once in `health.ts`, always rendered with a text label (never colour-only).

| Signal | Meaning | Weight (sort) |
|---|---|---|
| **Blocked** | Something is stopping progress; act now | 3 (top) |
| **Risk** | Ageing / at-risk; act soon | 2 |
| **OK** | On track | 1 |
| **Done** | Terminal — completed / cancelled / accepted | 0 |

Session health values `Blocked · At Risk · Needs Attention · Healthy · Completed · Cancelled` collapse onto this scale (**At Risk** and **Needs Attention** both render as **Risk** — the label keeps the distinction, the colour does not).

---

## 2. Order — fulfilment stage  ·  `fulfillment_stage_t`

The order's position in the sales→operations pipeline. This is the **primary** order workflow status.

| Status | Meaning | Who sets it | Allowed next |
|---|---|---|---|
| **New** | Order just created, not yet worked | Coordinator/Sales (on create) | In Communication |
| **In Communication** | Being discussed with the customer | Coordinator/Sales | For Order Creation |
| **For Order Creation** | Ready to be turned into a formal order | Coordinator | Endorsed to Ops |
| **Endorsed to Ops** | Handed to Operations for fulfilment | Coordinator/Sales (via *Endorse*) | SAP Created (Ops accepts) / back to *For Order Creation* (Ops returns) |
| **SAP Created** | Booked in SAP; fulfilment underway | Operations | — (terminal-ish) |
| **No Feedback** | Stalled awaiting customer reply | Coordinator/Ops | In Communication |
| **Cancelled** | Order cancelled | Coordinator/Ops/BO | — (terminal) |

> **Note (verified):** the *advance* control shows these raw enum labels. See the Friction Log — recommend human phrasing ("Ready to create order", "Awaiting customer reply").

## 3. Order — lifecycle state  ·  `order_status_t`

A second, coarser status on the same record. **Ambiguity risk** — see Friction Log FR-STATUS-1.

| Status | Meaning |
|---|---|
| **New** · **Confirmed** · **Completed** · **Cancelled** · **Waitlist** | Coarse lifecycle; `Waitlist` is auto-set on a line when its session is full. |

## 4. Order — collection state **(derived)**  ·  from `collection_t` + AR clock

Computed from the AR ledger and a 30-day clock (`orderState.ts`), *not* stored on the order.

| State | Meaning | Clock |
|---|---|---|
| **Paid** | Balance ≤ 0 | — |
| **Not due** | Balance outstanding, invoice not yet due | — |
| **Due soon** | Approaching the due date | ≤ 23 days |
| **Overdue** | Past the due date with a balance | > 30 days overdue triggers *Overdue* |
| **None** | No AR yet | — |

> The stored `collection_t` enum is `Pending | Partial | Collected`; the UI shows the richer derived state above.

## 5. Order — payment status  ·  `payment_status_t`

| Status | Meaning | Who sets it |
|---|---|---|
| **Unpaid · Partial · Paid** | Aggregate payment position on the order | Coordinator/Ops/BO/super_admin — **never Sales** (a DB trigger blocks sales from changing it). Updated automatically when a payment is recorded. |

> **Known integrity gap (verified in QA):** `payment_status` can be set independent of the AR ledger, so a record can read `Paid` with a non-zero balance. Trust the AR balance on the Payments tab over the header pill when they disagree.

## 6. Individual payment — state  ·  `payment_state_t`

| Status | Meaning |
|---|---|
| **Pending** | Recorded, not yet confirmed |
| **Confirmed** | Cleared |
| **Voided** | Reversed (kept in the record, struck through; removed from the paid balance). Void/refund is **Business Owner / super_admin only**. Payments are **never deleted**. |

---

## 7. Inquiry (lead) stage  ·  `inquiry_status_t`

| Status | Meaning | Open/Closed |
|---|---|---|
| **Received** | Lead logged | Open |
| **Responded** | First reply sent | Open |
| **RFQ or P Sent** | Quote/proposal sent | Open |
| **Awaiting Feedback** | Waiting on the customer | Open |
| **Closed Won** | Converted | Closed |
| **Closed Lost** | Lost (reason captured) | Closed |

**Lead health (derived):** ageing after 3 days (**Risk**), stalled after 7 days (**Blocked**); Won/Lost → **Done**.

## 8. Quote status **(partly derived)**

| Status | Meaning |
|---|---|
| **Draft** | Being built | 
| **Sent** | Issued to customer |
| **Accepted** | Customer accepted |
| **Expiring** *(derived)* | Within 3 days of `valid_until` |
| **Expired** *(derived)* | Past `valid_until` |

## 9. Session / schedule status  ·  `schedule_status_t`

| Status | Meaning | Who sets it | Allowed next |
|---|---|---|---|
| **Tentative** | Scheduled, not confirmed | Ops (default on create) | Confirmed (via *Confirm Go*), Cancelled |
| **Confirmed** | Going ahead | Ops (Go/No-Go *Confirm Go*, or raw override) | Running, Cancelled |
| **Running** | In progress | Ops | Completed |
| **Completed** | Delivered | Ops (confirmed via dialog; "cannot be undone from here") | — |
| **Cancelled** | Cancelled | Ops via *Cancel with dispositions*; **requires business-owner approval** | — |

**Session go-decision:** `go_status_t` = `Go | No-Go`. Go/No-Go *advises*; Operations decides. "Propose No-Go" files an approval, it does **not** auto-cancel.

**Session health (derived):** `Blocked | At Risk | Needs Attention | Healthy | Completed | Cancelled` (from `v_session_health`), collapsed onto the unified scale.

---

## 10. Handoff status  ·  `handoff_status_t`

The order endorsement handshake between Coordinator/Sales and Operations.

| Status | Meaning | Set by |
|---|---|---|
| **Endorsed** | Sent to Operations, awaiting acceptance | Coordinator/Sales (*Endorse to Operations*) |
| **Accepted** | Operations took ownership | Operations (*Accept*) — only shown while status is `Endorsed` |
| **Returned** | Sent back for correction (reason recorded) | Ops/Coordinator/BO (*Return for correction*) |

## 11. Approval  ·  `approval_object_t` × `approval_decision_t`

| Object type | Decision | Decider |
|---|---|---|
| **Forecast sign-off · Schedule cancellation · Session review** | **Pending → Approved / Rejected** | Business Owner / super_admin. A decision note is captured (currently optional — see Friction Log). |

## 12. Duplicate order triage  ·  `dup_status_t`

| Status | Meaning |
|---|---|
| **Open** | Candidate pair awaiting reconciliation |
| **Merged** | Resolved — duplicate cancelled, survivor kept (`fn_merge_orders`) |
| **Dismissed** | "Not a duplicate" |

## 13. E-learning access  ·  `access_status_t`

| Status | Meaning |
|---|---|
| **Not Granted** | Self-paced order awaiting platform access |
| **Granted** | Access given (Ops). Granting **before payment** requires a mandatory reason ("Grant anyway"). |

## 14. Task  ·  `task_status` × `task_priority`

| Status | `open · in_progress · blocked · done · cancelled` |
|---|---|
| **Priority** | `low · normal · high · urgent` (shown as a pill in My Work) |

## 15. Supporting enums (reference)

| Enum | Values |
|---|---|
| `channel_t` | Webshop · Inside Sales · Field Sales · In-house Request |
| `modality_t` (learning type) | Live Online Training · Face-to-face · E-learning |
| `training_type_t` | PersCert (personnel certification) · Professional |
| `offering_t` | Public · In-house |
| `country_t` | PH · ID |
| `engagement_t` | Engaged · Closed · Lost |
| `went_live_t` | Not Yet · Yes · Cancelled · Reschedule |
| `year_mode_t` / `year_status_t` | Rebuild · Copy / Active · Archived (annual rollover) |

---

### Status cross-reference — the three "statuses" on one order

A single order simultaneously carries three status fields plus a derived collection state. This is the portal's biggest source of status confusion (Friction Log FR-STATUS-1):

```
Order  ┌ fulfillment_stage : Endorsed to Ops      (workflow — primary)
       ├ order_status      : Confirmed            (lifecycle — coarse)
       ├ payment_status    : Partial              (money)
       └ collection (derived): Overdue 4d          (AR clock)
```
Read them top-to-bottom: *where in the pipeline · what lifecycle state · paid how much · collection risk*.
