-- 0003_accounts.sql
create sequence public.account_code_seq start 1;

create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null default ('CUS-' || lpad(nextval('public.account_code_seq')::text, 5, '0')),
  name          text not null check (length(trim(name)) >= 2),
  legal_name    text,
  segment       public.segment_t not null default 'other',
  status        public.account_status_t not null default 'prospect',
  lead_source   public.lead_source_t,
  owner_id      uuid references public.profiles(id) default auth.uid(),   -- responsible sales rep
  -- Business rules carried forward to billing (Phase 3):
  is_accredited        boolean not null default false, -- only accredited clients may receive sales orders
  accredited_at        date,
  billing_cutoff_day   smallint not null default 10 check (billing_cutoff_day between 1 and 28),
  lock_in_months       smallint check (lock_in_months between 1 and 60),
  principal_account_id uuid references public.accounts(id), -- billed principal, when this account is a sub-entity
  notes         text,
  archived_at   timestamptz,
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (is_accredited = false or accredited_at is not null),
  check (principal_account_id is null or principal_account_id <> id)
);
create index accounts_name_trgm on public.accounts using gin (name extensions.gin_trgm_ops);
create index accounts_owner_idx  on public.accounts (owner_id) where archived_at is null;
create index accounts_status_idx on public.accounts (status)   where archived_at is null;
create index accounts_principal_idx on public.accounts (principal_account_id);
create index accounts_created_by_idx on public.accounts (created_by);
create trigger trg_accounts_updated before update on public.accounts
  for each row execute function public.set_updated_at();

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id),
  full_name   text not null check (length(trim(full_name)) >= 2),
  job_title   text,
  department  text,                                    -- e.g. purchasing, logistics, warehouse
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  mobile      text,
  messenger_link text,
  is_primary  boolean not null default false,
  archived_at timestamptz,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index contacts_one_primary on public.contacts (account_id) where is_primary and archived_at is null;
create index contacts_account_idx on public.contacts (account_id) where archived_at is null;
create index contacts_email_idx on public.contacts (lower(email));
create index contacts_created_by_idx on public.contacts (created_by);
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();

-- A site is where pallets physically go (e.g. a client warehouse). Used for DRs in Phase 3.
create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id),
  name        text not null check (length(trim(name)) >= 2),
  region      public.region_t not null default 'luzon',
  province    text,
  city        text,
  address     text,
  lat         numeric(9,6) check (lat between -90 and 90),
  lng         numeric(9,6) check (lng between -180 and 180),
  receiving_hours text,
  site_contact_id uuid references public.contacts(id),
  trucking_zone text,                                   -- filled when the zone matrix arrives (Phase 3)
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index sites_account_idx on public.sites (account_id) where archived_at is null;
create index sites_region_idx on public.sites (region, account_id) where archived_at is null;
create index sites_contact_idx on public.sites (site_contact_id);
create trigger trg_sites_updated before update on public.sites
  for each row execute function public.set_updated_at();
