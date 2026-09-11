-- Marking a meeting worth returning to.
--
-- History is the only way back to a past encounter, and it is ordered by time
-- alone: the one meeting that mattered sinks under every routine one. A flag
-- on the scan is enough, because the scan is what the user browses.
alter table public.scans
  add column is_favorite boolean not null default false;

-- The favourites view is a filter over a user's own scans, newest first.
create index scans_user_id_is_favorite_created_at_idx
  on public.scans (user_id, created_at desc)
  where is_favorite;

-- No policy or function is added: "Users manage their own scans" already
-- covers the update, and a boolean the user sets directly needs no validation
-- beyond the ownership RLS enforces.
