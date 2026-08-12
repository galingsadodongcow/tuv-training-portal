# Implementation Roadmap (Parts 46, 51, 52)

Reassessed **after** the Phase 1–4 work — not a continuation of the old numbering. The sequence is driven by dependency, not by ease: the role model and handoff/ownership architecture come first because most of the remaining backlog composes off them. IDs reference `15-prioritized-backlog.md`; decisions reference `14-product-decisions.md`.

## Sequencing principle

> **Decide → own → consolidate → surface → deepen → automate → polish.**
> You cannot design a role-shaped My Work until the roles exist; you cannot build the accept/return handoff until intake ownership is decided; you cannot build Customer 360 until the customer model is decided. So the order is fixed by dependencies, and the two cheapest-highest-value bug fixes (B01, B02) plus the `send-comms` decision jump the queue as a "Phase 0".

## Phase 0 — Immediate (days, no decisions needed)

Small, safe, high-value; ship before the decision session.

| Item | Why now |
|---|---|
| **B01** Fix Duplicates↔merge permission mismatch | A live RLS wall for sales users; pure permission fix |
| **B02** Route all "at-risk session" surfaces through `v_session_health` | Surfaces currently contradict each other; low-risk FE |
| **STAT01** Inquiry/quote health badges | Cheap; extends the shipped health pattern |
| **TBL01** Column sort + row bulk on Orders | Low-risk table parity with Worklist |
| **Decision only:** should `send-comms` be scheduled? | Reminders queue but never send (`schedule.sql` crons only weekly-digest + nightly-hygiene). One-line cron — but **emailing real customers is a business decision**, so confirm before flipping it. Also wire `fn_notify_sla_breaches` (defined, never called). |

## Phase A — Decisions & role ownership (no code)

Resolve `14-product-decisions.md`, above all **D1 (intake ownership), D2 (endorsement contract), D3 (money authority), D5 (customer model)**. Agree the 8-role model and the ownership contract shape. **Exit criteria:** D1–D8 answered and signed; the permission matrix in `02-role-model-and-permissions.md` ratified. *Nothing below can be built cleanly until this closes.*

## Phase B — Role model, permissions, ownership & handoff architecture

The structural core. Backlog: **R01, R02, RM01, RM02, O01, H01, H02, RET01.**
- New roles (`coordinator`, `auditor`, `management`, `sales_manager`) + RLS policies + Admin grant UI; open intake to Coordinator.
- Owners for sessions and inquiries (`schedule.owner`, `inquiry.owner`, `inquiry.client_id`); ownership contract stored + surfaced (header strip + My Work + right rail).
- The handoff transaction: completeness gate (H01) → Accept/Return (H02) → ownership transfer + SLA start + activity event; universal Return-for-correction (RET01).
- Before/after audit capture (R02) so governance is real from here on.
**Exit criteria:** every transactional record answers Owner/Next/Due/Blocker/Next-owner; Sales→Ops endorsement is a two-sided, gated transaction; each new role is RLS-verified as anon + as itself.

## Phase C — IA consolidation & record standard

Backlog: **IA01, REC01, CUS01, INQ01.**
- Collapse Home + Worklist + Data Quality into **one My Work** (Worklist engine folded in; DataQuality/Duplicates → Exceptions filters); retire the overlap rather than adding to it.
- Standardise OrderDetail + ClientDetail onto the record page (REC01).
- Customer 360 on the agreed customer model (CUS01) + Inquiry detail with convert-to-order (INQ01).
**Exit criteria:** one operational surface; OrderDetail/ClientDetail match SessionDetail; one customer, one page; a lead resolves to its customer and converts in one click.

## Phase D — My Work, role dashboards & Operations command center

Backlog: **DASH01, AN01, OPS01, CAL01, SV01.**
- Role-specific, 100%-drill-through dashboards (DASH01); consolidate Analytics (AN01).
- Operations Today command center from the `v_digest_*` views (OPS01); Calendar week/day + session drawer (CAL01).
- Server-persisted saved views with role defaults (SV01).
**Exit criteria:** each role lands on a surface shaped to its job; every KPI drills through; ops sees today/at-risk/decisions without hopping modules.

## Phase E — Customer depth, payments & money model

Backlog: **PAY01, ROS01, SAL01, WEB01.**
- Refund/void/credit + immutable payments + AR exceptions board (PAY01).
- Roster CSV import + participant soft-delete/transfer/substitute (ROS01).
- `fn_create_order` atomic RPC + quote-line prefill (SAL01); webshop ingestion (WEB01).
**Exit criteria:** money never leaves via a delete; participant history is preserved; order creation is a review step, not re-entry; webshop orders land in a queue, not a keyboard.

## Phase F — Automation, SLA & management intelligence

Backlog: **AUTO01, AUTO02, AUTO03, SRCH01**, and the deferred Phase-4 automation.
- Payment-exception detection (AUTO01); prep/roster/cert tasks (AUTO02); escalation ladder (AUTO03) — each **validated against the live schema** (dry-run → apply via `apply-supabase.yml` → advisor re-check), the discipline the deferred Phase-4 items are waiting for.
- Global search coverage + typo tolerance + recents/preview (SRCH01).
- Management executive cockpit (exception-oriented, drill-through) once `management` role + dashboards exist.
**Exit criteria:** detection and paperwork are automated; judgment stays human; SLA breaches escalate in-app; search finds a customer by email/phone and a participant by name.

## Phase G — Final UI consistency, accessibility & responsive

Backlog: **ADM01, ADM02, BRC01, RPT01, SES01, RLV01, ELN01**, plus the design-system convergence and terminology dictionary in `12-ui-design-system.md`.
- Admin lookups/config console (ADM01) + user invite/deactivate (ADM02); breadcrumbs (BRC01).
- Design-system convergence; remaining accessibility (touch targets, table `scope`, chart tables everywhere); laptop/mobile optimisation for the new surfaces; the terminology dictionary applied to labels and nav.
**Exit criteria:** one design system; WCAG-AA across the new surfaces; config changes without a deploy; consistent action-labelled terminology.

## Dependency graph (condensed)

```
Phase 0 (B01,B02,quick) ─┐
D1,D2,D3,D5 (Phase A) ───┼─► R01,R02,RM01,RM02,O01 (B) ─► IA01,REC01,CUS01,INQ01 (C) ─► DASH01,OPS01,CAL01,SV01 (D)
                         │        └─► H01 ─► H02 ─► RET01 (B)                                   │
                         └────────────────────────────────────────► PAY01,ROS01,SAL01 (E) ─────┘
                                                                     AUTO01-03,SRCH01 (F) ─► UI/a11y/config (G)
```

## What to build first if only two weeks exist

1. **Phase 0** entirely (B01, B02, STAT01, TBL01, the `send-comms` decision).
2. **Run the Phase A decision session** (D1, D2, D3, D5).
3. Start **O01** (owners for sessions/inquiries) and **H01** (endorsement completeness gate) — the two changes that most improve every downstream journey and don't need the full role model to begin.

Everything else is valuable but composes off the roles and the handoff transaction — which is why Phases A and B are non-negotiable predecessors.

---

## Acceptance criteria

Measurable acceptance criteria for every P0 and P1 item are in `15-prioritized-backlog.md` (§"Acceptance criteria for P0/P1"). Each phase's exit criteria above summarise the outcomes; the backlog holds the testable detail (e.g. H02's "the item leaves the sender's queue only on Accept", CUS01's "no data-model change ships without D5 agreed", PAY01's "payments are immutable; AR recomputes from confirmed − refunds + applied credits").
