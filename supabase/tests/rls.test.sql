-- RLS / permission-matrix test suite (§3.2, AC-4/5/6).
-- Runs entirely inside one DO block and ends by raising the results, so every fixture rolls back.
-- Run with: psql -f, or paste into the Supabase SQL editor. Expect the final error message to list "FAIL: 0".
do $$
declare
  u_owner uuid := 'a0000000-0000-4000-8000-000000000001';
  u_admin uuid := 'a0000000-0000-4000-8000-000000000002';
  u_sm    uuid := 'a0000000-0000-4000-8000-000000000003';
  u_repa  uuid := 'a0000000-0000-4000-8000-000000000004';
  u_repb  uuid := 'a0000000-0000-4000-8000-000000000005';
  u_csr   uuid := 'a0000000-0000-4000-8000-000000000006';
  u_ops   uuid := 'a0000000-0000-4000-8000-000000000007';
  u_dep   uuid := 'a0000000-0000-4000-8000-000000000008';
  u_fin   uuid := 'a0000000-0000-4000-8000-000000000009';
  u_pur   uuid := 'a0000000-0000-4000-8000-00000000000a';
  u_off   uuid := 'a0000000-0000-4000-8000-00000000000b';
  acct_a  uuid := 'b0000000-0000-4000-8000-000000000001';
  opp_a   uuid := 'b0000000-0000-4000-8000-000000000002';
  tkt_del uuid := 'b0000000-0000-4000-8000-000000000003';
  tkt_bil uuid := 'b0000000-0000-4000-8000-000000000004';
  pass int := 0; fail int := 0; failures text := '';
  n int; ok boolean; v text;

  -- helpers implemented as inline blocks below
