# Data Quality, Error Prevention, Automation, Responsive, Accessibility, UI System, Redundancy, Priority Backlog & Roadmap

> Part 5 of 5. **Scope note:** a large remediation shipped this session (error states on Home/DataQuality; `useConfirm()` on every destructive action — Duplicates & Rollover previously used bare `window.confirm`; focus traps on Confirm/CommandPalette/TransferOrder/CancelSession/CloseSession; assertive toasts; mobile drawer `inert`+focus+Escape; skip-link; aria-labels; keyboard rows + `aria-sort`; chart empty-states + `role="img"`; CSV-injection guards; a DB trigger blocking sales from `payment_status`/`sap_order_no`; ops reassignment; `okOr` surfacing real errors). All treated as done. This part covers what remains.

## 1. Data-quality risks

The portal derives most "bad record" signals from views (`orderState.ts`, `DataQuality.tsx`, `weekly-digest`) — the right architecture. Gaps are in **capture-time validation**, **entity matching**, and one **broken merge**.

**Completeness gaps:** SalesEntry enforces only order_id + a fee per line + client email (contact/phone/country/channel default silently); the **reference/SAP number is free-text, hand-typed, no format/length/uniqueness check** (a typo breaks dup detection + SAP recon); roster names can stay blank to session start (detected by `weekly-digest`, not prevented); client-vs-organization has no enforced link (orphaned company strings). **Fix:** a field-completeness score per order/session/client (a view, like `orderState`), a chip on the record + a DataQuality tile, and **block endorsement (not entry)** below threshold.

**Consistency risks:** **currency** — `amount_php` is the only money column; multi-country orders are stored/shown as PHP (either commit to PHP-only + label, or add `currency`+`fx_rate` and stop hard-coding `php()`); **dates/times** — sessions have no time-of-day/timezone; `fn_queue_reminders` fires on UTC `start_date`, so a Manila session can remind a day early/late (store Asia/Manila explicitly); **learning-type naming** — three vocabularies (`modality` enum / "Learning Type" / friendly label) for one concept; **country** — `fn_country_inherit` cascades but nothing normalizes country strings at entry.

**Duplicate detection — the merge is broken and the code says so.** `fn_detect_duplicates()` populates `duplicate_candidate` when a sales order shares email or company+session with a webshop order (good coverage). But `Duplicates.tsx` `resolve(id,'Merged')` **only writes status='Merged'** — the file's own comment: *"It does NOT reconcile the two orders … seats and revenue stop being double-counted [must happen in an RPC]."* So today "Mark as duplicate" **hides the warning while leaving both orders live** — seats stay double-counted against session fill (feeding go/no-go) and revenue double-counted in Reports. **Worse than nothing.**

Matching rules to add (each a `match_basis` + confidence): same email (High), same phone/name+company (Med), normalized company name (Med), same client+session+overlapping dates (High), same reference prefix (High), same participant email in a session (High — block), same amount+order within N days (Med). **Build `fn_merge_orders(keep,dup,reason)`** — transactional: cancel the dup, re-parent/void its lines/participants, recompute fill+AR, write audit, then mark Merged; EXECUTE ops/super_admin only; before/after preview in the confirm. **Until it exists, rename the button to "Flag as duplicate (needs manual reconciliation)"** + a persistent "seats/revenue still doubled" warning. Also surface possible-duplicate chips **inline at creation** (SalesEntry email/company blur; ClientDetail banner; roster email block).

## 2. Error prevention

