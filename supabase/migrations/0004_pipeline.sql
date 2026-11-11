-- 0004_pipeline.sql
create table public.opportunities (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id),
  title          text not null check (length(trim(title)) >= 2),
  stage          public.opp_stage_t not null default 'new',
  owner_id       uuid not null references public.profiles(id) default auth.uid(),
  est_pallets    integer check (est_pallets > 0),
  pallet_spec    text,                                 -- e.g. 'ECR 1200x1000', free text in Phase 1
  target_region  public.region_t,
  expected_start date,
  lost_reason    text,
  stage_changed_at timestamptz not null default now(),
  closed_at      timestamptz,
  archived_at    timestamptz,
  created_by     uuid references public.profiles(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (stage <> 'lost' or length(trim(coalesce(lost_reason, ''))) > 0)
);
create index opp_account_idx on public.opportunities (account_id);
create index opp_owner_stage_idx on public.opportunities (owner_id, stage) where archived_at is null;
create index opp_created_by_idx on public.opportunities (created_by);
create trigger trg_opp_updated before update on public.opportunities
  for each row execute function public.set_updated_at();

create or replace function public.opp_stage_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage in ('lost','active') then new.closed_at := now(); else new.closed_at := null; end if;
    if new.stage <> 'lost' then new.lost_reason := null; end if;
  end if;
  return new;
end $$;
create trigger trg_opp_stage before update on public.opportunities
  for each row execute function public.opp_stage_touch();

create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  client_uuid  uuid not null unique,                   -- idempotency key from the device (offline replay)
  type         public.activity_type_t not null,
  account_id   uuid not null references public.accounts(id),
  contact_id   uuid references public.contacts(id),
  opportunity_id uuid references public.opportunities(id),
  site_id      uuid references public.sites(id),
  occurred_at  timestamptz not null default now(),
  summary      text not null check (length(trim(summary)) >= 3),
  next_step    text,
  lat          numeric(9,6) check (lat between -90 and 90),   -- optional geo-stamp for site visits
  lng          numeric(9,6) check (lng between -180 and 180),
  created_by   uuid not null references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index act_account_idx on public.activities (account_id, occurred_at desc);
create index act_opp_idx on public.activities (opportunity_id, occurred_at desc);
create index act_created_by_idx on public.activities (created_by, occurred_at desc);
create index act_contact_idx on public.activities (contact_id);
create index act_site_idx on public.activities (site_id);
-- Activities are append-only history: no UPDATE after 24h (see trigger in 0006).

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  client_uuid  uuid unique,                             -- offline idempotency key
  title        text not null check (length(trim(title)) >= 2),
  due_at       timestamptz,
  status       public.task_status_t not null default 'open',
  assigned_to  uuid not null references public.profiles(id),
  account_id   uuid references public.accounts(id),
  opportunity_id uuid references public.opportunities(id),
  activity_id  uuid references public.activities(id),  -- the activity whose next_step created it
  ticket_id    uuid,                                   -- FK added after tickets table
  created_by   uuid not null references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_assignee_idx on public.tasks (assigned_to, status, due_at);
create index tasks_created_by_idx on public.tasks (created_by);
create index tasks_account_idx on public.tasks (account_id);
create index tasks_opp_idx on public.tasks (opportunity_id);
create index tasks_activity_idx on public.tasks (activity_id);

create or replace function public.task_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger trg_task_touch before insert or update on public.tasks
  for each row execute function public.task_touch();
