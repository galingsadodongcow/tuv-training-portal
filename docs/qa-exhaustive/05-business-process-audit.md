# 05 — Business process audit

## Map: Sales → Operations → Delivery → Completion → Reporting

| Stage | Owner | Trigger | System state | Handoff artefact | Failure point |
|---|---|---|---|---|---|
| Lead / inquiry | sales | inbound | `inquiry` (Received…Awaiting Feedback) | — | stalls silently |
| Qualify | sales | contact made | inquiry status | — | no next-action field |
| Quote | sales | requirement agreed | `quote` + `quote_line` | quote total | quote→order conversion is manual |
| Order | sales / coordinator | acceptance | `orders` + `order_line` (`fn_create_order`) | order_id | **may have no owner (40/163)** |
| Endorse | sales / coordinator | order complete | `fn_endorse_order` + completeness | endorsement | **completeness does not require an owner** |
| Accept | operations | endorsement | `fn_accept_endorsement` | stage → SAP Created | return-for-correction loops |
| Schedule | operations | accepted | `schedule` + `order_line.schedule_id` | session | 6 live sessions unstaffed |
| Deliver | operations (trainer offline) | session date | attendance, `participant` | roster | trainers have no login |
| Close | operations | delivered | `CloseSession`, actuals | completion | — |
| Certify | operations | completion | certificate + `fn_verify_certificate` | certificate | — |
| Report | management / BO | ongoing | views + `fn_dashboard_metrics` | dashboards | **P&L readable by all (P0-1)** |

## Findings

**BP-1 (P1) — an order can be endorsed with no owner.**
`fn_order_completeness` checks the record but not `order_assignment`. With 40
unowned orders live, ops can receive work with no accountable counterpart.
*Fix:* add an owner check to the completeness blockers.
*Acceptance:* endorsing an unowned order returns a blocker, not a success.

**BP-2 (P2) — quote → order conversion is manual.** `quote_line` gained a
course FK (`20260812310000`) but there is no "convert quote to order" action;
the data is re-entered in Sales entry.
*Fix:* a convert action seeding `fn_create_order` from quote lines.
*Impact:* removes a full re-entry of every line.

**BP-3 (P2) — inquiry has no next-action / follow-up date.** Pipeline stalls are
detected only by age. A `next_action_at` field would make the Pipeline tab
actionable rather than a list.

**BP-4 (P2) — delivery depends on an offline actor.** Trainers cannot see
assignments, confirm availability or take attendance. Every trainer interaction
is Operations doing data entry on their behalf. This is the biggest structural
gap between the system and the real business process.

**BP-5 (P3) — no explicit "source of truth" for customer contact data** between
`client`, `contact` and `organization`. Customer 360 stitches them, but two
screens can write the same fact.

## Cross-function handoff assessment

| Handoff | Ownership clear? | Enforced? | Signalled? |
|---|---|---|---|
| Sales → Operations | ⚠️ only when an owner exists | partial — completeness runs, owner not required | ✅ endorsement + notification |
| Operations → Trainer | ❌ no system handoff | ❌ | ❌ offline |
| Operations → Finance | ⚠️ via AR views | n/a | partial |
| Session → Reporting | ✅ | ✅ | ✅ |

Handoffs that the software performs are well modelled — endorsement is
reason-gated, audited and reversible. The weakness is the **preconditions**
(owner) and the **actors outside the system** (trainers).
