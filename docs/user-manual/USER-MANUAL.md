# Academy Portal — User Manual

> **How this manual was built.** It is verified against the application's **source code and live database** (roles, statuses, RPCs, RLS), plus the team's QA/UAT record. The live deployment is behind a login I could not enter, so **interactive click-through and screenshots are not first-hand** — screenshot markers `[OPS-01]` etc. are placeholders for a credentialed reviewer. Field names, buttons, required fields and confirmations are taken from the code and are accurate. Anything not verifiable that way is flagged *(inferred)* and never presented as fact.

---

## 1. Introduction

**Purpose.** The Academy Portal is the internal operations system for **TÜV Rheinland Academy Philippines**. It carries training from catalogue to cash: **Catalogue → Calendar/Sessions → Sales orders → Fulfilment → Attendance & Certificates → Receivables → Reporting.**

**Intended users.** Eight staff roles — Operations, Coordinator, Sales, Sales Manager, Business Owner, Management, Auditor, and Super Admin. **Trainers and customers do not log in.**

**Overview.** It is a single web application. You sign in, land on your **home** screen, and work from there. All real permissions are enforced in the database, so you will only ever see and be able to do what your role allows.

---

## 2. Getting Started

### 2.1 Log in
- Go to the portal URL and sign in with your **work email + password**.
- Accounts are created by the Super Admin (in Supabase). If you can't sign in, contact your Super Admin — you cannot self-register.

### 2.2 Find your way around
- **Left navigation** — your role's main areas (4–6 items). It is deliberately short; supporting things are reached from records and search.
- **Top bar** — a **⌘K / Ctrl-K** button opens the **command palette**: type to jump to any page, or type 2+ letters to search records (orders, customers, sessions, participants…). This is the fastest way to reach anything.
- **Notification bell** — unread count; opens a list of recent notifications (click one to open the record).
- **Your home** — Most roles land on **My Work**. **Management** lands on **Overview**; **Auditor** lands on **Audit/Search**.

### 2.3 Interface conventions
- **Tables** show loading, empty, and error states; most lists have a search box and filters at the top.
- **Records** open at their own page with tabs (Overview, Lines/Participants, Payments, Files, Activity…).
- **Destructive actions** (cancel, void, refund, remove, merge) always ask you to confirm, and many ask for a reason.
- **Toasts** (top corner) confirm success or explain errors; they stay longer for errors.
- **Health vs status:** a coloured **health** pill (Blocked / Risk / OK) tells you *if a record needs attention*; the **status** tells you *where it is in its workflow*. They are different — read both.

---

## 3. Understanding the Academy Portal (read this first)

The whole system hangs off one structure:

```
Category → Subcategory → Course → (fees per learning type)
                              ↓
                           Session  ← Trainer, Venue
                              ↓
Customer → Inquiry → Quote → Order → Order line → Session booking
                              ↓                        ↓
                          Invoice → Payment       Participant → Attendance → Certificate
```

**The one concept everyone must understand — Course vs Session:**
- A **Course** is a *template*: its title, category, delivery types (Live Online / Face-to-face / E-learning), and fees. It has **no dates**.
- A **Session** is *one scheduled run* of a course: specific dates, a trainer, a venue, a capacity, and a roster of participants.
- You **create a course once** and **schedule many sessions** from it. Orders sell **seats in sessions**, not courses.

**The commercial side vs the delivery side:**
- **Sales/Coordinator** own the *commercial* record — inquiry → quote → **order**.
- **Operations** own the *delivery* record — **session** → trainer/venue → roster → completion → certificates.
- They meet at the **endorsement handoff**: the coordinator endorses the order to Operations, who accept it and fulfil.

---

## 4. Role Overview

| Role | You are here to… | You land on |
|---|---|---|
| **Operations** | Schedule and run training; staff sessions; fulfil orders | My Work |
| **Coordinator** | Turn won deals into orders and endorse them to Operations | My Work |
| **Sales** | Work leads, quote, and open orders | My Work |
| **Sales Manager** | Balance and unblock the sales team | My Work |
| **Business Owner** | Approve decisions and oversee the money | My Work |
| **Management** | Watch the numbers (read-only) | Overview |
| **Auditor** | Reconstruct any record and read the change log (read-only) | Audit / Search |
| **Super Admin** | Everything, plus users and configuration | My Work |

Full permissions: see **ROLE-PERMISSION-MATRIX.md**.

---

## 5. Operations User Manual (organised by task)

### How to view the training calendar
- **Purpose:** find and manage scheduled sessions. **Role:** Operations. **Prereq:** none. **Start:** left nav → **Calendar**.
- **Steps:** 1. Choose **Month / Week / Day / List**. 2. Set filters (Month, Year, Status, Category, Learning type) or use the search box. 3. Click a session to open its drawer.
- **Expected result:** the session drawer opens with inline actions. **Next:** assign a trainer/venue or open the full session. **Tips:** the List view is best for scanning "what needs staffing". **Common mistakes:** a stale filter hides sessions — clear filters if the list looks empty. **Related:** *assign a trainer*. `[OPS-01]`

