begin;

select plan(24);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4007-8000-000000000001',
    'ml007-alice@miraio.invalid',
    '{"display_name":"Mutual Value Alice"}'::jsonb
  ),
  (
    '00000000-0000-4007-8000-000000000002',
    'ml007-bob@miraio.invalid',
    '{"display_name":"Mutual Value Bob"}'::jsonb
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4007-8000-000000000001', true);

insert into public.profiles (user_id, current_role, current_company)
values ('00000000-0000-4007-8000-000000000001', 'UIデザイナー', 'ABC Inc.');

-- Alice has a brief_ready scan (pre-condition for Mutual Value).
insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4007-8000-000000000701',
  '00000000-0000-4007-8000-000000000001',
  'brief_ready',
  'networking'
);

insert into public.relationship_analyses (
  scan_id, user_id, flash_brief_json, mutual_value_json
) values (
  '00000000-0000-4007-8000-000000000701',
  '00000000-0000-4007-8000-000000000001',
  '{"who":"テスト","why_you":"テスト","say_this":["テスト"],"potential":"テスト"}'::jsonb,
  '{}'::jsonb
);

select set_config('request.jwt.claim.sub', '00000000-0000-4007-8000-000000000002', true);

insert into public.profiles (user_id, current_role, current_company)
values ('00000000-0000-4007-8000-000000000002', 'Engineer', 'DEF Corp.');

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4007-8000-000000000702',
  '00000000-0000-4007-8000-000000000002',
  'brief_ready',
  'sales'
);

-- Alice's second scan for failure tests.
select set_config('request.jwt.claim.sub', '00000000-0000-4007-8000-000000000001', true);

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4007-8000-000000000703',
  '00000000-0000-4007-8000-000000000001',
  'brief_ready',
  'recruiting'
);

-- ─── claim_mutual_value ───────────────────────────────────────────────────────

-- T01: Valid claim returns one run_id.
select is(
  (
    select count(*)
    from public.claim_mutual_value(
      '00000000-0000-4007-8000-000000000701',
      'openai',
      'gpt-4o'
    )
  ),
  1::bigint,
  'T01: claim_mutual_value returns one run_id'
);

-- T02: Scan advances to deep_enrichment.
select is(
  (select status from public.scans where id = '00000000-0000-4007-8000-000000000701'),
  'deep_enrichment',
  'T02: scan advances to deep_enrichment after claim'
);

-- T03: ai_run created with stage=mutual_value and status=running.
select results_eq(
  $$
    select stage, status
    from public.ai_runs
    where scan_id = '00000000-0000-4007-8000-000000000701'
      and stage = 'mutual_value'
  $$,
  $$ values ('mutual_value'::text, 'running'::text) $$,
  'T03: ai_run created with stage=mutual_value and status=running'
);

-- T04: Duplicate claim returns empty (dedup guard).
select is(
  (
    select count(*)
    from public.claim_mutual_value(
      '00000000-0000-4007-8000-000000000701',
      'openai',
      'gpt-4o'
    )
  ),
  0::bigint,
  'T04: duplicate claim returns empty'
);

-- T05: Blank provider raises error.
select throws_ok(
  $$
    select * from public.claim_mutual_value(
      '00000000-0000-4007-8000-000000000701'::uuid,
      '',
      'gpt-4o'
    )
  $$,
  '22023',
  null,
  'T05: blank provider raises error'
);

-- T06: Bob cannot claim Alice scan (cross-user isolation).
select set_config('request.jwt.claim.sub', '00000000-0000-4007-8000-000000000002', true);
select is(
  (
    select count(*)
    from public.claim_mutual_value(
      '00000000-0000-4007-8000-000000000701',
      'openai',
      'gpt-4o'
    )
  ),
  0::bigint,
  'T06: Bob cannot claim Alice scan'
);

-- T07: Bob can claim his own brief_ready scan.
select is(
  (
    select count(*)
    from public.claim_mutual_value(
      '00000000-0000-4007-8000-000000000702',
      'openai',
      'gpt-4o'
    )
  ),
  1::bigint,
  'T07: Bob can claim his own brief_ready scan'
);

