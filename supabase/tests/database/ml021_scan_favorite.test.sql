begin;

select plan(5);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4021-8000-000000000001',
    'ml021-alice@miraio.invalid',
    '{"display_name":"Favorite Alice"}'::jsonb
  ),
  (
    '00000000-0000-4021-8000-000000000002',
    'ml021-bob@miraio.invalid',
    '{"display_name":"Favorite Bob"}'::jsonb
  );

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4021-8000-000000000001', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4021-8000-000000000001', 'PM', 'TestCo')
on conflict (user_id) do update set "current_role" = excluded."current_role";

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4021-8000-000000000801',
  '00000000-0000-4021-8000-000000000001',
  'deep_ready',
  'networking'
);

-- T01: A scan starts unmarked.
select is(
  (
    select is_favorite from public.scans
    where id = '00000000-0000-4021-8000-000000000801'
  ),
  false,
  'T01: is_favorite defaults to false'
);

-- T02: The owner can mark it.
update public.scans
set is_favorite = true
where id = '00000000-0000-4021-8000-000000000801';

select is(
  (
    select is_favorite from public.scans
    where id = '00000000-0000-4021-8000-000000000801'
  ),
  true,
  'T02: the owner can mark a scan'
);

-- T03: The owner can unmark it.
update public.scans
set is_favorite = false
where id = '00000000-0000-4021-8000-000000000801';

select is(
  (
    select is_favorite from public.scans
    where id = '00000000-0000-4021-8000-000000000801'
  ),
  false,
  'T03: the owner can unmark a scan'
);

-- T04: Another user's update matches no row.
select set_config('request.jwt.claim.sub', '00000000-0000-4021-8000-000000000002', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4021-8000-000000000002', 'Engineer', 'OtherCo')
on conflict (user_id) do update set "current_role" = excluded."current_role";

with attempted as (
  update public.scans
  set is_favorite = true
  where id = '00000000-0000-4021-8000-000000000801'
  returning 1
)
select is(
  (select count(*) from attempted),
  0::bigint,
  'T04: another user updates no row'
);

-- T05: Alice's scan is untouched.
select set_config('request.jwt.claim.sub', '00000000-0000-4021-8000-000000000001', true);

select is(
  (
    select is_favorite from public.scans
    where id = '00000000-0000-4021-8000-000000000801'
  ),
  false,
  'T05: the other user did not mark it'
);

select * from finish();

rollback;
