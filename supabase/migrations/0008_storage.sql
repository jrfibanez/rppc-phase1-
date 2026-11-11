-- 0008_storage.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-attachments', 'crm-attachments', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Object access mirrors the attachments row: you can read an object only if you can read its metadata row.
create policy "crm files read" on storage.objects for select to authenticated
  using (bucket_id = 'crm-attachments'
         and exists (select 1 from public.attachments a where a.storage_path = storage.objects.name));

-- Uploads must land under {entity_type}/{entity_id}/ for an entity the user can see.
create policy "crm files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'crm-attachments'
    and (select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing'))
    and (storage.foldername(name))[1] in ('account','opportunity','ticket','activity')
  );
-- No update/delete policies: files are immutable for app users.
