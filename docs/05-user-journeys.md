# Version 1 user journeys

## 1. Journey design rules

- The normal start is My Work for actors, Calendar for scheduling, Sales for
  commercial work, and Overview for read-only oversight.
- A common action takes one to three interactions; an end-to-end stage should not
  exceed about five meaningful steps.
- Create screens request minimum viable information. Optional detail is disclosed
  after creation or under “More options”.
- Every transition identifies owner, current responsibility, next action, and a
  receipt. Errors explain the blocking fact and recovery.
- Routes below describe the proposed replacement, not compatibility paths.

## 2. Training setup

### J1 — Maintain catalogue

**Actor:** Operations. **Start:** Administration → Training catalogue.

1. Select **New course** and enter code, title, category, duration, default
   capacity, learning type, and standard price.
2. Save. The system validates unique code, hierarchy, positive capacity/duration,
   and a nonnegative price.
3. Add another effective price or qualified trainer only when needed.

**Result:** active course is immediately readable in Sales and selectable in the
Calendar. Editing future configuration does not rewrite historical quote/order
snapshots. A used course is deactivated, not deleted.

### J2 — Maintain trainer or venue

**Actor:** Operations. **Start:** Administration → Trainers or Venues.

1. Create the resource with name and the minimum scheduling facts.
2. For a trainer, select qualified courses; for a physical venue, enter capacity.
3. Save or later deactivate.

**Result:** active resources appear in the session drawer. Sensitive rates are
absent unless separately approved and authorized.

## 3. Training scheduling

### J3 — Create and confirm a session

**Actor:** Operations. **Start:** Calendar.

1. Select a date/time slot or **New session**.
2. Choose course and learning type; accept default duration/capacity.
3. Assign trainer and venue and select **Save draft** or **Confirm**.
4. The system checks qualification, overlaps, venue capacity, dates, and required
   resources. It shows `Risk` reasons for a saveable draft and `Blocked` reasons
   that prevent confirmation.
5. Resolve a blocker in the same drawer and confirm.

**Result:** the session is visible on the Calendar and, if it needs attention, in
Operations My Work. Confirmation records actor/time. A concurrent save rechecks
resources in the database rather than trusting a stale browser warning.

### J4 — Change or cancel a session

**Actor:** Operations. **Start:** Calendar event → session drawer/record.

1. Select **Edit schedule**, change the interval/resource, and save.
2. The system reruns conflict/capacity checks and identifies affected bookings.
3. For cancellation, select **Cancel**, review impact, enter a mandatory reason,
   and confirm (or request focused approval if the owner requires it).

**Result:** one current session remains authoritative. Cancellation preserves
bookings/history and creates an audit event; it does not delete the session.

## 4. Lead to sale

### J5 — Capture and qualify an inquiry

**Actor:** Sales. **Start:** Sales → Pipeline → New inquiry.

1. Search for the customer by name, domain, email, or contact.
2. Select it, or create a minimal customer after reviewing duplicate warnings.
3. Choose course/interest and save; signed-in Sales is the default owner.
4. Add expected participants/value/close date only during qualification, then
   mark **Qualified**, **Won**, or **Lost** (loss reason required).

**Result:** the inquiry retains customer/contact/course and ownership. No company
or interest details need retyping downstream. Follow-up dates at risk appear in
Sales My Work, derived from the inquiry rather than a second task record.

### J6 — Create and send a quotation

**Actor:** Sales. **Start:** Inquiry → Create quote, or Sales → Quotes → New.

1. Customer/owner/course interest prefill from the inquiry.
2. Add or confirm course lines, learning type, seats, and standard price; override
   only with permitted reason if an approval rule is later confirmed.
3. Set valid-until and save draft.
4. Review the concise total and select **Mark sent**.

**Result:** commercial snapshots are fixed when sent. Expiry is derived from
valid-until. The accepted quote can become an order without line re-entry.

### J7 — Create an order directly or from a quote

**Actor:** Sales. **Start:** Accepted quote → Create order, or Sales → New order.

1. Customer, owner, source, and quote lines prefill; direct creation asks for
   customer and lines.
2. Enter/confirm order reference and date.
3. For scheduled lines, select a compatible session; the UI shows remaining
   capacity. Add additional course lines when needed.
4. Save draft. One atomic transaction creates the header and all valid lines.

**Result:** a Sales-owned draft order links upstream evidence and displays its
completeness checklist. A failed line does not leave a partial order.

## 5. Sales-to-Operations handoff

### J8 — Endorse an order

**Actor:** Sales owner/coordinator responsibility. **Start:** My Work or order.

1. Review the visible completeness checklist.
2. Correct missing owner/customer/reference/lines/price/session facts in context.
3. Select **Endorse to Operations** and confirm.

**System transaction:** locks the order, repeats completeness and scope checks,
stamps endorser/time, changes lifecycle/responsibility, and writes audit evidence.

**Result:** Operations sees it in My Work immediately. Sales sees “Waiting for
Operations acceptance”; there is no notification record to become inconsistent.

