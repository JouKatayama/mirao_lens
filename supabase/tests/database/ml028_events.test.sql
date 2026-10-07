begin;

select plan(13);

insert into auth.users (id, email)
values
  ('00000000-0000-4028-8000-000000000001', 'ml028-alice@miraio.invalid'),
  ('00000000-0000-4028-8000-000000000002', 'ml028-bob@miraio.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4028-8000-000000000001', true);

insert into public.events (id, owner_user_id, name)
values ('00000000-0000-4028-8000-000000000101',
  '00000000-0000-4028-8000-000000000001', '展示会');
insert into public.scans (id, user_id)
values ('00000000-0000-4028-8000-000000000201',
  '00000000-0000-4028-8000-000000000001');
insert into public.event_scans (event_id, scan_id, owner_user_id)
values ('00000000-0000-4028-8000-000000000101',
  '00000000-0000-4028-8000-000000000201',
  '00000000-0000-4028-8000-000000000001');

select is((select count(*) from public.events), 1::bigint,
  'owner sees their event');
select is((select count(*) from public.event_scans), 1::bigint,
  'owner sees the deliberately attached scan');

select set_config('request.jwt.claim.sub', '00000000-0000-4028-8000-000000000002', true);
select is((select count(*) from public.events), 0::bigint,
  'another user cannot list the event');
select is((select count(*) from public.event_scans), 0::bigint,
  'another user cannot list its scans');
select is((select count(*) from public.read_event_team_items(
  '00000000-0000-4028-8000-000000000101')), 0::bigint,
  'uninvited user cannot read team projection');

with attempted as (
  update public.events set name = 'changed'
  where id = '00000000-0000-4028-8000-000000000101'
  returning 1
)
select is((select count(*) from attempted), 0::bigint,
  'another user cannot rename the event');

select set_config('request.jwt.claim.sub', '00000000-0000-4028-8000-000000000001', true);
select is((select name from public.events
  where id = '00000000-0000-4028-8000-000000000101'), '展示会',
  'unauthorized update did not change the name');

insert into public.business_cards (scan_id, user_id, name, company)
values ('00000000-0000-4028-8000-000000000201',
  '00000000-0000-4028-8000-000000000001', 'Synthetic Contact', 'Example Co');
insert into public.interaction_notes (scan_id, user_id, note_text)
values ('00000000-0000-4028-8000-000000000201',
  '00000000-0000-4028-8000-000000000001', 'Reviewed note');
insert into public.next_actions (scan_id, user_id, action_text, status, source)
values ('00000000-0000-4028-8000-000000000201',
  '00000000-0000-4028-8000-000000000001', 'Follow up', 'accepted', 'user');
insert into public.event_members (event_id, owner_user_id, member_user_id)
values ('00000000-0000-4028-8000-000000000101',
  '00000000-0000-4028-8000-000000000001',
  '00000000-0000-4028-8000-000000000002');

select set_config('request.jwt.claim.sub', '00000000-0000-4028-8000-000000000002', true);
select is((select count(*) from public.read_event_team_items(
  '00000000-0000-4028-8000-000000000101')), 1::bigint,
  'invited member reads one selected projection');
select is((select count(*) from public.business_cards), 0::bigint,
  'member still cannot read the owner card table');

select set_config('request.jwt.claim.sub', '00000000-0000-4028-8000-000000000001', true);
delete from public.event_members where event_id =
  '00000000-0000-4028-8000-000000000101';
select set_config('request.jwt.claim.sub', '00000000-0000-4028-8000-000000000002', true);
select is((select count(*) from public.read_event_team_items(
  '00000000-0000-4028-8000-000000000101')), 0::bigint,
  'revocation removes projection access on the next read');

select ok(not has_table_privilege('authenticated', 'public.hubspot_connections', 'select'),
  'user cannot read stored HubSpot credentials');
select ok(not has_table_privilege('authenticated', 'public.hubspot_oauth_states', 'select'),
  'user cannot read OAuth state hashes');
select ok(not has_function_privilege('authenticated', 'public.consume_hubspot_oauth_state(text)', 'execute'),
  'user cannot consume OAuth state directly');

select * from finish();
rollback;
