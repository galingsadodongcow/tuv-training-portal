-- Two product-decision follow-ups from the UX review:
--
-- 1) Operations may reassign order owners. Today order_assignment writes are
--    permitted only to super_admin (p_asg_admin), business_owner / sales
--    supervisors (p_asg_lead_*), and a sales rep for their own row
--    (p_asg_sales_*). Operations was excluded. Add an operations policy so the
--    intended set — super_admin, operations, business_owner, sales supervisor —
--    can (re)assign. Policies are OR-ed per command, so this only widens access.
--
-- 2) fn_transfer_line ("move a booking to another session") is SECURITY DEFINER
--    and only checked that the caller had *a* role — a rep could move a line on
--    an order they cannot see. Add an fn_can_see_order() visibility guard so the
--    caller must be able to see the owning order. Body is otherwise unchanged.
--
-- Idempotent; safe to re-apply.

-- 1) Operations write access to order_assignment ----------------------------
drop policy if exists p_asg_ops on public.order_assignment;
create policy p_asg_ops on public.order_assignment for all to authenticated
  using      (public.fn_current_role() = 'operations'::public.user_role)
  with check (public.fn_current_role() = 'operations'::public.user_role);

-- 2) fn_transfer_line with a visibility guard --------------------------------
create or replace function public.fn_transfer_line(p_line uuid, p_new_schedule uuid, p_reason text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role user_role; v_old uuid; v_seats int; v_order text;
  v_max int; v_taken int; v_oldname text; v_newname text;
begin
  select role into v_role from profiles where user_id = auth.uid();
  if v_role is null then raise exception 'Not allowed to transfer'; end if;

  select schedule_id, seats, order_id into v_old, v_seats, v_order from order_line where line_id = p_line;
  if v_order is null then raise exception 'Order line not found'; end if;

  -- Visibility guard: the caller must be able to see the owning order.
  if not fn_can_see_order(v_order) then
    raise exception 'Not allowed to transfer this order' using errcode = '42501';
  end if;

  if v_old = p_new_schedule then raise exception 'This line is already on that session'; end if;

  if (select status from schedule where schedule_id = p_new_schedule) not in ('Tentative','Confirmed') then
    raise exception 'Target session is not open for bookings';
  end if;
  select max_participants into v_max from schedule where schedule_id = p_new_schedule;
  if v_max is not null then
    select coalesce(sum(seats),0) into v_taken from order_line
     where schedule_id = p_new_schedule and line_status in ('New','Confirmed','Completed');
    if v_taken + v_seats > v_max then
      raise exception 'Target session has % of % seats taken, needs % more', v_taken, v_max, v_seats;
    end if;
  end if;

  update order_line set schedule_id = p_new_schedule, went_live = 'Reschedule' where line_id = p_line;
  update participant set schedule_id = p_new_schedule where line_id = p_line;

  select c.course_name into v_oldname from schedule s join course c on c.course_id=s.course_id where s.schedule_id=v_old;
  select c.course_name into v_newname from schedule s join course c on c.course_id=s.course_id where s.schedule_id=p_new_schedule;
  if v_old is not null then
    insert into session_note (schedule_id, author, note)
    values (v_old, auth.uid(), format('Order %s (%s seats) transferred out to %s. %s', v_order, v_seats, coalesce(v_newname,'another session'), coalesce(p_reason,'')));
  end if;
  insert into session_note (schedule_id, author, note)
  values (p_new_schedule, auth.uid(), format('Order %s (%s seats) transferred in from %s. %s', v_order, v_seats, coalesce(v_oldname,'no session'), coalesce(p_reason,'')));
end $function$;

revoke execute on function public.fn_transfer_line(uuid, uuid, text) from public, anon;
grant execute on function public.fn_transfer_line(uuid, uuid, text) to authenticated;
