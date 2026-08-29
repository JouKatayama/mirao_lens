begin;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4000-8000-000000000006',
    'ml004-owner@miraio.invalid',
    '{"display_name":"Camera Owner"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000007',
    'ml004-other@miraio.invalid',
    '{"display_name":"Other Camera User"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000006',
  true
);

select lives_ok(
  $$
    insert into public.scans (
      id,
      user_id,
      status,
      meeting_goal,
      raw_image_path,
      raw_image_expires_at
    ) values (
      '00000000-0000-4000-8000-000000000406',
      '00000000-0000-4000-8000-000000000006',
      'extracting_card',
      'partnership',
      '00000000-0000-4000-8000-000000000006/00000000-0000-4000-8000-000000000406/front.jpg',
      '2026-08-17T01:00:00.000Z'
    )
  $$,
  'owner can persist the card-camera handoff scan'
);
select results_eq(
  $$
    select status, meeting_goal, raw_image_path, raw_image_expires_at
    from public.scans
    where id = '00000000-0000-4000-8000-000000000406'
  $$,
  $$
    values (
      'extracting_card'::text,
      'partnership'::text,
      '00000000-0000-4000-8000-000000000006/00000000-0000-4000-8000-000000000406/front.jpg'::text,
      '2026-08-17T01:00:00.000Z'::timestamptz
    )
  $$,
  'scan preserves goal, private path, expiration, and handoff state'
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'business-card-images',
      '00000000-0000-4000-8000-000000000006/00000000-0000-4000-8000-000000000406/front.jpg'
    )
  $$,
  'owner can create a private object below their own prefix'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'business-card-images',
      '00000000-0000-4000-8000-000000000007/00000000-0000-4000-8000-000000000406/front.jpg'
    )
  $$,
  '42501',
  null,
  'owner cannot create an object below another user prefix'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000007',
  true
);

select is(
  (select count(*) from public.scans),
  0::bigint,
  'another user cannot read the owner scan'
);
select is_empty(
  $$
    update public.scans
    set status = 'failed_terminal'
    where id = '00000000-0000-4000-8000-000000000406'
    returning id
  $$,
  'another user cannot update the owner scan'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'business-card-images'),
  0::bigint,
  'another user cannot read the owner private object'
);

set local role anon;
select throws_ok(
  $$
    insert into public.scans (id, user_id)
    values (
      '00000000-0000-4000-8000-000000000407',
      '00000000-0000-4000-8000-000000000007'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot create scans'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'business-card-images',
      '00000000-0000-4000-8000-000000000007/00000000-0000-4000-8000-000000000407/front.jpg'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot upload card images'
);

select * from finish();

rollback;
