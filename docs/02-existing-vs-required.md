# Existing Academy Portal versus replacement requirements

## 1. Method

`KEEP` means the business outcome and core safeguard remain. `SIMPLIFY` means the
outcome remains with fewer states/tables/screens. `MERGE` means it moves into a
parent workflow. `REMOVE` means it is not in replacement version 1. `DEFER` means
there is plausible value but insufficient approved evidence for launch.

Current counts were established from the repository: 8 roles; 43 authenticated
route files plus login/root; 30 current screen routes and 13 legacy redirects;
36 screen components; 52 RLS-enabled public tables reported by live QA; roughly
40 privileged workflow functions; 30 reporting views; 66 migrations at the QA
baseline (69 now present); four CI workflows; and many overlapping status/health
vocabularies. These are comparison evidence, not reduction targets by themselves.

## 2. Feature disposition

| Current feature or design | Decision | Replacement | Reason |
|---|---|---|---|
| Supabase Auth + browser client | KEEP | Same principle | Appropriate for a small internal app |
| PostgreSQL foreign keys/constraints | KEEP | Clean single schema | Proven integrity safeguard |
| RLS as authority | KEEP | Deny-by-default per table/scope | Critical security invariant |
| Next.js, React, TypeScript | KEEP | Current supported versions | No business reason to change |
| TanStack Query | KEEP | Domain-local query modules | Useful server-state cache; no added state library |
| Playwright + Vitest | KEEP | Risk-focused tests | Appropriate stack |
| Recharts | REMOVE | CSS/HTML KPI summaries; add chart only if proven | Management needs indicators, not chart infrastructure |
| Eight roles | SIMPLIFY | Five roles plus team/approval capabilities | Coordinator/manager variants mainly express scope or responsibility |
| 21 historical nav destinations / current role slices | SIMPLIFY | My Work, Calendar, Sales, Customers, Administration; Overview only for oversight | Workflow-first navigation |
| My Work and Worklist queues | MERGE | One focused role-specific action list | Removes overlapping queues/dashboard behavior |
| Dashboard / Overview | MERGE | Compact Overview for Manager/Auditor; My Work for actors | Avoid dashboard overload |
| Calendar | KEEP | Primary Operations workspace | High-frequency scheduling requirement |
| Session create/edit/detail | SIMPLIFY | Calendar drawer for create/edit; one session record route | Fewer route transitions; detail retained for roster |
| Multi-segment date editor | REMOVE | One start/end interval | No approved v1 need |
| Recurring sessions | REMOVE | None | Explicit freeze rule |
| Trainer and venue conflict checks | KEEP | Query warning + database constraint/transaction check | Prevents operational failure |
| Course catalogue | MERGE | Administration → Training catalogue | Low-frequency configuration |
| Category and subcategory tables | SIMPLIFY | One self-referencing category table | Same hierarchy, less schema/UI |
| Course fees and discount rules | SIMPLIFY | Course prices by learning type | Standard pricing required; rule engine is not |
| Trainers, qualifications, venues | KEEP | Administration lists, selectable in Calendar | Required resource setup |
| Trainer availability/blackouts/co-trainers | DEFER | None initially | Conflict checking covers proved v1 need |
| Resources top-level route | MERGE | Administration; assignment in Calendar | Entity is not a primary workspace |
| Inquiries screen / pipeline | MERGE | Sales → Pipeline view | One commercial workspace |
| Quotations list/detail | MERGE | Sales views + quote record route | Quotes belong to sales workflow |
| Orders list/worklist/detail | MERGE | Sales views + order record route | Removes duplicate queue representations |
| Sales Entry separate module | MERGE | Sales order create flow | Creation is an action, not navigation |
| Quote-to-order | KEEP | Atomic copy of accepted quote lines | Removes confirmed duplicate entry |
| Order assignments and assignment logs | SIMPLIFY | Mandatory `sales_owner_id`; audit event on reassignment | One owner is sufficient for v1 |
| Fulfilment-stage + lifecycle + handoff status | SIMPLIFY | One small order lifecycle plus endorsement/accept/return facts | Eliminates three competing status systems |
| Order completeness RPC | KEEP | Queryable validator inside endorsement transaction | Critical handoff safeguard |
| Endorse / accept / return RPCs | KEEP | Three explicit transactions | Privileged atomic business seam |
| Handoff notifications | REMOVE | My Work is derived from responsibility | Avoid notification subsystem; no silent queue |
| Customer list/detail | KEEP | Customers + Customer 360 | Authoritative customer record |
| Client and organization books | SIMPLIFY | One customer entity | Existing organization layer duplicates the business concept |
| Contacts | KEEP | Nested in customer | Required customer information |
| Global search / search route/RPC | REMOVE | Search within Customers, Sales, Calendar | No separate search module; keeps queries scoped |
| Duplicate candidates/merge screen | SIMPLIFY | Create-time dedupe check; admin repair when needed | Prevention before a parallel workflow |
| Participants / roster / attendance | KEEP | Session record | Core fulfilment outcome |
| Participant transfer/removal RPCs | SIMPLIFY | Soft-remove initially; transfer deferred | Preserve history without a workflow engine |
| Waitlist + SLA auto-promotion | REMOVE | Capacity blocks with explicit correction | Automation not required for v1 |
| Assessments and certificates | DEFER | Await owner decision | Potentially essential, not proven in supplied core purpose |
| Session close transaction | KEEP | One guarded completion operation | Prevents incomplete close and post-close mutation |
| Session cancellation approvals | DEFER | Focused action if owner confirms | Generic approval engine rejected |
| Approval module/table | REMOVE | Explicit capability on the relevant transaction | Only entity-specific approvals are justified |
| Payments and receivables | DEFER | Minimal append-only reference ledger if confirmed | Scope says “where required”; authority unresolved |
| Invoice/refund/credit-note suite | REMOVE | External finance system; audited correction only if retained | Avoid ERP expansion |
| Trainer rates/session profitability | DEFER | Restricted optional fields/view | Sensitive and not a core operational requirement |
| Reports, Analytics, Financial | MERGE | Compact Overview and filters in Sales/Calendar | Operational reporting stays near workflows |
| Country/forecast/funnel/NPS/profit views | REMOVE | Only approved summary queries | Avoid embedded BI and derived schema |
| Feedback, quality, complaints | REMOVE | External/manual process for v1 | Not in approved workflow spine |
| Data Quality screen | REMOVE | Constraints and administrator correction | Data integrity is not a daily module |
| Audit log | KEEP | Narrow immutable audit events + auditor view | Required governance control |
| Saved views/defaults | REMOVE | Fixed useful defaults | Explicitly excluded; avoids preference table |
| Command palette/recent search | REMOVE | Direct navigation and contextual search | Explicitly excluded |
| Notification center/tasks/SLA policies | REMOVE | Derived My Work queries | No duplicate state or background automation |
| Communications/templates/log | REMOVE | None in v1 | No approved integration or delivery contract |
| Attachments | DEFER | External document links only if required | Storage and authorization cost not justified |
| E-learning provisioning | REMOVE | Sell as unscheduled type only if confirmed | Portal is not an LMS |
| Annual rollover/calendar year | REMOVE | Date filters; no year-copy workflow | Dates do not require duplicated configuration |
| Legacy redirects | REMOVE | Clean routes only | Replacement has no compatibility architecture |
| Fallbacks for missing columns | REMOVE | One current schema | Drift accommodation is contrary to clean build |
| Central `src/hooks/data.ts` | REMOVE | Feature-owned query/mutation files | Current 1,600-line shared layer loads unrelated domains |
| Shared record/panel abstractions | SIMPLIFY | Only proven reusable UI primitives | Avoid abstraction after one use |
| Edge functions and pg_cron | REMOVE | No background jobs in v1 | No approved requirement |
| Four GitHub Actions workflows | SIMPLIFY | App quality and controlled DB migration/RLS checks | Reduce duplication while preserving gates |
| Large audit/review/manual document tree | REMOVE from replacement | Five planning docs now; later four durable docs | Historical evidence should be archived, not continued |

