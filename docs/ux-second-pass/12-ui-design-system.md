# 12 — UI & Design System (Parts 16, 35, 36, 39, 41, 42)

> Second-pass. Grounded in `src/app/globals.css` (tokens), `src/components/record.tsx`, `ui.tsx`, `src/lib/orderState.ts` (`primaryFlag`), `src/lib/health.ts` (`v_session_health`), `src/components/ActivityTimeline` + `src/lib/activity.ts` (`mergeActivity`), and the current record/list screens. Baseline: `docs/qa/ux-review/02`, `03`. Phase 3 already darkened `--text-faint` to AA, added a shared `:focus-visible` ring, and tokenized pill hexes.

---

## Part 16 — Status vs Health (two separate models per entity)

**Principle (enforced):** every transactional entity carries **one process status** (user/action-driven, hand-set) and **one computed health/exception signal** (never hand-set). Today only Order (`primaryFlag`) and Session (`v_session_health`) have both. Inquiry and Quote have status but **no health signal**.

| Entity | Process status (user/action-driven) | Health / exception (computed, never hand-set) | Where it lives today |
|---|---|---|---|
| **Inquiry** | Received → Responded → RFQ/P Sent → Awaiting Feedback → Closed Won/Lost (+reason) | **NOT IMPLEMENTED** — add *aging* flag (days since last touch vs SLA) → Fresh / Aging / Stale | status only; aging is manual |
| **Quotation** | Draft → Sent → Accepted (auto on conversion) / Declined / Expired | **NOT IMPLEMENTED** — add *expiring-soon / expired* derived badge (Expired now auto-fires nightly via `fn_nightly_hygiene`, so surface it) | status only |
| **Order** | `fulfillment_stage` (New→…→SAP Created→No Feedback→Cancelled; guarded by `fn_orders_stage_guard`) + `payment_status` (Unpaid/Partial/Paid, AR-trigger only, sales blocked 42501) | `primaryFlag(o)`: Paid-not-endorsed / No-owner / No-feedback / Stalled Nd; + `collectionState`: Overdue / Due soon (IMPLEMENTED) | `orderState.ts`; rendered on Orders, Worklist, OrderDetail `BlockerBar` |
| **Payment** | (event) — Recorded | derived: On-time / Late / Unmatched-ref | **NOT IMPLEMENTED** as a signal; payments mutable/deletable (ledger) |
| **Session** | `status` (Tentative↔Confirmed user; Running/Completed action/date-driven; Cancelled via `fn_cancel_schedule`) + `go_status` (Go/No-Go, system) | `v_session_health`: Healthy / Needs Attention / At Risk / Blocked, proximity-weighted (IMPLEMENTED) | `health.ts`; header, Calendar, My Work |
| **Participant** | Registered → Attended / No Show; result Pending/Pass/Fail | derived: missing-info / cert-overdue | partial (roster "N of Y captured") |
| **Approval** | Pending → Approved / Rejected | derived: overdue (Pending > N days) | **NOT IMPLEMENTED** — no deadline/escalation |
| **Task** | open / in_progress / blocked / closed | derived: overdue (past `due_date`) | task table; auto-close on condition clear |

**Rendering rule (make it a convention):** process status uses a **solid pill** (`StatusPill`, `pill-webshop` for stage); health uses a **distinct visual channel** — a health pill (`health-*` classes) *plus* a leading dot/marker, and it is **suppressed when it would duplicate a terminal status** (SessionDetail already does this: `h !== 'Completed' && h !== 'Cancelled'`). Never let a health color masquerade as a status pill — they answer different questions (Q3 "where do I do it" vs Q5 "is it progressing correctly").

**To close the model:** extend `primaryFlag`/`v_session_health` to inquiry (aging) and quote (expiring). Both are cheap derived views, not new hand-set columns.

---

## Part 35 — Activity timeline (one pattern across records)

