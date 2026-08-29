begin;

select plan(16);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4008-8000-000000000001',
    'ml008-alice@miraio.invalid',
    '{"display_name":"Interaction Alice"}'::jsonb
  ),
  (
    '00000000-0000-4008-8000-000000000002',
    'ml008-bob@miraio.invalid',
    '{"display_name":"Interaction Bob"}'::jsonb
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4008-8000-000000000001', true);

insert into public.profiles (user_id, current_role, current_company)
values ('00000000-0000-4008-8000-000000000001', 'デザイナー', 'TestCo');

-- Alice's deep_ready scan (prerequisite for interaction).
insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4008-8000-000000000801',
  '00000000-0000-4008-8000-000000000001',
  'deep_ready',
  'networking'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4008-8000-000000000002', true);

insert into public.profiles (user_id, current_role, current_company)
values ('00000000-0000-4008-8000-000000000002', 'Engineer', 'OtherCo');

insert into public.scans (id, user_id, status, meeting_goal)
values (
  '00000000-0000-4008-8000-000000000802',
  '00000000-0000-4008-8000-000000000002',
  'deep_ready',
  'sales'
);

-- Switch back to Alice for the main tests.
select set_config('request.jwt.claim.sub', '00000000-0000-4008-8000-000000000001', true);

-- ─── upsert_interaction_note ─────────────────────────────────────────────────

-- T01: Valid upsert returns one note_id.
select is(
  (
    select count(*)
    from public.upsert_interaction_note(
      '00000000-0000-4008-8000-000000000801',
      'とても良い商談でした。'
    )
  ),
  1::bigint,
  'T01: upsert_interaction_note returns one note_id'
);

-- T02: Note text is stored correctly.
select is(
  (
    select note_text
    from public.interaction_notes
    where scan_id = '00000000-0000-4008-8000-000000000801'
  ),
  'とても良い商談でした。',
  'T02: note text is persisted in interaction_notes'
);

-- T03: Second upsert overwrites the note (ON CONFLICT UPDATE).
do $$
begin
  perform public.upsert_interaction_note(
    '00000000-0000-4008-8000-000000000801',
    '更新後のメモです。'
  );
end;
$$;

select is(
  (
    select note_text
    from public.interaction_notes
    where scan_id = '00000000-0000-4008-8000-000000000801'
  ),
  '更新後のメモです。',
  'T03: second upsert updates existing note'
);

-- T04: Blank note_text raises error.
select throws_ok(
  $$
    select * from public.upsert_interaction_note(
      '00000000-0000-4008-8000-000000000801'::uuid,
      '   '
    )
  $$,
  '22023',
  null,
  'T04: blank note_text raises error'
);

-- T05: Bob cannot write a note on Alice scan (returns empty).
select set_config('request.jwt.claim.sub', '00000000-0000-4008-8000-000000000002', true);

select is(
  (
    select count(*)
    from public.upsert_interaction_note(
      '00000000-0000-4008-8000-000000000801',
      'Bobのメモ'
    )
  ),
  0::bigint,
  'T05: Bob cannot write note on Alice scan'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4008-8000-000000000001', true);

-- ─── create_next_action ───────────────────────────────────────────────────────

-- T06: Valid create returns one action_id.
select is(
  (
    select count(*)
    from public.create_next_action(
      '00000000-0000-4008-8000-000000000801',
      '来週フォローアップミーティングを設定する',
      '1週間以内',
      'ai',
      'accepted'
    )
  ),
  1::bigint,
  'T06: create_next_action returns one action_id'
);

-- T07: Action is stored with correct fields.
select results_eq(
  $$
    select action_text, source, status
    from public.next_actions
    where scan_id = '00000000-0000-4008-8000-000000000801'
  $$,
  $$ values (
    '来週フォローアップミーティングを設定する'::text,
    'ai'::text,
    'accepted'::text
  ) $$,
  'T07: next_action stored with correct action_text, source, status'
);

-- T08: Blank action_text raises error.
select throws_ok(
  $$
    select * from public.create_next_action(
      '00000000-0000-4008-8000-000000000801'::uuid,
      '',
      null,
      'ai',
      'accepted'
    )
  $$,
  '22023',
  null,
  'T08: blank action_text raises error'
);

-- T09: Invalid source raises error.
select throws_ok(
  $$
    select * from public.create_next_action(
      '00000000-0000-4008-8000-000000000801'::uuid,
      'アクション',
      null,
      'robot',
      'accepted'
    )
  $$,
  '22023',
  null,
  'T09: invalid source raises error'
);

-- T10: Invalid status raises error.
select throws_ok(
  $$
    select * from public.create_next_action(
      '00000000-0000-4008-8000-000000000801'::uuid,
      'アクション',
      null,
      'ai',
      'pending'
    )
  $$,
  '22023',
  null,
  'T10: invalid status raises error'
);

-- T11: Bob cannot create action on Alice scan (returns empty).
select set_config('request.jwt.claim.sub', '00000000-0000-4008-8000-000000000002', true);

select is(
  (
    select count(*)
    from public.create_next_action(
      '00000000-0000-4008-8000-000000000801',
      'Bobのアクション',
      null,
      'user',
      'accepted'
    )
  ),
  0::bigint,
  'T11: Bob cannot create action on Alice scan'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4008-8000-000000000001', true);

-- ─── RLS isolation ────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-4008-8000-000000000002', true);

-- T12: Bob cannot read Alice interaction_notes.
select is(
  (
    select count(*)
    from public.interaction_notes
    where scan_id = '00000000-0000-4008-8000-000000000801'
  ),
  0::bigint,
  'T12: Bob cannot read Alice interaction_notes (RLS)'
);

-- T13: Bob cannot read Alice next_actions.
select is(
  (
    select count(*)
    from public.next_actions
    where scan_id = '00000000-0000-4008-8000-000000000801'
  ),
  0::bigint,
  'T13: Bob cannot read Alice next_actions (RLS)'
);

-- ─── Unauthenticated (anon) guards ───────────────────────────────────────────

set local role anon;

-- T14: anon cannot call upsert_interaction_note.
select throws_ok(
  $$
    select * from public.upsert_interaction_note(
      '00000000-0000-4008-8000-000000000801'::uuid,
      'メモ'
    )
  $$,
  '42501',
  null,
  'T14: anon cannot call upsert_interaction_note'
);

-- T15: anon cannot call create_next_action.
select throws_ok(
  $$
    select * from public.create_next_action(
      '00000000-0000-4008-8000-000000000801'::uuid,
      'アクション',
      null,
      'ai',
      'accepted'
    )
  $$,
  '42501',
  null,
  'T15: anon cannot call create_next_action'
);

-- T16: anon cannot read interaction_notes.
select is(
  (
    select count(*) from public.interaction_notes
  ),
  0::bigint,
  'T16: anon cannot read interaction_notes'
);

select * from finish();

rollback;
