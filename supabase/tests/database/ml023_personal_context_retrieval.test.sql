begin;

select plan(6);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4023-8000-000000000001',
    'ml023-alice@miraio.invalid',
    '{"display_name":"Retrieval Alice"}'::jsonb
  ),
  (
    '00000000-0000-4023-8000-000000000002',
    'ml023-bob@miraio.invalid',
    '{"display_name":"Retrieval Bob"}'::jsonb
  );

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4023-8000-000000000001', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4023-8000-000000000001', 'PM', 'TestCo')
on conflict (user_id) do update set "current_role" = excluded."current_role";

-- Three-dimensional vectors keep the fixture readable; the column declares no
-- dimension, so the arithmetic is the same as for a real embedding.
insert into public.personal_context_items
  (user_id, type, text, tags, source_type, user_approved, embedding)
values
  (
    '00000000-0000-4023-8000-000000000001',
    'strong_skill', '製造業のデータ基盤', '{}', 'user_entered', true,
    '[1,0,0]'::extensions.vector
  ),
  (
    '00000000-0000-4023-8000-000000000001',
    'current_theme', '生成AIの社内展開', '{}', 'user_entered', true,
    '[0,1,0]'::extensions.vector
  ),
  (
    '00000000-0000-4023-8000-000000000001',
    'past_experience', '無関係な経歴', '{}', 'user_entered', true,
    '[0,0,1]'::extensions.vector
  ),
  (
    '00000000-0000-4023-8000-000000000001',
    'offer', 'センサーデータの設計を手伝える', '{}', 'user_entered', true,
    null
  ),
  (
    '00000000-0000-4023-8000-000000000001',
    'current_theme', '未承認のテーマ', '{}', 'user_entered', false,
    '[1,0,0]'::extensions.vector
  );

-- Bob's item sits at the exact query vector, so RLS is the only thing keeping
-- it out of Alice's result.
select set_config('request.jwt.claim.sub', '00000000-0000-4023-8000-000000000002', true);

insert into public.profiles (user_id, "current_role", current_company)
values ('00000000-0000-4023-8000-000000000002', 'Engineer', 'OtherCo')
on conflict (user_id) do update set "current_role" = excluded."current_role";

insert into public.personal_context_items
  (user_id, type, text, tags, source_type, user_approved, embedding)
values (
  '00000000-0000-4023-8000-000000000002',
  'strong_skill', 'ボブの秘密', '{}', 'user_entered', true,
  '[1,0,0]'::extensions.vector
);

select set_config('request.jwt.claim.sub', '00000000-0000-4023-8000-000000000001', true);

-- ─── match_personal_context_items ────────────────────────────────────────────

-- T01: The nearest item to the query comes back first after the offer.
select results_eq(
  $$
    select item_text from public.match_personal_context_items(
      '[1,0,0]'::extensions.vector, 1, 1
    )
  $$,
  $$ values ('センサーデータの設計を手伝える'::text), ('製造業のデータ基盤'::text) $$,
  'T01: the offer leads, then the nearest item'
);

-- T02: A different query vector selects a different item.
select results_eq(
  $$
    select item_text from public.match_personal_context_items(
      '[0,1,0]'::extensions.vector, 1, 0
    )
  $$,
  $$ values ('生成AIの社内展開'::text) $$,
  'T02: the query decides which item is returned'
);

-- T03: The limit bounds the result.
select is(
  (
    select count(*) from public.match_personal_context_items(
      '[1,0,0]'::extensions.vector, 2, 1
    )
  ),
  3::bigint,
  'T03: offers plus the limit bound the result size'
);

-- T04: An unapproved item is never returned.
select is(
  (
    select count(*) from public.match_personal_context_items(
      '[1,0,0]'::extensions.vector, 20, 10
    )
    where item_text = '未承認のテーマ'
  ),
  0::bigint,
  'T04: unapproved context stays out'
);

-- T05: Another user's context stays out, however close it sits.
select is(
  (
    select count(*) from public.match_personal_context_items(
      '[1,0,0]'::extensions.vector, 20, 10
    )
    where item_text = 'ボブの秘密'
  ),
  0::bigint,
  'T05: another user context stays out'
);

-- T06: An out-of-range limit is rejected rather than silently clamped.
select throws_ok(
  $$
    select * from public.match_personal_context_items(
      '[1,0,0]'::extensions.vector, 50, 1
    )
  $$,
  '22023',
  null,
  'T06: an out-of-range limit raises an error'
);

select * from finish();

rollback;