### J9 — Accept or return an order

**Actor:** Operations. **Start:** My Work → Pending handoffs.

1. Open the order and review customer, session lines, participants needed, and
   external references.
2. Select **Accept**; or select **Return**, enter a mandatory actionable reason,
   and confirm.

**Result if accepted:** responsibility becomes Operations; acceptance actor/time
are visible to both teams. **Result if returned:** responsibility returns to the
Sales owner, the reason appears at the top of the order, and it enters Sales My
Work. Re-endorsement repeats validation and preserves the audit history.

## 6. Training fulfilment

### J10 — Prepare upcoming training

**Actor:** Operations. **Start:** My Work or Calendar.

1. Review upcoming sessions grouped only by actionable reason: missing trainer,
   missing venue, resource conflict, capacity/roster issue, or pending handoff.
2. Open the session and correct the resource or open the related order.
3. Confirm the session when no blocking conditions remain.

**Result:** My Work shrinks because its query no longer finds the condition; no
task is separately closed. Calendar remains the schedule source of truth.

### J11 — Manage roster and attendance

**Actor:** Operations. **Start:** Session record → Roster.

1. Add participants individually using minimum name/contact and optional sponsoring
   order line; duplicates and capacity are checked before commit.
2. Before or during delivery, correct a participant by editing safe fields or
   soft-removing with a reason.
3. After delivery, record Present/Absent using an efficient roster control.

**Result:** active count and remaining capacity update transactionally. Removed
participants and attendance history remain auditable. Assessment/certificate
steps appear only if the product owner approves them.

### J12 — Complete a session

**Actor:** Operations. **Start:** Session record.

1. Select **Complete session**.
2. Review blockers such as active participants without attendance or unresolved
   operational facts.
3. Correct them or confirm completion.

**System transaction:** locks the session, rechecks close conditions, stamps
completion, and prevents ordinary edits to the terminal record.

**Result:** training history appears on Customer 360 and delivered-revenue
indicators update from source records.

## 7. Customer management

### J13 — Use Customer 360

**Actor:** Sales (write), Operations/Manager/Auditor (policy-scoped read).
**Start:** Customers or a linked inquiry/quote/order/session participant.

1. Search and open the customer.
2. See customer details and contacts first, followed by one chronological or
   clearly sectioned view of inquiries, quotes, orders, and training history.
3. Sales edits details/adds a contact; other roles see only authorized controls
   and fields.

**Result:** users do not choose between client and organization books. New
commercial work starts with this customer ID and avoids duplicate entry.

## 8. Management and audit

### J14 — Management oversight

**Actor:** Manager. **Start:** Overview.

1. Set a bounded date range and, if authorized, owner/team.
2. Review concise pipeline, orders, upcoming training, revenue/receivable, and
   operational-risk indicators.
3. Select an indicator to open the filtered Sales or Calendar view, then a record.

**Result:** source records explain every number. No write controls, custom
dashboard, or report-building surface is available.

### J15 — Reconstruct a material change

**Actor:** Auditor or Administrator. **Start:** a record's audit section or
Overview → Audit activity.

1. Filter by date, actor, action, or entity identifier.
2. Review material field changes and mandatory reasons.
3. Export the bounded result if required.

**Result:** the auditor can reconstruct handoff, cancellation, participant
removal, financial correction, and access changes without gaining write access
or exposure to unrelated secret/PII payloads.

## 9. Recovery and exception behavior

| Exception | User-visible recovery | Integrity behavior |
|---|---|---|
| Possible duplicate customer | Select existing record or explicitly confirm permitted create | Database uniqueness/normalized check remains authoritative |
| Trainer/venue overlap | Choose another resource/time in same session drawer | Confirmation transaction rejects race |
| Capacity exceeded | Reduce seats, choose another session, or increase capacity if venue permits | Transaction rejects overbooking |
| Incomplete order | Checklist links to missing fields | Endorsement revalidates under lock |
| Returned order | Reason pinned; Sales edits and re-endorses | Prior return/endorsement facts retained in audit |
| Wrong participant | Soft-remove with reason, then add corrected record | Attendance/history not hard-deleted |
| Concurrent edit | Reload current version and reapply deliberate changes | Optimistic version/timestamp rejects lost update |
| Unauthorized deep link/API call | Clear access-denied response, no partial data | RLS/function role checks deny at database |

## 10. Acceptance measures

- Operations creates and confirms a conflict-free session from Calendar in no
  more than five meaningful steps.
- Sales captures a lead and creates a linked order without re-entering customer,
  course, or accepted quote lines.
- Endorse/accept/return always identifies actor, time, responsibility, and reason
  where applicable, and cannot partially commit.
- Customer 360 shows the authoritative cross-workflow history.
- Management can answer pipeline/orders/upcoming training/revenue/risk questions
  from Overview and one drill-through.
- Direct PostgREST/RPC tests prove that UI bypass does not expand authority.
- No version 1 journey depends on legacy redirects, compatibility columns,
  duplicated report/task state, or an excluded feature.
