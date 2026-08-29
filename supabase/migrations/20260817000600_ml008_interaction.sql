-- upsert_interaction_note
-- Upserts a private meeting note for the authenticated user's scan.
-- Returns note_id on success, empty on scan-not-found or wrong owner.
create or replace function public.upsert_interaction_note(
  p_scan_id  uuid,
  p_note_text text
)
returns table (note_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_note_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_note_text), '') is null then
    raise exception 'note_text must be non-empty.' using errcode = '22023';
  end if;

  if length(p_note_text) > 4000 then
    raise exception 'note_text must not exceed 4000 characters.' using errcode = '22023';
  end if;

  -- Verify the scan belongs to the caller; return empty for unknown/other-user scans.
  if not exists (
    select 1 from public.scans
    where id = p_scan_id and user_id = v_user_id
  ) then
    return;
  end if;

  insert into public.interaction_notes (scan_id, user_id, note_text)
  values (p_scan_id, v_user_id, p_note_text)
  on conflict (scan_id) do update
    set note_text  = excluded.note_text,
        updated_at = now()
  returning id into v_note_id;

  return query select v_note_id;
end;
$$;

revoke execute on function public.upsert_interaction_note from public, anon;
grant  execute on function public.upsert_interaction_note to   authenticated;

-- create_next_action
-- Inserts a next-action record (AI-suggested or user-defined) for the
-- authenticated user's scan. Returns action_id, empty for unknown scan.
create or replace function public.create_next_action(
  p_scan_id     uuid,
  p_action_text text,
  p_timing_text text,
  p_source      text,
  p_status      text
)
returns table (action_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_action_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_action_text), '') is null then
    raise exception 'action_text must be non-empty.' using errcode = '22023';
  end if;

  if length(p_action_text) > 2000 then
    raise exception 'action_text must not exceed 2000 characters.' using errcode = '22023';
  end if;

  if p_source not in ('ai', 'user') then
    raise exception 'source must be ai or user.' using errcode = '22023';
  end if;

  if p_status not in ('accepted', 'dismissed') then
    raise exception 'status must be accepted or dismissed.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.scans
    where id = p_scan_id and user_id = v_user_id
  ) then
    return;
  end if;

  insert into public.next_actions (
    scan_id, user_id, action_text, timing_text, source, status
  ) values (
    p_scan_id, v_user_id, p_action_text, p_timing_text, p_source, p_status
  )
  returning id into v_action_id;

  return query select v_action_id;
end;
$$;

revoke execute on function public.create_next_action from public, anon;
grant  execute on function public.create_next_action to   authenticated;
