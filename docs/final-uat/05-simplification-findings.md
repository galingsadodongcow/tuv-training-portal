# 05 — Simplification findings

Applying the §37 rule (KEEP / SIMPLIFY / MERGE / MOVE / HIDE-BY-ROLE / AUTOMATE / RETIRE / FIX). Default is subtraction. The heavy prior increments (S1–S5, CRM1, DEN1) already landed; this pass found little left to cut.

## Applied this pass
- **HIDE-BY-ROLE** — read-only roles (management/auditor) no longer see write controls on Inquiries, Worklist, OrderDetail comments, Attachments (see `04`/`07`).
- **FIX** — Inquiry qualification editable after lean capture; RosterPanel invalidation so health/roster-gap refresh.

## Structure — already clean (KEEP)
- **Nav**: 22 items, workflow-grouped; per-role counts are reasonable (sales 10, auditor 9, management 11, BO 12). Admin/config modules correctly gated away from management/auditor/sales. No technical module leaks.
- **My Work vs Calendar**: clean split (actions vs when) — no duplication. Landing is My Work for every role.
- **Session detail**: 6 tabs after S4's Notes→Activity merge. No further redundancy.
- **Calendar**: all four views present; drawer carries the frequent actions inline. Nothing to add (UAT §29).

## Candidates surfaced — deferred (see `08`)
- **MERGE candidate**: My Work ↔ Operations today overlap (session-attention + approvals rendered in both). Real, but needs a deliberate decision on which owns which queue — not a blind cut.
- **SIMPLIFY (screen weight)**: Calendar (663 lines, view switch + filters + fill bars), Reports (~18 controls), SalesEntry (long form) are the densest. Flagged, not redesigned — a compact pass wants a live preview to avoid over-thinning useful density.
- **COMPLETE, don't add**: S6 hierarchy is a working bridge but `subcategory_id` is write-only and Calendar/Reports still key on free-text `course.category`. Finishing adoption (then retiring the free-text column) is subtraction — but it's DB+multi-screen work for the Supabase session.

## Not simplified (intentionally KEEP)
- SalesEntry's per-line session pick on quote conversion — required by design (quote lines are course-level).
- Two-required-field session creation — already minimal.
- The `course.category` free-text column — **do not drop yet**; still read by Calendar filters + Reports. Retirement plan is in `08`.
