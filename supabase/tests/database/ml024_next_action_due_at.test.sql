begin;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-4024-8000-000000000001',
  'ml024-alice@miraio.invalid',
  '{"display_name":"Reminder Alice"}'::jsonb
);

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4024-8000-000000000001', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4024-8000-000000000001', 'PM', 'TestCo')
on conflict (user_id) do update set "current_role" = excluded."current_role";

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4024-8000-000000000801',
  '00000000-0000-4024-8000-000000000001',
  'deep_ready',
  'networking'
);

-- T01: An accepted action stores the due moment it was given.
select is(
  (
    select count(*) from public.create_next_action(
      '00000000-0000-4024-8000-000000000801',
      '事例資料を共有する',
      '3日以内',
      'ai',
      'accepted',
      '2026-09-14T09:00:00+09:00'::timestamptz
    )
  ),
  1::bigint,
  'T01: create_next_action accepts a due moment'
);

select results_eq(
  $$
    select timing_text, due_at
    from public.next_actions
    where scan_id = '00000000-0000-4024-8000-000000000801'
  $$,
  $$ values ('3日以内'::text, '2026-09-14T09:00:00+09:00'::timestamptz) $$,
  'T02: the wording the user read and the due moment are both kept'
);

-- T03: Omitting the due moment still works, as every earlier caller does.
select is(
  (
    select count(*) from public.create_next_action(
      '00000000-0000-4024-8000-000000000801',
      'お礼メールを送る',
      null,
      'user',
      'accepted'
    )
  ),
  1::bigint,
  'T03: the due moment is optional'
);

-- T04: A dismissed action cannot carry one.
select throws_ok(
  $$
    select * from public.create_next_action(
      '00000000-0000-4024-8000-000000000801'::uuid,
      '見送るアクション',
      null,
      'ai',
      'dismissed',
      '2026-09-14T09:00:00+09:00'::timestamptz
    )
  $$,
  '22023',
  null,
  'T04: a dismissed action cannot be due'
);

select * from finish();

rollback;
