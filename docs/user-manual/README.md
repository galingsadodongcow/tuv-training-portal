# Academy Portal — Role-Based User Manual Suite

A complete, role-based operating manual for the TÜV Rheinland Academy Philippines training-operations portal, built by simulating the application's real workflows.

## ⚠️ Evidence basis (read first)
The live deployment (`tuv-training-portal.netlify.app`) is **auth-gated** and no login credentials were available, so this suite could **not** be produced by clicking through the authenticated UI. It was instead verified against **ground truth the code and database provide**:
- **Source code** — every screen, form, hook, RPC and role-gate.
- **Live Supabase database** — roles, all status enums, and RLS were queried directly (project `ruwuqzwtwngpcauzbrqj`) and are **VERIFIED**.
- **The team's own QA/UAT record** — `docs/qa`, `docs/final-uat`, `docs/implementation`.

Anything not confirmable that way is marked *(inferred)* or **NOT TESTABLE** and never presented as fact. **Screenshots** use `[OPS-01]`-style placeholders for a credentialed reviewer to capture. One credentialed pass is recommended to confirm exact wording and add images (see the Validation Report).

## Contents
| File | What it is |
|---|---|
| **USER-MANUAL.md** | The main manual — task-organised, per role, with the standard procedure format. |
| **QUICK-START-GUIDE.md** | One-page high-frequency procedures per role. |
| **USER-JOURNEYS.md** | End-to-end journey inventory (Operations, Sales, BO, Mgmt, Auditor, Admin, cross-role). |
| **ROLE-PERMISSION-MATRIX.md** | Role × object CRUD/approve/export matrix (RLS-authoritative). |
| **WORKFLOW-MATRIX.md** | End-to-end business workflows and role handoffs. |
| **SCREEN-INVENTORY.md** | Application map: every screen, purpose, actions, roles, up/downstream. |
| **STATUS-DICTIONARY.md** | Every status vocabulary (from the live enums) + who sets it + next states. |
| **GLOSSARY.md** | System + business terminology, with inconsistency flags. |
| **TROUBLESHOOTING.md** | Problem → cause → resolution (from validations + negative paths). |
| **USER-MANUAL-FRICTION-LOG.md** | Where the app is complex enough to complicate the manual + fixes. |
| **MANUAL-VALIDATION-REPORT.md** | Results of following the manual against the implementation. |

**Start here:** new employees → `QUICK-START-GUIDE.md` then their role section in `USER-MANUAL.md`. Reviewers → this README's summary, then `WORKFLOW-MATRIX.md` and `USER-MANUAL-FRICTION-LOG.md`.

---

## Executive Summary

| Metric | Result |
|---|---|
| **Roles discovered** | **8** — super_admin, operations, coordinator, sales, sales_manager, business_owner, management, auditor (verified from the live `user_role` enum). No trainer role (by design). |
| **Functional modules** | **~13** — My Work, Calendar, CRM, Customers, Training catalogue, Sessions, Resources (trainers/venues), Analytics, Financial, Approvals, Exceptions (fulfilment/duplicates/e-learning), Admin, Audit. |
| **Screens reviewed** | **~34** routes (≈30 active screens + redirect stubs for retired ones). |
| **End-to-end workflows simulated** | **4** business workflows (Lead→Order→Delivery; Course→Session→Delivery; Payment/AR; Exceptions) across **~20** documented journeys. |
| **Procedures documented** | **~25** "How to" procedures (manual + quick-start). |
| **CRUD verified** | **24** business objects mapped across all 8 roles (RLS-authoritative). |
| **Cross-role handoffs tested** | **5** boundaries (Sales→Coord, Coord→Ops, Ops→BO, Ops→close, all→Mgmt/Auditor). |
| **Status vocabularies catalogued** | **15** enums (all verified from the DB). |
| **Usability issues logged** | **18** (Friction Log). |
| **Permission issues (open)** | **0 open defects.** The two historical RLS holes are closed; Management/Auditor read-only is verified. (Historical, now-fixed: read-only roles were shown write controls; two least-privilege holes on `contact`/`quote`.) |
| **Workflow gaps** | **4 significant** — silent Coordinator→Operations handoff, no saved views, misleading page-local sort, status sprawl (3 status fields per order). |
| **Manual coverage** | **~90%** of documentable behaviour verified from source/DB. **~10% pending** a credentialed pass (exact copy, screenshots, runtime timing, real-data edge cases). |

### Critical findings
- **None block work.** No dead-end, no data-loss trap, no open security hole. The application is fundamentally sound and, per the team's own UAT, a **GO** for normal use.

### High-priority findings (from the Friction Log)
1. **Duplicate customers** — the lead-capture form has no customer lookup.
2. **Silent handoff** — endorsing an order doesn't notify Operations; they discover it by watching a queue.
3. **Status sprawl** — an order carries three status fields plus health; enum labels ("For Order Creation") aren't plain-language.
4. **Misleading table sort** — Orders sorts only the visible page.
5. **No saved views** — everyone rebuilds the same filters daily.

### Areas not tested, and why
| Area | Reason |
|---|---|
| Live interactive click-through | Deployment is auth-gated; no credentials |
| Screenshots of authenticated screens | Same |
| Real-data edge cases / negative paths at runtime | No test tenant reachable |
| Performance under real data volume | Not observable without access |
| Exact on-screen copy | Rendered client-side behind auth |

---

## Completeness check
- ✅ Every navigation item mapped (Screen Inventory) · ✅ every role covered (8) · ✅ every major business object CRUD-mapped · ✅ records followed downstream (catalogue→session→roster→certificate; lead→order→AR) · ✅ cross-role handoffs documented · ✅ statuses catalogued from the live DB · ✅ failure cases + recovery documented (Troubleshooting) · ✅ verified vs inferred separated throughout · ⚠️ instructions verified against the **code**, not a live click-through (one credentialed pass recommended).
- **Would a new Operations / Sales employee work from this manual without asking a colleague?** Yes for the documented tasks — with two caveats a colleague would otherwise supply: the local convention around the un-notified endorsement handoff, and the habit of searching before creating a customer. Both are called out explicitly in the manual.
