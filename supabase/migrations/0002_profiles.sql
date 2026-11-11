-- 0002_profiles.sql
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 2 and 120),
  role        public.app_role not null default 'sales_rep',
  phone       text,
  is_active   boolean not null default true,
  must_change_password boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role lookup. SECURITY DEFINER so RLS policies can call it without recursion.
create or replace function public.auth_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and is_active
$$;

create or replace function public.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() = any(roles), false)
$$;

revoke all on function public.auth_role() from public, anon;
revoke all on function public.has_role(public.app_role[]) from public, anon;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;

-- Block privilege escalation through any path (UI or direct API):
--  * only owner/admin may change role or is_active
--  * only an owner may touch an owner row or grant 'owner'
--  * must_change_password is set/cleared only by trusted server code (password flow)
create or replace function public.guard_profile_change() returns trigger
language plpgsql set search_path = '' as $$
declare actor public.app_role := public.auth_role();
begin
  if public.is_privileged() then return new; end if;

  if new.id is distinct from old.id then
    raise exception 'profile id is immutable';
  end if;
  if new.must_change_password is distinct from old.must_change_password then
    raise exception 'password flag is managed by the server';
  end if;
  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    if actor is null or actor not in ('owner','admin') then
      raise exception 'not allowed to change role or status';
    end if;
    if (old.role = 'owner' or new.role = 'owner') and actor <> 'owner' then
      raise exception 'only an owner can change owner accounts';
    end if;
    if old.id = (select auth.uid()) and new.is_active is distinct from old.is_active then
      raise exception 'you cannot deactivate yourself';
    end if;
  end if;
  if old.role = 'owner' and old.id <> (select auth.uid()) and actor <> 'owner' then
    raise exception 'only an owner can change owner accounts';
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_change();

alter table public.profiles enable row level security;

-- Everyone with a CRM role can see names (needed for owner/assignee pickers); only the
-- profile rows themselves, no auth data.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager',
                               'deployment_officer','finance','billing'))
  );

-- A user may edit only their own name/phone; role/status edits are caught by the trigger above.
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.has_role('owner','admin')))
  with check (id = (select auth.uid()) or (select public.has_role('owner','admin')));
-- No INSERT policy: profiles are created only by the server (service role).
-- No DELETE policy: deactivate instead.