-- Back to Alice.
select set_config('request.jwt.claim.sub', '00000000-0000-4007-8000-000000000001', true);

-- ─── persist_mutual_value ─────────────────────────────────────────────────────

-- Capture Alice's run_id.
do $$
declare
  v_run_id uuid;
begin
  select id into v_run_id
  from public.ai_runs
  where scan_id = '00000000-0000-4007-8000-000000000701'
    and stage = 'mutual_value'
    and status = 'running';

  perform set_config('test.alice_mv_run_id', v_run_id::text, true);
end;
$$;

-- T08: Negative latency raises error.
select throws_ok(
  format(
    $$ select * from public.persist_mutual_value(%L::uuid, %L::uuid, %L::jsonb, -1) $$,
    '00000000-0000-4007-8000-000000000701',
    current_setting('test.alice_mv_run_id'),
    '{"give":[{"text":"x","claim_type":"hypothesis"}],"get":[{"text":"x","claim_type":"hypothesis"}],"bridge":"x","ask":[{"question":"x","validates_hypothesis":null}],"next_action":{"action":"x","timing":null,"reason":"x"}}'
  ),
  '22023',
  null,
  'T08: persist_mutual_value rejects negative latency'
);

-- T09: Non-object mutual_value_json raises error.
select throws_ok(
  format(
    $$ select * from public.persist_mutual_value(%L::uuid, %L::uuid, %L::jsonb, 100) $$,
    '00000000-0000-4007-8000-000000000701',
    current_setting('test.alice_mv_run_id'),
    '"not_an_object"'
  ),
  '22023',
  null,
  'T09: persist_mutual_value rejects non-object JSON'
);

-- T10: Valid persist returns analysis_id.
select is(
  (
    select count(*)
    from public.persist_mutual_value(
      '00000000-0000-4007-8000-000000000701'::uuid,
      current_setting('test.alice_mv_run_id')::uuid,
      '{"give":[{"text":"UXリサーチの知見","claim_type":"hypothesis"}],"get":[{"text":"市場事例","claim_type":"hypothesis"}],"bridge":"両者ともデジタル製品に注力","ask":[{"question":"課題は？","validates_hypothesis":null}],"next_action":{"action":"来週話す","timing":"1週間以内","reason":"相乗効果"}}'::jsonb,
      800
    )
  ),
  1::bigint,
  'T10: persist_mutual_value returns one row'
);

-- T11: Scan advances to deep_ready.
select is(
  (select status from public.scans where id = '00000000-0000-4007-8000-000000000701'),
  'deep_ready',
  'T11: scan advances to deep_ready after persist'
);

-- T12: mutual_value_json stored in relationship_analyses.
select ok(
  (
    select mutual_value_json ->> 'bridge'
    from public.relationship_analyses
    where scan_id = '00000000-0000-4007-8000-000000000701'
  ) is not null,
  'T12: mutual_value_json stored in relationship_analyses'
);

-- T13: ai_run marked succeeded with latency.
select results_eq(
  format(
    $$ select status, latency_ms from public.ai_runs where id = %L::uuid $$,
    current_setting('test.alice_mv_run_id')
  ),
  $$ values ('succeeded'::text, 800::integer) $$,
  'T13: ai_run marked succeeded with latency'
);

-- ─── fail_mutual_value ────────────────────────────────────────────────────────

-- Claim the third scan for failure tests.
do $$
declare
  v_run_id uuid;
begin
  select run_id into v_run_id
  from public.claim_mutual_value(
    '00000000-0000-4007-8000-000000000703'::uuid,
    'openai',
    'gpt-4o'
  );

  perform set_config('test.fail_mv_run_id', v_run_id::text, true);
end;
$$;

-- T14: Blank error_code raises error.
select throws_ok(
  format(
    $$ select public.fail_mutual_value(%L::uuid, %L::uuid, '') $$,
    '00000000-0000-4007-8000-000000000703',
    current_setting('test.fail_mv_run_id')
  ),
  '22023',
  null,
  'T14: fail_mutual_value rejects blank error_code'
);

