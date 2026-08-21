# 11 — Simplification metrics (current → target)

Estimates from the code inventory (`01`). Targets assume the `10` backlog is delivered.

## Navigation (visible items per role)
| Role | Now | Target | Δ |
|---|---|---|---|
| super_admin | 21 | 8 (6 + Admin + Audit) | −62% |
| operations | 18 | 6 | −67% |
| coordinator | 13 | 5 | −62% |
| business_owner | 12 | 5 | −58% |
| management | 11 | 5 | −55% |
| sales | 10 | 4 | −60% |
| auditor | 10 | 2 | −80% |
| sales_manager | 9 | 5 | −44% |
| **avg** | **13** | **5** | **−62%** |

Well beyond the 25–35% target.

## Screens & surfaces
| Metric | Now | Target | Δ |
|---|---|---|---|
| Distinct nav destinations | 21 | ~9 (role-scoped) | −57% |
| Major screens (routes) | ~30 | ~18 | −40% |
| Read-only aggregator screens | 3 (Ops today, Data quality, Dashboard-cards) | 0 | −100% |
| Analytics/reporting destinations | 5 (+~13 views) | 1 (role tabs) | −80% |
| Customer "books" | 2 (Clients, Orgs) | 1 (Customer 360) | −50% |
| Ops screens used in a normal day | ~6 (MyWork, Calendar, Ops-today, Session, Worklist, Orders) | 3 (My Work, Calendar, Session) | −50% |
| Sales screens used in a normal day | ~5 (Inquiries, Quotes, New order, Orders, Customers) | 2 (My Work, CRM) | −60% |

## Records, tabs, fields, columns
| Metric | Now | Target |
|---|---|---|
| Session detail tabs | 6 | 5 |
| Session detail header badges | 6 | 3 |
| Session status buttons | 7 | 1 primary + More |
| Order detail tabs | 6 | 5 |
| Customer 360 tabs | 6 | 5 |
| Calendar list columns | 10 (×2 tables) | 7 (×1) |
| Calendar filter controls | 7 | 4 |
| Orders columns | 7 | 7 (add Health, drop SAP) |
| Create-session visible fields | 3 (of 11) | 3 ✓ (already met) |
| Create-course visible fields | ~11 | 3 + Advanced |
| Create-inquiry visible fields | 4 (of 11) | 4 ✓ (already met) |

## Status / signal density
| Metric | Now | Target |
|---|---|---|
| Distinct status/label systems | 19+ | ~10 (process per entity) |
| "Health/attention" vocabularies | 3 (orderState, health, leadHealth) | 1 (`ok/risk/blocked`) |
| Pill CSS classes | 14 + 5 health | ~6 (mapped to meaning) |
| Max signals on a table row | ~8 (Calendar) | 3 (Status, Health, Owner) |

## Clicks (common workflows, target ≤3 quick / ≤5 workflow)
| Workflow | Now | Target |
|---|---|---|
| Assign trainer | 1 (Calendar drawer ✓) | 1 |
| Confirm session | 1 (drawer ✓) | 1 |
| Review "what needs action" | 1–2 (but split across My Work / Ops-today / Dashboard) | 1 (My Work) |
| Advance an order in fulfillment | 2 (Worklist) | 2 (Orders view) |
| Qualify a lead after capture | 2 (edit ✓) | 2 |
| Find "next run of course X" for a customer | 3–4 (search ranks past first) | 1–2 (search fix) |

## Headline
Average visible nav **−62%**, analytics destinations **−80%**, status vocabularies **3→1**, read-only aggregators **→0**, customer books **2→1** — all via subtraction/consolidation, no lost capability.
