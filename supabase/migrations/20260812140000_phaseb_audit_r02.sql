-- ===========================================================================
-- Phase B (second-pass) — 5/6: audit-grade capture (R02).
--
-- The live fn_audit already records old_data / new_data / changed_fields
-- ({field:{old,new}}). This closes the remaining R02 gaps:
--   * add a `source` flag (system vs user) so background-job writes are
--     distinguishable from human writes;
--   * add a `reason` column, populated from a transaction-local GUC
--     (app.audit_reason) that RPCs set before a sensitive write;
--   * extend audit-trigger coverage to the money + lead + contact tables that
--     were previously unaudited: payment, refund, credit_note, inquiry,
--     contact, invoice, participant.
--
-- Idempotent. fn_audit keeps its existing behaviour; only the two new columns
-- are added to each row it writes.
-- ===========================================================================

alter table public.audit_log add column if not exists source text not null default 'user';
alter table public.audit_log add column if not exists reason text;

-- fn_audit: unchanged capture + source flag + optional reason from GUC.
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  v_pk_col  text := tg_argv[0];
  v_old     jsonb;
  v_new     jsonb;
  v_pk      text;
  v_changed jsonb;
  v_actor   uuid;
  v_role    user_role;
  v_source  text;
  v_reason  text;
begin
  v_actor  := auth.uid();
  v_source := case when v_actor is null then 'system' else 'user' end;
  v_reason := nullif(current_setting('app.audit_reason', true), '');
  select role into v_role from profiles where user_id = v_actor;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_pk := v_new ->> v_pk_col;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_pk := v_old ->> v_pk_col;
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    v_pk  := coalesce(v_new ->> v_pk_col, v_old ->> v_pk_col);
    select jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
      into v_changed
      from jsonb_each(v_old) o join jsonb_each(v_new) n using (key)
      where o.value is distinct from n.value;
  end if;

  if tg_op = 'UPDATE' and (v_changed is null or v_changed = '{}'::jsonb) then
    return null;
  end if;

  insert into audit_log (table_name, row_pk, action, actor_id, actor_role,
                         old_data, new_data, changed_fields, source, reason)
  values (tg_table_name, v_pk, tg_op, v_actor, v_role,
          v_old, v_new, v_changed, v_source, v_reason);
  return null;
end;
$function$;
revoke execute on function public.fn_audit() from public, anon, authenticated;

-- Extend audit coverage to the money / lead / contact tables.
drop trigger if exists trg_audit_payment on public.payment;
create trigger trg_audit_payment after insert or delete or update on public.payment
  for each row execute function public.fn_audit('payment_id');
drop trigger if exists trg_audit_refund on public.refund;
create trigger trg_audit_refund after insert or delete or update on public.refund
  for each row execute function public.fn_audit('refund_id');
drop trigger if exists trg_audit_credit_note on public.credit_note;
create trigger trg_audit_credit_note after insert or delete or update on public.credit_note
  for each row execute function public.fn_audit('credit_id');
drop trigger if exists trg_audit_inquiry on public.inquiry;
create trigger trg_audit_inquiry after insert or delete or update on public.inquiry
  for each row execute function public.fn_audit('inquiry_id');
drop trigger if exists trg_audit_contact on public.contact;
create trigger trg_audit_contact after insert or delete or update on public.contact
  for each row execute function public.fn_audit('contact_id');
drop trigger if exists trg_audit_invoice on public.invoice;
create trigger trg_audit_invoice after insert or delete or update on public.invoice
  for each row execute function public.fn_audit('invoice_id');
drop trigger if exists trg_audit_participant on public.participant;
create trigger trg_audit_participant after insert or delete or update on public.participant
  for each row execute function public.fn_audit('participant_id');

-- Surface source + reason through the super-admin/auditor audit browser.
-- Return type changes (added columns) => must drop before recreate.
drop function if exists public.fn_audit_search(text, text, text, timestamptz, timestamptz, text, integer);
create or replace function public.fn_audit_search(
  p_table text default null, p_action text default null, p_role text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_search text default null, p_limit integer default 200)
returns table(audit_id bigint, table_name text, row_pk text, action text,
              actor_role text, actor_id uuid, changed_at timestamptz,
              changed_fields jsonb, source text, reason text)
language sql stable security definer set search_path to 'public' as $$
  select a.audit_id, a.table_name, a.row_pk, a.action, a.actor_role, a.actor_id,
         a.changed_at, a.changed_fields, a.source, a.reason
    from audit_log a
   where fn_current_role() in ('super_admin','auditor')
     and (p_table  is null or a.table_name = p_table)
     and (p_action is null or a.action = p_action)
     and (p_role   is null or a.actor_role::text = p_role)
     and (p_from   is null or a.changed_at >= p_from)
     and (p_to     is null or a.changed_at <= p_to)
     and (p_search is null or a.row_pk ilike '%'||p_search||'%'
          or a.changed_fields::text ilike '%'||p_search||'%')
   order by a.changed_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
grant execute on function public.fn_audit_search(text, text, text, timestamptz, timestamptz, text, integer) to authenticated;