### How to create a training category and subcategory
- **Purpose:** classify courses. **Role:** Operations/Super Admin. **Start:** Training catalogue (`/courses`) → **+ New course** → Category area.
- **Steps:** 1. In the course form, pick or create a **Category**. 2. Pick or create a **Subcategory** under it (the subcategory field is disabled until a category is chosen).
- **Expected result:** the course is filed under Category → Subcategory. **Tips:** every course needs a subcategory. **Common mistakes:** trying to pick a subcategory first — choose the category first.

### How to create a course
- **Purpose:** add a reusable course. **Role:** Operations/Super Admin. **Prereq:** category/subcategory. **Start:** **Training catalogue → + New course**.
- **Steps:** 1. Enter **Training title** *(required)*. 2. Pick **Category → Subcategory**. 3. Pick **Training type** (PersCert / Professional). 4. Tick each **learning type** offered and enter its **fee** *(at least one required)*. 5. *(Optional — Advanced:* certification, assessment, pass mark, cert validity, seat cap, webshop URL.) 6. **Save**.
- **Expected result:** the course appears in the directory. **Next:** *schedule a session*. **Common mistakes:** no learning type/fee → save is blocked (toast). This form validates only on save — there are no inline field errors. **Related:** *schedule a session*. `[OPS-02]`

### How to schedule a session
- **Purpose:** put a course on the calendar. **Role:** Operations. **Prereq:** course exists. **Start:** **Calendar → Book** on a course, or **New session** (`/session/new`).
- **Steps:** 1. Pick **Course** *(required)*. 2. Pick **Learning type**. 3. Add one or more **date blocks**. 4. *(Optional — More options:* fee, min/max pax, sales owner, trainer, venue, status, private-run — all default from the course.) 5. **Save**.
- **Expected result:** a session in status **Tentative**. **Next:** *assign a trainer/venue*, then *confirm*. **Tips:** you only need Course + Learning type + Dates; everything else is defaulted. **Common mistakes:** end date before start, or a trainer/venue double-booking → a blocking notice appears and Save is disabled until fixed. **Related:** *assign trainer*, *confirm a session*. `[OPS-03]`

### How to assign a trainer and a venue
- **Purpose:** staff a session. **Role:** Operations. **Start:** **Calendar → session drawer** (or session **Edit**).
- **Steps:** 1. In the drawer, select a **Trainer** (qualified trainers for the course are flagged). 2. Select a **Venue**. 3. A conflict check runs; a warning appears if there's a clash (it does not block). 4. *(Optional)* **Confirm session** from the drawer.
- **Expected result:** trainer and venue set without leaving the calendar. **Tips:** this is the fastest path — one click each. **Common mistakes:** ignoring a conflict warning — check the flagged clash before proceeding. `[OPS-05]`

### How to confirm a session (Go/No-Go)
- **Purpose:** commit a session to run. **Role:** Operations. **Prereq:** Tentative session, ideally staffed. **Start:** `/session/[id]` → **Go/No-Go** panel.
- **Steps:** 1. Review the recommendation and metrics (minimum, booked, paid, target, decision-due). 2. Click **Confirm Go**. 3. If below the minimum, click **Confirm Go anyway** to override (an amber warning explains the risk).
- **Expected result:** status → **Confirmed**. **Next:** enrol participants; run and complete. **Tips:** the system *advises*; you decide. **Common mistakes:** using the raw "Confirm session" status override instead of Confirm Go — prefer **Confirm Go** so the decision is logged. **Related:** *propose No-Go* (files an approval; does not cancel). `[OPS-04]`

### How to manage participants (enrol, attendance, certificate)
- **Purpose:** build and complete the roster. **Role:** Operations/Coordinator. **Start:** `/session/[id]` → **Participants**.
- **Steps:** 1. **Add** a participant, or **Import CSV** (preview + validation; a warning shows if you exceed capacity). 2. **Mark attendance**. 3. Enter **assessment score/result** if applicable. 4. **Issue certificate** (one) or **Issue all** (bulk). 5. To move someone, use **Transfer** (to another session of the same course); to take someone off, use **Remove** (soft — history is kept).
- **Expected result:** a roster with attendance and certificates. **Tips:** certificates warn they "cannot be un-issued from here" — check before bulk-issuing. **Common mistakes:** assessment score/result saves **without a success toast** — re-open the row to confirm it saved. **Related:** *complete a session*. `[OPS-06]`

