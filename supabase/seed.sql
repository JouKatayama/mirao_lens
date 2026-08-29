-- Deterministic local-only seed data. The .invalid address cannot receive mail,
-- and the Auth row intentionally has no password or sign-in credential.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-4000-8000-000000000002',
  'ml002-seed@miraio.invalid',
  '{"display_name":"Miraio Sample"}'::jsonb
)
on conflict (id) do nothing;

update public.profiles
set
  current_company = 'Example Company',
  "current_role" = 'Product Lead'
where user_id = '00000000-0000-4000-8000-000000000002';

insert into public.personal_context_items (
  id,
  user_id,
  type,
  text,
  tags,
  source_type,
  user_approved
)
values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000002',
    'expertise',
    'Digital product discovery and validation',
    array['product', 'discovery'],
    'user_entered',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000002',
    'offer',
    'Structured feedback on early product concepts',
    array['feedback', 'validation'],
    'user_entered',
    true
  )
on conflict (id) do update
set
  type = excluded.type,
  text = excluded.text,
  tags = excluded.tags,
  source_type = excluded.source_type,
  user_approved = excluded.user_approved;
