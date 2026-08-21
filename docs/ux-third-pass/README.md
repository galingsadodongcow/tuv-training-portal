# Third-pass UX simplification review

A fresh, aggressive simplification pass on the TÜV Rheinland Academy Training Ops & Sales Hub — after QA (`docs/qa/ux-review/`), the second-pass redesign (`docs/ux-second-pass/`), implementation + streamlining (`docs/implementation/`), and final UAT (`docs/final-uat/`). This pass asks not "does it work?" but **"is this the simplest professional way this work should happen?"** — and answers with subtraction.

Method: full route/screen inventory of `main` + per-screen metrics (fields, columns, tabs, actions, status systems) traced from source. Deliverables `01`–`12`.

## Overall simplicity score: **63 / 100**

Strong bones — workflow-shaped nav, a real action-queue My Work, a consistent record pattern, lean create forms (session/inquiry already 2–4 fields), non-destructive lifecycle. But it still carries a **read-only aggregator layer**, **five analytics destinations**, **two customer books**, and **19+ status vocabularies** that tax comprehension on every screen. The functionality is done; the *coherence* is not.

## Top 15 complexity problems
1. **Operations today** is a 7-section read-only aggregator overlapping 6 other screens.
2. **Five analytics destinations** (Dashboard, Reports, Quality, Data quality, AnalyticsTabs) / ~13 views re-presenting the same hooks.
3. **19+ status/label systems**, 14 pill classes reused so one colour means different things per screen.
4. **Three competing "health" vocabularies** (orderState / health / leadHealth) with overlapping Stalled/At-risk/Ageing.
5. **Two customer books** (Customers + Organizations) for one concept.
6. **Fulfillment (Worklist)** is a standalone module overlapping Orders + My Work.
7. **CRM split** across 4 nav items (Inquiries, Quotations, New order, Orders) for one commercial process.
8. **Data quality** near-duplicates Dashboard cards *and* My Work sections.
9. **My Work is mirrored** by Dashboard cards, Worklist, and Approvals (its content re-rendered elsewhere).
10. **21 nav items**; Operations sees 18.
11. **Session detail**: 6 tabs, 6 header badges, a 7-button status row.
12. **Participant transfer** implemented in 3 separate UIs.
13. **Calendar** carries 7 filters + a 10-column list split across 2 tables + ~8 signals/row.
14. **Auditor** navigates 10 browse screens when Audit + Search would serve better.
15. **Config beside daily work** — Pricing/Communications/Rollover/Users as 7 loose "Admin"-group items.

## Top 15 simplification opportunities
1. Retire Operations today → My Work + Calendar. 2. Merge 5 analytics screens → 1. 3. Collapse 3 health vocabularies → one `ok/risk/blocked`. 4. Fulfillment → Orders saved view. 5. Organizations → Customer 360. 6. CRM workspace (Inquiries+Quotes+Orders). 7. Approvals → My Work drawer. 8. Data quality → My Work exceptions. 9. Duplicates/E-learning → exceptions/Orders view. 10. Session detail 6→5 tabs, 7→1 primary action. 11. Sales My Work queues (inquiries/quotes/returned). 12. Calendar 7→4 filters, one list table. 13. Training Catalogue (Courses + fee edit unified). 14. Inquiries default table view. 15. One Admin group for all config.

## Top screens to RETIRE
Operations today · Data quality (normal roles) · dead `Home.tsx`.

## Top screens to MERGE
Dashboard + Reports + Quality → Analytics · Organizations → Customer 360 · Inquiries + Quotations + New order + Orders → CRM · Courses + CourseForm → Training Catalogue.

## Top functions to MOVE
Fulfillment → Orders view · Approvals → My Work · Duplicates → My Work exception · E-learning → Orders view · Pricing/Communications/Rollover/Users → Admin group.

## Top functions to HIDE by role
Data quality (→ super_admin/Admin only) · trainer/venue admin (hide from Sales) · edit actions (hide from Management/Auditor — already RLS-enforced, tighten UI) · Create (hide from Auditor) · Sales pipeline controls (hide from Operations).

## Final navigation per role
| Role | Nav |
|---|---|
| **Operations** | My Work · Calendar · Training · Resources · Orders · Analytics |
| **Sales** | My Work · CRM · Customers · Training |
| **Sales Manager** | My Work · CRM · Customers · Team · Analytics |
| **Management** | Overview · Customers · Training · Financial · Analytics |
| **Auditor** | Audit · Search |
| **Super Admin** | My Work · Calendar · Training · Orders · Customers · Analytics · **Admin** · Audit |

## Recommended reductions
- **Navigation:** avg 13 → 5 items/role (**−62%**).
- **Major screens:** ~30 → ~18 (**−40%**).
- **Analytics destinations:** 5 → 1 (**−80%**).
- **Form fields (create-course):** ~11 → 3 + Advanced; session/inquiry already met.
- **Tabs:** Session/Order/Customer 6 → 5 each.
- **Action surfaces:** one primary + ≤3 secondary + More per screen (Session status 7 → 1+More).
- **Status vocabularies:** 3 health systems → 1; signals/row ~8 → 3.

## Top 20 backlog (full list in `10`)
P0: retire Ops today · analytics merge · hide Data quality · status/health consolidation. P1: Fulfillment→Orders view · Organizations→Customer 360 · CRM workspace · nav redesign · Session-detail trim · Approvals→My Work · Sales My Work queues. P2: Calendar simplify · Training Catalogue · Duplicates/E-learning move · Inquiries table view · Customer 360 5 tabs · Course progressive form · Admin grouping · drop Resources Load tab. P3: relabel transfer→move booking · visual-weight pass · table defaults.

## Recommended implementation sequence
1. **Low-risk structural wins:** retire Ops today, hide Data quality, delete dead Home, Approvals/Duplicates/E-learning → queues. *(removes ~5 nav items, near-zero regression)*
2. **Signal clarity:** status/health consolidation (do first so later screens inherit one language).
3. **Nav + consolidation:** nav redesign, Fulfillment→Orders, Organizations→Customer 360, CRM workspace, Session-detail trim, Sales My Work queues.
4. **Analytics merge** (largest build; smaller aggregators already gone).
5. **Polish:** Calendar, Catalogue, tables, visual weight.

## Final question — the smallest professional version
If rebuilt today with the same business capability, the app is **~9 shared screens on 6 page patterns**:
**My Work** (queue) · **Calendar** · **Training Catalogue** · **Resources** · **Customers (360)** · **CRM** · **Orders** · **Analytics** · **Admin/Audit** — role-scoped to 2–6 each. Records (Session, Order, Customer, Inquiry, Course) all share one header→attention→summary→tabs shell; one status + one health + owner is the entire signal language.

**Screens we would not rebuild at all:** Operations today, Data quality, standalone Fulfillment, standalone Organizations, a separate Dashboard *and* Reports *and* Quality, standalone Duplicates and E-learning modules, the Resources Load tab, and any Notes/History/Feedback surface that Activity already covers. None of these represent a business concept employees think in — they are database- or report-shaped views the queue, the calendar, the record, and search cover better.
