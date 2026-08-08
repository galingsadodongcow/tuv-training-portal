-- SAP number becomes an optional reference, not a workflow driver.
-- The old fn_stage_stamp trigger did two jobs: it stamped stage_changed_at on
-- a stage change (keep this, it powers stall detection), and it auto-advanced
-- an order to 'SAP Created' as soon as a SAP number was entered (drop this).
-- This redefinition keeps the stamp and removes the auto-advance, so a SAP
-- number can be annotated for reference without moving the order.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor. The trigger
-- binding is unchanged; only the function body is replaced.

create or replace function public.fn_stage_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.fulfillment_stage is distinct from old.fulfillment_stage then
    new.stage_changed_at := now();
  end if;
  return new;
end $$;
