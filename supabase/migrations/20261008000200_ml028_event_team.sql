-- Members never receive direct privileges on another user's scans or notes.
-- The projection below is the only cross-user read surface.
create table public.event_members (
  event_id uuid not null,
  owner_user_id uuid not null,
  member_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_user_id),
  foreign key (event_id, owner_user_id)
    references public.events (id, owner_user_id) on delete cascade,
  check (owner_user_id <> member_user_id)
);

create index event_members_member_idx on public.event_members (member_user_id);
alter table public.event_members enable row level security;

create policy "Owner manages event members"
on public.event_members for all to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "Member sees own membership"
on public.event_members for select to authenticated
using ((select auth.uid()) = member_user_id);

revoke all on table public.event_members from anon;
grant select, insert, delete on table public.event_members to authenticated;

create function public.list_shared_events()
returns table (id uuid, name text, owner_user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.name, e.owner_user_id
  from public.events e
  join public.event_members m on m.event_id = e.id
  where m.member_user_id = (select auth.uid())
  order by e.created_at desc;
$$;

create function public.read_event_team_items(p_event_id uuid)
returns table (
  scan_id uuid,
  card_name text,
  card_company text,
  card_title text,
  note_text text,
  action_text text,
  action_status text
)
language sql stable security definer set search_path = ''
as $$
  select s.id, c.name, c.company, c.title, n.note_text,
    a.action_text, a.status
  from public.event_scans es
  join public.scans s on s.id = es.scan_id
  left join public.business_cards c on c.scan_id = s.id
  left join public.interaction_notes n on n.scan_id = s.id
  left join lateral (
    select na.action_text, na.status
    from public.next_actions na
    where na.scan_id = s.id and na.status in ('accepted', 'completed')
    order by na.updated_at desc limit 1
  ) a on true
  where es.event_id = p_event_id
    and (
      es.owner_user_id = (select auth.uid())
      or exists (
        select 1 from public.event_members m
        where m.event_id = es.event_id
          and m.member_user_id = (select auth.uid())
      )
    )
  order by es.created_at desc;
$$;

revoke all on function public.list_shared_events() from public, anon;
revoke all on function public.read_event_team_items(uuid) from public, anon;
grant execute on function public.list_shared_events() to authenticated;
grant execute on function public.read_event_team_items(uuid) to authenticated;
