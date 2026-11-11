-- 0006_attachments_audit.sql
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('account','opportunity','ticket','activity')),
  entity_id    uuid not null,
  storage_path text not null unique,                    -- {entity_type}/{entity_id}/{uuid}-{safe_name}
  file_name    text not null,
  mime_type    text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp',
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes   integer not null check (size_bytes between 1 and 10485760),   -- 10 MB
  uploaded_by  uuid not null references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  check (storage_path like entity_type || '/' || entity_id::text || '/%')
);
create index att_entity_idx on public.attachments (entity_type, entity_id);
create index att_uploaded_by_idx on public.attachments (uploaded_by);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid default auth.uid(),
  table_name text not null,
  row_id     text,
  action     text not null check (action in ('INSERT','UPDATE','DELETE','IMPORT')),
  old_data   jsonb,
  new_data   jsonb
);
create index audit_row_idx on public.audit_log (table_name, row_id, at desc);
create index audit_at_idx on public.audit_log (at desc);
create index audit_actor_idx on public.audit_log (actor, at desc);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rid text;
begin
  -- skip no-op updates (e.g. touching updated_at only)
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return new;
  end if;
  rid := coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'), (to_jsonb(new)->>'account_id'),
                  (to_jsonb(old)->>'account_id'), (to_jsonb(new)->>'priority'), (to_jsonb(old)->>'priority'));
  insert into public.audit_log(table_name, row_id, action, old_data, new_data)
  values (tg_table_name, rid, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles','accounts','contacts','sites','opportunities','activities','tasks',
                           'tickets','ticket_comments','attachments','sla_policies']
  loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Audit rows are immutable.
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated
  using ((select public.has_role('owner','admin')));
-- No insert/update/delete policies: only SECURITY DEFINER functions write.
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

-- Activities: editable by the author for 24h only (typo fixes); never deletable.
create or replace function public.activity_lock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_privileged() then return new; end if;
  if old.created_at < now() - interval '24 hours' and not public.has_role('owner','admin') then
    raise exception 'activity is locked after 24 hours';
  end if;
  new.client_uuid := old.client_uuid;
  new.created_by  := old.created_by;
  new.created_at  := old.created_at;
  return new;
end $$;
create trigger trg_activity_lock before update on public.activities
  for each row execute function public.activity_lock();
