-- 0009_functions_jobs.sql
-- Fuzzy account search (runs as the caller, so RLS applies).
create or replace function public.search_accounts(q text, max_rows integer default 50)
returns setof public.accounts
language sql stable set search_path = '' as $$
  select a.* from public.accounts a
   where a.archived_at is null
     and (a.name ilike '%' || q || '%' or a.code ilike q || '%' or extensions.similarity(a.name, q) > 0.3)
   order by (a.name ilike q || '%') desc, extensions.similarity(a.name, q) desc, a.name
   limit least(greatest(max_rows, 1), 200)
$$;
revoke all on function public.search_accounts(text, integer) from public, anon;
grant execute on function public.search_accounts(text, integer) to authenticated;

-- Duplicate detection for CSV import: best existing match per incoming name.
create or replace function public.match_account_names(names text[])
returns table (input_name text, account_id uuid, account_code text, account_name text, score real)
language sql stable set search_path = '' as $$
  select n.name, m.id, m.code, m.name, m.score
    from unnest(names) as n(name)
    cross join lateral (
      select a.id, a.code, a.name,
             extensions.similarity(lower(trim(a.name)), lower(trim(n.name))) as score
        from public.accounts a
       where a.archived_at is null
       order by score desc
       limit 1
    ) m
   where m.score >= 0.85
$$;
revoke all on function public.match_account_names(text[]) from public, anon;
grant execute on function public.match_account_names(text[]) to authenticated;

-- Import log entry (audit_log has no insert policy; this definer function is the only path).
create or replace function public.log_import(p_entity text, p_file_name text, p_counts jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('owner','admin','sales_manager') then
    raise exception 'not allowed';
  end if;
  insert into public.audit_log(table_name, row_id, action, new_data)
  values ('csv_import:' || p_entity, null, 'IMPORT',
          jsonb_build_object('file_name', p_file_name, 'counts', p_counts));
end $$;
revoke all on function public.log_import(text, text, jsonb) from public, anon;
grant execute on function public.log_import(text, text, jsonb) to authenticated;

revoke all on function public.is_privileged() from public, anon;
grant execute on function public.is_privileged() to authenticated;

-- Scheduled jobs (pg_cron)
create extension if not exists pg_cron;

select cron.schedule('sla-breach-flag', '0 * * * *', $$ select public.flag_sla_breaches() $$);

-- Auto-close tickets resolved for 7+ days
select cron.schedule('ticket-auto-close', '15 2 * * *', $$
  update public.tickets set status = 'closed'
   where status = 'resolved' and resolved_at < now() - interval '7 days'
$$);
