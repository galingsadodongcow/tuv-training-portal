# Fix Plan

Ordered by severity. **Update:** after the initial pass (Critical + High), the
customer approved "fix everything" — all Medium and Low findings below have now
also been applied and re-validated (tsc + build + a second Postgres harness run
covering the new RLS ownership policies).

## Applied this pass (Critical + High)

| ID | Sev | Fix | Files | Effort | Validation |
|----|-----|-----|-------|:------:|-----------|
| F1 | 🔴 | Cast CASE → `payment_status_t` in `fn_ar_recompute` | `migrations/20260808160000_accounts_receivable.sql` | S | harness: payment recompute OK |
| F2 | 🟠 | `actor_role::text = p_role` in `fn_audit_search` | `migrations/20260808280000_pricing_country_audit.sql` | S | reasoned + build |
| F3 | 🟠 | `grant usage,select on sequence quote_seq to authenticated` | `migrations/20260808200000_quotations.sql` | S | harness: quote insert OK |
| S0 | 🟠 | `enable row level security` on `orders` | `migrations/20260808260000_access_scoping.sql` | S | harness: sales 58→28 |
| S1 | 🟠 | `fn_can_see_order` + scope `order_line`/`participant`/`invoice`/`payment` SELECT | `migrations/20260808290000_rls_hardening.sql` (new) | M | harness: 6→3, 58→28, 50→23, 45→23 |
| S2 | 🟠 | `security_invoker=true` on `v_order_ar`/`v_country_revenue`/`v_session_forecast`/`v_session_pnl` | `migrations/20260808290000_rls_hardening.sql` | S | applies clean |
| X1 | 🟠 | Confirm dialog on 6 destructive deletes | `ReceivablePanel`, `PricingRules`, `QuoteDetail`, `AttachmentsPanel`, `ContactsPanel`, `TrainerManage` | M | tsc + build |
| A1 | 🟠 | `aria-label` on bare controls (AuditLog, Admin) | `AuditLog.tsx`, `Admin.tsx` | S | tsc + build |

Effort: S ≈ <15 min, M ≈ 15–60 min, L ≈ >1 h.

## Applied — Medium (second pass, "fix everything")

| ID | Sev | Fix | Files | Validation |
|----|-----|-----|-------|-----------|
| S3 | 🟡 | Owner-scope quote/quote_line writes (`created_by`/`sales_id`) | `migrations/20260808300000_rls_ownership.sql` | harness: own quote UPDATE 1, other rep's UPDATE 0 / DELETE 0 |
| S4 | 🟡 | `order_line` INSERT `with check` now requires `fn_can_see_order()` | `migrations/20260808300000_rls_ownership.sql` | policy applies clean |
| S5 | 🟡 | Attribution guard on `client_interaction`; owner/unowned scope on `contact` | `migrations/20260808300000_rls_ownership.sql` | harness: self INSERT ok, forged sales_id → RLS violation |
| X2 | 🟡 | `error` states in Reports (4 tabs)/Quality/Communications/FeedbackPanel | 4 files | build |
| X3 | 🟡 | `window.prompt` → `confirm({reason})` for lost reason | `Inquiries.tsx` | build |
| U1 | 🟡 | `.scroll-x` wrapper on embedded panel tables | globals.css + 4 files | build |
| A2 | 🟡 | Keyboard-operable quotation rows (`role`/`tabIndex`/Enter-Space) | `Quotations.tsx` | build |
| A3 | 🟡 | Dialog `role`/`aria-modal`/Escape + initial focus | `Confirm.tsx`, `Communications.tsx`, `TrainerManage.tsx` | build |

## Applied — Low (second pass)

| ID | Sev | Fix | Files | Validation |
|----|-----|-----|-------|-----------|
| S6 | ⚪ | Role-gate `fn_queue_reminders()` (ops+) | `migrations/20260808300000_rls_ownership.sql` | harness: sales → exception, ops → returns count |
| A1r | ⚪ | Remaining `aria-label`s | SalesEntry, Resources, Quality, SessionDetail, ContactsPanel | build |
| A4 | ⚪ | `aria-label` on Inquiries move buttons | `Inquiries.tsx` | build |
| U2 | ⚪ | Removed dead `.stack` class | `Quality.tsx` | build |

## Deployment note

DB fixes ship as migrations; apply by pasting
`supabase/bundles/2026_program_all_migrations.sql` (regenerated, now 15 sections
ending with `20260808290000_rls_hardening`) into the Supabase SQL editor. All
statements are idempotent and safe to re-run over an already-migrated database.
Frontend fixes deploy with the normal Netlify build.

## Git summary

```bash
# review
git status
git diff --stat

# stage, commit, push (feature branch)
git add supabase/migrations/20260808160000_accounts_receivable.sql \
        supabase/migrations/20260808200000_quotations.sql \
        supabase/migrations/20260808260000_access_scoping.sql \
        supabase/migrations/20260808280000_pricing_country_audit.sql \
        supabase/migrations/20260808290000_rls_hardening.sql \
        supabase/bundles/2026_program_all_migrations.sql \
        supabase/seed/rebuild_2026_full.sql \
        src/components/ReceivablePanel.tsx src/components/AttachmentsPanel.tsx \
        src/components/ContactsPanel.tsx src/components/TrainerManage.tsx \
        src/screens/PricingRules.tsx src/screens/QuoteDetail.tsx \
        src/screens/AuditLog.tsx src/screens/Admin.tsx \
        docs/qa/ROLE_MATRIX.md docs/qa/SIMULATION_LOG.md \
        docs/qa/QA_AUDIT_REPORT.md docs/qa/FIX_PLAN.md

git commit -m "QA pass: fix Critical/High findings + add QA deliverables"
git push -u origin claude/app-code-review-oyrttm
```
