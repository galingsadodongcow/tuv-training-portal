-- The Go/No-Go panel can request a review, which inserts an approval with
-- object_type 'Session review'. That value was missing from the approval_object
-- enum, so the insert would fail. Add it.
--
-- ALTER TYPE ... ADD VALUE must run on its own, not inside a transaction block.
-- Paste this statement by itself in the Supabase SQL editor.

alter type public.approval_object_t add value if not exists 'Session review';
