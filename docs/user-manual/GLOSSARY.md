# Glossary — Academy Portal

> Business + system terminology. **Common confusion** flags terms that overlap or are used inconsistently across screens (cross-referenced to the Friction Log).

| Term | Meaning | When used | Related object | Common confusion |
|---|---|---|---|---|
| **Course** | Reusable training *template* — title, category, learning types and fees. Holds no dates. | Catalogue (Training) | Category, Session | ⚠ Often confused with **Session**. A course is the "what"; a session is a scheduled "when". |
| **Session** | One scheduled *instance* of a course — specific dates, trainer, venue, capacity. Also called a *schedule* in the data. | Calendar, Session detail | Course, Trainer, Venue, Participant | ⚠ "Schedule" (DB) = "Session" (UI). |
| **Category → Subcategory** | Two-level classification of courses (e.g. "Occupational H&S → General"). | Course form, Calendar filter | Course | Replaced the old free-text `course.category`; every course now has a subcategory. |
| **Learning type / Modality** | How a course is delivered: **Live Online Training**, **Face-to-face**, **E-learning**. Each has its own fee. | Course fees, session, order line | Course fee | "Learning type" (UI) = `modality` (DB). |
| **Training type** | `PersCert` (personnel certification) or `Professional`. Not the same as learning type. | Course | Course | ⚠ Distinct from learning type/modality. |
| **Trainer** | Person who delivers a session. **External or internal — managed by Operations; trainers do NOT log in.** | Resources, Session | Session | No trainer role/login exists (by design). |
| **Venue** | Physical/virtual location for a session, with capacity. | Resources, Session | Session | — |
| **Customer / Client** | The buying organisation or person. Route is `/clients`, label is "Customers". | Customers, Customer 360 | Order, Contact, Organization | ⚠ "Client" (route/data) = "Customer" (label). |
| **Contact** | A named person at a customer (name, title, email, phone). Multiple per customer. | Customer 360 → Contacts | Customer | The one object with a hard delete. |
| **Organization** | Parent grouping over several customer accounts ("Related accounts"). | Customer 360, Organization record | Customer | Organizations were folded into Customer 360; the list is retired. |
| **Inquiry / Lead** | An unqualified or in-progress sales opportunity. | CRM → Pipeline | Customer, Quote | "Inquiry" (UI) = lead; there is no separate "Opportunity" object. |
| **Quotation / Quote** | A priced proposal with lines, before it becomes an order. | CRM → Quotes, Quote detail | Inquiry, Order | — |
| **Order** | The commercial record of a sale — customer + lines, fulfilment stage, AR. | CRM → Orders, Order detail | Quote, Session, Payment | Carries **three** status fields (see Status Dictionary). |
| **Order line** | One item on an order — a course + learning type + seats + a session (unless E-learning). | Order detail → Lines | Order, Session | "Move booking" moves a line to another session. |
| **Participant** | A person enrolled in a session (the roster). | Session → Participants | Session, Certificate | ⚠ "Transfer" (participant → another session) ≠ "Move booking" (order line). |
| **Roster** | The list of participants on a session, with attendance and certificates. | Session → Participants | Participant | — |
| **Fulfilment stage** | The order's pipeline position (New … Endorsed to Ops … SAP Created). | Order, Fulfilment queue | Order | The *primary* order status. |
| **Endorsement / Handoff** | Sending an order from Sales/Coordinator to Operations for fulfilment. | Order detail | Order | Statuses: Endorsed → Accepted / Returned. |
| **Fulfilment queue / Worklist** | The operational queue of orders to advance/assign. | CRM → "Needs fulfilment" | Order | Route `/worklist` redirects into the CRM Orders saved view. |
| **Go / No-Go** | The advisory recommendation on whether a session should run. | Session detail | Session | The system *advises*; Operations *decides*. No-Go proposes, it does not cancel. |
| **Health / Risk** | Whether a record needs attention (Blocked/Risk/OK/Done). Separate from process status. | everywhere | all | ⚠ Not the same as "status". |
| **Collection state** | Derived AR position (Paid/Due soon/Overdue…). | Order, Receivables | Payment | Different clock (30d) from lead ageing (7d). |
| **Approval** | A decision (forecast sign-off, cancellation, session review) the Business Owner makes. | Approvals, My Work | Session, Forecast | — |
| **Duplicate** | A suspected duplicate order pair awaiting merge/dismiss. | Duplicates | Order | — |
| **E-learning access** | Platform access for a self-paced (session-less) order, granted after payment. | E-learning, CRM saved view | Order | "Grant anyway" (pre-payment) needs a reason. |
| **Rollover** | Rolling the training catalogue/sessions into a new year (Rebuild or Copy). | Annual rollover | Session, Year | Admin/config task. |
| **Saved view** | A stored filter preset. **The preference object exists in the DB but no UI ships it yet** (see Friction Log). | — | — | Do not promise this to users until built. |
| **Command palette** | The ⌘K / Ctrl-K jump-to + record-search overlay. | global | all | — |
| **My Work** | The single per-user action surface (landing for most roles). | `/my-work` | tasks, orders, sessions | Replaced the retired "Home" and "Operations today". |
