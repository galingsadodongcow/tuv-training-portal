# Migration log

This is the definitive capability migration record. The architectural target is always v2; v1 is a source of business outcomes and sample patterns only.

| Old capability/location | New capability/location | Architectural/behavioral change | Data migration | Verification | Status |
|---|---|---|---|---|---|
| Calendar/session schedules | `sessions` + `session_schedule_blocks`; `/training` | Session is aggregate; blocks reserve dated resources and eliminate false overnight occupancy | Existing session envelopes backfilled into daily blocks | Migration integrity + build/unit tests | Migrated/improved |
| Public/private course runs | `sessions.offering_type`, publication controls | One delivery aggregate supports public, private and internal offerings | Existing order-created sessions classified private; 3 safe public samples | Production queries; role-scoped RLS | Migrated/improved |
| Trainer availability | `trainer_unavailability`; `/administration` | Explicit blackout records enforced in the same scheduling transaction | None; safe empty operational table | Supabase constraints/RLS; build | Migrated/improved |
| Venue/room booking | `venue_rooms`, block `room_id`; `/administration` | Venue contains bookable rooms; room and venue capacity/overlap enforced | 3 sample rooms derived from v1-like venues | Production integrity; advisor review | Migrated/improved |
| Minimum pax / session review | course/session minimum + `go_status` | v1 default 8 becomes configurable; Go required before open/start; No-Go closes atomically | Existing sessions get `min(capacity, course default)`; ESG sample default 10 | Constraints + sample scenarios | Migrated/improved |
| Sellable schedules | quote/order line `delivery_intent` + `session_id` | Sales may reserve a published public session, request private delivery or leave assignment to Operations | Existing private links backfilled | Trigger validation + production migration | Migrated/improved |
| Seat/capacity commitment | `session_reservations` | Commercial commitments exist before named roster; named allocation does not double count | Existing private order headcount backfilled into reservation | Reservation integrity query; unit rule test | Migrated/improved |
| Waitlist/transfer | reservation-aware participant RPCs | Transfers move reservation quantity; releases rebalance FIFO and promote named waitlist | Existing private participants linked to order line | Unit + production schema checks | Migrated/improved |
| Sales→Operations endorsement | `orders.operations_target_id` | Sales chooses an active named recipient; only target/Admin accepts/returns | Pending samples assigned first active Operations user | RLS/RPC checks; UI build | Migrated/improved |
| Order cancellation/completion | centralized transition functions | Cancellation releases seats/cancels linked names/promotes waitlist; final linked session completes order | No destructive rewrite | Transaction migration + integrity checks | Migrated/improved |
| Mobile shell | `AppShell` mobile navigation | Authorized links remain reachable below 980px | None | Lint/typecheck/build | Migrated/improved |
| Audit log UI | `/audit`, audit query module | Immutable search/filter/detail workspace; Admin/Auditor only | Uses existing `audit_events`; new resource changes audited | Permission unit test + zero v2 security advisories | Migrated/improved |
| Calendar filtering | `DeliveryCalendar` | Block-based month/week/list display with course/category/trainer/venue/status/offering filters | None | Unit calendar tests + build | Migrated/improved |
| Roster import | allocation/customer-aware CSV flow | Public sessions can allocate names to reservations or an active direct customer | No bulk historical import | Existing CSV tests + typecheck | Improved core; job ledger remains |
| Session export | `/api/exports/sessions` | Adds offering, publication, Go/No-Go, minimum, confirmed and waitlisted seats | None | CSV unit coverage + build | Improved |
| Legacy roles | five roles + Sales Supervisor scope | Overlapping v1 roles merged into capabilities | Existing role swaps preserved | Permission tests | Migrated/improved |
| Communications | none | Deliberately held; no email/reminder jobs added | None | Repository/migration review | Intentionally excluded |
| Finance ledger | none; SAP reference boundary | Editable v1 finance model not copied | None | Architecture review | Replaced/deferred |

## Rollout record

- Local migration file: `20260830195609_v2_5_integrated_rollout.sql`.
- Live migration version: `20260830202610`.
- Live security advisor findings for `academy_v2`: zero.
- Sample data is synthetic and clearly marked; no real participant contact data was imported from v1.