### How to reschedule or cancel a session
- **Reschedule:** open the session → **Edit** → change the date blocks → **Save**.
- **Cancel:** session **More actions → Cancel with dispositions** → resolve any missing dispositions the banner shows → confirm. **This files a Business-Owner approval** — cancellation is not immediate/unilateral.
- **Tips:** prefer rescheduling over cancelling where possible; cancellation needs sign-off.

### How to complete and close a session
- **Steps:** set status **Running** then **Completed** (completion is confirmed via a dialog and "cannot be undone from here"); ensure attendance is marked and certificates issued first.
- **Expected result:** Completed session; delivered revenue counts. **Related:** *record payment*.

### How to work the fulfilment queue
- **Purpose:** move orders through fulfilment. **Role:** Operations/Coordinator. **Start:** **CRM → Orders → Needs fulfilment**.
- **Steps:** 1. Filter (Mine / Claim queue / Everyone; by stage). 2. **Advance** an order to its next stage, or **assign** an owner. 3. Select rows → **bulk advance / bulk assign**.
- **Expected result:** orders progress. **Tips:** the "Claim queue" shows unassigned orders you can pick up. `[OPS-07]`

---

## 6. Sales User Manual (organised by journey)

### How to capture a lead
- **Purpose:** log an inbound opportunity. **Role:** Sales. **Start:** **CRM → Pipeline → + New inquiry**.
- **Steps:** 1. Enter **Company** *(required)*, Contact, Email, Course of interest. 2. *(Optional — Add deal details:* phone, offering, pax, value, probability, expected close, source.) 3. **Save**.
- **Expected result:** the inquiry appears in the pipeline. **Common mistakes:** ⚠ **there is no customer lookup here** — if the company already exists as a customer, you will create a duplicate. Check the Customers list first, or use ⌘K to search, before creating. **Related:** *qualify*, *quote*. `[SALES-01]`

### How to qualify a lead
- **Steps:** in the Pipeline **Table**, **Edit** the inquiry to add value/probability/expected close, and **advance the stage** (Received → Responded → RFQ or P Sent → Awaiting Feedback). Mark **Lost** (with a reason) or **Reopen** as needed.
- **Expected result:** an updated, weighted pipeline entry.

### How to create a quote and turn it into an order
- **Purpose:** price a deal, then book it. **Role:** Sales/Coordinator. **Start:** **CRM → Quotes → New quote**.
- **Steps:** 1. Pick **Client** (must already exist) and **Valid until** → the quote opens. 2. **Add lines** (course, learning type, seats, unit price — price auto-fills; a **discount hint** offers a one-click best price). 3. Header fields save **as you leave them** (on blur). 4. When accepted, **Convert to order** (prefills the order).
- **Expected result:** a quote, then a linked order. **Common mistakes:** the client must exist — create the customer first if needed. **Related:** *create a sales order*. `[SALES-02]`

### How to create a sales order
- **Purpose:** record a sale. **Role:** Coordinator/Sales. **Start:** **CRM → + New order** (or from a customer/quote).
- **Steps:** 1. **Customer** — pick existing, or enter new (Email required; a duplicate-email warning appears live). 2. **Order** — **Order number** *(required — typed by hand)*, order date (today by default), channel. 3. **Training lines** — per line: course, learning type, **session** *(required unless E-learning)*, seats, **fee** *(auto-filled, required)*. Use **+ Add another training** for more lines. 4. **Save**.
- **Expected result:** an order in stage **New**. **Tips:** the owner and currency are set automatically; you don't type them. This form shows **inline field errors after your first Save attempt** (the only form that does). **Common mistakes:** picking a full session → the line becomes **Waitlist** automatically. **Related:** *endorse the order*. `[SALES-03]`

### How to endorse an order to Operations
- **Purpose:** hand a ready order to delivery. **Role:** Coordinator/Sales. **Start:** `/orders/[id]` → **Endorsement**.
- **Steps:** 1. Clear the listed **completeness blockers**. 2. Click **Endorse to Operations**.
- **Expected result:** stage → **Endorsed to Ops**; handoff → **Endorsed**; you get a toast. **⚠ Important:** Operations is **not** notified automatically — if it's urgent, tell them. **Next:** Operations **Accepts** (or **Returns for correction** with a reason, which comes back to you to fix and re-endorse). **Common mistakes:** trying to endorse with open blockers — resolve them first (only a Super Admin can override, with a reason). `[SALES-04]`

---

## 7. Administrator User Manual (Super Admin)

> **System administration** = users, roles, audit, and app configuration (below). **Operational administration** = catalogue, sessions, pricing that Operations also manages. Keep the two mental buckets separate.

### How to create a user and assign a role
- **Purpose:** give a staff member the right access. **Role:** Super Admin. **Start:** **Admin → Users & access** (`/admin`).
- **Steps:** 1. Create the user profile. 2. Assign one **role** (of the 8). 3. Map to a salesperson/team where relevant.
- **Expected result:** the role instantly governs everything that user can see and do (via RLS). **Tips:** the *login* account is created in Supabase; `/admin` governs the app-side role. **Common mistakes:** giving Sales a supervisor flag unintentionally widens their scope to the whole team. **Related:** *permission matrix*. `[ADMIN-01]`

