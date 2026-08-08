-- Document attachments. A private storage bucket plus a metadata table that
-- links any stored file to a record (order, session, client, organization).
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- Private bucket.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Storage access: any signed-in role reads and uploads; the uploader or
-- operations and super admin can delete.
drop policy if exists p_att_read on storage.objects;
create policy p_att_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
drop policy if exists p_att_insert on storage.objects;
create policy p_att_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');
drop policy if exists p_att_delete on storage.objects;
create policy p_att_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or public.fn_current_role() in ('operations','super_admin')));

-- Metadata for each uploaded file.
create table if not exists public.attachment (
  attachment_id uuid primary key default gen_random_uuid(),
  entity_type text not null,      -- order, session, client, organization
  entity_id text not null,
  path text not null,             -- storage object path
  file_name text not null,
  mime text,
  size bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists attachment_entity_idx on public.attachment(entity_type, entity_id);

alter table public.attachment enable row level security;

drop policy if exists p_attach_r on public.attachment;
create policy p_attach_r on public.attachment for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_attach_i on public.attachment;
create policy p_attach_i on public.attachment for insert to authenticated
  with check (uploaded_by = auth.uid());
drop policy if exists p_attach_d on public.attachment;
create policy p_attach_d on public.attachment for delete to authenticated
  using (uploaded_by = auth.uid() or fn_current_role() in ('operations','super_admin'));
