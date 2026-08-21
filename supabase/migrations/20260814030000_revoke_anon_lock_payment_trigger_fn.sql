-- Close the last anon-executable trigger-function hole.
--
-- 20260812010000_lock_trigger_fn_execute revoked EXECUTE on the trigger
-- functions added that pass, but fn_orders_lock_payment_status() — a
-- SECURITY DEFINER BEFORE-trigger function that returns `trigger` — was missed
-- and still carries the default PUBLIC/anon/authenticated EXECUTE grant. That
-- exposes it as an anon-callable /rest/v1/rpc/fn_orders_lock_payment_status
-- endpoint, which the Supabase advisor flags
-- (0028_anon_security_definer_function_executable). It only ever runs from the
-- trigger mechanism, never as an RPC.
--
-- Revoking EXECUTE from the API roles clears the finding and does NOT stop the
-- trigger firing — trigger execution does not check the invoker's EXECUTE
-- privilege on the trigger function. Idempotent: REVOKE is a no-op when the
-- grant is already absent.

revoke execute on function public.fn_orders_lock_payment_status() from public, anon, authenticated;
