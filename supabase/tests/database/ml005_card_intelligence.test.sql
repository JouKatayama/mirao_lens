begin;

select plan(19);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4000-8000-000000000008',
    'ml005-owner@miraio.invalid',
    '{"display_name":"Card Intelligence Owner"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000009',
    'ml005-other@miraio.invalid',
    '{"display_name":"Other Card Intelligence User"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000008',
  true
);

insert into public.scans (
  id,
  user_id,
  status,
  meeting_goal,
  raw_image_path,
  raw_image_expires_at
) values (
  '00000000-0000-4000-8000-000000000508',
  '00000000-0000-4000-8000-000000000008',
  'extracting_card',
  'networking',
  '00000000-0000-4000-8000-000000000008/00000000-0000-4000-8000-000000000508/front.jpg',
  now() + interval '1 hour'
);

select is(
  (
    select count(*)
    from public.claim_card_extraction(
      '00000000-0000-4000-8000-000000000508',
      'fixture-provider',
      'fixture-card-model'
    )
  ),
  1::bigint,
  'owner claims one Card Intelligence run'
);
select is(
  (
    select count(*)
    from public.claim_card_extraction(
      '00000000-0000-4000-8000-000000000508',
      'fixture-provider',
      'fixture-card-model'
    )
  ),
  0::bigint,
  'a duplicate active extraction cannot be claimed'
);
select results_eq(
  $$
    select stage, provider, model_alias, status
    from public.ai_runs
    where scan_id = '00000000-0000-4000-8000-000000000508'
  $$,
  $$ values (
    'card_extraction'::text,
    'fixture-provider'::text,
    'fixture-card-model'::text,
    'running'::text
  ) $$,
  'claim records non-sensitive running metadata'
);

select lives_ok(
  $$
    select public.persist_card_extraction(
      '00000000-0000-4000-8000-000000000508',
      (
        select id
        from public.ai_runs
        where scan_id = '00000000-0000-4000-8000-000000000508'
          and stage = 'card_extraction'
      ),
      '{
        "name":"Mira Testperson",
        "company":"Example Invalid Labs",
        "department":null,
        "title":"Product Lead",
        "email":"mira.card@example.invalid",
        "phone":null,
        "website":null,
        "address":null,
        "language":"en",
        "field_confidence":{
          "name":0.99,
          "company":0.98,
          "department":0,
          "title":0.97,
          "email":0.96,
          "phone":0,
          "website":0,
          "address":0
        }
      }'::jsonb,
      84
    )
  $$,
  'valid extraction persists atomically'
);
select results_eq(
  $$
    select name, company, department, title, email, user_corrected
    from public.business_cards
    where scan_id = '00000000-0000-4000-8000-000000000508'
  $$,
  $$ values (
    'Mira Testperson'::text,
    'Example Invalid Labs'::text,
    null::text,
    'Product Lead'::text,
    'mira.card@example.invalid'::text,
    false
  ) $$,
  'card stores only extracted nullable fields'
);
select is(
  (
    select count(*)
    from public.evidence
    where scan_id = '00000000-0000-4000-8000-000000000508'
      and source_type = 'business_card'
  ),
  4::bigint,
  'one FACT Evidence row exists for every non-null card field'
);
select is(
  (
    select bool_and(confidence between 0 and 1)
    from public.evidence
    where scan_id = '00000000-0000-4000-8000-000000000508'
      and source_type = 'business_card'
  ),
  true,
  'card Evidence confidence stays bounded'
);
select results_eq(
  $$
    select status, raw_image_expires_at <= now()
    from public.scans
    where id = '00000000-0000-4000-8000-000000000508'
  $$,
  $$ values ('card_ready'::text, true) $$,
  'successful extraction reaches card_ready and expires the raw image'
);
select results_eq(
  $$
    select status, latency_ms, error_code
    from public.ai_runs
    where scan_id = '00000000-0000-4000-8000-000000000508'
  $$,
  $$ values ('succeeded'::text, 84::integer, null::text) $$,
  'AI run records success and latency without raw output'
);

select lives_ok(
  $$
    select public.correct_business_card(
      '00000000-0000-4000-8000-000000000508',
      '{"title":"Principal Product Lead","department":null}'::jsonb
    )
  $$,
  'owner can correct and clear card fields'
);
select results_eq(
  $$
    select
      title,
      department,
      (field_confidence ->> 'title')::numeric,
      (field_confidence ->> 'department')::numeric,
      user_corrected
    from public.business_cards
    where scan_id = '00000000-0000-4000-8000-000000000508'
  $$,
  $$ values (
    'Principal Product Lead'::text,
    null::text,
    1::numeric,
    0::numeric,
    true
  ) $$,
  'correction updates fields, confidence, and review state'
);
select is(
  (
    select extraction_json ->> 'title'
    from public.business_cards
    where scan_id = '00000000-0000-4000-8000-000000000508'
  ),
  'Product Lead',
  'correction preserves the original extraction JSON'
);
select is(
  (
    select count(*)
    from public.evidence
    where scan_id = '00000000-0000-4000-8000-000000000508'
      and source_type = 'user_correction'
  ),
  2::bigint,
  'correction provenance records updated and cleared fields'
);
select throws_ok(
  $$
    update public.business_cards
    set field_confidence = jsonb_set(field_confidence, '{name}', '1.2'::jsonb)
    where scan_id = '00000000-0000-4000-8000-000000000508'
  $$,
  '23514',
  null,
  'database rejects out-of-range field confidence'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000009',
  true
);

select is(
  (select count(*) from public.business_cards),
  0::bigint,
  'another user cannot read the extracted card'
);
select is(
  (select count(*) from public.evidence),
  0::bigint,
  'another user cannot read card or correction Evidence'
);
select is(
  (select count(*) from public.ai_runs),
  0::bigint,
  'another user cannot read Card Intelligence runs'
);
select is(
  (
    select count(*)
    from public.correct_business_card(
      '00000000-0000-4000-8000-000000000508',
      '{"title":"Cross-user edit"}'::jsonb
    )
  ),
  0::bigint,
  'cross-user correction does not disclose or mutate the card'
);

set local role anon;
select throws_ok(
  $$
    select public.claim_card_extraction(
      '00000000-0000-4000-8000-000000000508',
      'fixture-provider',
      'fixture-card-model'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot claim Card Intelligence work'
);

select * from finish();

rollback;
