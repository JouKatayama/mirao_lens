create extension if not exists vector with schema extensions;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  current_company text,
  "current_role" text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.personal_context_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  text text not null check (char_length(text) between 1 and 4000),
  tags text[] not null default '{}',
  embedding extensions.vector,
  source_type text not null check (source_type in ('user_entered', 'ai_suggested')),
  user_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'created' check (
    status in (
      'created',
      'image_uploaded',
      'extracting_card',
      'card_ready',
      'fast_context',
      'generating_brief',
      'brief_ready',
      'deep_enrichment',
      'deep_ready',
      'failed_retryable',
      'failed_terminal'
    )
  ),
  meeting_goal text not null default 'networking' check (
    meeting_goal in (
      'networking',
      'sales',
      'recruiting',
      'partnership',
      'learning_information_exchange',
      'other'
    )
  ),
  raw_image_path text,
  raw_image_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.business_cards (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  company text,
  department text,
  title text,
  email text,
  phone text,
  website text,
  address text,
  language text not null default 'ja',
  field_confidence jsonb not null default '{}'::jsonb,
  extraction_json jsonb not null default '{}'::jsonb,
  user_corrected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (scan_id, user_id)
    references public.scans (id, user_id)
    on delete cascade
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  title text,
  department text,
  identity_status text not null default 'unresolved' check (
    identity_status in (
      'verified',
      'high_confidence',
      'medium_confidence',
      'unresolved'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  domain text,
  industry text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null,
  source_type text not null check (
    source_type in (
      'business_card',
      'user_correction',
      'official_company',
      'public_web',
      'user_context',
      'ai_inference'
    )
  ),
  source_title text,
  source_url text,
  retrieved_at timestamptz,
  excerpt text,
  confidence real not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  foreign key (scan_id, user_id)
    references public.scans (id, user_id)
    on delete cascade
);

create table public.relationship_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null unique,
  flash_brief_json jsonb not null default '{}'::jsonb,
  mutual_value_json jsonb not null default '{}'::jsonb,
  model_metadata_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  foreign key (scan_id, user_id)
    references public.scans (id, user_id)
    on delete cascade
);

create table public.interaction_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null unique,
  note_text text not null check (char_length(note_text) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (scan_id, user_id)
    references public.scans (id, user_id)
    on delete cascade
);

create table public.next_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null,
  action_text text not null check (char_length(action_text) between 1 and 2000),
  timing_text text,
  status text not null default 'suggested' check (
    status in ('suggested', 'accepted', 'dismissed', 'completed')
  ),
  source text not null check (source in ('ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (scan_id, user_id)
    references public.scans (id, user_id)
    on delete cascade
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null,
  stage text not null,
  provider text not null,
  model_alias text not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  status text not null check (
    status in ('queued', 'running', 'succeeded', 'failed_retryable', 'failed_terminal')
  ),
  cost_metadata_json jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  foreign key (scan_id, user_id)
    references public.scans (id, user_id)
    on delete cascade
);

create index personal_context_items_user_id_idx
  on public.personal_context_items (user_id);
create index scans_user_id_created_at_idx
  on public.scans (user_id, created_at desc);
create index business_cards_user_id_idx
  on public.business_cards (user_id);
create index people_owner_user_id_idx
  on public.people (owner_user_id);
create index organizations_owner_user_id_idx
  on public.organizations (owner_user_id);
create index evidence_user_id_scan_id_idx
  on public.evidence (user_id, scan_id);
create index relationship_analyses_user_id_idx
  on public.relationship_analyses (user_id);
create index interaction_notes_user_id_idx
  on public.interaction_notes (user_id);
create index next_actions_user_id_scan_id_idx
  on public.next_actions (user_id, scan_id);
create index ai_runs_user_id_scan_id_idx
  on public.ai_runs (user_id, scan_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger personal_context_items_set_updated_at
before update on public.personal_context_items
for each row execute function public.set_updated_at();

create trigger scans_set_updated_at
before update on public.scans
for each row execute function public.set_updated_at();

create trigger business_cards_set_updated_at
before update on public.business_cards
for each row execute function public.set_updated_at();

create trigger people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger interaction_notes_set_updated_at
before update on public.interaction_notes
for each row execute function public.set_updated_at();

create trigger next_actions_set_updated_at
before update on public.next_actions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.personal_context_items enable row level security;
alter table public.scans enable row level security;
alter table public.business_cards enable row level security;
alter table public.people enable row level security;
alter table public.organizations enable row level security;
alter table public.evidence enable row level security;
alter table public.relationship_analyses enable row level security;
alter table public.interaction_notes enable row level security;
alter table public.next_actions enable row level security;
alter table public.ai_runs enable row level security;

create policy "Users manage their own profile"
on public.profiles for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own personal context"
on public.personal_context_items for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own scans"
on public.scans for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own business cards"
on public.business_cards for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own people"
on public.people for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "Users manage their own organizations"
on public.organizations for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "Users manage their own evidence"
on public.evidence for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own analyses"
on public.relationship_analyses for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own interaction notes"
on public.interaction_notes for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own next actions"
on public.next_actions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own AI runs"
on public.ai_runs for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table
  public.profiles,
  public.personal_context_items,
  public.scans,
  public.business_cards,
  public.people,
  public.organizations,
  public.evidence,
  public.relationship_analyses,
  public.interaction_notes,
  public.next_actions,
  public.ai_runs
from anon;

grant select, insert, update, delete on table
  public.profiles,
  public.personal_context_items,
  public.scans,
  public.business_cards,
  public.people,
  public.organizations,
  public.evidence,
  public.relationship_analyses,
  public.interaction_notes,
  public.next_actions,
  public.ai_runs
to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'business-card-images',
  'business-card-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users upload business cards to their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users read business cards from their own folder"
on storage.objects for select to authenticated
using (
  bucket_id = 'business-card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users update business cards in their own folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'business-card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'business-card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users delete business cards from their own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'business-card-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