**Current state (IMPLEMENTED, reuse it):** `ActivityTimeline` + `mergeActivity(...)` in `src/lib/activity.ts` already merges heterogeneous sources into one time-ordered rail: `noteEvents`, `taskEvents`, `notificationEvents`, `auditEvents`, `approvalEvents`. OrderDetail, ClientDetail, SessionDetail all call it. CSS (`.timeline*` in globals) renders a dotted rail with title/detail/when. This is the right foundation.

**Two layers, kept separate:**
- **Human-friendly timeline** (the Activity/History tab) — "Ana advanced this order to Endorsed to Ops", "Cancellation approved by BO", "Note added". Actor + verb + object + relative time. This is `mergeActivity` today.
- **Value-level audit** (the Audit tab, admin) — before/after field values. **NOT IMPLEMENTED / NEEDS DB:** `auditEvents` currently renders `changed_fields` which is **field-names only, no before/after** (ledger) — not audit-grade. Keep the two as *separate tabs* so the timeline stays readable and the audit stays forensic.

**Events every record should capture** (many already flow through `mergeActivity`): created; status/stage change (who, from→to); ownership change / reassign / claim; note added; task created/closed; approval requested/decided; SLA breach / escalation; handoff sent / accepted / returned (once handoff-as-transaction lands, ledger); money events (payment recorded, refund, quote sent/accepted). Session adds: confirmed, closed, cancelled, transfer, waitlist promote.

**Consistency fixes:** put the timeline in the **same place on every record** — the Activity tab body *and* a 3–5-event preview in the right rail (Part 15). Today OrderDetail/ClientDetail put it in an always-on section at the bottom of a long scroll; SessionDetail puts it in a History tab. Standardize on the tab + rail-preview pair.

---

## Part 36 — UI design review (screen by screen)

The app's Vercel/Geist monochrome base is **calm and professional** — this is a strength; the review is about consistency, not a restyle.

**Global / cross-cutting**
- **Hierarchy** — good: `page-head h1` at 22px/650, muted subtitle capped at 72ch, uppercase `k-label` micro-labels. Headings are *not* oversized — no consumer-app hero text. Keep.
- **Typography** — one family (Geist), 14px base, tight `-0.02em` on headings. Consistent. Body line-height 1.55 is comfortable.
- **Density** — a `data-density=compact` token exists but is app-global; tables want per-view density (Part 25). List rows are a touch tall for a queue (`td` 11px vertical).
- **Color** — semantic tokens (`--success/--danger/--warning/--accent`) with light+dark; legacy `--tr-*` aliased. Clean. One risk: several inline styles hard-reach `var(--tr-amber)` / `var(--tr-red)` for flag text (Orders/Worklist `primaryFlag` rendering) instead of using a class — tolerable but drifts from the tokenized-pill discipline.
- **Status/health indicators** — the concern is **pill proliferation.** OrderDetail's header badge row can show channel + stage + payment + collection + assignee + email simultaneously (six chips), and `record.tsx` `Badge` maps tones onto *status* pill classes (`pill-go`, `pill-nogo`) — reusing status colors for generic badges muddies the status-vs-health separation. Cap the header to status + health + owner; push the rest into the summary band.
- **Buttons** — solid primary (`--btn-bg` near-black), ghost secondary, danger. Good, restrained. But screens render flat `toolbar`s of equal-weight ghost buttons (SessionDetail ops stack: Tentative/Confirmed/Running/Completed/Close/Cancel/Clone all `btn-ghost btn-sm`) — no primary emphasis, so the *next* action doesn't stand out (fails design-test Q2). Introduce the primary/secondary/⋯ hierarchy (Part 15.2).
- **Forms** — labels + `req-star` + `.field-error` + `.invalid` are solid post-Phase-4. Inputs have hover + focus-ring. Good.
- **Tables** — clean; sticky-1 first column; `clickable` rows with keyboard handlers + `aria-label`. Missing sticky header + sort on two of four (Part 25).
- **Cards** — `.card` + `.card-pad`; subtle shadow. Risk is **card overload**: OrderDetail/ClientDetail stack 5–6 full cards vertically. Tabs (Part 15) fix this.
- **Tabs** — `RecordTabs`/`.tabbar` with `role=tablist`, `aria-selected`, underline-on-active, overflow-x scroll. Good.
- **Drawers/modals** — drawer has scrim+blur+slide-in+sticky head; Confirm dialog is focus-trapped with Escape (ledger). Good.
- **Headers** — `RecordHeader` consistent shape. Needs breadcrumb + action hierarchy (Part 15).
- **Filters** — `.filters` flex-wrap row; Worklist shows live counts on chips (excellent — count-in-label is the pattern to copy to Orders).
- **Empty/loading/error** — consistent (`Spinner`, `ErrorNote`, `.empty`, `TableSkeleton`); error states everywhere (ledger). Strong.
- **Charts/calendar** — Recharts + "View as table" toggle (Phase 3); calendar risk shown by text tag not color-alone (Phase 3). Good.

