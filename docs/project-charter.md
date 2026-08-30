# TÜV Rheinland Academy PH Training Portal — rationale, purpose and objectives

> **v2.5 integration note (2026-08-31):** This charter is preserved as the business-purpose reference from v1. The authoritative target implementation and current rollout status are documented in `PRODUCT.md`, `ARCHITECTURE.md`, and `system-rebuild/00-executive-summary.md`.

A synthesis of what this system is for, why it is built the way it is, and what
it has to achieve to be considered successful. Written 2026-08-14 from the
codebase, the live database, the migration history and the QA audit — not from a
brief. Where something is inference rather than documented fact, it says so.

`CLAUDE.md` explains *how to work on* this repo. This document explains *why the
repo exists*. The two are meant to be read together.

---

## 1. The business it serves

TÜV Rheinland Academy Philippines sells and delivers professional training:
ISO management-system courses (quality, environment, OH&S, information
security), lead-auditor certifications, occupational safety, data privacy,
energy and food safety. Some courses certify an individual and are capacity-
constrained; others are general and admit more people. Delivery is classroom,
online or blended, in training rooms, hotels, client sites or virtually.

Observed scale on the live system (2026 book):

| | |
|---|---|
| Orders | 163 |
| Sessions scheduled | 161 |
| Customers | 28 |
| Revenue represented | ≈ ₱31.1M |
| Salespeople | 7 |
| Trainers | 6 |
| Venues | 5 |

This is a **small-team, high-coordination** business. The data volumes are
modest; the *dependencies* between records are not. A single sold seat touches a
customer, a contact, an order, an order line, a scheduled session, a trainer, a
venue, a participant, an attendance record, a certificate, an invoice and a
revenue line. That coordination load — not transaction volume — is the problem
this portal exists to solve.

The schema carries a `country_t` enum (`PH, SG, MY, ID, VN, TH`), so the design
anticipates the wider APA region even though today's operation is Philippine.

---

## 2. Rationale — why the system exists

### The alternative it replaces

Without this portal the work runs on spreadsheets, email threads, a shared
calendar and someone's memory. That arrangement fails in specific, recurring
ways, and **the schema is essentially a catalogue of those failures**. Each of
the following exists because something went wrong often enough to be worth
modelling:

| Feature in the system | The failure it exists to prevent |
|---|---|
| `duplicate_candidate` + merge workflow | The same order raised twice by two people |
| Endorse / accept / return-for-correction | Sales "handing over" work Operations never actually received |
| `fn_order_completeness` blockers | Incomplete orders reaching delivery |
| Go/No-Go decision + approval trail | Sessions running below viability, or cancelled without authority |
| `min_participants` enforcement | Loss-making runs going ahead by default |
| SLA breach + escalation rules | Records going quiet and being forgotten |
| Trainer/venue conflict detection | Double-booking a person or a room |
| Waitlist, transfers, dispositions | Reschedules and cancellations handled ad hoc |
| `attribution` | Disputes over who gets credit for a sale |
| `audit_log` with reason-gated overrides | "Who changed this, and why?" being unanswerable |
| `sap_order_no` as reference only | Ambiguity about which system is the financial record |

That last one is worth stating plainly: **this portal is not the finance system**.
SAP is. The portal holds a SAP reference and deliberately blocks Sales from
editing payment status — a database trigger enforces it. The portal's job is
everything *before and around* the financial record, not the ledger itself.

### The single sentence

> Make one accountable, auditable record of what we are selling, who owns it,
> whether it is ready to deliver, whether it happened, and whether it made money.

---

## 3. Purpose — what it does

The system encodes one value chain end to end:

```
catalogue → calendar / sessions → sales orders → fulfilment
   → attendance & certificates → receivables → reporting
```

**Catalogue.** Courses, categories, fees per modality, pricing rules and
discounts. Master data maintained by Operations.

**Calendar.** The scheduled sessions — the single source of truth for what is
actually on sale. Every role can see it; only Operations and super-admin can
change it. This was made universal deliberately: if the calendar is not shared,
Sales sells against a stale copy.

**Sales.** Inquiries → quotes → orders → line items, each line pointing at a
scheduled session. Ownership is recorded per order so there is always an
accountable person.

**Fulfilment.** A staged pipeline (New → In Communication → For Order Creation →
Endorsed to Ops → SAP Created) with a formal handoff between Sales and
Operations, completeness checks before endorsement, and a return path when the
order is not ready.

**Delivery.** Trainer and venue assignment with conflict detection, capacity and
waitlist handling, a Go/No-Go decision before a session is committed, and
participant rosters.

**Closure.** Attendance, certificates with verification, session close-out with
actuals, feedback and complaints.

**Money and reporting.** Receivables and ageing, session-level profitability,
forecast versus actual, revenue by channel and country, and dashboards scoped to
each role.

---

## 4. Objectives — what "working" means

1. **The calendar is trusted.** Every role sees the same schedule, and nobody
   maintains a private copy.
2. **Every commercial record has an owner.** "Whose is this?" is always
   answerable. *(Not yet met: 24.5% of orders are unowned.)*
3. **Handoffs are explicit and enforced.** Work moves between teams through a
   modelled transition with preconditions, not an email. *(Mechanism built;
   the owner precondition is not yet enforced.)*