Principle: **prevent at capture, validate at handoff, confirm at destruction** (the session's `useConfirm` work covers the third; first two are thin).

| Error class | Prevent | Validate | Today |
|---|---|---|---|
| Invalid date range | Disable end before start in `DateSegments`; monotonic check | Trigger reject | ❌ no guard |
| Wrong stage transition | Render only legal next stages (Worklist `NEXT` map does) — but `.update({fulfillment_stage})` accepts anything | **DB trigger enforcing the stage graph** | ⚠️ UI-only |
| Wrong customer | Autocomplete + preview | Confirm naming customer on endorse | ⚠️ partial |
| Duplicate participant | **Unique `(schedule_id, lower(email))`** + UI block | — | ❌ |
| Duplicate order | Inline email+session check at entry | batch | ⚠️ batch only |
| Missing owner | Default-assign (done); alert on webshop imports | `isUnowned` + tasks | ✅ mostly |
| Missing required info | Completeness gate on endorsement | block "Endorse to Ops" | ❌ |
| Incorrect currency | Lock PHP or add currency field | — | ❌ |
| Wrong session | Course→session cascade (good) | warn if modality mismatch | ✅ good |
| Incorrect payment amount | Validate ≤ outstanding; warn on overpay | AR trigger | ⚠️ recomputes, doesn't reject |
| Accidental delete/cancel/reassign | `useConfirm(danger,reason)` | — | ✅ done |
| Sales self-marking paid | UI hides fields | `fn_guard_orders_sales_fields` (42501) | ✅ done |

**Highest-value additions:** (1) unique participant index + roster block; (2) stage-transition trigger (turns the UI `NEXT` map into an enforced state machine); (3) date-range guard; (4) endorsement completeness gate.

## 3. Automation opportunities

Strong scaffolding: edge functions `send-comms`/`nightly-hygiene`/`weekly-digest`; RPCs `fn_nightly_hygiene`→`fn_generate_worklist_tasks`, `fn_weekly_digest`, `fn_queue_reminders`, `fn_detect_duplicates`, `fn_enforce_pax`, AR recompute; `task`/`notification` tables; Home streams. **Build on these.**

**⚠️ CRITICAL:** `fn_queue_reminders()` (session reminders 3d out + overdue-payment reminders, de-duped over 7d) **is written but never scheduled or called.** `supabase/schedule.sql` crons only `weekly-digest` + `nightly-hygiene`; `fn_nightly_hygiene` calls `fn_generate_worklist_tasks` but **not** `fn_queue_reminders`. So participant + payment reminders never queue into `comms_log` and `send-comms` never sends them. **Fix: add `perform fn_queue_reminders();` to `fn_nightly_hygiene`** — one line unlocks two already-built automations.

Opportunities (*trigger/rule/action/exception/notify/override/benefit/risk*): **A. Auto inquiry assignment** (round-robin within region, respect supervisor load; override via Worklist reassign; risk: skewed load → cap per-rep open count). **B. Auto order validation** (completeness+dup+fee-sanity at endorsement; block hard fails, warn soft; super_admin override). **C. Auto ownership transfer on endorsement** (set ops fulfillment owner, keep sales owner for AR — model both explicitly). **D. Auto task creation** — *live* (`fn_generate_worklist_tasks`, idempotent, auto-closing); extend to roster-gap/unstaffed/prep-deadline. **E. Prep-deadline reminders** (T-14/T-7/T-3 open readiness items → session-owner task). **F. Participant reminders** — *built but unwired* (the critical fix). **G. Payment-exception flagging** (payment>balance, on cancelled order, partial past 30d; allow a "prepayment" flag). **H. Session-risk/readiness calc** (health score green/amber/red from fill+staffing+roster+days → calendar accents + digest; never auto-cancel). **I. Overdue-follow-up escalation** — *partly live*; extend to owner→supervisor→BO ladder. **J. Auto timestamps** — *live* (`fn_stage_stamp`); extend `endorsed_at`/`first_contacted_at` to triggers. **K. Auto status transitions** — *live* (Confirmed→Running→Completed time-based, No-Feedback timeout); extend Tentative→Confirmed (fill+staffed), order→Closed (paid+completed+certs).

**System-computed vs user-controlled:** auto → session Running/Completed, session health, collection state, payment recompute, go/no-go recommendation, quote Expired; human → session Cancelled, no-go decision, refunds, duplicate *merges*, approval outcomes, reassignment away from a rep. **Automate the detection and the paperwork, not the judgment.**

## 4. Responsive design review

Layout: 240px sticky sidebar + `.main{max-width:1320px}`. Only two breakpoints: 860px (sidebar→drawer) and 720px (calendar→cards). No laptop-specific tuning.

**Laptop (1280–1440, the priority):** the 1320 cap + 240 rail leaves ~1000px working canvas; on 1280 the **Worklist** (8 columns incl. an owner `<select>` + next-step button) scrolls horizontally, hiding **Value** and **Next-step** — the two things ops act on. **Fix:** sticky Owner/Next-step columns or denser rows ≤1366px. Dashboards reflow well; Recharts need explicit min-height. SalesEntry's vertical line-builder is long — a 2-column line editor saves scrolling.

**The 861–1100 gap:** full rail stays but `.main` shrinks — the worst case for wide tables. **Add an intermediate breakpoint (~1024–1180) that narrows the rail to icon-only** to reclaim ~180px.

**Large desktop (≥1600):** 1320 cap wastes gutters for table-heavy screens — add a "wide" density lifting the cap to ~1560 for Worklist/Orders/Calendar.

**Mobile strategy — realistic use only.** Do **not** ship SalesEntry/order-builder/Reports/PricingRules/Rollover/bulk-Worklist on phones. **Keep for mobile:** Home (attention + My Work + approvals), Approvals (approve/reject with reason — a BO decides from their phone), single Order/Session status review, notifications, ⌘K/search, Calendar (already card-collapses at 720). Everything else shows a "best on a larger screen" note, not a broken layout.

## 5. Accessibility review (WCAG 2.1 AA)

**Shipped this session (verified):** error states, `useConfirm` for destructive actions, focus traps + Escape on all modals + command palette, assertive toasts, mobile drawer `inert`+focus-return, skip-link, aria-labels on selects/date/checkbox, keyboard rows + `aria-sort`, chart `role="img"`+empty-states, `RecordTabs` roles, `aria-current="page"`.

**Remains:**

| Item | Finding | Fix |
|---|---|---|
| Contrast | `--text-faint:#8f8f8f` ≈ **2.9:1** — fails AA; styles `th`, `.fill-label`, `.cmdk-path`, placeholders. `--warning` as 11px pill text borderline | Darken to ≥`#767676`; never use for data |
| Focus indicators | `.nav-link/.tab/.linkbtn/.seg-btn/.cmdk-item/.cal-event`/row buttons have **no explicit focus style** | One shared `:focus-visible{box-shadow:var(--ring)}` |
| Charts | `role="img"`+label good, **no data-table alternative** | "View as table" toggle per chart |
| Status by color | Calendar risk accents, fill bars, blockerbar dots, cal-event borders encode meaning **by color only** | Add icon/text token beside color |
| Touch targets | `.btn-sm`, 11px pills, checkboxes < 44px | On coarse-pointer, bump to ≥44px |
| Table semantics | `th` lacks `scope="col"` | Add globally |
| Required fields | HTML `required` only; errors in one top banner | Visible `*` + `aria-describedby` field errors |
| Reduced motion | thorough block exists | ✅ keep |

## 6. Enterprise UI design audit

Vercel/Geist monochrome aesthetic (#0070f3 accent, near-black buttons) — calm and professional, a strong base. Findings:
- **Brand identity missing.** Despite "TÜV red brand", the accent is Vercel blue and `--tr-red` is just a `--danger` alias — no TÜV red anywhere structural. Decide: commit to neutral (stop calling it TÜV-branded) or reintroduce TÜV red as accent/primary over neutral surfaces.
- **Token drift / two vocabularies.** Semantic tokens (`--text`,`--accent`) coexist with legacy `--tr-*` aliases still used inline (`var(--tr-amber)`/`var(--tr-red)` in Home/Worklist/ui.tsx). Migrate and retire `--tr-*`.
- **Hard-coded pill colors** (`.pill-inside` #7c3aed, `.pill-field` #db2777) bypass tokens — tokenize.
- **Duplicated dark palette** (defined twice: `@media(prefers-color-scheme:dark)` + `[data-theme='dark']`) — define once.
- **Card overload / pill proliferation** (~12 pill variants; `record.tsx Badge` maps tones to *status* pill classes, coupling semantics) — define one status-chip system decoupled from go/no-go classes.
- **Page headers inconsistent** (`.page-head` vs `RecordHeader`; no breadcrumb).
- **Positive:** disciplined type scale (22/18/15/13.5/12/11), consistent spacing, restrained shadows, real empty/skeleton states, useful density toggle. The risk is *sameness/genericness*, not clutter.

## 7. Recommended design system

**Typography:** keep Geist; scale 22/650 title, 18 section, 15 card, 13.5 body, 12/550 label, 11 uppercase micro; base 14 (13 compact); retire `--text-faint` for real text. **Spacing/grid:** 4px base; card 20 (14 compact); content 1320 (+"wide" 1560 for tables). **Buttons:** `.btn`/`.btn-ghost`/`.btn-danger`/`.btn-sm`; destructive always via `useConfirm(danger)` (done); every button needs `:focus-visible`. **Inputs/autocomplete:** a shared combobox primitive with `role="combobox"`/`aria-expanded` (client picker is ad hoc today); native `type="date"` + `DateSegments` with range validation. **Tables:** `.card>table` overflow-x, `.scroll-x` for panel tables, `scope="col"`, sticky action columns. **Badges/status-chips:** one component with an explicit tone→(color+icon+text) map, decoupled from go/no-go pills. **Modals/drawers:** `.dialog`/`.drawer`/`.cmdk` all focus-trapped; standardize scrim+Escape+focus-return+`role=dialog aria-modal`. **Empty/error/loading/skeleton:** mandate `Empty`/`ErrorNote`/`Spinner`/`Skeleton` on every list/panel; add a shared `Tooltip`.

**Page-header standard (adopt everywhere):**
```
[ breadcrumb: Home › Orders › ORD-123 ]
[ Title (id/name) ]              [ Primary action ] [ Secondary ] [ ⋯ overflow ]
[ subtitle/context ]  [ status chip ] [ health chip ] [ owner chip ]
```
Extend `RecordHeader` (has title/subtitle/badges/actions/back) with breadcrumb + status/health/owner chips as first-class props + overflow; roll `.page-head` list screens onto it. **Breadcrumbs:** add a `Breadcrumb` primitive fed by the route (≤3 levels).

## 8. Redundancy & consolidation

| Overlap | Evidence | Recommendation |
|---|---|---|
| Home vs DataQuality | DataQuality's 6 tiles are a superset of Home's super_admin cards, same view counts | Fold into a Home "Data health" view/tab |
| Home vs Worklist | Home cards deep-link into Worklist filters | Keep (launcher vs workbench); one count source |
| Duplicates screen | single-purpose queue, broken merge | Make it a tab within "Data health," not top-level nav |
| Dashboard vs Reports vs Quality | three Recharts analytics surfaces | One **Analytics** area, tabs (Overview/Reports/Feedback) — 3 nav items → 1 |
| Clients vs Organizations | two nav + two detail pages for one "customer" | Central Customer record (client under organization), one detail page + tabs |
| SalesEntry vs Quote→Order | two order-entry paths | Share one line-builder + one validation module |

**Terminology dictionary** (single source referenced by `labels.ts`+nav): Customer (Organization=company, Contact=person) not "Clients"/"company"; **Fulfillment** (rename `Worklist.tsx` to match); Stage for `fulfillment_stage`; the four distinct axes (Order status / Payment status / Session status / Health) — never bare "status"; **Learning format** (Classroom/Virtual/E-learning) — one label (retire "modality"/raw enum); Duplicate review (not "resolution"). Observed drift: Fulfillment=Worklist=`fulfillment_stage`; modality×3; Clients/Customers/Companies/Organizations; "TÜV red brand" vs a blue UI.

## 9. Quick wins & structural changes

**Quick wins (high-impact/low-effort, excluding this session's shipped work):**
1. **Wire `fn_queue_reminders` into the nightly job** — one line; unlocks participant + payment reminders.
2. **Rename the Duplicates merge button** + persistent double-count warning until the merge RPC exists.
3. **`:focus-visible` ring** on nav/tab/link/seg/cmdk/cal-event (one CSS rule).
4. **Darken `--text-faint`** to pass AA.
5. **Unique index `(schedule_id, lower(email))`** on participant.
6. **`scope="col"` on `th`** globally.
7. **Tokenize `.pill-inside`/`.pill-field`**; migrate inline `--tr-*`.
8. **Fold DataQuality into Home**; drop Duplicates from top-level nav.
9. **Visible required markers** + inline field errors on SalesEntry.
10. **Payment > balance warning** at entry.

**Structural changes:** My Work center; Notification/Task/Approval frameworks (tables+generator exist — formalize a Notification Center + escalation ladder); Workflow engine (enforce the `NEXT` stage map as a DB state machine); Global search evolution; Role dashboards; Standard record page (page-header standard everywhere); Status/health framework (split axes + computed session health); Activity timeline on every record; Central customer record; Automated escalation & session-health model.

## 10. Priority backlog

| # | Issue | Role | Screen | Current | Change | Benefit | Complexity | Pri |
|---|---|---|---|---|---|---|---|---|
|1|Duplicate "merge" doesn't reconcile|ops|Duplicates|Flags only; orders stay live|`fn_merge_orders` RPC + preview; ops-only|Accurate fill/revenue|High (DB/backend/perm)|**P0**|
|2|Reminders coded but never scheduled|ops/customers|edge|`fn_queue_reminders` unwired|Call in `fn_nightly_hygiene`|Reminders go live|Low (backend)|**P0**|
|3|No enforced stage state machine|ops/sales|Worklist|Raw update accepts any value|DB trigger on legal transitions|Data integrity|Med (DB/workflow)|**P0**|
|4|Duplicate participants allowed|ops|Roster|No uniqueness|Unique index + UI block|Clean rosters|Low (DB)|**P0**|
|4b|SessionForm defeats per-session pax + hand-sets Completed|ops|SessionForm|Disabled min/max; Completed selectable|Editable pax; restrict picker; drive Completed via close|Correct caps + close-out integrity|Low (frontend)|**P0**|
|5|Endorsement w/ incomplete data|ops|Worklist/OrderDetail|Only email/fee/ref required|Completeness gate on endorse|Fewer rejects|Med (workflow)|**P1**|
|6|Contrast fails AA|all|global|2.9:1 data text|Darken token|Legibility/compliance|Low (UI)|**P1**|
|7|Missing focus styles|keyboard|global|No `:focus-visible` on many controls|One shared rule|A11y|Low (UI)|**P1**|
|8|Charts no table alternative|BO/ops|Dashboard/Reports|`role=img` only|"View as table"|A11y|Med|**P1**|
|9|Status by color alone|all|Calendar/lists|Color-only accents|Add icon/text|A11y|Low|**P1**|
|10|Currency silently PHP|BO/finance|Orders/Reports|`amount_php`+`php()` hard-coded|Currency field or label PHP-only|Correct money|Med (DB)|**P1**|
|11|Session health not modeled|ops/BO|Calendar/Home|Recomputed per surface|Stored health score|One risk truth|Med (DB/automation)|**P1**|
|12|DataQuality duplicates Home|super_admin|DataQuality|Two screens, same counts|Fold into Home tab|Simpler IA|Low|**P2**|
|13|Dashboard/Reports/Quality split|BO/ops|3 screens|3 nav items|One Analytics area|Coherent IA|Med|**P2**|
|14|Clients vs Organizations split|sales/ops|Clients/Orgs|Two nav + detail pages|Central customer record|360° customer|High|**P2**|
|15|No breadcrumbs|all|records|Single back-link|Breadcrumb primitive|Orientation|Low|**P2**|
|16|Page-header inconsistent|all|list vs record|Two patterns|Unify on `RecordHeader`|Consistency|Med|**P2**|
|17|Terminology inconsistent|all|nav/labels|Fulfillment=Worklist, modality×3|Terminology dictionary|Clarity|Low|**P2**|
|18|Laptop wide-table crowding|ops/sales|Worklist/Orders|8 cols scroll|Sticky owner/next-step; breakpoint|Usable on laptops|Med|**P2**|
|19|861–1100px squeeze|all|global|Full rail + narrow main|Collapsible icon rail|Space reclaim|Med|**P2**|
|20|No notification center|all|header|Notifications only in Home|Bell + unread + panel|Awareness|Med|**P2**|
|21|Inline dup check missing|sales|SalesEntry|Batch-only|Warn on blur|Prevent at source|Med|**P2**|
|22|Owner-select cramped on laptop|ops|Worklist|Labelled but tight|Overflow/drawer on narrow|Usability|Low|**P3**|
|23|Auto inquiry assignment|sales|Inquiries|Manual pickup|Round-robin|Faster response|Med (automation)|**P2**|
|24|Overpayment accepted|finance|OrderDetail/AR|Recomputes, no reject|Validate ≤ balance|Correct AR|Med (DB)|**P2**|
|25|Legacy `--tr-*` + hard-coded pills|dev|globals.css|Mixed tokens; dark×2|Migrate; define dark once|Maintainability|Low|**P3**|
|26|No prep-deadline tasks|ops|SessionDetail|Ad hoc|Rules in generator|Readiness|Med|**P3**|
|27|Escalation ladder shallow|ops/BO|Worklist|Notify button only|Owner→sup→BO|Accountability|Med|**P3**|
|28|Required markers absent|sales|SalesEntry|`required` only|Visible `*`+inline errors|Fewer failed saves|Low|**P3**|
|29|Date-range not validated|ops|SessionForm|No monotonic check|Client+DB guard|Data integrity|Low|**P3**|
|30|Reference/SAP no format check|sales/ops|SalesEntry|Free-text|Format+uniqueness|Reliable matching|Low|**P3**|

### Implementation roadmap
- **Phase 1 — Foundations (workflow, status, ownership, permissions, correctness):** stage state-machine (#3), four-axis status split + session health (#11), SessionForm pax/Completed fix (#4b), terminology (#17), dual sales/fulfillment ownership, merge RPC + permissions (#1), reminders wiring (#2), participant uniqueness (#4), completeness gate (#5). *Do first — trust items.*
- **Phase 2 — IA & structure:** fold DataQuality+Duplicates into Data-health (#12), consolidate Analytics (#13), central customer record (#14), My Work center, breadcrumbs (#15), unified header (#16), notification center (#20).
- **Phase 3 — Design system & responsive:** contrast/focus/status-not-color (#6,7,9), chart tables (#8), token cleanup (#25), laptop tables + breakpoints (#18,19), required markers + validation (#28,29,30), currency decision (#10).
- **Phase 4 — Automation:** auto inquiry assignment (#23), prep-deadline tasks (#26), escalation ladder (#27), payment-exception flagging (#24), inline dup warnings (#21), auto status transitions.

### Acceptance criteria (the 8 biggest)
1. **My Work** — every open task, unread notification, pending approval for the user on one filterable screen; mark done/read updates instantly; empty/error states; RLS-verified no leak.
2. **Session health** — every upcoming session shows a stored green/amber/red from fill+days+trainer+roster; identical across Calendar/Home/digest; recomputed nightly+on booking; never auto-cancels.
3. **Status/health split** — UI never labels anything bare "status"; order stage/payment/session/health are distinct chips; illegal stage transitions rejected by DB with a clear error.
4. **Notification center** — header bell + unread count; drill-through; mark-read persists; escalations appear here + digest.
5. **Standard record page** — Order/Session/Customer/Quote share one header (breadcrumb+title+status/health/owner+primary/secondary/overflow), one tab bar; back-link+breadcrumb work; activity timeline present.
6. **Global search** — ⌘K returns customers/orders/sessions/participants by name/email/reference <300ms; keyboard-navigable; RLS-respecting; recents on open.
7. **Ops command center (Fulfillment)** — wide table usable at 1280px (action columns visible/sticky); bulk advance/assign with confirm+reason; SLA breaches surface with a working notify; illegal stage advance blocked.
8. **Permission matrix** — per-role read/write per entity documented and DB-verified; sales cannot change payment/SAP (done), cannot merge duplicates, cannot see others' orders beyond team/region; verified as anon + two reps + advisor clean.

### Final prioritized action plan
**P0 (correctness, now):** merge RPC + relabel button; wire `fn_queue_reminders`; enforce stage state machine; participant uniqueness; SessionForm pax/Completed fix.
**P1 (integrity + access):** endorsement completeness gate; contrast; focus rings; chart data-tables; status-not-by-color; currency decision; session-health model.
**P2 (IA + consolidation + automation start):** fold DataQuality/Duplicates; unify Analytics; central customer record; breadcrumbs/header/terminology; laptop tables + breakpoint; notification center; inline dup check; auto inquiry assignment; overpayment guard.
**P3 (polish + deeper automation):** owner-select on narrow; token cleanup + single dark palette; prep-deadline tasks; escalation ladder; required markers; date-range guard; reference format guard.

### Load-bearing findings
- `Duplicates.tsx` merge only flags — the file's own comment confirms orders aren't reconciled (double-counted seats/revenue).
- `fn_queue_reminders` is defined but never called by `schedule.sql`/`fn_nightly_hygiene` — reminders are dead code until wired.
- `globals.css` `--text-faint:#8f8f8f` (contrast fail); duplicated dark palette; hard-coded pill hex.
- The stage graph lives only in `Worklist.tsx` `NEXT` map with no DB enforcement; `fn_guard_orders_sales_fields` is the model for a stage-transition trigger.
- `orderState.ts` and `fn_generate_worklist_tasks` are the correct foundations to extend for health scoring and escalation — reuse, don't rebuild.