**Verdict:** professional and calm already. The specific flags are (1) **pill proliferation in record headers**, (2) **equal-weight button toolbars** hiding the next action, (3) **card-stack overload** on OrderDetail/ClientDetail (→ tabs), (4) `Badge` reusing status-pill classes for non-status meaning. No consumer-app styling, no oversized headings.

---

## Part 39 — The standardized design system

Each recommendation states its **functional purpose** (why the rule earns its place). Where Phase 3 already delivered, it is marked.

| Element | Standard | Functional purpose |
|---|---|---|
| **Typography** | One family (Geist). Scale: h1 22/650, section `k-label` 11.5px uppercase, body 14/1.55, micro `fill-label` 12px. `-0.02em` headings. | One type ramp = instant hierarchy read; uppercase micro-labels separate structure from content without size inflation. |
| **Spacing** | 4px base; card-pad 20 (14 compact); section rhythm via `.record-section` 18px top border+pad. | Predictable rhythm lets the eye chunk a dense ops screen. |
| **Grid** | `main` max-width 1320; `.grid` auto-fit `minmax(200,1fr)`; collapse to 1fr ≤860. | Content stays measure-bound on big screens, reflows on small. |
| **Semantic colors** | `--success/--danger/--warning/--accent` + light/dark; legacy `--tr-*` aliased. | Meaning-by-token, not hex; themes swap cleanly. (Phase 3 darkened `--text-faint` to AA.) |
| **Buttons** | Solid primary, ghost secondary, danger; `btn-sm`. **Add:** exactly one primary per action group; secondary ▾ + ⋯ overflow. | The *next action* must be visually singular (design-test Q2); equal-weight toolbars hide it. |
| **Inputs** | Full-width, `--border-strong`, focus ring `--ring`, `.invalid` + `.field-error`, `req-star`. | Consistent affordance + AA focus (Phase 3) + inline validation at point of error. |
| **Autocomplete** | **NEW:** client/course/trainer type-ahead reading existing records (Part 27). | Kills retyping of data that already exists (the top manual-entry cost). |
| **Date fields** | `type=date`; range monotonic-validated (SessionForm, shipped). | Native picker + end≥start guard prevents impossible ranges. |
| **Tables** | `.card > table`, `sticky-1` first col, `clickable` rows w/ keyboard + `aria-label`. **Add:** sticky header, sort, density, saved views. | A queue is scanned top-to-bottom repeatedly; sticky context + sort are the core operations (Part 25). |
| **Cards** | `.card`+`.card-pad`, subtle shadow. **Rule:** ≤3 stacked; more → tabs. | Prevents the OrderDetail/ClientDetail long-scroll card stack. |
| **Tabs** | `RecordTabs` `role=tablist`, URL-driven active. | Shared link/refresh lands on the same tab; one navigation model per record. |
| **Badges** | `Badge` tones — **stop reusing status-pill classes** for generic badges; give it its own neutral set. | Keeps status colors meaning *status* only (Part 16). |
| **Status chips** | Solid pill, one per entity (`StatusPill`, stage pill). | One glance = where in the process (Q3). |
| **Health indicators** | `health-*` pill + leading dot; suppressed when terminal. | Distinct channel from status; answers "is it progressing" (Q5). |
| **Modals** | Focus-trap + Escape + `role=dialog aria-modal`. Destructive → Confirm w/ reason. | Prevents accidental destructive actions; a11y baseline. |
| **Drawers** | Right slide-in, scrim, sticky head. Use for SessionForm off Calendar. | Edit-in-context without losing the list. |
| **Alerts/notices** | `.notice-info/warn/error` bordered banners; `BlockerBar` for record blockers. | Severity-by-token; blockers hoisted above tabs (Part 15). |
| **Notifications** | `NotificationCenter` bell + count + panel (shipped). Group by day, class icon, record deep-link. | Central inbox; classes route (Part 16). |
| **Tooltips** | `title=` today; upgrade attention markers to show GoNoGo `health[]` sentences on hover. | Detail on demand without cluttering the row. |
| **Breadcrumbs** | **NEW:** `RecordHeader.crumbs[]`. | Fixes orphaned record pages + no-breadcrumb ledger gap. |
| **Headers** | `RecordHeader` + crumb + action hierarchy + owner/due. | One record header shape everywhere. |
| **Search** | ⌘K global; extend to email/phone/participant/trainer/cert + typo tolerance (ledger). | One finder for all entities. |
| **Filters** | `.filters` chips with **live counts in label** (Worklist pattern). | The count *is* the information scent. |
| **Empty/loading/error** | `Spinner`, `ErrorNote`, `.empty`, `TableSkeleton` — everywhere (shipped). | No failed fetch renders as "no data". |
| **Confirms** | `useConfirm` promise dialog, `tone:danger`, optional reason (shipped). | Judgment stays human; reason captured for audit. |
| **Destructive** | Danger button + confirm + reason; **no bare deletes** (roster/payment still hard-delete — ledger gap). | Reversibility + trail. |
| **Focus** | Shared `:focus-visible` ring on nav/tab/linkbtn/seg/cmdk/cal-event/back-link/button (Phase 3). | Keyboard users can see where they are. |

