begin;

select plan(24);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4006-8000-000000000001',
    'ml006-alice@miraio.invalid',
    '{"display_name":"Flash Brief Alice"}'::jsonb
  ),
  (
    '00000000-0000-4006-8000-000000000002',
    'ml006-bob@miraio.invalid',
    '{"display_name":"Flash Brief Bob"}'::jsonb
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4006-8000-000000000001', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4006-8000-000000000001', 'UIデザイナー', 'ABC Inc.')
on conflict (user_id) do update
  set "current_role" = excluded."current_role",
      current_company = excluded.current_company;

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4006-8000-000000000601',
  '00000000-0000-4006-8000-000000000001',
  'generating_brief',
  'networking'
);

insert into public.business_cards (
  scan_id, user_id, name, company, title, language, field_confidence, extraction_json
) values (
  '00000000-0000-4006-8000-000000000601',
  '00000000-0000-4006-8000-000000000001',
  '山田 太郎', 'XYZ株式会社', 'プロダクトマネージャー', 'ja',
  '{"name":0.98,"company":0.95,"department":0,"title":0.9,"email":0,"phone":0,"website":0,"address":0}'::jsonb,
  '{"name":"山田 太郎","company":"XYZ株式会社","title":"プロダクトマネージャー","language":"ja","field_confidence":{"name":0.98,"company":0.95,"department":0,"title":0.9,"email":0,"phone":0,"website":0,"address":0}}'::jsonb
);

select set_config('request.jwt.claim.sub', '00000000-0000-4006-8000-000000000002', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4006-8000-000000000002', 'Engineer', 'DEF Corp.')
on conflict (user_id) do update
  set "current_role" = excluded."current_role",
      current_company = excluded.current_company;

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4006-8000-000000000602',
  '00000000-0000-4006-8000-000000000002',
  'generating_brief',
  'sales'
);

-- A third scan for Alice (failure tests) — inserted under Alice.
select set_config('request.jwt.claim.sub', '00000000-0000-4006-8000-000000000001', true);

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4006-8000-000000000603',
  '00000000-0000-4006-8000-000000000001',
  'generating_brief',
  'recruiting'
);

-- ─── claim_flash_brief ────────────────────────────────────────────────────────

-- T01: Valid claim returns one run_id.
select is(
  (
    select count(*)
    from public.claim_flash_brief(
      '00000000-0000-4006-8000-000000000601',
      'openai',
      'gpt-4o'
    )
  ),
  1::bigint,
  'T01: claim_flash_brief returns one run_id'
);

-- T02: Claim leaves the scan at generating_brief (ML-008 removed the
-- advance to fast_context; persist_flash_brief moves it to brief_ready).
select is(
  (select status from public.scans where id = '00000000-0000-4006-8000-000000000601'),
  'generating_brief',
  'T02: scan stays at generating_brief after claim'
);

-- T03: ai_run created with stage=flash_brief and status=running.
select results_eq(
  $$
    select stage, status
    from public.ai_runs
    where scan_id = '00000000-0000-4006-8000-000000000601'
      and stage = 'flash_brief'
  $$,
  $$ values ('flash_brief'::text, 'running'::text) $$,
  'T03: ai_run created with stage=flash_brief and status=running'
);

