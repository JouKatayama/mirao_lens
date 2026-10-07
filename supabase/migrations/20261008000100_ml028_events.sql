-- An event groups only scans its owner deliberately attaches. The composite
-- foreign keys prevent a scan from being put in another user's event, even if
-- a caller bypasses the API and writes through PostgREST directly.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (id, owner_user_id)
);

create table public.event_scans (
  event_id uuid not null,
  scan_id uuid not null unique,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, scan_id),
  foreign key (event_id, owner_user_id)
    references public.events (id, owner_user_id) on delete cascade,
  foreign key (scan_id, owner_user_id)
    references public.scans (id, user_id) on delete cascade
);

create index events_owner_created_at_idx
  on public.events (owner_user_id, created_at desc);
create index event_scans_event_created_at_idx
  on public.event_scans (event_id, created_at desc);

alter table public.events enable row level security;
alter table public.event_scans enable row level security;

create policy "Owners manage their events"
on public.events for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "Owners manage their event scans"
on public.event_scans for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

revoke all on table public.events, public.event_scans from anon;
grant select, insert, update, delete on table public.events, public.event_scans
  to authenticated;