### How to manage pricing, communications, and the annual rollover
- **Pricing rules** (`/pricing`) — discount/price rules (also editable by Business Owner). **Communications** (`/communications`) — message templates. **Annual rollover** (`/rollover`) — roll the training year forward (**Rebuild** = fresh, **Copy** = clone last year). These are configuration tasks; do them deliberately and off-peak.

---

## 8. Other Role Manuals

### Coordinator
Your daily surface is **My Work** and **CRM**. You: create orders (*§6 create a sales order*), work them through the fulfilment stages, and **endorse** them to Operations (*§6 endorse*). You can **return** an endorsement isn't yours to accept — that's Operations. You also triage **duplicate orders** (My Work → Possible duplicates → Resolve).

### Sales Manager
Your surface adds **Team** (Workload · Queue · Pipeline). Use **Workload** to see how orders are distributed across your reps, **Queue** to reassign/claim/advance, and **Pipeline** to watch the team's leads. Your dashboard shows team pipeline, stalled orders, unassigned orders, and conversion. You see the team's records (region-scoped); you don't own individual reps' leads.

### Business Owner
Your jobs are **approvals** and **money**. Decide forecast sign-offs and session cancellations (*BO-J1*); **void/refund** payments (*BO-J2*); oversee **Pricing**. Your dashboard leads with pending approvals, booked/delivered revenue, AR outstanding, and cancellation rate — each drills through.

### Management (read-only)
You land on **Overview** (KPI tiles, all drill-through), and use **Financial** (receivables + revenue) and **Analytics** (full workbench). You cannot change anything — that's by design. If you see a button that looks editable, it will be rejected by the database; report it.

### Auditor (read-only)
You land on **Search** and **Audit**. Use global **Search** to find any record, then the **Audit log** to see its change history. Your dashboard tracks changes today, deletes this week, profile/access changes, and high-risk writes — all linking into the audit log.

---

## 9. Cross-Role Workflows

See **WORKFLOW-MATRIX.md** for the full tables. The essentials:

- **Sales → Coordinator:** hand over when the deal is won / quote accepted. Coordinator creates the order.
- **Coordinator → Operations:** the **endorsement handoff**. Coordinator endorses; **Operations must Accept** to take ownership; Operations can **Return for correction** (with a reason). *Because Operations isn't auto-notified, agree a working convention (e.g. a quick message on urgent endorsements) until in-app handoff notifications ship.*
- **Operations → Business Owner:** session cancellations and forecasts go to the Business Owner to **Approve/Reject**.
- **Everyone → Management/Auditor:** all changes are visible read-only and in the audit log.

---

## 10. Status Reference

Full tables (with who sets each status and the allowed next status) are in **STATUS-DICTIONARY.md**. The rule to remember: **process status ≠ health**. An order carries three status fields at once — *fulfilment stage* (where in the pipeline), *order status* (lifecycle), and *payment status* — plus a derived *collection state*. Read them together.

---

## 11. Troubleshooting

See **TROUBLESHOOTING.md**. Most common: "I can't edit this" (your role is read-only or you don't own the record — expected), "the session won't confirm" (below minimum — use Confirm Go anyway, or add participants), "my search finds nothing" (search is exact-match; try fewer letters), "Operations didn't see my order" (endorsement isn't notified — tell them).

---

## 12. FAQ

- **What's the difference between a course and a session?** A course is the template (no dates); a session is one scheduled run of it. You sell seats in sessions.
- **I logged a lead but the customer already exists — now there are two.** The inquiry form doesn't check for existing customers. Search first (⌘K). Ask a Super Admin to merge if a duplicate slips through.
- **Why can't I change the payment status / SAP number?** Sales can't — a database rule blocks it. Ask Operations/Coordinator.
- **I endorsed an order — did Operations get it?** It's in their fulfilment queue, but they aren't pinged. Tell them if it's urgent.
- **The header says Paid but there's still a balance.** Trust the AR balance on the Payments tab; the header pill can drift (known issue).
- **Can I delete a record?** Almost nothing is truly deleted — participants are removed (soft), payments are voided, orders are cancelled. Contacts are the one exception (hard delete, Super Admin/Coordinator).
- **Where did the Dashboard / Reports / Organizations menu go?** They were consolidated — Dashboard/Reports live under **Analytics**; Organizations under **Customer 360**. Old links redirect.

---

## 13. Glossary

See **GLOSSARY.md**.

## 14. Quick Reference

See **QUICK-START-GUIDE.md** for one-page procedures for the highest-frequency tasks.
