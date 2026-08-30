# UX and responsive review

## Overall finding

The new portal is calmer and more task-oriented than the legacy portal. The former critical responsive defect is closed: role-filtered navigation is now available below 980px through an accessible native disclosure menu. The legacy app’s strongest UX ideas—role focus, My Work, progressive calendar filtering and direct record links—are preserved without restoring its dense dashboards or very large multipurpose screens.

v2.5 also makes the calendar block-aware, exposes offering/publication/Go state as compact badges, keeps “Let Operations assign” as the safe quotation default, and reveals reservation versus named-roster capacity explicitly. Credentialed mobile UAT remains required.

## Current strengths

- Five role-specific navigation sets and a Sales Supervisor scope.
- A single Sales surface for pipeline, quotations and orders.
- Calendar is the primary delivery entry point.
- Progressive forms and side panels avoid separate routes for every small action.
- Clear empty states, status badges and user-safe validation messages.
- Operations actions expose concrete business failures such as qualification, conflict and capacity errors.
- Reduced-motion support and semantic buttons/links are present.

## Critical issues

| Issue | Evidence | Impact | Recommendation |
|---|---|---|---|
| Missing mobile navigation | `.sidebar { display:none }` at 980px; no menu in `AppShell` | Users below desktop width cannot switch modules | Add menu button + accessible drawer; retain role-filtered nav and sign-out. |
| Calendar mobile interaction | Month/week grids use 880/980px minimum widths | Horizontal scrolling is usable but not task-optimized | Default small screens to list/day, offer explicit “grid” view, sticky date controls. |
| Long pages | Administration and session detail aggregate many sections | Important actions can be buried | Use anchored sub-navigation, contextual action summary and progressive disclosure. |
| Table behavior | Horizontal scrolling only; limited pagination | Key fields/actions disappear off-screen; large datasets degrade | Priority columns/cards on mobile and shared server pagination. |
| Feedback transport | Notices are query-string banners after redirect | Can persist/share accidentally and lacks live-region consistency | Keep PRG pattern but clear notices, use accessible status region and correlation for unexpected errors. |

## Workflow review

### Operations

- Course creation is concise, but course, price, qualification and venue forms share one administration page. Split by anchored sections/tabs while retaining one work area.
- Session creation correctly starts from accepted order lines and combines resource/time/capacity choices. Add a pre-submit conflict summary, but keep the database as final authority.
- Session detail is the right place for roster, outcome, certificate and reschedule actions. Show “Next required action” at the top based on state.
- Batch certificate issue can partially complete. The UI must say whether the operation is atomic; target implementation should make the database command atomic.

### Sales

- Customer→contact→inquiry sequencing is clear.
- Inquiry qualification and quote conversion reduce re-entry.
- The user needs a visible lifecycle bar and next step; Won/Lost and lost reasons are missing.
- Handoff should show readiness items before enabling Send, and returned orders should emphasize the Operations reason.

### Manager/Auditor

- Reporting is useful, but Auditor navigation currently labels Overview as “Audit & reports” without an audit list. This violates role expectation.
- Manager and Auditor masking is appropriate; the UI should explicitly explain that contact fields are intentionally restricted instead of appearing broken.

### Trainer

The legacy system did not provide a trainer login. Trainer-facing screens should not be added from assumption. Operations needs a strong trainer resource view first: eligibility, availability, assignments, conflicts and evidence.

## Responsive acceptance matrix

| Width | Required behavior |
|---:|---|
| 390px | Menu/drawer; one-column forms; list calendar default; no clipped action; 44px touch targets. |
| 620px | One-column key forms; tables become cards or scroll with frozen primary column. |
| 768px | Drawer navigation; two-column content only where labels remain readable. |
| 980px | Drawer or compact sidebar transition without inaccessible breakpoint gap. |
| 1280px+ | Full sidebar, dense tables and month/week calendar. |

## Design rules for migrated features

1. Show the user’s next decision before secondary history.
2. Hide advanced fields until relevant.
3. Default from customer/course/order context; do not retype known facts.
4. Use action names (“Send to Operations”, “Start session”), not generic “Update”.
5. Destructive/irreversible actions require consequence, reason and confirmation.
6. Empty states explain how records enter the screen and who can create them.
7. Permission-denied states distinguish lack of access from missing data.
8. Calendar filters start with three high-value fields; advanced filters use a drawer and active-filter chips.
9. Mobile uses adapted list/action patterns, not a shrunken desktop grid.
10. Every mutation disables duplicate submission and preserves entered values on validation failure where practical.