---

## Part 41 — Accessibility (verify post-remediation, don't assume)

**Verified present in current code / CSS:**
- **Contrast** — `--text-faint` darkened `#8f8f8f → #6b6b6b` (~5.3:1 on white, passes AA). ✅
- **Focus** — shared `:focus-visible` ring (`--ring`) on nav-link, tab, linkbtn, seg-btn, cmdk-item, cal-event, back-link, and bare `button`. ✅ (verified in globals.css lines ~273–284).
- **Keyboard** — clickable table rows carry `role=button tabIndex=0` + Enter/Space handlers (Orders, Clients). ✅
- **Labels / ARIA** — inputs/selects carry `aria-label` where no visible label (LineTransfer reason, Worklist owner select, roster inputs); `aria-sort` on sortable headers (Clients). ✅
- **Required fields** — `req-star` visual + `required` attr (SalesEntry). ✅
- **Validation** — inline `.field-error` tied to fields, gated on submit-attempt. ✅ (not yet wired via `aria-describedby` — see below).
- **Tables** — sortable headers expose `aria-sort`; row purpose via `aria-label="Open order …"`. ✅
- **Dialogs** — Confirm/drawer focus-trap + Escape (ledger; not re-verified line-by-line here — **NEEDS TECHNICAL VALIDATION** that `role=dialog aria-modal` is on every modal, not just Confirm).
- **Status-not-by-color** — calendar risk shown as text tag + inset bar, not color alone; health pills carry text labels; ChartTable "View as table" toggle. ✅
- **Reduced motion** — `@media (prefers-reduced-motion)` zeroes animations. ✅

