begin;

select plan(30);

select has_extension('vector', 'pgvector extension is available');

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'personal_context_items', 'personal context table exists');
select has_table('public', 'scans', 'scans table exists');
select has_table('public', 'business_cards', 'business cards table exists');
select has_table('public', 'people', 'people table exists');
select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'evidence', 'evidence table exists');
select has_table('public', 'relationship_analyses', 'analyses table exists');
select has_table('public', 'interaction_notes', 'interaction notes table exists');
select has_table('public', 'next_actions', 'next actions table exists');
select has_table('public', 'ai_runs', 'AI runs table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.personal_context_items'::regclass), 'personal context RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.scans'::regclass), 'scans RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.business_cards'::regclass), 'business cards RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.people'::regclass), 'people RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'organizations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.evidence'::regclass), 'evidence RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.relationship_analyses'::regclass), 'analyses RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.interaction_notes'::regclass), 'interaction notes RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.next_actions'::regclass), 'next actions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_runs'::regclass), 'AI runs RLS enabled');

select ok(
  exists(select 1 from storage.buckets where id = 'business-card-images'),
  'private card image bucket exists'
);
select ok(
  not (select public from storage.buckets where id = 'business-card-images'),
  'card image bucket is private'
);
select ok(
  exists(
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ),
  'Auth user profile trigger exists'
);
select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid = 'public.scans'::regclass
      and contype = 'u'
      and conname = 'scans_id_user_id_key'
  ),
  'scan ownership composite key exists'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public'),
  11::bigint,
  'every public user-owned table has an RLS policy'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'Users % business cards%'
  ),
  4::bigint,
  'card image objects have CRUD policies'
);
select ok(
  exists(
    select 1
    from public.profiles
    where user_id = '00000000-0000-4000-8000-000000000002'
  ),
  'seeded Auth user received a profile'
);

select * from finish();

rollback;
