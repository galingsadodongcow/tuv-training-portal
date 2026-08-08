# Fix Plan

Ordered by severity. Critical + High were applied in this pass and re-validated;
Medium + Low are recommendations awaiting approval (per the engagement rules).

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

## Recommended next (Medium) — awaiting approval

| ID | Sev | Fix | Files | Effort |
|----|-----|-----|-------|:------:|
| S3 | 🟡 | Owner-scope quote writes (`sales_id = fn_current_sales_id()` or super_admin) | `migrations/20260808200000_quotations.sql` | S |
| S4 | 🟡 | Add assignment check to `order_line` INSERT `with check` | base schema / new migration | M |
| S5 | 🟡 | Owner-scope `contact` / `client_interaction` writes | `migrations/20260808210000_crm_depth.sql` | S |
| X2 | 🟡 | Add `error` states to Reports/Quality/Communications/FeedbackPanel | 4 files | M |
| X3 | 🟡 | Replace `window.prompt` lost-reason with `confirm({reason})` | `Inquiries.tsx` | S |
| U1 | 🟡 | Wrap panel tables in `overflow-x:auto` | 4 files | S |
| A2 | 🟡 | Keyboard-operable quotation rows | `Quotations.tsx` | S |
| A3 | 🟡 | Dialog semantics + Escape + focus trap on ad-hoc modals | `Communications.tsx`, `TrainerManage.tsx`, `Confirm.tsx` | M |

## Recommended later (Low) — awaiting approval

| ID | Sev | Fix | Files | Effort |
|----|-----|-----|-------|:------:|
| S6 | ⚪ | Role-gate `fn_queue_reminders()` | `migrations/20260808190000_communications.sql` | S |
| A1r | ⚪ | Remaining `aria-label`s (SalesEntry, Resources, Quality, SessionDetail, ContactsPanel) | 5 files | M |
| A4 | ⚪ | `aria-label` on Inquiries move buttons | `Inquiries.tsx` | S |
| U2 | ⚪ | Remove dead `.stack`, standardize `label.field` | 3 files | S |

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
