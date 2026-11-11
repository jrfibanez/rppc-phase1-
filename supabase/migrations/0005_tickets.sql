-- 0005_tickets.sql
create sequence public.ticket_seq start 1;

create table public.sla_policies (
  priority         public.ticket_priority_t primary key,
  first_response_h integer not null check (first_response_h between 1 and 720),
  resolution_h     integer not null check (resolution_h between 1 and 2160),
  check (resolution_h >= first_response_h)
);
insert into public.sla_policies values
  ('urgent', 1, 8), ('high', 4, 24), ('normal', 8, 72), ('low', 24, 120);  -- assumed defaults; admin-editable

create table public.tickets (
  id            uuid primary key default gen_random_uuid(),
  client_uuid   uuid unique,
  number        text unique not null default ('TKT-' || to_char(now() at time zone 'Asia/Manila','YYYY') || '-' || lpad(nextval('public.ticket_seq')::text, 6, '0')),
  account_id    uuid not null references public.accounts(id),
  site_id       uuid references public.sites(id),
  contact_id    uuid references public.contacts(id),
  channel       public.ticket_channel_t not null default 'messenger',
  source_ref    text,                                   -- link or reference to the original Messenger/WhatsApp/email thread
  category      public.ticket_category_t not null default 'other',
  priority      public.ticket_priority_t not null default 'normal',
  status        public.ticket_status_t not null default 'new',
  subject       text not null check (length(trim(subject)) >= 3),
  description   text,
  assigned_to   uuid references public.profiles(id),
  first_response_due timestamptz,
  resolution_due     timestamptz,
  first_responded_at timestamptz,
  resolved_at   timestamptz,
  sla_breached  boolean not null default false,
  resolution_note text,
  created_by    uuid not null references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status not in ('resolved','closed') or length(trim(coalesce(resolution_note, ''))) > 0)
);
create index tickets_status_idx on public.tickets (status, priority) where status not in ('closed');
create index tickets_assignee_idx on public.tickets (assigned_to) where status not in ('resolved','closed');
create index tickets_account_idx on public.tickets (account_id, created_at desc);
create index tickets_site_idx on public.tickets (site_id);
create index tickets_contact_idx on public.tickets (contact_id);
create index tickets_created_by_idx on public.tickets (created_by);
create trigger trg_tickets_updated before update on public.tickets
  for each row execute function public.set_updated_at();

alter table public.tasks add constraint tasks_ticket_fk foreign key (ticket_id) references public.tickets(id);
create index tasks_ticket_idx on public.tasks (ticket_id);

-- Compute SLA deadlines on insert and when priority changes; keep resolved_at consistent.
create or replace function public.ticket_sla() returns trigger
language plpgsql set search_path = '' as $$
declare p public.sla_policies;
begin
  select * into p from public.sla_policies where priority = new.priority;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;   -- SLA anchor is immutable
    new.number := old.number;
  end if;
  if tg_op = 'INSERT' or new.priority is distinct from old.priority then
    new.first_response_due := new.created_at + make_interval(hours => p.first_response_h);
    new.resolution_due     := new.created_at + make_interval(hours => p.resolution_h);
  end if;
  if new.status in ('resolved','closed') and new.resolved_at is null then
    new.resolved_at := now();
  elsif new.status not in ('resolved','closed') then
    new.resolved_at := null;   -- re-opened
  end if;
  return new;
end $$;
create trigger trg_ticket_sla before insert or update on public.tickets
  for each row execute function public.ticket_sla();

create table public.ticket_comments (
  id          uuid primary key default gen_random_uuid(),
  client_uuid uuid unique,
  ticket_id   uuid not null references public.tickets(id),
  body        text not null check (length(trim(body)) >= 1),
  is_internal boolean not null default false,           -- internal notes vs. a logged client reply
  created_by  uuid not null references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index tcomments_ticket_idx on public.ticket_comments (ticket_id, created_at);
create index tcomments_created_by_idx on public.ticket_comments (created_by);

-- First non-internal comment by staff stamps first_responded_at.
create or replace function public.ticket_first_response() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_internal then
    perform set_config('rppc.allow_first_response', 'on', true);
    update public.tickets set first_responded_at = coalesce(first_responded_at, now())
     where id = new.ticket_id and first_responded_at is null;
    perform set_config('rppc.allow_first_response', 'off', true);
  end if;
  return new;
end $$;
revoke all on function public.ticket_first_response() from public, anon, authenticated;
create trigger trg_ticket_first_response after insert on public.ticket_comments
  for each row execute function public.ticket_first_response();

-- Hourly: flag SLA breaches (scheduled with pg_cron, see 0009).
create or replace function public.flag_sla_breaches() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.tickets set sla_breached = true
   where sla_breached = false
     and status not in ('resolved','closed')
     and (resolution_due < now() or (first_responded_at is null and first_response_due < now()));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.flag_sla_breaches() from public, anon, authenticated;
