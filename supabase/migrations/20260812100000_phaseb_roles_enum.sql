-- ===========================================================================
-- Phase B (second-pass) — 1/6: the 8-role model, enum values only.
--
-- Adds the four new roles agreed in the Phase A decision session (D1, D4, D7,
-- D8) to the user_role enum:
--   coordinator    — owns webshop + manual order intake, dedup, endorsement (D1)
--   sales_manager  — real team-scoped manager role (D8)
--   management     — read-only executive role (D4)
--   auditor        — read-only governance role with audit_log access (D7)
--
-- ISOLATED on purpose: `alter type ... add value` commits a new enum label, and
-- PostgreSQL forbids using a just-added label in the SAME transaction. The CI
-- bundle is applied by psql in autocommit mode (each statement its own txn), so
-- adding the labels here and USING them only in the later Phase B migration
-- files is safe. Do not add anything that references the new labels to this file.
--
-- Idempotent: `if not exists` makes re-runs a no-op.
-- ===========================================================================

alter type public.user_role add value if not exists 'coordinator';
alter type public.user_role add value if not exists 'sales_manager';
alter type public.user_role add value if not exists 'management';
alter type public.user_role add value if not exists 'auditor';