-- T15: Valid fail returns true.
select is(
  public.fail_mutual_value(
    '00000000-0000-4007-8000-000000000703'::uuid,
    current_setting('test.fail_mv_run_id')::uuid,
    'rate_limited'
  ),
  true,
  'T15: fail_mutual_value returns true on success'
);

-- T16: Scan rolls back to brief_ready.
select is(
  (select status from public.scans where id = '00000000-0000-4007-8000-000000000703'),
  'brief_ready',
  'T16: scan rolls back to brief_ready after failure'
);

-- T17: ai_run marked failed_retryable with correct error_code.
select results_eq(
  format(
    $$ select status, error_code from public.ai_runs where id = %L::uuid $$,
    current_setting('test.fail_mv_run_id')
  ),
  $$ values ('failed_retryable'::text, 'rate_limited'::text) $$,
  'T17: ai_run marked failed_retryable with error_code'
);

-- T18: fail_mutual_value returns false when run is no longer running.
select is(
  public.fail_mutual_value(
    '00000000-0000-4007-8000-000000000703'::uuid,
    current_setting('test.fail_mv_run_id')::uuid,
    'timeout'
  ),
  false,
  'T18: fail_mutual_value returns false for already-terminated run'
);

-- ─── Claim requires brief_ready — rejects other statuses ─────────────────────

-- T19: claim returns empty when scan is already deep_enrichment.
-- (Alice's scan 701 is now deep_ready, claim should reject.)
select is(
  (
    select count(*)
    from public.claim_mutual_value(
      '00000000-0000-4007-8000-000000000701',
      'openai',
      'gpt-4o'
    )
  ),
  0::bigint,
  'T19: claim rejects scan not in brief_ready (deep_ready)'
);

-- ─── RLS isolation ────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-4007-8000-000000000002', true);

-- T20: Bob cannot read Alice relationship_analyses.
select is(
  (
    select count(*)
    from public.relationship_analyses
    where scan_id = '00000000-0000-4007-8000-000000000701'
  ),
  0::bigint,
  'T20: Bob cannot read Alice relationship_analyses (RLS)'
);

-- T21: Bob cannot read Alice ai_runs.
select is(
  (
    select count(*)
    from public.ai_runs
    where scan_id = '00000000-0000-4007-8000-000000000701'
  ),
  0::bigint,
  'T21: Bob cannot read Alice ai_runs (RLS)'
);

-- ─── Unauthenticated (anon) guards ───────────────────────────────────────────

set local role anon;

-- T22: anon cannot call claim_mutual_value.
select throws_ok(
  $$
    select * from public.claim_mutual_value(
      '00000000-0000-4007-8000-000000000701'::uuid,
      'openai',
      'gpt-4o'
    )
  $$,
  '42501',
  null,
  'T22: anon cannot call claim_mutual_value'
);

-- T23: anon cannot call persist_mutual_value.
select throws_ok(
  $$
    select * from public.persist_mutual_value(
      '00000000-0000-4007-8000-000000000701'::uuid,
      '00000000-0000-4007-8000-999999999999'::uuid,
      '{"give":[{"text":"x","claim_type":"hypothesis"}],"get":[{"text":"x","claim_type":"hypothesis"}],"bridge":"x","ask":[{"question":"x","validates_hypothesis":null}],"next_action":{"action":"x","timing":null,"reason":"x"}}'::jsonb,
      100
    )
  $$,
  '42501',
  null,
  'T23: anon cannot call persist_mutual_value'
);

-- T24: anon cannot call fail_mutual_value.
select throws_ok(
  $$
    select public.fail_mutual_value(
      '00000000-0000-4007-8000-000000000701'::uuid,
      '00000000-0000-4007-8000-999999999999'::uuid,
      'timeout'
    )
  $$,
  '42501',
  null,
  'T24: anon cannot call fail_mutual_value'
);

select * from finish();

rollback;
