# 17 — Quick wins (high impact, low/medium effort)

Each validated against the actual implementation.

| # | Change | Why | Effort | Where |
|---|---|---|---|---|
| QW-1 | Default order owner to the creator when they hold a selling role | Stops the 40-order unowned backlog growing | S | `fn_create_order` |
| QW-2 | Add an owner blocker to `fn_order_completeness` | Makes the Sales→Ops handoff have a real precondition | S | `fn_order_completeness` |
| QW-3 | Add route Guards to `/crm`, `/clients`, `/clients/[id]`, `/orders/[id]`, `/session/[id]` matching the nav lists | Removes the nav↔route inconsistency | S | `src/app/(app)/**/page.tsx` |
| QW-4 | Show "N of M" result counts beside the filter summary | Users cannot currently tell if a filter matched | S | `SavedViews.tsx` + list screens |
| QW-5 | Extend the active-filter summary to Resources / Approvals / Complaints | Those surfaces have filters but no summary | S | list screens |
| QW-6 | Set `nullsFirst` consistently on `.order()` calls | Null-heavy columns sort unpredictably | S | `src/hooks/data.ts` |
| QW-7 | Add "Duplicate" to the calendar session drawer | 3 navigations → 1 for a very common op | S | `Calendar.tsx` |
| QW-8 | Render trigger-blocked fields (payment status, SAP no.) as text for sales, not inputs | Removes an affordance the DB rejects | S | `OrderDetail.tsx` |
| QW-10 | Add an unsaved-changes guard to the long forms | Prevents silent loss on mis-navigation | M | Session/Course/SalesEntry forms |
| QW-11 | Bound the remaining unpaginated list queries | Latent at current scale, not yet a problem | M | `src/hooks/data.ts` |
| QW-12 | Configure `NEXT_PUBLIC_TELEMETRY_ENDPOINT` | No production error visibility today | S | env/Netlify |
| QW-13 | Enable leaked-password protection | One dashboard toggle (Pro plan) | S | Supabase Auth settings |
| QW-14 | Convert record-page `'1fr 1fr'` grids to `auto-fit/minmax` | Most likely mobile breakage; verify visually first | S | record screens |
| QW-15 | Add an empty-state next action wherever one is missing | Copy the Resources pattern | S | list screens |

**QW-9 withdrawn.** It proposed adding a skip link; the shell already has a
correct one (`Shell.tsx`). See `10-accessibility-audit.md` A11Y-1.

**Deliberately not listed as a quick win:** the cost/margin fix (DEF-1). It is
small in code but changes a business rule, so it needs a decision first.
