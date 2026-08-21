# 04 — Sales / CRM simplification

Target: **one focused training CRM** = My Work · CRM · Customers · Training. Sales should never feel like switching apps as an opportunity progresses.

## 1. One CRM workspace (P1) — Inquiries + Quotations + New order + my Orders
Today these are 4 separate nav items (Inquiries, Quotations, New order, Orders) — the *phases of one commercial process*. Consolidate under a single **CRM** destination with views/tabs:
- **Pipeline** (inquiries) · **Quotes** · **Orders (mine/team)**. "New order" and "New quote" become primary actions *inside* CRM and reachable from a customer/inquiry — not top-level nav.
- The commercial journey — Lead → Qualified → Quoted → Won → Order → Handoff — happens without leaving CRM.

## 2. Inquiries — add a table view; keep Kanban optional (P2)
Kanban is the *only* view today. For daily work (who to call, what's overdue) a **compact table** is faster:
`Customer · Training interest · Owner · Health · Next action · Due date · Value`
- Make the table the default; keep Kanban as a toggle for pipeline-movement sessions. This directly serves "daily follow-up" (which the Kanban board buries).
- Create form is already lean (4 essentials + 7 folded) and now has an edit surface — **keep**.
- **Add the missing follow-up queue to My Work**: open inquiries needing action, overdue follow-ups (see `docs/final-uat/08`). This is the Sales equivalent of the Operations exception queue.

## 3. Quotations — create from context, not a standalone module (P2)
Quote creation should start from an **Inquiry** or **Customer**, carrying the customer + training interest — not a separate "New quote" that re-picks the client. Keep the Quote detail record (line editor is fine). Within the CRM workspace, "Quotes" is a view, not a separate nav item.

## 4. Customer 360 as the one customer experience (P1) — absorb Organizations
Today: **Customers** + **Organizations** = two account books; Organization is essentially a grouping key (`client.org_id`) given its own two screens, with a Contacts table that subsets Customers and a Files panel identical to Customer 360.
- **Fold Organizations into Customer 360**: an org is a customer with children. Surface the parent/child grouping as an **Overview** section + a "Related accounts" list on the customer record. Org-level contacts/files become the parent customer's tabs.
- Remove **Organizations** from primary nav. Bulk org reference management (rename, merge) is RARE → **Admin → Reference data** if needed.
- **Customer 360 tabs 6 → 5:** Overview, Contacts, Commercial (Orders + Quotes + Inquiries merged), Finance (receivables), Activity. Drop the separate **Sessions** tab (link training from Commercial/Overview); it duplicated session links. Files fold under Activity/Overview or stay as a 6th only if attachment volume warrants.

## 5. Orders vs My Work vs Fulfillment — one responsibility each (P1)
- **Orders** = searchable system of record (keep).
- **My Work** = the action queue (keep; it already lists orders-needing-attention).
- **Fulfillment (Worklist)** = **retire as a standalone module** → a **saved Orders view** ("Needs fulfillment", with the advance + assign controls) plus the existing My Work queue. The bulk-advance/assign controls move onto the Orders saved view. This removes a whole nav item and the Orders/Fulfillment/My-Work three-way overlap.

## 6. My Work stays a queue, not a dashboard (P1)
My Work is already correct (5 action queues, no KPI tiles). Protect that:
- Do **not** add analytics to it. The Dashboard "needs attention" cards, DataQuality tiles, and Worklist views all mirror My Work — those are the ones to retire, leaving My Work the single action surface.
- Add the two missing Sales queues (open inquiries, my quotes, returned orders) so Sales gets the same "what's on my plate" completeness Operations has.

## 7. Sales pipeline / status hygiene (P2)
Keep **process stage separate from health** (see `07`). Every open opportunity row shows: Owner · Status · Health · Next action · Next-action date · Customer · Training interest · Value. Remove statuses users don't manually select. The three health vocabularies (lead/quote/order) should share one visual language.

## Sales end-state
Nav: **My Work · CRM · Customers · Training** (4). Journey: capture lead in CRM → qualify (edit) → quote from the inquiry → convert to order (no retype) → send to Operations — all inside CRM + Customer 360, never touching Operations admin.
