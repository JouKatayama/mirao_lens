begin;

select plan(7);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4018-8000-000000000001',
    'ml018-alice@miraio.invalid',
    '{"display_name":"Outcome Alice"}'::jsonb
  ),
  (
    '00000000-0000-4018-8000-000000000002',
    'ml018-bob@miraio.invalid',
    '{"display_name":"Outcome Bob"}'::jsonb
  );

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4018-8000-000000000001', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4018-8000-000000000001', 'コンサルタント', 'TestCo')
on conflict (user_id) do update
  set "current_role" = excluded."current_role",
      current_company = excluded.current_company;

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4018-8000-000000000801',
  '00000000-0000-4018-8000-000000000001',
  'deep_ready',
  'networking'
);

-- now() is fixed for the whole transaction, so an action created here would
-- carry the same updated_at the trigger is about to write. Age the fixture so
-- T03 can actually observe the trigger firing.
insert into public.next_actions (
  id, scan_id, user_id, action_text, source, status, created_at, updated_at
)
values (
  '00000000-0000-4018-8000-000000000901',
  '00000000-0000-4018-8000-000000000801',
  '00000000-0000-4018-8000-000000000001',
  '事例資料を共有する',
  'ai',
  'accepted',
  now() - interval '1 hour',
  now() - interval '1 hour'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4018-8000-000000000002', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4018-8000-000000000002', 'Engineer', 'OtherCo')
on conflict (user_id) do update
  set "current_role" = excluded."current_role",
      current_company = excluded.current_company;

select set_config('request.jwt.claim.sub', '00000000-0000-4018-8000-000000000001', true);

-- ─── update_next_action_status ───────────────────────────────────────────────

-- T01: Completing an accepted action returns one action_id.
select is(
  (
    select count(*)
    from public.update_next_action_status(
      '00000000-0000-4018-8000-000000000901',
      'completed'
    )
  ),
  1::bigint,
  'T01: update_next_action_status returns one action_id'
);

-- T02: The stored status reflects the outcome.
select results_eq(
  $$
    select status
    from public.next_actions
    where id = '00000000-0000-4018-8000-000000000901'
  $$,
  $$ values ('completed'::text) $$,
  'T02: next_action status is completed'
);

-- T03: The update trigger refreshes updated_at.
select ok(
  (
    select updated_at > created_at
    from public.next_actions
    where id = '00000000-0000-4018-8000-000000000901'
  ),
  'T03: updated_at is refreshed by the status update'
);

-- T04: An unknown status is rejected.
select throws_ok(
  $$
    select * from public.update_next_action_status(
      '00000000-0000-4018-8000-000000000901'::uuid,
      'suggested'
    )
  $$,
  '22023',
  null,
  'T04: an unknown status raises an error'
);

-- T05: An unknown action id returns empty rather than failing.
select is(
  (
    select count(*)
    from public.update_next_action_status(
      '00000000-0000-4018-8000-000000000999',
      'completed'
    )
  ),
  0::bigint,
  'T05: an unknown action id returns no row'
);

-- T06: Another user cannot settle Alice's action.
select set_config('request.jwt.claim.sub', '00000000-0000-4018-8000-000000000002', true);

select is(
  (
    select count(*)
    from public.update_next_action_status(
      '00000000-0000-4018-8000-000000000901',
      'dismissed'
    )
  ),
  0::bigint,
  'T06: another user gets no row back'
);

-- T07: Alice's action is untouched by the other user's attempt.
select set_config('request.jwt.claim.sub', '00000000-0000-4018-8000-000000000001', true);

select results_eq(
  $$
    select status
    from public.next_actions
    where id = '00000000-0000-4018-8000-000000000901'
  $$,
  $$ values ('completed'::text) $$,
  'T07: the other user did not change the status'
);

select * from finish();
rollback;
