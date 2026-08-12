# 10 — Prioritized simplification backlog

Priority: **P0** structural · **P1** major daily friction · **P2** useful · **P3** polish.
Type: RETIRE / MERGE / SIMPLIFY / MOVE / REDESIGN / AUTOMATE / HIDE.
Each notes rough effort (S/M/L) and regression risk.

| # | P | Type | Item | Effort | Risk |
|---|---|---|---|---|---|
| 1 | P0 | RETIRE | **Operations today** → My Work + Calendar "this week" | S (delete route/nav; Calendar landing) | Low |
| 2 | P0 | MERGE | **Analytics consolidation**: Dashboard + Reports + Quality + Data quality → one Analytics area (role tabs) | L | Med |
| 3 | P0 | HIDE | **Data quality** out of normal nav → My Work exceptions (super_admin keeps it under Admin) | S | Low |
| 4 | P0 | SIMPLIFY | **Status/health consolidation**: 3 health vocabularies → one `{ok/risk/blocked}`; stop reusing pill classes across meanings | M | Med |
| 5 | P1 | CONVERT | **Fulfillment (Worklist)** → Orders saved view "Needs fulfillment" (+ existing My Work queue) | M | Med |
| 6 | P1 | MERGE | **Organizations** → Customer 360 (parent/child); remove from nav | M | Med |
| 7 | P1 | MERGE | **CRM workspace**: Inquiries + Quotations + New order + Orders under one CRM destination with views | M | Med |
| 8 | P1 | REDESIGN | **Nav per role** to the `02` targets (Ops 18→6, Sales 10→4, Auditor 10→2, etc.) | M | Med |
| 9 | P1 | SIMPLIFY | **Session detail**: 6→5 tabs (fold Feedback into Activity); 7-button status row → 1 primary + More; 6→3 header badges | M | Low |
| 10 | P1 | CONVERT | **Approvals** → My Work queue + decision drawer; keep /approvals as history only | S | Low |
| 11 | P1 | AUTOMATE | **My Work Sales queues**: open inquiries, my quotes, returned orders (the missing sales exceptions) | M | Low |
| 12 | P2 | SIMPLIFY | **Calendar**: 7→4 filters; list 10→7 cols; merge PersCert/Professional tables; drawer = default detail | M | Low |
| 13 | P2 | MERGE | **Training Catalogue**: Courses screen + CourseForm fee edit → one directory + edit-drawer | M | Low |
| 14 | P2 | MOVE | **Duplicates** → My Work exception drawer; **E-learning** → Orders saved view | S | Low |
| 15 | P2 | SIMPLIFY | **Inquiries**: add default table view (Kanban optional) | M | Low |
| 16 | P2 | SIMPLIFY | **Customer 360** 6→5 tabs (drop Sessions; merge Orders/Quotes/Inquiries into Commercial) | M | Low |
| 17 | P2 | SIMPLIFY | **Course create** progressive disclosure (fold certification/assessment/cert-validity into Advanced) | S | Low |
| 18 | P2 | HIDE | Group all config (Pricing, Communications, Rollover, Users, Reference data) under one **Admin** menu | S | Low |
| 19 | P2 | SIMPLIFY | **Resources**: drop Load tab (fold its one metric into Trainers row) | S | Low |
| 20 | P3 | SIMPLIFY | Relabel Orders/Lines "Transfer" → "Move booking"; keep participant Transfer only in roster | S | Low |
| 21 | P3 | SIMPLIFY | Visual-weight pass: fewer nested cards on Overviews (extend DEN1) | M | Low |
| 22 | P3 | SIMPLIFY | Tables get default sort + primary row action uniformly | S | Low |
| 23 | P3 | AUTOMATE | Finish S6 adoption so Calendar/Reports read the category hierarchy; retire free-text `course.category` | M (DB) | Med |

## Recommended implementation sequence
1. **Quick structural wins (P0, low-risk):** #1 (retire Ops today), #3 (hide Data quality), #10 (Approvals→My Work), #14 (Duplicates/E-learning move). Immediately removes 4–5 nav items, near-zero regression.
2. **Signal clarity (P0):** #4 status/health consolidation — the biggest comprehension gain; do before nav so consolidated screens inherit one language.
3. **Nav + consolidation (P1):** #8 nav redesign, #5 Fulfillment→Orders view, #6 Organizations→Customer 360, #7 CRM workspace, #9 Session detail, #11 Sales My Work queues.
4. **Analytics (P0/L):** #2 — largest single build; do once the smaller aggregators (#1,#3) are gone so scope shrinks.
5. **Polish (P2–P3):** #12–#23.

Each item ships behind the existing branch→preview→merge flow; structural changes stay draft for preview. No item requires new business capability — all are subtraction/consolidation.
