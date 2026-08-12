# 06 — Tables, forms, actions

## Tables — target 5–8 useful columns before scroll

| Table | Now | Target columns | Cut / move |
|---|---|---|---|
| **Calendar list** | 10 (×2 tables) | 7: Date, Course, Status, Health, Trainer, Venue, Fill | Channels, Go, Fee → drawer; merge the PersCert/Professional split into one table with a Type column |
| **Orders** | 7 + expand | 7: Order, Customer, Stage, Health, Owner, Value, Age | keep; add **Health** (flags) so the row shows *why* it needs action; SAP → detail |
| **Customers** | 5 | 5: Company, Contact, Owner, Outstanding, Last activity | add Outstanding + Last activity (decision-useful); drop raw Email/Phone to the record |
| **Resources › Trainers** | 6 | 6: Name, Type, Qualified courses, Sessions, Next, status | fold Load-tab's "days delivered" here; retire Load tab |
| **Roster** | 6 | keep 6 | fine |
| **Reports/Quality tabs** | many | — | consolidate into Analytics (see `05`) |

**Rules:** important field first; rare fields in the expanded row or record; every operational table gets a **default sort** (Orders by age/health, Calendar by date, Customers by last activity) and a **primary row action** (open record). Bulk actions only where a real batch job exists (Fulfillment advance, participant import).

## Forms — progressive disclosure, derive don't retype

| Form | Now | Target initial fields | Notes |
|---|---|---|---|
| **Create session** | 11 (2 req) | keep 3 (Course, Learning type, Dates) | already lean ✓ |
| **Create course** | ~11 + 3 rows | 3 initial: Title, Category, ≥1 learning type+fee | fold is_certification / assessment / pass mark / cert validity into **Advanced** |
| **Create inquiry** | 11 (4 shown) | keep 4 + folded | already lean ✓ |
| **New order** | ~12 | keep sectioned | already sectioned ✓; ensure quote/client prefill carries everything |
| **Create quote** | 2–3 | start from inquiry/customer | prefill client + training interest |

**Course → Session inheritance (do not re-enter):** Category, Subcategory, default Learning format, Duration, Min/Max pax, default Fee, Certificate type, Preparation requirements should all flow Course → Session automatically. Session overrides only delivery specifics (dates, trainer, venue, this-run price). Session create already inherits pax + fee; extend to duration/cert/prep once those live on Course.

## Duplicate data entry to remove
| Value | Typed in | Should | 
|---|---|---|
| Customer identity | Inquiry, Quote, Order | inherit from the linked customer (quote→order already does) |
| Course defaults | Course, Session | inherit (see above) |
| Fee | Course grid, CourseForm, Session, Quote line | one course fee source; sessions/quotes default from it |
| Contact/email | New-order new-customer vs existing | prefer "existing customer" path; dedup check already exists |

## Actions — one primary, 2–3 secondary, rest in More

| Screen | Primary | Secondary (≤3) | Move to More |
|---|---|---|---|
| **Session detail** | Confirm / Close (by state) | Edit, Add participant | Cancel, Clone, status overrides (the 7-button row → 1 primary + More) |
| **Order detail** | Endorse / Accept / Return (by state) | Save fulfillment, Add payment | Comment, export |
| **Calendar drawer** | Confirm session | Assign trainer, Assign venue | Reschedule, Cancel, Open full |
| **Customer 360** | (contextual) | New quote, New order | Archive, Set org |
| **Inquiry card** | Advance | Edit, Lost | Move back, Reopen |

**Labels:** outcome-based (Create Session, Assign Trainer, Send to Operations, Accept Handoff, Return for Correction, Confirm Payment, Transfer Participant, Close Session) — already largely the case; apply to the session status row and the Orders/Lines "transfer" → "Move booking".
