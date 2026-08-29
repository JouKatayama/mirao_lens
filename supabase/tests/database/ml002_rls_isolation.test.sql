begin;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-4000-8000-000000000003',
  'ml002-other@miraio.invalid',
  '{"display_name":"Other Sample"}'::jsonb
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',
  true
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'authenticated user sees only their profile'
);
select is(
  (
    select count(*)
    from public.profiles
    where user_id = '00000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'authenticated user cannot see another profile'
);
select lives_ok(
  $$
    insert into public.scans (id, user_id)
    values (
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000002'
    )
  $$,
  'authenticated user can insert their own scan'
);
select throws_ok(
  $$
    insert into public.scans (id, user_id)
    values (
      '00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "scans"',
  'authenticated user cannot insert another user scan'
);

select * from finish();

rollback;