-- T04: Duplicate claim returns empty (dedup guard).
select is(
  (
    select count(*)
    from public.claim_flash_brief(
      '00000000-0000-4006-8000-000000000601',
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
    select * from public.claim_flash_brief(
      '00000000-0000-4006-8000-000000000601'::uuid,
      '',
      'gpt-4o'
    )
  $$,
  '22023',
  null,
  'T05: blank provider raises error'
);

-- T06: Bob cannot claim Alice scan (cross-user isolation).
select set_config('request.jwt.claim.sub', '00000000-0000-4006-8000-000000000002', true);
select is(
  (
    select count(*)
    from public.claim_flash_brief(
      '00000000-0000-4006-8000-000000000601',
      'openai',
      'gpt-4o'
    )
  ),
  0::bigint,
  'T06: Bob cannot claim Alice scan'
);

-- T07: Bob can claim his own generating_brief scan.
select is(
  (
    select count(*)
    from public.claim_flash_brief(
      '00000000-0000-4006-8000-000000000602',
      'openai',
      'gpt-4o'
    )
  ),
  1::bigint,
  'T07: Bob can claim his own generating_brief scan'
);

-- Switch back to Alice for the remaining tests.
select set_config('request.jwt.claim.sub', '00000000-0000-4006-8000-000000000001', true);

-- ─── persist_flash_brief ──────────────────────────────────────────────────────

-- Capture Alice's run_id into a session-local config value.
do $$
declare
  v_run_id uuid;
begin
  select id into v_run_id
  from public.ai_runs
  where scan_id = '00000000-0000-4006-8000-000000000601'
    and stage = 'flash_brief'
    and status = 'running';

  perform set_config('test.alice_run_id', v_run_id::text, true);
end;
$$;

-- T08: Negative latency raises error.
select throws_ok(
  format(
    $$ select * from public.persist_flash_brief(%L::uuid, %L::uuid, %L::jsonb, -1) $$,
    '00000000-0000-4006-8000-000000000601',
    current_setting('test.alice_run_id'),
    '{"who":"x","why_you":"x","say_this":["x"],"potential":"x"}'
  ),
  '22023',
  null,
  'T08: persist_flash_brief rejects negative latency'
);

-- T09: Non-object brief_json raises error.
select throws_ok(
  format(
    $$ select * from public.persist_flash_brief(%L::uuid, %L::uuid, %L::jsonb, 100) $$,
    '00000000-0000-4006-8000-000000000601',
    current_setting('test.alice_run_id'),
    '"not_an_object"'
  ),
  '22023',
  null,
  'T09: persist_flash_brief rejects non-object JSON'
);

-- T10: Valid persist returns analysis_id.
select is(
  (
    select count(*)
    from public.persist_flash_brief(
      '00000000-0000-4006-8000-000000000601'::uuid,
      current_setting('test.alice_run_id')::uuid,
      '{"who":"山田太郎さんはXYZ社のPMです","why_you":"UIと相性あり","say_this":["プロダクト課題は？"],"potential":"共創の可能性あり"}'::jsonb,
      512
    )
  ),
  1::bigint,
  'T10: persist_flash_brief returns one row'
);

-- T11: Scan advances to brief_ready.
select is(
  (select status from public.scans where id = '00000000-0000-4006-8000-000000000601'),
  'brief_ready',
  'T11: scan advances to brief_ready after persist'
);

-- T12: relationship_analyses row upserted.
select is(
  (
    select count(*)
    from public.relationship_analyses
    where scan_id = '00000000-0000-4006-8000-000000000601'
  ),
  1::bigint,
  'T12: relationship_analyses row created'
);

-- T13: ai_run marked succeeded.
select results_eq(
  format(
    $$ select status, latency_ms from public.ai_runs where id = %L::uuid $$,
    current_setting('test.alice_run_id')
  ),
  $$ values ('succeeded'::text, 512::integer) $$,
  'T13: ai_run marked succeeded with latency'
);

-- ─── fail_flash_brief ─────────────────────────────────────────────────────────

-- Claim the third scan for failure tests.
do $$
declare
  v_run_id uuid;
begin
  select run_id into v_run_id
  from public.claim_flash_brief(
    '00000000-0000-4006-8000-000000000603'::uuid,
    'openai',
    'gpt-4o'
  );

  perform set_config('test.fail_run_id', v_run_id::text, true);
end;
$$;

-- T14: Blank error_code raises error.
select throws_ok(
  format(
    $$ select public.fail_flash_brief(%L::uuid, %L::uuid, '') $$,
    '00000000-0000-4006-8000-000000000603',
    current_setting('test.fail_run_id')
  ),
  '22023',
  null,
  'T14: fail_flash_brief rejects blank error_code'
);

-- T15: Valid fail returns true.
select is(
  public.fail_flash_brief(
    '00000000-0000-4006-8000-000000000603'::uuid,
    current_setting('test.fail_run_id')::uuid,
    'rate_limited'
  ),
  true,
  'T15: fail_flash_brief returns true on success'
);

-- T16: Scan rolls back to card_ready.
select is(
  (select status from public.scans where id = '00000000-0000-4006-8000-000000000603'),
  'card_ready',
  'T16: scan rolls back to card_ready after failure'
);

-- T17: ai_run marked failed_retryable with correct error_code.
select results_eq(
  format(
    $$ select status, error_code from public.ai_runs where id = %L::uuid $$,
    current_setting('test.fail_run_id')
  ),
  $$ values ('failed_retryable'::text, 'rate_limited'::text) $$,
  'T17: ai_run marked failed_retryable with error_code'
);

-- T18: fail_flash_brief returns false when run is no longer running.
select is(
  public.fail_flash_brief(
    '00000000-0000-4006-8000-000000000603'::uuid,
    current_setting('test.fail_run_id')::uuid,
    'timeout'
  ),
  false,
  'T18: fail_flash_brief returns false for already-terminated run'
);

-- ─── RLS isolation ────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-4006-8000-000000000002', true);

-- T19: Bob cannot read Alice relationship_analyses.
select is(
  (
    select count(*)
    from public.relationship_analyses
    where scan_id = '00000000-0000-4006-8000-000000000601'
  ),
  0::bigint,
  'T19: Bob cannot read Alice relationship_analyses (RLS)'
);

-- T20: Bob cannot read Alice ai_runs.
select is(
  (
    select count(*)
    from public.ai_runs
    where scan_id = '00000000-0000-4006-8000-000000000601'
  ),
  0::bigint,
  'T20: Bob cannot read Alice ai_runs (RLS)'
);

-- ─── Unauthenticated (anon) guards ───────────────────────────────────────────

set local role anon;

-- T21: anon cannot call claim_flash_brief.
select throws_ok(
  $$
    select * from public.claim_flash_brief(
      '00000000-0000-4006-8000-000000000601'::uuid,
      'openai',
      'gpt-4o'
    )
  $$,
  '42501',
  null,
  'T21: anon cannot call claim_flash_brief'
);

-- T22: anon cannot call persist_flash_brief.
select throws_ok(
  $$
    select * from public.persist_flash_brief(
      '00000000-0000-4006-8000-000000000601'::uuid,
      '00000000-0000-4006-8000-999999999999'::uuid,
      '{"who":"x","why_you":"x","say_this":["x"],"potential":"x"}'::jsonb,
      100
    )
  $$,
  '42501',
  null,
  'T22: anon cannot call persist_flash_brief'
);

-- T23: anon cannot call fail_flash_brief.
select throws_ok(
  $$
    select public.fail_flash_brief(
      '00000000-0000-4006-8000-000000000601'::uuid,
      '00000000-0000-4006-8000-999999999999'::uuid,
      'timeout'
    )
  $$,
  '42501',
  null,
  'T23: anon cannot call fail_flash_brief'
);

-- T24: anon cannot read relationship_analyses. anon holds no table privilege
-- at all, so the read is refused outright and never reaches RLS.
select throws_ok(
  $$ select count(*) from public.relationship_analyses $$,
  '42501',
  null,
  'T24: anon cannot read relationship_analyses'
);

select * from finish();

rollback;
