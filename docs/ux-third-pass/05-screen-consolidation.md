# 05 — Screen consolidation (redundancy map)

Each block: **CURRENT** overlapping surfaces → **FUTURE** single/simplified surface.

## R1 — The attention/aggregator cluster (biggest win)
```
CURRENT                                   FUTURE
Operations today (7 sections)     ┐
Dashboard "needs attention" cards ├──►  My Work (queues)  +  Calendar "this week"
Data quality (6 tiles)            │        (all three re-present the same
Worklist views                   ┘         fulfillment/health/sla/duplicate hooks)
```
My Work owns the action queue; Calendar owns "when"; the aggregators retire.

## R2 — Analytics / reporting
```
CURRENT                            FUTURE
Dashboard   ┐
Reports (6 tabs)  ├──►  ONE Analytics area (tabbed): Overview · Revenue · Receivables ·
Quality (3 tabs)  │       Certificates · Profitability · Quality/NPS
Data quality      ┘     (Complaints register becomes a record list, not an analytics tab)
```
5 destinations / ~13 views → 1 destination, role-scoped tabs. Role dashboards become the "Overview" tab.

## R3 — Customer books
```
CURRENT                          FUTURE
Customers (Clients)   ┐
Organizations         ├──►  Customer 360  (parent/child grouping inside the record)
Organization detail   ┘     Org bulk admin → Admin › Reference data (rare)
```

## R4 — CRM pipeline
```
CURRENT                       FUTURE
Inquiries   ┐
Quotations  ├──►  CRM workspace: Pipeline · Quotes · Orders views
New order   │       (New quote / New order = actions inside CRM + from a customer)
Orders      ┘
```

## R5 — Fulfillment
```
CURRENT                       FUTURE
Worklist (Fulfillment)  ──►  Orders › saved view "Needs fulfillment" (advance+assign controls)
                              + My Work "orders needing attention" (already exists)
```

## R6 — Operations exceptions
```
CURRENT                    FUTURE
Duplicates   ──►  My Work exception card → resolve drawer
E-learning   ──►  Orders › saved view "Awaiting e-learning access"
```

## R7 — Approvals
```
CURRENT                     FUTURE
Approvals screen  ──►  My Work "Approvals to decide" queue → decision drawer (modal)
                       (keep /approvals only as the decided-history view, or fold into Analytics)
```

## R8 — Record tabs that duplicate other screens
```
Customer 360 › Orders tab      ──►  reachable list, but dedupe vs Orders screen
Customer 360 › Sessions tab    ──►  merge into Commercial/Overview (drop tab)
Customer 360 › Activity        ──►  keep (canonical timeline; already absorbed Notes+audit)
Session detail › Feedback tab  ──►  fold into Activity/Overview
```

## R9 — Duplicated actions (not screens)
| Action | Appears in | Keep in |
|---|---|---|
| Transfer participant | RosterPanel, Session Orders tab, Order Lines tab | **RosterPanel** (session); relabel the booking-level ones "Move booking" |
| Assign trainer/venue | Calendar drawer, Session form "More options" | both OK (different moments); no change |
| Edit course fee | Courses grid, CourseForm rows | **one Training edit-drawer** |
| Weighted pipeline value | Inquiries, Dashboard, Reports | compute once; show on CRM + Analytics only |

## Net effect
- **Nav items 21 → ~9 shared** (role-scoped to 2–6).
- **Major screens ~30 → ~18** (retire 6, merge ~6 into records/views).
- **Analytics destinations 5 → 1.**
- **Customer books 2 → 1.**
