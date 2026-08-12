# 12 — Retirement plan

Screens/functions to stop rebuilding, and how to retire each **without losing capability**. A screen is only retired once its unique content has a confirmed home.

## Retire outright (content already lives elsewhere)
| Screen | Unique content | New home | Steps |
|---|---|---|---|
| **Operations today** (`/operations-today`) | none — 7 aggregator sections | My Work + Calendar "this week" | delete route+nav; make Calendar default to a this-week list; confirm My Work covers roster-gap/stalled/decisions (it does) |
| **Data quality** (`/data-quality`) for normal roles | 6 check tiles | My Work exceptions (normal) / Admin (super_admin) | drop from nav for all but super_admin; ensure each tile's condition surfaces as a My Work exception |
| **Home** (`/home`) | none (already redirects to /my-work) | — | `Home.tsx` is unreferenced dead code — delete the file + route |

## Convert to a view/queue (route may remain, nav item goes)
| Screen | Becomes | Notes |
|---|---|---|
| **Fulfillment** (`/worklist`) | Orders saved view "Needs fulfillment" | move advance/assign/bulk controls onto the Orders view; keep My Work "orders needing attention" |
| **Approvals** (`/approvals`) | My Work "Approvals to decide" + decision drawer | keep /approvals as a decided-history list only, or fold history into Analytics |
| **Duplicates** (`/duplicates`) | My Work exception → resolve drawer | RARE; no reason for a top-level module |
| **E-learning access** (`/elearning`) | Orders saved view "Awaiting e-learning access" | it's an order-fulfillment queue |

## Merge into a record / larger surface
| Screen | Merges into |
|---|---|
| **Organizations** + **Organization detail** | Customer 360 (parent/child grouping); bulk admin → Admin › Reference data |
| **Dashboard** + **Reports** + **Quality** | one **Analytics** area (role-scoped tabs); role dashboards become the "Overview" tab |
| **Courses** screen | **Training Catalogue** (directory + edit-drawer, unified with CourseForm fee editing) |
| **Session detail › Feedback tab** | Activity / Overview summary |
| **Customer 360 › Sessions tab** | Commercial/Overview |
| **Quality › Complaints** | a complaints **record list** (not an analytics tab) |

## Reduce nav prominence (keep screen, move under Admin)
Pricing rules · Communications · Annual rollover · Users & access · Reference data (categories/subcategories) → one **Admin** group, visible to super_admin (+ operations where they own it). These are RARE/annual/config — they should never sit beside daily work.

## Explicitly DO NOT retire
- **My Work** — the canonical queue; everything else de-duplicates toward it.
- **Calendar, Session detail, Order detail, Customer 360** — the core Record/Calendar surfaces.
- **Audit log** — compliance; keep for auditor + super_admin.
- **New order / Quote detail / Roster** — real create/work surfaces (reached from context, not necessarily top-level).
- Any **RLS policy, RPC, or DB table** — this is a *UI* retirement plan; the schema and access controls (validated in `docs/final-uat/`) stay intact. `organization`, `subcategory`, and join tables persist in the DB while losing their user-facing destinations.

## Sequencing (lowest risk first)
1. Delete dead `Home.tsx`; retire Operations today; hide Data quality. *(no user-facing capability lost)*
2. Approvals/Duplicates/E-learning → queues/views.
3. Organizations → Customer 360; Fulfillment → Orders view.
4. Analytics merge (largest); Training Catalogue.

Each retirement is verifiable in a deploy preview before merge; keep the retired screen's route as a redirect for one release where deep-links may exist (as was done for `/home`).
