-- Pilot extension 5 (spec §2.4, ADR-0010): the follow-up recommendation.
--
-- One judgement per scan: follow up, hold, or skip, with labelled reasons and,
-- only for a follow-up, a draft. The table records what was suggested and what
-- the user decided. Nothing here sends, schedules, or queues a message; there is
-- no outbound path on the server at all.
create table public.follow_up_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null unique,
  decision text not null check (
    decision in ('follow_up', 'hold', 'no_follow_up')
  ),
  confidence real not null check (confidence between 0 and 1),
  reasons_json jsonb not null default '[]'::jsonb,
  uncertainty text check (char_length(uncertainty) <= 600),
  timing_text text check (char_length(timing_text) <= 200),
  draft_subject text check (char_length(draft_subject) <= 200),
  draft_body text check (char_length(draft_body) <= 4000),
  status text not null default 'suggested' check (
    status in ('suggested', 'approved', 'dismissed')
  ),
  -- Whether the approved draft differs from what the AI wrote; the edit rate
  -- is one of the extension's measures.
  edited boolean not null default false,
  model_metadata_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  check (decision = 'follow_up' or (draft_subject is null and draft_body is null)),
  check ((status = 'suggested') = (decided_at is null)),
  foreign key (scan_id, user_id)
    references public.scans (id, user_id) on delete cascade
);

alter table public.follow_up_recommendations enable row level security;

create policy "Users manage their own follow-up recommendations"
on public.follow_up_recommendations for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.follow_up_recommendations from anon;
grant select, insert, update, delete on table public.follow_up_recommendations
  to authenticated;