## 3. Route disposition

### Retained concepts

- `/my-work`
- `/calendar` and `/calendar/sessions/[id]`
- `/sales`, `/sales/orders/[id]`, `/sales/quotes/[id]`
- `/customers` and `/customers/[id]`
- `/administration`
- `/overview`
- `/login` and the role-aware root redirect

### Removed or folded current destinations

`/dashboard`, `/home`, `/operations-today`, `/worklist`, `/crm`, `/inquiries`,
`/quotations`, `/orders`, `/sales-entry`, `/clients`, `/organizations`,
`/training`, `/courses`, `/course/*`, `/resources`, `/analytics`, `/reports`,
`/quality`, `/data-quality`, `/financial`, `/team`, `/approvals`, `/complaints`,
`/duplicates`, `/pricing`, `/communications`, `/rollover`, `/audit`, `/search`,
and `/elearning` are not preserved as compatibility routes. Their approved
outcomes are either merged above or removed by the feature table.

## 4. Quantitative comparison

| Measure | Current evidence | Recommended replacement v1 | Interpretation |
|---|---:|---:|---|
| Primary navigation destinations | Up to 21 historically; 4–10 in current role slices | 5 regular; Overview substitutes My Work for read-only roles | Stable workflow vocabulary |
| Authenticated business routes | 43 files / 30 screen routes | 12 | Includes record routes, not legacy redirects |
| User roles | 8 | 5 | Scope/capabilities cover team lead and approvals |
| Public business tables | 52 | 18 | No report/preference/automation tables |
| Reporting views | 30 | 0 required persisted views | Prefer RLS-safe queries; add only measured SQL views |
| Privileged business RPCs | ~40 | 5 maximum | Only atomic/privileged operations |
| Feature dependencies | 6 production dependencies | 5 initially | Remove Recharts; keep existing core stack |
| CI workflows | 4 | 2 target | Quality plus controlled migration/security |
| Status vocabularies | 19+ | 6 lifecycle vocabularies + shared attention | No overlapping order health/stage/handoff pills |

Counts are architectural budgets, not reasons to omit a confirmed safeguard.
