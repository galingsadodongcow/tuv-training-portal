# Troubleshooting — Academy Portal

Format: **Problem → Likely cause → Resolution.** Derived from the app's validations, RLS behaviour, and negative-path testing (Phase 7). "By design" means the behaviour is intended, not a bug.

## Access & permissions
| Problem | Likely cause | Resolution |
|---|---|---|
| A button/field is missing or read-only | Your role doesn't have that right (RLS), or you don't **own** the record | Expected. Ask the owning role. Management/Auditor are read-only by design. |
| I clicked a control and it failed with a permission error | You're a read-only role (Management/Auditor) or acting outside your scope | The DB blocks it. If you're *not* one of those roles and expected access, report it — a UI control shown to a read-only role is a defect. |
| I can't change the payment status / SAP number on an order | You're Sales — a DB trigger blocks it | Ask Operations/Coordinator to set it. |
| I can't sign in | Accounts are created by the Super Admin | Contact your Super Admin; you cannot self-register. |
| I was redirected to My Work when opening a page | The page isn't in your role's access | Use ⌘K to reach what you can access; the redirect is the guard working. |

## Forms & data entry
| Problem | Likely cause | Resolution |
|---|---|---|
| Save did nothing / showed a red toast | A required field is missing or invalid (validation runs on Save) | Read the toast; on the **New order** form, inline field errors also appear after the first Save. Fill required fields (Company/Order number/Email/Session/Fee as applicable). |
| End date before start / bad dates | Date validation | Fix the date block; Save stays disabled until it's valid. |
| "Trainer/venue already booked" notice | Double-booking conflict check | Pick a different trainer/venue/time, or accept the clash knowingly (the notice on assign is a warning, not a block; on session create it blocks). |
| I created a duplicate customer | The **New inquiry** form has no customer lookup | Search (⌘K) before creating. If a duplicate exists, ask a Super Admin to reconcile. |
| Capacity exceeded on import | Roster over the session's max | Reduce the import or increase capacity; the import warns before committing. |
| Full session when booking a line | Session at capacity | The line auto-sets to **Waitlist** — expected; promote later or pick another session. |

## Status & workflow
| Problem | Likely cause | Resolution |
|---|---|---|
| The session won't confirm | Below the minimum participants | Add participants, or use **Confirm Go anyway** (override, logged). |
| I endorsed an order but Operations didn't act | Endorsement moves it to their queue but doesn't notify them | Tell Operations directly for urgent orders (known gap). |
| My endorsed order came back | Operations **Returned it for correction** (with a reason) | Read the return reason on the order, fix it, and re-endorse. |
| Header says "Paid" but there's a balance | `payment_status` can drift from the AR ledger (known issue) | Trust the **AR balance on the Payments tab**; record the missing payment. |
| Two "at risk" indicators disagree on the calendar | A secondary risk calc differs from the health pill (known issue) | Trust the **health pill** on the session record. |
| A session cancellation isn't taking effect | Cancellation needs Business-Owner **approval** | It's pending approval; the Business Owner must approve it. |

## Search, filters, navigation
| Problem | Likely cause | Resolution |
|---|---|---|
| Search returns nothing | Search is exact substring match (no typo tolerance); needs 2+ characters | Try fewer/simpler letters; search by company, order id, or person name. |
| A list looks empty | A filter is hiding rows | Clear the filters/search; check you're on the right owner scope (Mine/Everyone). |
| I can't see all customers | The Customers list caps at the first 300 (known limit) | Use search to find a specific customer; full paging is a pending improvement. |
| Sorting a big table didn't reorder everything | On Orders, sorting reorders only the current page (known limit) | Filter to narrow first, then sort within the page. |
| A filtered view was lost when I left the screen | Some screens (Clients, Inquiries) don't keep filters in the URL | Re-apply the filter; on Orders/Calendar the filters persist in the URL and can be bookmarked. |
| An old bookmarked link (Dashboard/Reports/Organizations) | Those screens were consolidated | The link redirects automatically (to Analytics / Customer 360 / CRM). |

## Data safety & recovery
| Problem | Likely cause | Resolution |
|---|---|---|
| I removed the wrong participant | Soft delete (flagged Removed, history kept) | Re-add them, or ask a Super Admin to restore. |
| I voided a payment by mistake | Void is intentional and kept in the record | Record a corrected payment; ask Business Owner/Super Admin to review. |
| I archived a customer | Soft delete (hidden from lists) | **Restore** from the customer record. |
| I deleted a contact | Contacts are a **hard delete** (the one exception) | It's gone; re-create it (Super Admin/Coordinator only can delete). |
| Assessment score didn't seem to save | It saves without a success toast (known gap) | Re-open the participant row to confirm; re-enter if blank. |

## Environment
| Problem | Likely cause | Resolution |
|---|---|---|
| Browser refresh mid-form | Unsaved form state is lost | Re-enter; the app doesn't auto-save drafts. |
| Slow list load as data grows | Full-load tables + some unindexed joins (known perf note) | Filter to narrow the result; report persistent slowness. |
