-- 0007_rls.sql
-- Policies wrap auth.uid()/has_role() in (select ...) so Postgres evaluates them once per
-- statement instead of once per row (Supabase performance advisor).
alter table public.accounts        enable row level security;
alter table public.contacts        enable row level security;
alter table public.sites           enable row level security;
alter table public.opportunities   enable row level security;
alter table public.activities      enable row level security;
alter table public.tasks           enable row level security;
alter table public.tickets         enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.attachments     enable row level security;
alter table public.sla_policies    enable row level security;

-- NOTE: select policies deliberately do NOT filter on archived_at. If they did, an UPDATE that sets
-- archived_at would fail (the new row would be invisible to the SELECT policy). Screens and queries
-- filter `archived_at is null` in the data-access layer; managers can open an "Archived" view.

-- ===== accounts =====
create policy accounts_select on public.accounts for select to authenticated
  using ((select public.has_role(
    'owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing')));

create policy accounts_insert on public.accounts for insert to authenticated
  with check (
    (select public.has_role('owner','admin','sales_manager'))
    or ((select public.has_role('sales_rep')) and owner_id = (select auth.uid()))
  );

create policy accounts_update on public.accounts for update to authenticated
  using (
    (select public.has_role('owner','admin','sales_manager','ops_manager'))
    or ((select public.has_role('sales_rep')) and owner_id = (select auth.uid()))
  )
  with check (
    (select public.has_role('owner','admin','sales_manager','ops_manager'))
    or ((select public.has_role('sales_rep')) and owner_id = (select auth.uid()))
  );
-- No DELETE policy. Archiving is an UPDATE that sets archived_at.

-- Field-level guard: accreditation, billing cutoff, owner reassignment and archiving are restricted;
-- ops_manager may change accreditation fields only.
create or replace function public.guard_account_fields() returns trigger
language plpgsql set search_path = '' as $$
declare
  actor public.app_role := public.auth_role();
begin
  if public.is_privileged() then return new; end if;
  new.code := old.code; new.created_by := old.created_by; new.created_at := old.created_at;

  if new.is_accredited is distinct from old.is_accredited
     or new.accredited_at is distinct from old.accredited_at
     or new.billing_cutoff_day is distinct from old.billing_cutoff_day then
    if actor is null or actor not in ('owner','admin','sales_manager','ops_manager') then
      raise exception 'only management/operations can change accreditation or billing cutoff';
    end if;
  end if;
  if new.owner_id is distinct from old.owner_id and (actor is null or actor not in ('owner','admin','sales_manager')) then
    raise exception 'only sales management can reassign account ownership';
  end if;
  if new.archived_at is distinct from old.archived_at and (actor is null or actor not in ('owner','admin','sales_manager')) then
    raise exception 'only sales management can archive accounts';
  end if;
  if actor = 'ops_manager' then
    if (to_jsonb(new) - array['is_accredited','accredited_at','billing_cutoff_day','updated_at'])
       <> (to_jsonb(old) - array['is_accredited','accredited_at','billing_cutoff_day','updated_at']) then
      raise exception 'operations can change accreditation and billing cutoff only';
    end if;
  end if;
  return new;
end $$;
create trigger trg_accounts_guard before update on public.accounts
  for each row execute function public.guard_account_fields();

-- Generic archive guard for child records: only management may archive/unarchive.
create or replace function public.guard_archive() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_privileged() then return new; end if;
  if new.archived_at is distinct from old.archived_at and not public.has_role('owner','admin','sales_manager') then
    raise exception 'only sales management can archive records';
  end if;
  return new;
end $$;
create trigger trg_contacts_archive before update on public.contacts for each row execute function public.guard_archive();
create trigger trg_sites_archive    before update on public.sites    for each row execute function public.guard_archive();

