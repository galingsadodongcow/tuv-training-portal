# User Journeys — Academy Portal

> **Evidence basis:** journeys are reconstructed from the screen components, hooks, RPCs and status enums (**VERIFIED from source + live DB**). Live click-through and screenshots are **NOT TESTABLE** here (auth-gated deployment). Field names, buttons, required fields, validation and confirmations below are taken from the actual code; screenshot markers `[OPS-nn]` etc. are placeholders for a credentialed pass.

Format per journey: ID · Role · Objective · Start · Prerequisites · Steps · System response · Result · Next · Mistakes & recovery · Permissions · Manual notes.

---

## OPERATIONS

### OPS-J1 · View the calendar and find a session
- **Role:** Operations · **Objective:** locate a scheduled session · **Start:** `/calendar` · **Prereq:** sessions exist.
- **Steps:** (1) Open Calendar. (2) Choose a view — **Month / Week / Day / List** (segmented control; persists in the URL as `?cal=`). (3) Filter by Month, Year, Status, Category, Learning type, or type in the search box (searches course name). (4) Click a session.
- **System response:** a **session drawer** slides in with summary + inline actions.
- **Result:** session drawer open. **Next:** assign trainer/venue or open full session.
- **Mistakes/recovery:** wrong filter → clear it; the drawer is not deep-linkable, so you can't share the exact drawer via URL (open the full session `/session/[id]` to share).
- **Permissions:** all can view; inline edits are Ops/super_admin only.
- **Manual notes:** the Calendar is the operational command centre — most scheduling actions start here. `[OPS-01: Calendar list view + filters]`

### OPS-J2 · Create a course (with category/subcategory)
- **Role:** Operations/super_admin · **Objective:** add a reusable course · **Start:** `/courses` (Training catalogue) · **Prereq:** a category + subcategory exist (create them in the same form).
- **Steps:** (1) Click **+ New course** (opens the edit drawer). (2) Enter **Training title** (required). (3) Pick **Category** then **Subcategory** (dependent selects; subcategory disabled until a category is chosen). (4) Pick **Training type** (PersCert / Professional). (5) Tick each **learning type** offered and enter its **fee** (at least one required). (6) *(Advanced fold:* certification, assessment, pass mark, cert validity, seat cap, webshop URL.) (7) Save.
- **System response:** validation on submit (toast); course appears in the directory.
- **Result:** course created. **Next:** schedule a session from it (OPS-J3).
- **Mistakes/recovery:** no learning type/price → blocked with a toast; the form has no inline field errors (submit-only).
- **Permissions:** super_admin, operations only. **Manual notes:** *A course has no dates* — dates come from a Session. `[OPS-02: Course edit drawer]`

### OPS-J3 · Schedule a session (Session lifecycle: create → confirm → complete)
- **Role:** Operations · **Objective:** put a course on the calendar · **Start:** `/session/new` (or "Book" from a calendar course) · **Prereq:** course exists.
- **Steps:** (1) Pick **Course** (required). (2) Pick **Learning type**. (3) Add one or more **date blocks** (validated live). (4) *(More options:* fee, min/max pax, sales owner, trainer, venue, status, private-run — all defaulted from the course; leave collapsed for a quick create.) (5) Save → session created as **Tentative**.
- **Confirm:** open the session → **Go/No-Go** panel → **Confirm Go** (if below minimum, a second "Confirm Go anyway" arming click is required). Status → **Confirmed**.
- **Deliver:** set **Running** → **Completed** (completion is confirmed via a dialog; "cannot be undone from here").
- **System response:** live double-booking check on trainer/venue/date shows a blocking notice; pax/fee default from the course.
- **Result:** a session that moves Tentative → Confirmed → Running → Completed. **Next:** assign trainer/venue (OPS-J4), enrol participants (OPS-J6).
- **Mistakes/recovery:** end date before start / conflict → submit disabled until resolved. **Permissions:** ops/super_admin write; others read.
- **Manual notes:** the two confirmation doors (raw status override vs Confirm Go) can diverge — prefer **Confirm Go**. `[OPS-03: New session form]` `[OPS-04: Go/No-Go panel]`

### OPS-J4 · Assign a trainer and venue (inline)
- **Role:** Operations · **Start:** Calendar → session drawer (or session edit).
- **Steps:** (1) In the drawer, choose a **trainer** (the picker flags trainers *qualified* for the course) and a **venue** — each is a single-click assign. (2) A **conflict check** runs best-effort; a warning notice appears on a clash (never blocks). (3) *(Optional)* **Confirm session** from the drawer.
- **Result:** trainer/venue set without leaving the calendar (this replaced a ~4-click open→edit→save→back path). **Permissions:** ops/super_admin. `[OPS-05: Session drawer inline assign]`

