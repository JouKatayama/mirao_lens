begin;

select plan(12);

insert into auth.users (id, email)
values
  ('00000000-0000-4031-8000-000000000001', 'ml031-alice@miraio.invalid'),
  ('00000000-0000-4031-8000-000000000002', 'ml031-bob@miraio.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4031-8000-000000000001', true);

insert into public.people (id, owner_user_id, name)
values
  ('00000000-0000-4031-8000-000000000101', '00000000-0000-4031-8000-000000000001', 'Synthetic A'),
  ('00000000-0000-4031-8000-000000000102', '00000000-0000-4031-8000-000000000001', 'Synthetic B');

insert into public.person_connections (owner_user_id, from_person_id, to_person_id, connection_type)
values ('00000000-0000-4031-8000-000000000001',
  '00000000-0000-4031-8000-000000000101',
  '00000000-0000-4031-8000-000000000102', 'introduced_by');

select is((select count(*) from public.person_connections), 1::bigint,
  'owner sees their connection');

select throws_ok($$
  insert into public.person_connections (owner_user_id, from_person_id, to_person_id, connection_type)
  values ('00000000-0000-4031-8000-000000000001',
    '00000000-0000-4031-8000-000000000101',
    '00000000-0000-4031-8000-000000000101', 'knows')
$$, '23514', null, 'a person cannot be connected to themself');

select throws_ok($$
  insert into public.person_connections (owner_user_id, from_person_id, to_person_id, connection_type, provenance, approved)
  values ('00000000-0000-4031-8000-000000000001',
    '00000000-0000-4031-8000-000000000101',
    '00000000-0000-4031-8000-000000000102', 'knows', 'user', false)
$$, '23514', null, 'a user-entered connection is always approved');

insert into public.scans (id, user_id)
values ('00000000-0000-4031-8000-000000000201', '00000000-0000-4031-8000-000000000001');

insert into public.follow_up_recommendations (user_id, scan_id, decision, confidence)
values ('00000000-0000-4031-8000-000000000001',
  '00000000-0000-4031-8000-000000000201', 'hold', 0.4);

select throws_ok($$
  update public.follow_up_recommendations
  set draft_body = 'x', draft_subject = 'y'
  where scan_id = '00000000-0000-4031-8000-000000000201'
$$, '23514', null, 'only a follow_up decision carries a draft');

select throws_ok($$
  update public.follow_up_recommendations set status = 'sent'
  where scan_id = '00000000-0000-4031-8000-000000000201'
$$, '23514', null, 'there is no sent status');

-- Another user: sees nothing and cannot point at Alice's people.
select set_config('request.jwt.claim.sub', '00000000-0000-4031-8000-000000000002', true);

select is((select count(*) from public.person_connections), 0::bigint,
  'another user cannot read connections');
select is((select count(*) from public.follow_up_recommendations), 0::bigint,
  'another user cannot read recommendations');

insert into public.people (id, owner_user_id, name)
values ('00000000-0000-4031-8000-000000000103', '00000000-0000-4031-8000-000000000002', 'Synthetic C');

select throws_ok($$
  insert into public.person_connections (owner_user_id, from_person_id, to_person_id, connection_type)
  values ('00000000-0000-4031-8000-000000000002',
    '00000000-0000-4031-8000-000000000103',
    '00000000-0000-4031-8000-000000000101', 'knows')
$$, '23503', null, 'a connection cannot reach another user''s person');

with attempted as (
  delete from public.person_connections returning 1
)
select is((select count(*) from attempted), 0::bigint,
  'another user cannot delete connections');

-- Back to the owner: deletion cascades.
select set_config('request.jwt.claim.sub', '00000000-0000-4031-8000-000000000001', true);

select is((select count(*) from public.person_connections), 1::bigint,
  'the connection survived the other user''s delete');

delete from public.people where id = '00000000-0000-4031-8000-000000000102';
select is((select count(*) from public.person_connections), 0::bigint,
  'deleting a person removes their connections');

delete from public.scans where id = '00000000-0000-4031-8000-000000000201';
select is((select count(*) from public.follow_up_recommendations), 0::bigint,
  'deleting a scan removes its recommendation');

select * from finish();
rollback;
