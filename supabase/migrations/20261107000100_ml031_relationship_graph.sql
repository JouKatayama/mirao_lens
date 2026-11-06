-- Pilot extension 6 (spec §2.4, ADR-0010): the relationship graph.
--
-- People, organizations, scans and events are already owner-scoped rows, so
-- the edges they imply (met, works at, met at) are read from them rather than
-- copied. Only a connection no scan records gets storage of its own: one person
-- the user has met introduced, knows, or worked with another.

-- The composite key lets a connection prove that both people belong to the
-- connection's owner, as event_scans does for events and scans.
alter table public.people
  add constraint people_id_owner_user_id_key unique (id, owner_user_id);

create table public.person_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  -- `introduced_by` reads "from_person was introduced by to_person". The other
  -- types are symmetric; the direction is only the order they were entered in.
  from_person_id uuid not null,
  to_person_id uuid not null,
  connection_type text not null check (
    connection_type in ('introduced_by', 'knows', 'worked_with')
  ),
  provenance text not null default 'user' check (
    provenance in ('user', 'ai_suggestion')
  ),
  -- AI suggestions start unapproved, as Personal Context does. A connection the
  -- user entered is approved by the act of entering it.
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  check (from_person_id <> to_person_id),
  check (provenance = 'ai_suggestion' or approved),
  unique (owner_user_id, from_person_id, to_person_id, connection_type),
  foreign key (from_person_id, owner_user_id)
    references public.people (id, owner_user_id) on delete cascade,
  foreign key (to_person_id, owner_user_id)
    references public.people (id, owner_user_id) on delete cascade
);

create index person_connections_from_idx
  on public.person_connections (owner_user_id, from_person_id);
create index person_connections_to_idx
  on public.person_connections (owner_user_id, to_person_id);

alter table public.person_connections enable row level security;

-- Owner only. Event team membership (ADR-0009) grants nothing here.
create policy "Owners manage their person connections"
on public.person_connections for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

revoke all on table public.person_connections from anon;
grant select, insert, update, delete on table public.person_connections
  to authenticated;