begin
  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email, aud, role) values
    (u_owner,'owner@t.local','authenticated','authenticated'), (u_admin,'admin@t.local','authenticated','authenticated'),
    (u_sm,'sm@t.local','authenticated','authenticated'), (u_repa,'repa@t.local','authenticated','authenticated'),
    (u_repb,'repb@t.local','authenticated','authenticated'), (u_csr,'csr@t.local','authenticated','authenticated'),
    (u_ops,'ops@t.local','authenticated','authenticated'), (u_dep,'dep@t.local','authenticated','authenticated'),
    (u_fin,'fin@t.local','authenticated','authenticated'), (u_pur,'pur@t.local','authenticated','authenticated'),
    (u_off,'off@t.local','authenticated','authenticated');
  insert into public.profiles (id, full_name, role, must_change_password, is_active) values
    (u_owner,'Owner','owner',false,true), (u_admin,'Admin','admin',false,true), (u_sm,'Sales Mgr','sales_manager',false,true),
    (u_repa,'Rep A','sales_rep',false,true), (u_repb,'Rep B','sales_rep',false,true), (u_csr,'CSR','csr',false,true),
    (u_ops,'Ops','ops_manager',false,true), (u_dep,'Deploy','deployment_officer',false,true), (u_fin,'Finance','finance',false,true),
    (u_pur,'Purchasing','purchasing',false,true), (u_off,'Inactive Rep','sales_rep',false,false);
  insert into public.accounts (id, name, owner_id, created_by) values (acct_a, 'Test Co', u_repa, u_repa);
  insert into public.account_finance (account_id, tin) values (acct_a, '123-456-789-00000');
  insert into public.opportunities (id, account_id, title, owner_id, created_by) values (opp_a, acct_a, 'Deal A', u_repa, u_repa);
  insert into public.tickets (id, account_id, subject, category, created_by) values
    (tkt_del, acct_a, 'Late delivery', 'delivery_delay', u_csr), (tkt_bil, acct_a, 'Wrong invoice', 'billing', u_csr);

  -- Each check: switch identity, run, record. Identity switch:
  --   perform set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true); set local role authenticated;

  -- ===== 1. Rep B reads all accounts but cannot update Rep A's =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_repb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.accounts;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | repB read accounts'; end if;
  update public.accounts set notes = 'hacked' where id = acct_a;
  get diagnostics n = row_count;
  if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | repB updated repA account'; end if;
  update public.opportunities set title = 'hacked' where id = opp_a;
  get diagnostics n = row_count;
  if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | repB updated repA opp'; end if;
  -- rep cannot create an account owned by someone else
  begin
    insert into public.accounts (name, owner_id) values ('Sneaky', u_repa);
    fail := fail+1; failures := failures || ' | repB created account for repA';
  exception when others then pass := pass+1; end;
  -- rep cannot self-promote
  begin
    update public.profiles set role = 'owner' where id = u_repb;
    fail := fail+1; failures := failures || ' | repB self-promoted';
  exception when others then pass := pass+1; end;
  -- rep cannot clear must_change_password
  begin
    update public.profiles set must_change_password = true where id = u_repb;
    fail := fail+1; failures := failures || ' | repB changed password flag';
  exception when others then pass := pass+1; end;
  -- rep cannot read TIN
  select count(*) into n from public.account_finance;
  if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | repB read TIN'; end if;
  -- rep cannot read audit log
  select count(*) into n from public.audit_log;
  if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | repB read audit'; end if;
  -- rep cannot write audit log
  begin
    insert into public.audit_log (table_name, action) values ('x','INSERT');
    fail := fail+1; failures := failures || ' | repB wrote audit';
  exception when others then pass := pass+1; end;
  -- rep cannot update a ticket not assigned to them
  update public.tickets set priority = 'urgent' where id = tkt_del;
  get diagnostics n = row_count;
  if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | repB updated unassigned ticket'; end if;
  reset role;

  -- ===== 2. Rep A edits own account, cannot accredit or reassign =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_repa, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.accounts set notes = 'mine' where id = acct_a;
  get diagnostics n = row_count;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | repA could not edit own account'; end if;
  begin
    update public.accounts set is_accredited = true, accredited_at = current_date where id = acct_a;
    fail := fail+1; failures := failures || ' | repA accredited';
  exception when others then pass := pass+1; end;
  begin
    update public.accounts set owner_id = u_repb where id = acct_a;
    fail := fail+1; failures := failures || ' | repA reassigned';
  exception when others then pass := pass+1; end;
  begin
    update public.accounts set archived_at = now() where id = acct_a;
    fail := fail+1; failures := failures || ' | repA archived';
  exception when others then pass := pass+1; end;
  -- lost requires reason (BR-4)
  begin
    update public.opportunities set stage = 'lost' where id = opp_a;
    fail := fail+1; failures := failures || ' | lost without reason';
  exception when others then pass := pass+1; end;
  update public.opportunities set stage = 'proposal_sent' where id = opp_a;
  get diagnostics n = row_count;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | repA could not move own opp'; end if;
  -- activity insert with spoofed author is rejected
  begin
    insert into public.activities (client_uuid, type, account_id, summary, created_by) values (gen_random_uuid(), 'call', acct_a, 'spoof', u_repb);
    fail := fail+1; failures := failures || ' | activity author spoof';
  exception when others then pass := pass+1; end;
  -- idempotent activity replay
  insert into public.activities (client_uuid, type, account_id, summary) values ('c0000000-0000-4000-8000-000000000001', 'visit', acct_a, 'site visit');
  insert into public.activities (client_uuid, type, account_id, summary) values ('c0000000-0000-4000-8000-000000000001', 'visit', acct_a, 'site visit') on conflict (client_uuid) do nothing;
  select count(*) into n from public.activities where client_uuid = 'c0000000-0000-4000-8000-000000000001';
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | replay duplicated'; end if;
  -- primary contact uniqueness (BR-6)
  insert into public.contacts (account_id, full_name, is_primary) values (acct_a, 'P One', true);
  begin
    insert into public.contacts (account_id, full_name, is_primary) values (acct_a, 'P Two', true);
    fail := fail+1; failures := failures || ' | two primary contacts';
  exception when others then pass := pass+1; end;
  -- reps cannot archive contacts
  begin
    update public.contacts set archived_at = now() where account_id = acct_a;
    fail := fail+1; failures := failures || ' | repA archived contact';
  exception when others then pass := pass+1; end;
  reset role;

  -- ===== 3. Ops manager: accreditation only =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_ops, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.accounts set is_accredited = true, accredited_at = current_date, billing_cutoff_day = 25 where id = acct_a;
  get diagnostics n = row_count;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | ops could not accredit'; end if;
  begin
    update public.accounts set name = 'Renamed by ops' where id = acct_a;
    fail := fail+1; failures := failures || ' | ops renamed account';
  exception when others then pass := pass+1; end;
  -- BR-1: accredited needs a date
  begin
    update public.accounts set accredited_at = null where id = acct_a;
    fail := fail+1; failures := failures || ' | accredited without date';
  exception when others then pass := pass+1; end;
  select count(*) into n from public.opportunities;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | ops cannot read opps'; end if;
  reset role;

  -- ===== 4. Finance: billing tickets only; TIN read/write =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tickets;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | finance sees ' || n || ' tickets'; end if;
  select count(*) into n from public.opportunities;
  if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | finance sees opps'; end if;
  update public.account_finance set tin = '111-222-333' where account_id = acct_a;
  get diagnostics n = row_count;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | finance cannot write TIN'; end if;
  -- BR-5: resolve requires a note
  begin
    update public.tickets set status = 'resolved' where id = tkt_bil;
    fail := fail+1; failures := failures || ' | resolved without note';
  exception when others then pass := pass+1; end;
  update public.tickets set status = 'resolved', resolution_note = 'Credit memo issued' where id = tkt_bil;
  get diagnostics n = row_count;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | finance cannot resolve billing ticket'; end if;
  begin
    insert into public.accounts (name) values ('Fin Co');
    fail := fail+1; failures := failures || ' | finance created account';
  exception when others then pass := pass+1; end;
  reset role;

  -- ===== 5. CSR works tickets; first response stamping =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_csr, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.ticket_comments (ticket_id, body, is_internal) values (tkt_del, 'internal note', true);
  select (first_responded_at is null) into ok from public.tickets where id = tkt_del;
  if ok then pass := pass+1; else fail := fail+1; failures := failures || ' | internal note stamped first response'; end if;
  insert into public.ticket_comments (ticket_id, body, is_internal) values (tkt_del, 'Hi, truck arrives 3pm', false);
  select (first_responded_at is not null) into ok from public.tickets where id = tkt_del;
  if ok then pass := pass+1; else fail := fail+1; failures := failures || ' | reply did not stamp first response'; end if;
  begin
    update public.tickets set first_responded_at = null, sla_breached = false where id = tkt_del;
    select (first_responded_at is not null) into ok from public.tickets where id = tkt_del;
    if ok then pass := pass+1; else fail := fail+1; failures := failures || ' | CSR tampered SLA fields'; end if;
  end;
  update public.tickets set priority = 'urgent' where id = tkt_del;
  select (resolution_due = created_at + interval '8 hours') into ok from public.tickets where id = tkt_del;
  if ok then pass := pass+1; else fail := fail+1; failures := failures || ' | SLA not recomputed on priority change'; end if;
  begin
    update public.accounts set notes = 'csr' where id = acct_a;
    get diagnostics n = row_count;
    if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | CSR edited account'; end if;
  end;
  reset role;

  -- ===== 6. Admin cannot touch owner; admin manages others =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set role = 'owner' where id = u_admin;
    fail := fail+1; failures := failures || ' | admin made self owner';
  exception when others then pass := pass+1; end;
  begin
    update public.profiles set is_active = false where id = u_owner;
    fail := fail+1; failures := failures || ' | admin deactivated owner';
  exception when others then pass := pass+1; end;
  update public.profiles set role = 'csr' where id = u_repb;
  get diagnostics n = row_count;
  if n = 1 then pass := pass+1; else fail := fail+1; failures := failures || ' | admin could not change role'; end if;
  select count(*) into n from public.audit_log;
  if n > 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | admin cannot read audit'; end if;
  begin
    update public.audit_log set table_name = 'x';
    get diagnostics n = row_count;
    if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | audit editable'; end if;
  exception when insufficient_privilege then pass := pass+1; end;
  reset role;

  -- ===== 7. Purchasing & inactive users see nothing =====
  foreach v in array array[u_pur::text, u_off::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v, 'role','authenticated')::text, true);
    set local role authenticated;
    select (select count(*) from public.accounts) + (select count(*) from public.tickets) + (select count(*) from public.contacts) into n;
    if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | no-CRM user sees data ' || v; end if;
    begin
      insert into public.activities (client_uuid, type, account_id, summary) values (gen_random_uuid(), 'call', acct_a, 'nope');
      fail := fail+1; failures := failures || ' | no-CRM user logged activity';
    exception when others then pass := pass+1; end;
    reset role;
  end loop;

  -- ===== 8. anon sees nothing =====
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    select count(*) into n from public.accounts;
    if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | anon reads accounts'; end if;
  exception when others then pass := pass+1; end;
  reset role;

  -- ===== 9. Activities lock after 24h =====
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);  -- backdate as trusted code
  update public.activities set created_at = now() - interval '25 hours' where client_uuid = 'c0000000-0000-4000-8000-000000000001';
  perform set_config('request.jwt.claims', json_build_object('sub', u_repa, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.activities set summary = 'edited later' where client_uuid = 'c0000000-0000-4000-8000-000000000001';
    fail := fail+1; failures := failures || ' | activity editable after 24h';
  exception when others then pass := pass+1; end;
  reset role;

  -- ===== 10. Attachments follow parent visibility =====
  insert into public.attachments (entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    values ('ticket', tkt_del, 'ticket/' || tkt_del || '/x-a.pdf', 'a.pdf', 'application/pdf', 100, u_csr);
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.attachments;
  if n = 0 then pass := pass+1; else fail := fail+1; failures := failures || ' | finance sees delivery-ticket file'; end if;
  reset role;

  raise exception 'RLS TESTS => PASS: % FAIL: % %', pass, fail, failures;
end $$;