4. **People see what their job requires and no more** — enforced in the
   database, not the interface.
5. **Every consequential change is attributable.** Who, what, when, and for
   destructive actions, why.
6. **Exceptions surface themselves.** Stalled orders, unstaffed sessions,
   overdue receivables and SLA breaches appear in a work queue rather than
   waiting to be noticed.
7. **Reporting needs no spreadsheet export.**
8. **The system is preferred over the manual alternative.** The real test: does
   an operations coordinator reach for this or for Excel? *(Unvalidated — no
   employee has yet used it for production work.)*

---

## 5. Architecture, and the reasoning behind it

**Next.js + React, client-rendered, talking directly to Supabase.** No bespoke
API tier. For a team of this size that removes a whole layer to build, secure
and operate.

**The consequence that governs everything else:** the browser holds only the
Supabase **anon key**. Anyone can read that key out of the bundle and call the
database directly. Therefore:

> **Row Level Security and the `SECURITY DEFINER` RPCs are the only real access
> control. The interface is cosmetic.**

This is not a stylistic preference — it is forced by the deployment model, and
it is why `CLAUDE.md` states that a UI-only block over a permissive database
policy is a bug. The audit found exactly one live instance of that class
(commercial margin and trainer day-rates readable by every role despite a gated
tab); it was fixed on 2026-08-14.

Other load-bearing decisions and their rationale:

- **Every schema change is an ordered, idempotent migration.** The project has a
  documented history of drift between repo and live database caused by pasting
  SQL into the dashboard. Migrations plus a parity check are the correction.
- **Workflow rules live in the database, not the client.** `fn_create_order`,
  `fn_endorse_order`, `fn_merge_orders`, `fn_refund_payment` and ~35 others are
  `SECURITY DEFINER` functions that enforce their own authority. A rule in the
  browser is advice; a rule in the database is a rule. Note the corollary,
  discovered during the audit: *the RPC allowlist, not the RLS policy, is the
  real gate for order creation* — reading `pg_policies` alone gives the wrong
  answer.
- **Graceful degradation on missing columns.** Mutations catch Postgres `42703`
  and retry without newer fields, so the deployed app works whether or not the
  latest migration has been applied.
- **Consolidated information architecture.** Thirteen legacy routes were folded
  into four hubs (My Work, Calendar, CRM, Analytics) so each role sees 4–6
  destinations, with every old URL preserved as a redirect.
- **Shared components over duplicated ones.** Where the same concept appeared
  twice it drifted — the calendar's session drawer fell behind the session page,
  and owner assignment existed only in the queue. Both are now single
  implementations rendered in two places.

---

## 6. Roles

Eight roles: `super_admin`, `operations`, `business_owner`, `sales`,
`coordinator`, `sales_manager`, `management`, `auditor`.

Authority is layered: operations and super-admin own delivery and master data;
sales and coordinator create commercial records; sales managers supervise a team
and may also sell; business owner and management oversee and approve; auditor
reads the record. Role delegation is **downward only** — nobody can grant
authority they do not themselves hold — and is enforced by a database matrix
with self-promotion, cross-team and oversight-role protections.

**There is deliberately no trainer login.** Trainers are a managed resource, not
users. This is the largest structural gap between the software and the business
process: every trainer interaction — assignment, availability, attendance — is
performed by Operations on their behalf. It is a legitimate simplification for
today's scale and an open strategic question for tomorrow's.

---

## 7. Constraints to design within

1. **Production is the only database.** By owner decision (2026-08-14) no
   staging project will be created. Every migration is a production change on
   first application, and no destructive automated test can ever run. Mitigation:
   validate each migration against a throwaway PostgreSQL first, keep signed-in
   automation read-only, and treat the RLS regression suite — which builds its
   own disposable database — as the home for write-path testing.
2. **The browser cannot create accounts.** The anon key cannot call the Auth
   admin API, so a person signs in once and is then granted a role and team.
3. **The portal is not the financial system of record.** SAP is.
4. **Small team, high coordination.** Optimise for fewer steps and clearer
   ownership, not for throughput.

---

## 8. Where it stands

Production readiness **75/100** (target 85). The engineering foundation is
sound: referential integrity is clean across every foreign-key path, all 30
reporting views enforce RLS, production dependencies carry no known
vulnerabilities, and the static, unit, browser and RLS suites all pass.

What is not yet ready is **not mostly code**:

- A quarter of orders have no owner.
- Six live sessions have no trainer.
- Five of seven salespeople cannot log in.
- The team structure is a single flat team with one supervisor.
- No employee has yet used the system for real work.

The last point is the important one. Every usability finding in the audit was
inferred from structure, because no signed-in session was available to observe.
**The next meaningful validation is a controlled pilot, not another engineering
sprint.**

---

## 9. Open strategic questions

1. **Do trainers become users?** Determines whether this is the system of record
   or a thing Operations maintains alongside email.
2. **Is maximum capacity a property of the course or of the session?** Two
   migrations are written; exactly one should be applied.
3. **What is the real team structure?** One flat team makes the delegation model
   trivial by shape.
4. **Who may see margin?** Answered 2026-08-14 — super-admin, operations,
   business owner, management, auditor; deliberately excluding order intake.
5. **Where does operational error visibility live?** Telemetry is implemented
   but points nowhere, so production failures are currently unobserved.
