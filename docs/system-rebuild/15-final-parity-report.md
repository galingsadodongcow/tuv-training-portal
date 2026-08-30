# Parity report — v2.5 convergence rollout

**Status:** recommended v1/v2 convergence rollout implemented; broader legacy parity remains explicitly tracked.

## Domain status

| Domain | Migrated/improved | Still partial | Intentionally replaced/deferred |
|---|---|---|---|
| Identity/access | SSR auth, five roles + supervisor scope, forced RLS, role preview, responsive nav | Authenticated E2E fixtures | Eight overlapping roles merged |
| Catalogue/resources | Categories, courses, prices, qualifications, trainers, availability, venues, rooms | Advanced course/trainer evidence and hybrid metadata | Separate subcategory/entity duplication removed |
| CRM/commercial | Customers, contacts, inquiries, quotes, approval, delivery intent, reservations, named handoff, cancellation | Inquiry Won/Lost, quote expiry/proposal, activity timeline | Duplicate client/organization/opportunity concepts merged |
| Scheduling | Public/private/internal offerings, blocks, conflicts, rooms, blackouts, month/week/list calendar and filters | Day view, recurrence, drag/drop | Legacy giant calendar/global hook not copied |
| Participants | Reservation allocation, direct registration, waitlist, transfer, cancellation, attendance and assessment | Import job ledger and richer history | Double-counted commercial/named capacity prevented |
| Certificates | Eligibility, issue, revoke, PDF/register/export | Public verification and correction/reissue | — |
| Audit/reporting | Role reports, immutable events, Administrator/Auditor audit workspace | Shared pagination/export/metric dictionary | Vanity/duplicate reporting views not copied |
| Mobile | Authorized navigation, responsive forms/cards/tables/calendar | Credentialed role UAT evidence | Desktop-only shell removed |
| Security | Schema isolation, private definers, forced RLS, zero v2 security findings | Authenticated/concurrency regression automation | Legacy public-schema architecture rejected |
| Communications | — | All automated triggers/reminders | Explicitly held |
| Finance/integrations | — | SAP read projection, LMS, files | Editable portal ledger deferred/replaced |

## Acceptance status

| Criterion | Status | Evidence |
|---|---|---|
| Important legacy functionality inventoried | Complete assessment | `02-academy-portal-inventory.md` |
| Roles analyzed | Complete baseline | `03-role-permission-matrix.md` |
| Entities/relationships mapped | Updated | `04-domain-model.md` plus v2.5 migration |
| Old-vs-new matrix | Updated | `06-feature-gap-analysis.md` |
| Recommended convergence rebuilt | Complete | UI/features + live migration `20260830202610` |
| Legacy architecture not copied | Met | One 21-table v2 schema; legacy remains non-authoritative |
| Permissions server-enforced | Strong | RLS/private helper pattern; zero v2 security advisories |
| Scheduling conflicts safe | Met for implemented model | Qualification, blackout, venue/room/capacity and overlap validation with locks |
| Critical pure rules tested | Met | 30/30 unit assertions |
| Authenticated role journeys automated | Open | GAP-005 |
| Mobile implementation | Implemented; UAT open | Responsive shell/build; GAP-010 |
| No silent legacy loss | Met | Every capability has a disposition |
| Communication automation held | Met | No reminder/email implementation added |

## Production verification

- Migration applied successfully to `ruwuqzwtwngpcauzbrqj`.
- 0 invalid minimum/capacity rows.
- 0 invalid reservation balance rows.
- 0 `academy_v2` security-advisor findings.
- Lint passed.
- Type-check passed.
- Tests: 9 files, 30 assertions passed.
- Vinext production build passed.

## Final disposition

- **Migrated/improved now:** mobile shell, audit UI, trainer availability, venue rooms, block scheduling, public inventory, delivery intent, reservations, Go/No-Go, named handoff, cancellation/completion side effects and sample scenarios.
- **Keep but redesign next:** authenticated E2E, CRM end states, shared list/search, customer activities, import jobs, certificate verification and quality workflows.
- **Replaced/deprecated:** legacy public-schema/global-hook architecture, duplicate role/entity models and editable local finance assumption.
- **Do not migrate now:** automated communication/email reminders.
