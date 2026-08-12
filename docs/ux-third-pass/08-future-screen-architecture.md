# 08 — Future screen architecture

## Six page patterns (every screen maps to one)

| Pattern | Responsibility | Screens |
|---|---|---|
| **Action Queue** | what needs doing | My Work (+ Team for managers) |
| **Directory / List** | find & scan a set | Training Catalogue, Customers, Resources, Orders |
| **Calendar** | when things happen | Training Calendar |
| **Record Detail** | full state of one thing | Session, Customer 360, Order, Inquiry, Course |
| **Admin / Config** | rare setup & governance | Users, Reference data, Pricing, Communications, Rollover |
| **Analytics** | measure & report | one Analytics area (role-scoped tabs), Audit |

Fewer patterns → more predictable product. Today the app has these patterns *plus* a seventh anti-pattern — the **read-only aggregator** (Operations today, Data quality, half of Dashboard) — which this review retires by pushing its content back into Action Queue + Calendar + Analytics.

## Interaction rules (drawer/modal/page/inline)
- **Inline** — tiny field edits (course fee cell, valid-until, discount %).
- **Drawer** — quick contextual work without leaving context (Calendar session drawer, Course edit, Resource edit, Duplicate resolve, Inquiry edit).
- **Modal** — a short focused decision (Approve/Reject, Refund/Void, Cancel-with-reason, Confirm-destructive).
- **Full page** — complex multi-section records (Customer 360, Order, Session, New order).

Mismatches to fix: Approvals is a full page for a modal-sized decision → decision drawer/modal from My Work. Resources trainer edit is already a modal (good). Assign trainer is already inline/drawer (good).

## Target information hierarchy for every Record Detail
```
HEADER    identity · process status · health · owner · ONE primary action
ATTENTION the blockers/reasons (only when present) — one band
SUMMARY   the 4–6 facts you need in 5 seconds
TABS      3–5 meaningful groups (Overview · [entity children] · Files · Activity)
```
Applies uniformly to Session, Order, Customer, Inquiry, Course. Activity is the canonical timeline (notes + audit + tasks already merged); no separate Notes/History/Feedback tabs.

## The four role experiences (end-state)
- **Operations** → one training-management workspace: My Work · Calendar · Training · Resources · Orders · Analytics.
- **Sales** → one CRM: My Work · CRM · Customers · Training.
- **Management** → one oversight console: Overview · Customers · Training · Financial · Analytics (read-only).
- **Auditor** → one investigation tool: Audit · Search.
- **Super Admin** → operational visibility + one Admin group holding all config + Audit.

## What the DB keeps that the UI hides
`organization`, `subcategory`, `session_trainer`, `order_assignment`, `client_interaction`, and the various join tables remain in the schema but stop being *user-facing destinations*. Employees navigate customers, courses, sessions, and orders — not the tables underneath them.
