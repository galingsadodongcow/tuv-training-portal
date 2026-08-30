# Security review

## Executive assessment

The `academy_v2` boundary is a substantial improvement over the legacy architecture. All 21 v2 tables have RLS enabled and forced; anonymous table and RPC access is revoked; public RPC wrappers are security-invoker; private security-definer functions use an empty search path and role/state checks. After the v2.5 production migration, the live Supabase security advisor reported **zero findings for `academy_v2`** on 2026-08-31.

The new room, blackout, block and reservation tables follow the same forced-RLS model. Conflict and capacity decisions use private transactional helpers, row locks and transaction-scoped advisory locks. Public session visibility includes legitimate published/closed inventory and record-linked commercial access; draft inventory remains Operations/Admin scoped.

The retained legacy `public` schema reported 44 findings: one RLS-info item and 43 authenticated-executable security-definer functions. These are not v2 vulnerabilities, but they are project-level attack surface while the legacy Data API remains exposed.

## Threat review

| Area | Evidence | Risk | Recommendation |
|---|---|---|---|
| Authentication | SSR cookie refresh; `getClaims()`; profile active check | Low; recovery/email operations depend on Supabase configuration | Add auth E2E, rate/error telemetry and admin-controlled user onboarding. |
| Route protection | Server pages redirect based on profile/capability | UI-safe, but route tests absent | Add direct-URL tests for every role. |
| API authorization | PDF/CSV/server actions use server profile + RLS | Good pattern; verify every handler repeats it | Add handler permission tests and audit sensitive export. |
| Database authorization | Explicit grants + forced RLS; role/owner helpers | Strong current boundary | Keep helper search path empty; test denied cases on every new table/RPC. |
| Role escalation | Admin-only profile update policy; supervisor constrained to Sales | Low in v2; admin self-demotion/last-admin policy unclear | Prevent removal of final active Administrator; require audit reason for privilege changes. |
| Function escalation | V2 invoker wrappers/private definers; legacy public definers exposed | High project-level legacy surface | Inventory every public definer; revoke/retire with legacy shutdown plan after usage verification. |
| IDOR | RLS scopes record reads; dynamic detail routes query through Supabase | Good but untested across all IDs/exports | Add cross-owner ID tests and nonexistent-ID behavior. |
| Input validation | TS validation + DB checks/FKs/status functions | Good for implemented forms | Normalize Unicode/whitespace and bound all free text/file sizes. |
| SQL injection | Supabase query builder/RPC parameters; no string-built SQL in app | Low | Keep dynamic filters allow-listed. |
| XSS | React escaping; user text rendered normally | Low; CSV and future rich text/files are edges | Never render user HTML; retain CSV formula escaping. |
| CSRF | Same-site SSR auth and Next server actions | Moderate until deployment cookie/origin behavior is tested | Verify origin checks, SameSite/Secure cookie behavior and state-changing route-handler methods. |
| Sensitive data | Participant contact masking for Manager/Auditor | Good; PDF/export privacy needs explicit tests | Apply least-field queries, audit exports and define retention. |
| Secrets | Only public Supabase config in app; no service role | Strong | Keep service role out of browser/app runtime; admin user creation uses a separate protected server secret if added. |
| Audit | Append-only table; material functions write events | Partial coverage | Add catalogue/customer/resource edit audit and audit-read UI. |
| Files | No storage currently | No present upload risk | Before files: MIME/size allow-list, malware scan, signed URLs, ownership, retention and legal hold. |
| Logging | Safe user messages, no documented correlation/monitoring | Diagnosis gap | Structured logs with request ID; redact tokens, emails/phones and raw form bodies. |
| Availability/abuse | No documented pagination/rate limits | Broad queries can grow; login/reset provider limits external | Keyset pagination, bounded exports/imports, timeouts and job limits. |

## RLS and function observations

- All v2 role helpers use `(select auth.uid())`/wrapped helper patterns suited to per-statement initialization.
- Manager/Auditor can see participant outcome evidence, but contact, phone, employee reference and certificate notes are returned as null by `list_participants()` unless the caller manages delivery/sales scope.
- Direct `SELECT` on `participants` was revoked from authenticated after the masked function was introduced.
- V2 has no views, avoiding default view-owner bypass. Any future exposed view must be security-invoker.
- The v2 performance advisor only reports unused indexes. With 1 session/6 participants, this is not enough evidence to drop integrity/foreign-key indexes.

## Security acceptance tests required

1. Anonymous cannot read any v2 table or execute any v2 RPC.
2. Authenticated user without active profile sees zero business rows and cannot mutate.
3. Sales cannot read another owner’s inquiry/quote/order; Supervisor can read allowed team scope.
4. Operations cannot see pre-handoff commercial records.
5. Manager/Auditor cannot see masked participant contact fields.
6. Auditor cannot mutate any record; can read audit events.
7. Operations cannot revoke a certificate; Administrator can with reason.
8. Direct status updates fail; only transition functions work.
9. Cross-customer contact IDs and cross-order-line session IDs fail.
10. Concurrent registration, rescheduling and quote conversion preserve invariants.

## Legacy containment plan

Do not revoke legacy grants blindly while the legacy site is active. First capture RPC/table usage, map each caller, run role regression tests, then retire routes/functions in batches. The end state should remove `public` from the Academy v2 Data API surface or revoke all legacy grants after a signed decommission decision.

Advisor references: [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), [database linter remediation](https://supabase.com/docs/guides/database/database-linter), and [2026 Data API grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
