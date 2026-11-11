-- 0001_foundation.sql
-- Extensions live in the `extensions` schema (Supabase advisor: no extensions in public).
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;   -- fuzzy search on account names

create type public.app_role as enum (
  'owner','admin','sales_manager','sales_rep','csr','ops_manager',
  'deployment_officer','finance','billing','purchasing','hr',
  'production_officer','qc','driver','helper','pallet_maker','painter'
);

create type public.segment_t as enum ('warehouse','distributor','manufacturer','fmcg','third_party_logistics','other');
create type public.region_t as enum ('luzon','visayas','mindanao');
create type public.account_status_t as enum ('prospect','active','inactive');
create type public.lead_source_t as enum ('cold_call','referral','direct_visit','inbound','website','facebook','event','other');
create type public.opp_stage_t as enum (
  'new','contacted','presentation_done','proposal_sent',
  'conforme_signed','contract_sent','contract_signed','active','on_hold','lost'
);
create type public.activity_type_t as enum ('call','visit','email','meeting','messenger','whatsapp','note');
create type public.task_status_t as enum ('open','done','cancelled');
create type public.ticket_channel_t as enum ('messenger','whatsapp','email','phone','visit','internal','other');
create type public.ticket_category_t as enum (
  'delivery_delay','pallet_quality','pallet_shortage','billing','dehire_request',
  'pallet_audit','pickup_request','contract','other'
);
create type public.ticket_priority_t as enum ('low','normal','high','urgent');
create type public.ticket_status_t as enum ('new','assigned','in_progress','waiting_client','resolved','closed');

-- keeps updated_at honest
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- True when the current request is trusted server code (service role key) or a direct
-- database session (migrations, pg_cron). False for anon/authenticated API users.
create or replace function public.is_privileged() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', 'service_role') = 'service_role'
$$;
