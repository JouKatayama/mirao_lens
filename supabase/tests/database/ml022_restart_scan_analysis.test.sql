begin;

select plan(8);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4022-8000-000000000001',
    'ml022-alice@miraio.invalid',
    '{"display_name":"Restart Alice"}'::jsonb
  ),
  (
    '00000000-0000-4022-8000-000000000002',
    'ml022-bob@miraio.invalid',
    '{"display_name":"Restart Bob"}'::jsonb
  );

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4022-8000-000000000001', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4022-8000-000000000001', 'PM', 'TestCo')
on conflict (user_id) do update set "current_role" = excluded."current_role";

-- A settled scan with both analyses stored.
insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4022-8000-000000000801',
  '00000000-0000-4022-8000-000000000001',
  'deep_ready',
  'networking'
);

insert into public.relationship_analyses (
  scan_id, user_id, flash_brief_json, mutual_value_json, company_context_json
)
values (
  '00000000-0000-4022-8000-000000000801',
  '00000000-0000-4022-8000-000000000001',
  '{"who":"a","why_you":"b","say_this":["c"],"potential":"d"}'::jsonb,
  '{"bridge":"e"}'::jsonb,
  '{"industry":"IT"}'::jsonb
);

-- A scan still inside the pipeline.
insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4022-8000-000000000802',
  '00000000-0000-4022-8000-000000000001',
  'generating_brief',
  'networking'
);

-- ─── restart_scan_analysis ───────────────────────────────────────────────────

-- T01: A settled scan restarts and reports the status the pipeline resumes at.
select results_eq(
  $$
    select status from public.restart_scan_analysis(
      '00000000-0000-4022-8000-000000000801'::uuid,
      'sales'
    )
  $$,
  $$ values ('card_ready'::text) $$,
  'T01: restart returns card_ready'
);

-- T02: The goal is the one asked for.
select results_eq(
  $$
    select meeting_goal, status from public.scans
    where id = '00000000-0000-4022-8000-000000000801'
  $$,
  $$ values ('sales'::text, 'card_ready'::text) $$,
  'T02: the scan carries the new goal and is back at card_ready'
);

-- T03: The goal-dependent analyses are cleared.
select results_eq(
  $$
    select flash_brief_json, mutual_value_json
    from public.relationship_analyses
    where scan_id = '00000000-0000-4022-8000-000000000801'
  $$,
  $$ values ('{}'::jsonb, '{}'::jsonb) $$,
  'T03: brief and mutual value are emptied'
);

-- T04: Company context survives, because it derives from the card.
select results_eq(
  $$
    select company_context_json
    from public.relationship_analyses
    where scan_id = '00000000-0000-4022-8000-000000000801'
  $$,
  $$ values ('{"industry":"IT"}'::jsonb) $$,
  'T04: company context is kept'
);

-- T05: A scan mid-pipeline is refused.
select is(
  (
    select count(*) from public.restart_scan_analysis(
      '00000000-0000-4022-8000-000000000802'::uuid,
      'sales'
    )
  ),
  0::bigint,
  'T05: a scan mid-pipeline returns no row'
);

-- T06: An unknown goal is rejected.
select throws_ok(
  $$
    select * from public.restart_scan_analysis(
      '00000000-0000-4022-8000-000000000801'::uuid,
      'gossip'
    )
  $$,
  '22023',
  null,
  'T06: an unknown meeting goal raises an error'
);

-- T07: Another user cannot restart Alice's scan.
select set_config('request.jwt.claim.sub', '00000000-0000-4022-8000-000000000002', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4022-8000-000000000002', 'Engineer', 'OtherCo')
on conflict (user_id) do update set "current_role" = excluded."current_role";

select is(
  (
    select count(*) from public.restart_scan_analysis(
      '00000000-0000-4022-8000-000000000801'::uuid,
      'recruiting'
    )
  ),
  0::bigint,
  'T07: another user gets no row back'
);

-- T08: And changed nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-4022-8000-000000000001', true);

select results_eq(
  $$
    select meeting_goal from public.scans
    where id = '00000000-0000-4022-8000-000000000801'
  $$,
  $$ values ('sales'::text) $$,
  'T08: the other user did not change the goal'
);

select * from finish();

rollback;
