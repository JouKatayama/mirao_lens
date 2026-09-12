begin;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-4025-8000-000000000001',
  'ml025-alice@miraio.invalid',
  '{"display_name":"Reminder Alice"}'::jsonb
),
(
  '00000000-0000-4025-8000-000000000002',
  'ml025-bob@miraio.invalid',
  '{"display_name":"Reminder Bob"}'::jsonb
);

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4025-8000-000000000001', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4025-8000-000000000001', 'PM', 'TestCo')
on conflict (user_id) do update set "current_role" = excluded."current_role";

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4025-8000-000000000801',
  '00000000-0000-4025-8000-000000000001',
  'deep_ready',
  'networking'
);

-- An action the user accepted without choosing a reminder, which is the case
-- this function exists for.
create temporary table ml025_actions as
select action_id as open_action
from public.create_next_action(
  '00000000-0000-4025-8000-000000000801',
  '事例資料を共有する',
  '3日以内',
  'ai',
  'accepted'
);

create temporary table ml025_settled as
select action_id as settled_action
from public.create_next_action(
  '00000000-0000-4025-8000-000000000801',
  '実行済みのアクション',
  null,
  'user',
  'accepted'
);

select public.update_next_action_status(
  (select settled_action from ml025_settled),
  'completed'
);

-- T01: A reminder can be chosen after the action was written.
select is(
  (
    select count(*) from public.set_next_action_due_at(
      (select open_action from ml025_actions),
      '2026-09-14T09:00:00+09:00'::timestamptz
    )
  ),
  1::bigint,
  'T01: an accepted action takes a due moment later'
);

select is(
  (
    select due_at from public.next_actions
    where id = (select open_action from ml025_actions)
  ),
  '2026-09-14T09:00:00+09:00'::timestamptz,
  'T02: the chosen moment is stored'
);

-- T03: Choosing no reminder afterwards clears it.
select is(
  (
    select count(*) from public.set_next_action_due_at(
      (select open_action from ml025_actions),
      null
    )
  ),
  1::bigint,
  'T03: clearing a reminder settles the same action'
);

select is(
  (
    select due_at from public.next_actions
    where id = (select open_action from ml025_actions)
  ),
  null::timestamptz,
  'T04: a null due moment clears the reminder'
);

-- T05: An action already settled is not something to be reminded of.
select throws_ok(
  format(
    $$
      select * from public.set_next_action_due_at(
        %L::uuid,
        '2026-09-14T09:00:00+09:00'::timestamptz
      )
    $$,
    (select settled_action from ml025_settled)
  ),
  '22023',
  null,
  'T05: a completed action cannot be given a due moment'
);

-- T06: An unknown action is silently empty, as create_next_action is.
select is(
  (
    select count(*) from public.set_next_action_due_at(
      '00000000-0000-4025-8000-0000000009ff',
      '2026-09-14T09:00:00+09:00'::timestamptz
    )
  ),
  0::bigint,
  'T06: an unknown action returns nothing'
);

-- T07: Another user's action is not reachable, and is not distinguishable
-- from one that does not exist.
select set_config('request.jwt.claim.sub', '00000000-0000-4025-8000-000000000002', true);

select is(
  (
    select count(*) from public.set_next_action_due_at(
      (select open_action from ml025_actions),
      '2026-09-14T09:00:00+09:00'::timestamptz
    )
  ),
  0::bigint,
  'T07: another user cannot set a due moment'
);

select * from finish();

rollback;