-- Opportunities: only management may reassign or archive.
create or replace function public.guard_opportunity_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_privileged() then return new; end if;
  new.created_by := old.created_by; new.created_at := old.created_at;
  if (new.owner_id is distinct from old.owner_id or new.archived_at is distinct from old.archived_at)
     and not public.has_role('owner','admin','sales_manager') then
    raise exception 'only sales management can reassign or archive opportunities';
  end if;
  return new;
end $$;
create trigger trg_opp_guard before update on public.opportunities
  for each row execute function public.guard_opportunity_fields();

-- Tax details live in a separate table so only finance-side roles and management can read them.
-- (A column-level REVOKE does nothing while a table-level SELECT grant exists, so we split the table.)
create table public.account_finance (
  account_id    uuid primary key references public.accounts(id),
  tin           text check (tin is null or tin ~ '^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$'),
  billing_address text,
  billing_email text check (billing_email is null or billing_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at    timestamptz not null default now()
);
create trigger trg_account_finance_updated before update on public.account_finance
  for each row execute function public.set_updated_at();
create trigger trg_audit_account_finance after insert or update or delete on public.account_finance
  for each row execute function public.audit_row();

alter table public.account_finance enable row level security;
create policy acctfin_select on public.account_finance for select to authenticated
  using ((select public.has_role('owner','admin','sales_manager','finance','billing')));
create policy acctfin_insert on public.account_finance for insert to authenticated
  with check ((select public.has_role('owner','admin','finance','billing')));
create policy acctfin_update on public.account_finance for update to authenticated
  using ((select public.has_role('owner','admin','finance','billing')))
  with check ((select public.has_role('owner','admin','finance','billing')));

-- ===== contacts / sites =====
create policy contacts_select on public.contacts for select to authenticated
  using ((select public.has_role(
    'owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing')));
create policy contacts_insert on public.contacts for insert to authenticated
  with check ((select public.has_role('owner','admin','sales_manager','sales_rep','csr')));
create policy contacts_update on public.contacts for update to authenticated
  using ((select public.has_role('owner','admin','sales_manager','sales_rep')))
  with check ((select public.has_role('owner','admin','sales_manager','sales_rep')));

create policy sites_select on public.sites for select to authenticated
  using ((select public.has_role(
    'owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing')));
create policy sites_insert on public.sites for insert to authenticated
  with check ((select public.has_role('owner','admin','sales_manager','sales_rep','ops_manager')));
create policy sites_update on public.sites for update to authenticated
  using ((select public.has_role('owner','admin','sales_manager','sales_rep','ops_manager')))
  with check ((select public.has_role('owner','admin','sales_manager','sales_rep','ops_manager')));

-- ===== opportunities =====
create policy opp_select on public.opportunities for select to authenticated
  using ((select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager')));
create policy opp_insert on public.opportunities for insert to authenticated
  with check ((select public.has_role('owner','admin','sales_manager'))
              or ((select public.has_role('sales_rep')) and owner_id = (select auth.uid())));
create policy opp_update on public.opportunities for update to authenticated
  using ((select public.has_role('owner','admin','sales_manager'))
         or ((select public.has_role('sales_rep')) and owner_id = (select auth.uid())))
  with check ((select public.has_role('owner','admin','sales_manager'))
              or ((select public.has_role('sales_rep')) and owner_id = (select auth.uid())));

-- ===== activities =====
create policy act_select on public.activities for select to authenticated
  using ((select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing')));
create policy act_insert on public.activities for insert to authenticated
  with check (created_by = (select auth.uid())
              and (select public.has_role('owner','admin','sales_manager','sales_rep','csr','deployment_officer')));
create policy act_update on public.activities for update to authenticated
  using ((created_by = (select auth.uid()) and (select public.has_role('owner','admin','sales_manager','sales_rep','csr','deployment_officer')))
         or (select public.has_role('owner','admin','sales_manager')))
  with check ((created_by = (select auth.uid()) and (select public.has_role('owner','admin','sales_manager','sales_rep','csr','deployment_officer')))
         or (select public.has_role('owner','admin','sales_manager')));

-- ===== tasks: see/edit what you own or are assigned; management sees all =====
create policy tasks_select on public.tasks for select to authenticated
  using ((select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing'))
         and (assigned_to = (select auth.uid()) or created_by = (select auth.uid())
              or (select public.has_role('owner','admin','sales_manager','ops_manager'))));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.has_role(
    'owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing')));
create policy tasks_update on public.tasks for update to authenticated
  using ((select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing'))
         and (assigned_to = (select auth.uid()) or created_by = (select auth.uid())
              or (select public.has_role('owner','admin','sales_manager'))))
  with check ((select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing'))
         and (assigned_to = (select auth.uid()) or created_by = (select auth.uid())
              or (select public.has_role('owner','admin','sales_manager'))));

-- ===== tickets =====
create policy tickets_select on public.tickets for select to authenticated
  using ((select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer'))
         or ((select public.has_role('finance','billing')) and category in ('billing','contract')));
create policy tickets_insert on public.tickets for insert to authenticated
  with check (created_by = (select auth.uid())
              and (select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer')));
create policy tickets_update on public.tickets for update to authenticated
  using ((select public.has_role('owner','admin','sales_manager','csr','ops_manager','deployment_officer'))
         or ((select public.has_role('sales_rep')) and assigned_to = (select auth.uid()))
         or ((select public.has_role('finance','billing')) and category = 'billing'))
  with check ((select public.has_role('owner','admin','sales_manager','csr','ops_manager','deployment_officer'))
         or ((select public.has_role('sales_rep')) and assigned_to = (select auth.uid()))
         or ((select public.has_role('finance','billing')) and category = 'billing'));

-- Ticket integrity: SLA fields are system-managed.
create or replace function public.guard_ticket_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_privileged() then return new; end if;
  new.created_by := old.created_by;
  new.client_uuid := old.client_uuid;
  if current_setting('rppc.allow_first_response', true) is distinct from 'on' then
    new.first_responded_at := old.first_responded_at;
  end if;
  new.sla_breached := old.sla_breached;
  return new;
end $$;
create trigger trg_tickets_guard before update on public.tickets
  for each row execute function public.guard_ticket_fields();

create policy tcomments_select on public.ticket_comments for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id));   -- inherits ticket visibility via RLS
create policy tcomments_insert on public.ticket_comments for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (select 1 from public.tickets t where t.id = ticket_id));

-- ===== attachments inherit the parent's visibility =====
create policy att_select on public.attachments for select to authenticated
  using (
    case entity_type
      when 'account'     then exists (select 1 from public.accounts a      where a.id = entity_id)
      when 'opportunity' then exists (select 1 from public.opportunities o where o.id = entity_id)
      when 'ticket'      then exists (select 1 from public.tickets t       where t.id = entity_id)
      when 'activity'    then exists (select 1 from public.activities x    where x.id = entity_id)
      else false
    end);
create policy att_insert on public.attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid())
    and (select public.has_role('owner','admin','sales_manager','sales_rep','csr','ops_manager','deployment_officer','finance','billing'))
    and case entity_type
      when 'account'     then exists (select 1 from public.accounts a      where a.id = entity_id)
      when 'opportunity' then exists (select 1 from public.opportunities o where o.id = entity_id)
      when 'ticket'      then exists (select 1 from public.tickets t       where t.id = entity_id)
      when 'activity'    then exists (select 1 from public.activities x    where x.id = entity_id)
      else false
    end);

create policy sla_read on public.sla_policies for select to authenticated using (true);
create policy sla_insert on public.sla_policies for insert to authenticated
  with check ((select public.has_role('owner','admin')));
create policy sla_update on public.sla_policies for update to authenticated
  using ((select public.has_role('owner','admin'))) with check ((select public.has_role('owner','admin')));
