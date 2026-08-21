-- Drop duplicate indexes flagged by the Supabase Performance Advisor.
--
-- 20260814010000 created idx_participant_schedule on participant (schedule_id)
-- and idx_audit_changed on audit_log (changed_at desc). Each already had a
-- byte-identical twin on the live DB — participant_schedule_idx and
-- ix_audit_changed_at — that no repo migration creates (live-only drift). The
-- advisor reports each pair as duplicate_index ("Drop all except one").
--
-- Keep the repo-defined idx_* (so a from-scratch rebuild from these migrations
-- matches the live schema) and drop the un-tracked twins. This removes the
-- duplicate_index findings and one more slice of repo <-> DB drift at once.
-- Idempotent: DROP INDEX IF EXISTS is a no-op when the index is already gone.

drop index if exists public.participant_schedule_idx;
drop index if exists public.ix_audit_changed_at;
