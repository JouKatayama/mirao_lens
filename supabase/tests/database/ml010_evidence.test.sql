begin;

select plan(10);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4010-8000-000000000001',
    'ml010-alice@miraio.invalid',
    '{"display_name":"Evidence Alice"}'::jsonb
  ),
  (
    '00000000-0000-4010-8000-000000000002',
    'ml010-bob@miraio.invalid',
    '{"display_name":"Evidence Bob"}'::jsonb
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4010-8000-000000000001', true);

insert into public.profiles (user_id, current_role, current_company)
values ('00000000-0000-4010-8000-000000000001', 'デザイナー', 'TestCo');

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4010-8000-000000001001',
  '00000000-0000-4010-8000-000000000001',
  'brief_ready',
  'networking'
);

-- Insert Alice's evidence directly (simulating persist_card_extraction output).
-- Need to reset role to insert, then switch back.
set local role postgres;

insert into public.evidence
  (id, user_id, scan_id, source_type, source_title, excerpt, confidence)
values
  (
    '00000000-0000-4010-8000-000000009001',
    '00000000-0000-4010-8000-000000000001',
    '00000000-0000-4010-8000-000000001001',
    'business_card',
    'card.name',
    '山田太郎',
    0.98
  ),
  (
    '00000000-0000-4010-8000-000000009002',
    '00000000-0000-4010-8000-000000000001',
    '00000000-0000-4010-8000-000000001001',
    'business_card',
    'card.company',
    'XYZ株式会社',
    0.95
  );

-- Bob's scan and evidence.
insert into public.profiles (user_id, current_role, current_company)
values ('00000000-0000-4010-8000-000000000002', 'Engineer', 'OtherCo');

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4010-8000-000000001002',
  '00000000-0000-4010-8000-000000000002',
  'brief_ready',
  'sales'
);

insert into public.evidence
  (id, user_id, scan_id, source_type, source_title, excerpt, confidence)
values
  (
    '00000000-0000-4010-8000-000000009003',
    '00000000-0000-4010-8000-000000000002',
    '00000000-0000-4010-8000-000000001002',
    'business_card',
    'card.name',
    '鈴木花子',
    0.90
  );

-- ─── Tests as Alice ──────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4010-8000-000000000001', true);

-- T01: Alice can read her own evidence.
select ok(
  (
    select count(*)::int from public.evidence
    where scan_id = '00000000-0000-4010-8000-000000001001'
  ) = 2,
  'T01: Alice can read her own evidence (2 rows)'
);

-- T02: Alice reads Bob's scan_id and gets 0 rows (RLS filters user_id mismatch).
select ok(
  (
    select count(*)::int from public.evidence
    where scan_id = '00000000-0000-4010-8000-000000001002'
  ) = 0,
  'T02: Alice cannot read Bob scan evidence (0 rows via RLS)'
);

-- T03: Alice's evidence has the expected source types.
select ok(
  (
    select count(*)::int from public.evidence
    where scan_id = '00000000-0000-4010-8000-000000001001'
      and source_type = 'business_card'
  ) = 2,
  'T03: Alice evidence has 2 business_card rows'
);

-- T04: Alice's evidence has the expected excerpts.
select ok(
  (
    select excerpt from public.evidence
    where id = '00000000-0000-4010-8000-000000009001'
  ) = '山田太郎',
  'T04: Alice name evidence excerpt is correct'
);

-- T05: Confidence values are within bounds.
select ok(
  (
    select bool_and(confidence between 0 and 1)
    from public.evidence
    where scan_id = '00000000-0000-4010-8000-000000001001'
  ),
  'T05: All evidence confidence values are in [0, 1]'
);

-- ─── Tests as Bob ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-4010-8000-000000000002', true);

-- T06: Bob can read his own evidence.
select ok(
  (
    select count(*)::int from public.evidence
    where scan_id = '00000000-0000-4010-8000-000000001002'
  ) = 1,
  'T06: Bob can read his own evidence (1 row)'
);

-- T07: Bob cannot read Alice's evidence.
select ok(
  (
    select count(*)::int from public.evidence
    where scan_id = '00000000-0000-4010-8000-000000001001'
  ) = 0,
  'T07: Bob cannot read Alice scan evidence (0 rows via RLS)'
);

-- T08: Bob cannot insert evidence into Alice's scan.
select throws_ok(
  $$
    insert into public.evidence
      (user_id, scan_id, source_type, source_title, excerpt, confidence)
    values (
      '00000000-0000-4010-8000-000000000001',
      '00000000-0000-4010-8000-000000001001',
      'ai_inference',
      null,
      'injected',
      0.5
    )
  $$,
  null,
  'T08: Bob cannot insert evidence for Alice (RLS violation)'
);

-- ─── Anon tests ───────────────────────────────────────────────────────────────

set local role anon;

-- T09: Anon cannot SELECT from evidence (permission denied).
select throws_ok(
  $$select count(*) from public.evidence$$,
  '42501',
  null,
  'T09: Anon cannot select from evidence (permission denied)'
);

-- T10: Anon cannot INSERT into evidence (permission denied).
select throws_ok(
  $$
    insert into public.evidence
      (user_id, scan_id, source_type, source_title, excerpt, confidence)
    values (
      '00000000-0000-4010-8000-000000000001',
      '00000000-0000-4010-8000-000000001001',
      'public_web',
      null,
      'anon test',
      0.1
    )
  $$,
  '42501',
  null,
  'T10: Anon cannot insert into evidence (permission denied)'
);

select * from finish();

rollback;
