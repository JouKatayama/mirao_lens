begin;

select plan(17);

select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid = 'public.personal_context_items'::regclass
      and conname = 'personal_context_items_type_check'
  ),
  'Personal Context type constraint exists'
);
select has_column(
  'public',
  'personal_context_items',
  'onboarding_request_id',
  'onboarding request ID is persisted'
);
select has_column(
  'public',
  'personal_context_items',
  'onboarding_position',
  'onboarding suggestion order is persisted'
);
select has_function(
  'public',
  'persist_personal_context_onboarding',
  array['uuid', 'text', 'text', 'jsonb'],
  'atomic onboarding persistence function exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.persist_personal_context_onboarding(uuid,text,text,jsonb)',
    'execute'
  ),
  'anonymous users cannot execute onboarding persistence'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4000-8000-000000000004',
    'ml003-owner@miraio.invalid',
    '{"display_name":"Context Owner"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    'ml003-other@miraio.invalid',
    '{"display_name":"Other Context User"}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000004',
  true
);

select lives_ok(
  $$
    select *
    from public.persist_personal_context_onboarding(
      '00000000-0000-4000-8000-000000000304',
      'Example Company',
      'Product Lead',
      '[
        {"type":"expertise","text":"Product discovery","tags":["product"]},
        {"type":"offer","text":"Structured concept feedback","tags":["feedback"]}
      ]'::jsonb
    )
  $$,
  'owner can persist an onboarding result'
);
select is(
  (
    select count(*)
    from public.personal_context_items
    where onboarding_request_id = '00000000-0000-4000-8000-000000000304'
  ),
  2::bigint,
  'all suggestions are persisted'
);
select results_eq(
  $$
    select current_company, "current_role"
    from public.profiles
    where user_id = '00000000-0000-4000-8000-000000000004'
  $$,
  $$ values ('Example Company'::text, 'Product Lead'::text) $$,
  'direct profile facts are persisted'
);
select is(
  (
    select count(*)
    from public.personal_context_items
    where source_type = 'ai_suggested'
      and not user_approved
  ),
  2::bigint,
  'AI suggestions begin unapproved'
);
select lives_ok(
  $$
    select *
    from public.persist_personal_context_onboarding(
      '00000000-0000-4000-8000-000000000304',
      'Changed Company',
      'Changed Role',
      '[{"type":"offer","text":"Changed text","tags":[]}]'::jsonb
    )
  $$,
  'the same request ID can be replayed safely'
);
select is(
  (
    select count(*)
    from public.personal_context_items
    where onboarding_request_id = '00000000-0000-4000-8000-000000000304'
  ),
  2::bigint,
  'idempotent replay creates no duplicate suggestions'
);
select results_eq(
  $$
    select current_company, "current_role"
    from public.profiles
    where user_id = '00000000-0000-4000-8000-000000000004'
  $$,
  $$ values ('Example Company'::text, 'Product Lead'::text) $$,
  'idempotent replay preserves the original profile facts'
);
select lives_ok(
  $$
    update public.personal_context_items
    set user_approved = true
    where user_id = '00000000-0000-4000-8000-000000000004'
      and type = 'offer'
  $$,
  'owner can approve a suggestion'
);
select is(
  (
    select count(*)
    from public.personal_context_items
    where user_approved
  ),
  1::bigint,
  'only explicitly approved context is approved'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000005',
  true
);

select is(
  (select count(*) from public.personal_context_items),
  0::bigint,
  'another user cannot see owner context'
);
select is_empty(
  $$
    update public.personal_context_items
    set user_approved = true
    where onboarding_request_id = '00000000-0000-4000-8000-000000000304'
    returning id
  $$,
  'another user cannot approve owner context'
);
select throws_ok(
  $$
    insert into public.personal_context_items (
      user_id,
      type,
      text,
      source_type,
      user_approved
    ) values (
      '00000000-0000-4000-8000-000000000005',
      'personality',
      'Disallowed category',
      'user_entered',
      true
    )
  $$,
  '23514',
  null,
  'unknown Personal Context types are rejected'
);

select * from finish();

rollback;
