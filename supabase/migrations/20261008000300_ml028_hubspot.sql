-- Server-only OAuth credentials. No anon/authenticated table grant or RLS policy.
create table public.hubspot_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.hubspot_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hub_id bigint not null,
  encrypted_tokens text not null,
  access_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.hubspot_exports (
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null,
  hub_id bigint not null,
  contact_id text not null,
  note_id text,
  note_status text not null default 'none'
    check (note_status in ('none', 'sending', 'sent')),
  updated_at timestamptz not null default now(),
  primary key (user_id, scan_id, hub_id),
  foreign key (scan_id, user_id)
    references public.scans (id, user_id) on delete cascade
);

alter table public.hubspot_oauth_states enable row level security;
alter table public.hubspot_connections enable row level security;
alter table public.hubspot_exports enable row level security;
revoke all on table public.hubspot_oauth_states,
  public.hubspot_connections, public.hubspot_exports from anon, authenticated;
grant select, insert, update, delete on table public.hubspot_oauth_states,
  public.hubspot_connections, public.hubspot_exports to service_role;

create function public.consume_hubspot_oauth_state(p_state_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  delete from public.hubspot_oauth_states
  where state_hash = p_state_hash and expires_at > now()
  returning user_id into owner_id;
  return owner_id;
end;
$$;
revoke all on function public.consume_hubspot_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_hubspot_oauth_state(text) to service_role;