**What remains after Phase 3 (NOT IMPLEMENTED):**
1. **`aria-describedby` linking** — `.field-error` messages are visually adjacent but not programmatically associated to their input; a screen reader user hears the label, not the error. Wire `aria-describedby` + `aria-invalid`.
2. **Live regions** — toasts (`.toaster`) and inline save notices (`RecordNotice`) are not `aria-live`; success/error is silent to AT. Add `role=status`/`aria-live=polite` (errors `assertive`).
3. **Touch targets** — `btn-sm` (5px vertical) and `linkbtn` (padding 0 in places, e.g. OrderDetail "Move to another session", Worklist order-id) fall below the 44px target on mobile. Enlarge hit area on the ≤640 breakpoint.
4. **Tab semantics** — `RecordTabs` has `role=tab`+`aria-selected` but no `role=tabpanel`/`aria-controls` on the bodies and no arrow-key roving tabindex. Complete the tab pattern.
5. **Icon-only controls** — notification bell and topbar toggle: confirm each has an accessible name (`aria-label`) — **NEEDS TECHNICAL VALIDATION** (not visible in the files read here).
6. **Charts** — the "View as table" toggle is the a11y fallback (good); ensure every Recharts instance actually exposes it, not just Dashboard/Reports/Quality.

---

## Part 42 — Terminology dictionary (one term per concept)

**Action labels describe the outcome, not the mechanism** (a dropdown edit is not a verb the user thinks in). Canonical set:

| Concept | Canonical term | Action label |
|---|---|---|
| A person/company we sell to | **Customer** | — |
| A lead before it is an order | **Inquiry** | Assign to Sales · Return for Correction |
| A priced offer | **Quotation** | Send Quote · Convert to Order |
| A confirmed sale | **Order** | Advance · Endorse to Operations · Close Order |
| Moving an order to ops | **Endorse to Operations** | Send to Operations · Accept Handoff · Return for Correction |
| A scheduled run | **Session** | Confirm · Close Session · Cancel |
| Money owed | **Receivable** | Confirm Payment |
| A learner in a session | **Participant** | Mark Attendance |
| The queue of orders in flight | **Fulfillment** *(pick one)* | — |
| Delivery mode | **Learning type** *(pick one)* | — |

**Current drift to fix (verified in code):**

1. **Fulfillment = Worklist = "Fulfillment".** Nav route is `/worklist`, the screen `<h1>` says **Fulfillment**, the data hook is `useFulfillmentQueue`, and the docs call it "Worklist." Three names, one thing. **Pick "Fulfillment"** for the label and route, or fold the whole screen into My Work (Part 37) and retire the name entirely.
2. **Modality × 3.** `SalesEntry.tsx` field label says **"Learning type"** and `blankLine()` defaults `modality: 'Live Online Training'`; `QuoteDetail` defaults **`Face-to-face`**; the DB column and `lt()` label helper call it **modality**. One concept, three surface words and two house defaults. **Pick "Learning type"** as the user-facing term and **one default** across SalesEntry + QuoteDetail.
3. **Clients / Customers / Organizations.** The screen is titled **"Clients and attribution"**, the nav says **Clients**, ClientDetail's copy says **"Customer 360"** and renders "Customer not found", and **Organizations** is a separate screen for the same real-world concept (a company). Three words (Client/Customer/Organization) for two things (a contact vs the company they belong to). **Standardize on "Customer"** for the sellable entity and reserve **"Organization"** only if the parent-company grouping survives the Customer-360 merge (ledger defers this).
4. **"Move to another session" vs "Transfer".** OrderDetail says *Move to another session*; SessionDetail's order row says *Transfer*; both call `fn_transfer_line`. **Pick "Transfer".**
5. **"Pick up" vs "Claim" vs "Assign to me".** Worklist uses *Pick up* (self-assign button), the claim-queue filter says *Claim queue*, SalesEntry auto-"assigns". **Pick "Claim"** for self-assignment, **"Assign to …"** for assigning to someone else.

A single `labels.ts`-style term map (already the pattern for `lt()`/`formatSegments`) should own these strings so the drift can't re-open.
