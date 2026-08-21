-- ===========================================================================
-- #121 — Notify the receiving side of the order endorsement handoff.
--
-- Endorsing an order moved it to Operations' queue but sent no in-app
-- notification, so Ops discovered endorsed orders only by scanning the queue.
-- This adds a notification from inside the two SECURITY DEFINER handoff RPCs:
--   * fn_endorse_order          -> notify every Operations user (no per-order
--                                  ops owner exists at endorsement).
--   * fn_return_for_correction  -> notify the coordinator who endorsed it.
--
-- Uses kind = 'assignment' (the notification.kind CHECK allows
-- mention/assignment/approval/system/info — NOT 'handoff') and entity_type =
-- 'order' (allowed), so clicking the notification opens the order record.
-- The function bodies are otherwise identical to the deployed versions.
-- Idempotent (create or replace).
-- ===========================================================================

create or replace function public.fn_endorse_order(p_order text, p_override_reason text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r text := fn_current_role()::text; v_check jsonb; v_is_admin boolean;
begin
  if r is null or r not in ('coordinator','operations','sales','super_admin') then
    raise exception 'Your role may not endorse orders' using errcode = '42501';
  end if;
  if not fn_can_see_order(p_order) then
    raise exception 'Not allowed to act on this order' using errcode = '42501';
  end if;

  v_check := fn_order_completeness(p_order);
  v_is_admin := (r = 'super_admin');
  if not (v_check->>'ok')::boolean then
    if not (v_is_admin and coalesce(btrim(p_override_reason),'') <> '') then
      raise exception 'Order is not complete: %', (v_check->'hard')::text using errcode = '42501';
    end if;
    perform set_config('app.audit_reason', 'endorse override: '||p_override_reason, true);
  end if;

  update orders set fulfillment_stage = 'Endorsed to Ops' where order_id = p_order;

  insert into order_handoff (order_id, status, endorsed_by, endorsed_at, completeness, updated_at)
    values (p_order, 'Endorsed', auth.uid(), now(), v_check, now())
  on conflict (order_id) do update
    set status = 'Endorsed', endorsed_by = auth.uid(), endorsed_at = now(),
        returned_by = null, returned_at = null, return_reason = null,
        completeness = excluded.completeness, updated_at = now();

  -- #121: tell Operations the order arrived. Notify every operations user
  -- except the actor (an ops user may endorse their own).
  insert into notification (recipient_id, kind, title, body, entity_type, entity_id, actor_id)
  select p.user_id, 'assignment', 'Order endorsed to Operations',
         'Order '||p_order||' is ready for fulfilment.', 'order', p_order, auth.uid()
    from profiles p
   where p.role::text = 'operations' and p.user_id is not null and p.user_id <> auth.uid();

  return v_check;
end $function$;

create or replace function public.fn_return_for_correction(p_order text, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r text := fn_current_role()::text;
begin
  if r is null or r not in ('operations','coordinator','business_owner','super_admin') then
    raise exception 'Your role may not return an order for correction' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason),'') = '' then
    raise exception 'A return requires a reason' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', 'returned: '||p_reason, true);
  -- Controlled, single-purpose bypass of the forward-only stage guard.
  perform set_config('app.allow_stage_regression', 'on', true);
  update orders set fulfillment_stage = 'For Order Creation'
   where order_id = p_order and fulfillment_stage::text <> 'For Order Creation';
  perform set_config('app.allow_stage_regression', 'off', true);

  insert into order_handoff (order_id, status, returned_by, returned_at, return_reason, updated_at)
    values (p_order, 'Returned', auth.uid(), now(), p_reason, now())
  on conflict (order_id) do update
    set status = 'Returned', returned_by = auth.uid(), returned_at = now(),
        return_reason = p_reason, updated_at = now();

  -- #121: tell the coordinator who endorsed it that the order came back.
  insert into notification (recipient_id, kind, title, body, entity_type, entity_id, actor_id)
  select h.endorsed_by, 'assignment', 'Order returned for correction',
         'Order '||p_order||' was returned: '||p_reason, 'order', p_order, auth.uid()
    from order_handoff h
   where h.order_id = p_order and h.endorsed_by is not null and h.endorsed_by <> auth.uid();
end $function$;
