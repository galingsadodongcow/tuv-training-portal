-- Lock down EXECUTE on BEFORE-trigger functions.
--
-- A new function defaults to EXECUTE for PUBLIC, which PostgREST then exposes as
-- an anon-callable /rest/v1/rpc/<fn> endpoint. For SECURITY DEFINER *trigger*
-- functions that is pure attack surface: they return `trigger` and only ever run
-- from the trigger mechanism, never as an RPC. The Supabase security advisor
-- flags them (0028_anon_security_definer_function_executable /
-- 0029_authenticated_...). Revoking EXECUTE from the API roles clears the finding
-- and does NOT stop the triggers firing — trigger execution does not check the
-- invoker's EXECUTE privilege on the trigger function.
--
-- Covers the two functions added this pass (fn_orders_stage_guard,
-- fn_participant_dedup_guard) plus the pre-existing fn_guard_orders_sales_fields,
-- which had the same hole. Idempotent: REVOKE is a no-op when the grant is absent.

revoke execute on function public.fn_orders_stage_guard()        from public, anon, authenticated;
revoke execute on function public.fn_participant_dedup_guard()   from public, anon, authenticated;
revoke execute on function public.fn_guard_orders_sales_fields() from public, anon, authenticated;