### OPS-J5 · Manage trainers / venues
- **Role:** Operations · **Start:** `/resources` (Trainers / Venues tabs).
- **Steps:** add/edit a **trainer** (expertise, qualified courses) or **venue** (capacity, location); the Trainers row shows delivered-session counts.
- **Permissions:** super_admin, operations, business_owner. **Manual notes:** trainers do **not** log in — this is where the pool is maintained.

### OPS-J6 · Manage participants (roster) → attendance → certificate
- **Role:** Operations/Coordinator · **Start:** `/session/[id]` → **Participants** tab (RosterPanel) · **Prereq:** confirmed/booked session.
- **Steps:** (1) **Add** a participant, or **CSV import** (preview + validation + over-capacity warning). (2) **Mark attendance**. (3) Enter **assessment score/result** (if the course has an assessment). (4) **Issue certificate** (single) or **Issue all** (bulk; warns "cannot be un-issued from here"). (5) **Transfer** a participant to another session of the same course; or **soft-remove** (danger + optional reason; record is flagged Removed, history preserved).
- **System response:** toasts on every action **except assessment score/result (silent — verify manually)**; roster + fill counts refresh.
- **Result:** roster with attendance + certificates. **Mistakes/recovery:** removed a wrong participant → it is a soft-delete; re-add or ask super_admin. **Permissions:** ops/coordinator/super_admin. `[OPS-06: Roster panel]`

### OPS-J7 · Reschedule / cancel a session
- **Reschedule:** open the session → **Edit dates** (`/session/[id]/edit`) → change date blocks → Save.
- **Cancel:** session **More actions → Cancel with dispositions** → the Cancel modal surfaces missing dispositions before you confirm; cancellation **files a business-owner approval** (it is not a unilateral delete). **Permissions:** ops proposes, business owner approves.

### OPS-J8 · Fulfilment queue (advance / assign / bulk)
- **Role:** Operations/Coordinator · **Start:** CRM → **Orders → Needs fulfilment** (`/worklist` redirects here).
- **Steps:** filter by owner (Mine / Claim queue / Everyone) and stage; **advance** an order to its next stage; **assign/reassign** an owner; **select rows → bulk advance / bulk assign**.
- **Permissions:** ops/coordinator write; management/auditor read-only (controls hidden). `[OPS-07: Fulfilment queue]`

---

## SALES

### SALES-J1 · Capture a lead
- **Role:** Sales · **Start:** CRM → **Pipeline → + New inquiry**.
- **Steps:** enter **Company** (required), Contact, Email, Course of interest (+ Salesperson if admin). *(Add deal details:* phone, offering, pax, value, probability, expected close, source.) Save.
- **System response:** submit-only validation (toast). **⚠ No customer lookup** — typing an existing customer's details creates a duplicate (see Friction Log FR-DUP-1).
- **Result:** inquiry in the pipeline. **Next:** qualify → quote. **Permissions:** sales/coordinator/super_admin. `[SALES-01: New inquiry form]`

### SALES-J2 · Qualify a lead
- **Steps:** in the Pipeline table, **Edit** the inquiry to add value/probability/expected close; advance the stage (Received → Responded → RFQ or P Sent → Awaiting Feedback); or mark **Lost** (reason) / **Reopen**.
- **Manual notes:** qualification opens a *separate* edit form repeating the create fields.

### SALES-J3 · Create a quote → convert to order
- **Role:** Sales/Coordinator · **Start:** CRM → **Quotes → New quote**.
- **Steps:** (1) Pick **Client** (must already exist), set **Valid until** → creates the quote and opens **Quote detail**. (2) **Add lines** (course, learning type, seats, unit price — price auto-fills from the catalogue; a **discount hint** offers a one-click best-rule apply). (3) Header edits (status, valid-until, discount %) save **inline on blur**. (4) When accepted, **convert to order** (prefills lines into `sales-entry`).
- **Result:** quote → order. **Permissions:** sales/coordinator/super_admin. `[SALES-02: Quote detail]`

### SALES-J4 · Create a sales order
- **Role:** Coordinator/Sales · **Start:** `/sales-entry` (CRM header "+ New order", or from a customer/quote).
- **Steps:** (1) **Customer** — pick existing or enter new (name/company/**email required**; a live duplicate-email warning appears). (2) **Order** — **Order number (required, typed by hand)**, order date (defaults today), channel. (3) **Training lines** — per line: course, learning type, **session (required unless E-learning)**, seats, **fee (required, auto-fills from catalogue/session)**; **+ Add another training** for more lines. Save.
- **System response:** inline field errors appear **after the first submit** (the only form in the app with inline errors); owner is taken from your profile automatically; currency is PHP implicitly.
- **Result:** order (stage New). **Next:** work it → **endorse** (SALES/COORD-J5). **Mistakes/recovery:** full session → the line auto-sets to Waitlist. **Permissions:** sales/coordinator/super_admin. `[SALES-03: New order form]`

### SALES/COORD-J5 · Endorse an order to Operations (the handoff)
- **Role:** Coordinator/Sales · **Start:** `/orders/[id]` → **Endorsement** section.
- **Steps:** (1) Clear the **completeness blockers** listed. (2) Click **Endorse to Operations**. (If blockers remain, only super_admin can override, with a reason.)
- **System response:** stage → Endorsed to Ops; handoff → **Endorsed**; you get a toast. **⚠ Operations is NOT notified in-app** — they find it via the fulfilment queue.
- **Result:** order with Operations. **Next:** Operations **Accepts** (or **Returns for correction** with a reason, which comes back to you). **Permissions:** endorse = coordinator/sales/ops/super_admin. `[SALES-04: Order endorsement]`

---

## BUSINESS OWNER

### BO-J1 · Decide an approval
- **Role:** Business owner/super_admin · **Start:** `/approvals` (or My Work → Approvals to decide).
- **Steps:** review the pending item (forecast sign-off / session cancellation / session review) → **Approve** or **Reject** (danger tone) with an optional **Decision note**.
- **System response:** decision + decider + date recorded; toast. **Manual notes:** the note is optional — recommend always adding one (Friction Log FR-REASON-1). **Permissions:** business_owner/super_admin only. `[BO-01: Approvals]`

### BO-J2 · Void / refund a payment
- **Start:** `/orders/[id]` → **Payments** tab → on a payment row, **Refund** (amount + required reason) or **Void** (required reason).
- **System response:** confirm dialog (danger); payment is voided (kept, struck through) or a refund row is recorded. **Permissions:** business_owner/super_admin only; payments are never deleted.

---

## MANAGEMENT (read-only)

### MGMT-J1 · Oversight
- **Start:** `/overview` (landing) → KPI tiles (booked/delivered revenue, pipeline, conversion, AR, session health, exceptions) each **drill through** to records. → `/financial` for receivables + revenue; `/analytics` for the full tabbed workbench.
- **Permissions:** read + export only. Any write control shown here is a defect.

## AUDITOR (read-only)

### AUD-J1 · Reconstruct a record
- **Start:** `/search` (landing) → type ≥ 2 characters → open the matching order/customer/session/participant/etc. → cross-reference in `/audit` (change log). Dashboard cards (changes today, deletes this week, profile/access changes, high-risk writes) all link into `/audit`.
- **Permissions:** read + audit export. **Manual notes:** search is exact-match (no typo tolerance) and has no result preview yet.

---

## ADMINISTRATOR (super_admin)

### ADMIN-J1 · Create a user & assign a role
- **Start:** `/admin` (Users & access).
- **Steps:** create the user, assign a **role** (one of the 8), and map to a salesperson where relevant.
- **System response:** the role drives every RLS permission. **Manual notes:** account creation for *login* is done in Supabase (the login screen says so); `/admin` governs the app-side profile/role. **Permissions:** super_admin only. `[ADMIN-01: Users & access]`

### ADMIN-J2 · Configuration
- Pricing rules (`/pricing`), Communications templates (`/communications`), Annual rollover (`/rollover`, Rebuild/Copy a training year). **Permissions:** super_admin (+ operations; pricing also business_owner).

---

## CROSS-ROLE JOURNEY (the full spine, multiple people)

### X-J1 · From lead to certified participant
1. **Sales** logs an inquiry → qualifies → quotes. *(Inquiry, Quote)*
2. **Sales/Coordinator** wins it, creates the **order** with session-linked lines. *(Order: New)*
3. **Coordinator** works and **endorses** the order. *(Handoff: Endorsed → Operations)*
4. **Operations** **accepts**, sets SAP, ensures the **session**, assigns **trainer + venue**, enrols **participants**. *(Order: SAP Created; Session: Tentative→Confirmed)*
5. **Operations** runs and **completes** the session, marks **attendance**, issues **certificates**. *(Session: Completed; Certificates issued)*
6. **Coordinator/Ops/BO** record **payments**; **Business owner** handles any refund/void and approvals. *(Payment: Paid)*
7. **Management/Auditor** read the result in Analytics/Financial and the audit log.
- **The two friction points in this chain:** the silent Coordinator→Operations handoff (step 3→4) and the duplicate-customer risk if the lead (step 1) wasn't linked to an existing client.
