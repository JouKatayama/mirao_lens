-- A next action can carry the moment it is due.
--
-- `timing_text` holds what the model wrote ("3日以内"), which reads well and
-- schedules nothing: the loop the product describes ends at "next action" and
-- the user is left to remember it. A concrete instant is what a reminder can
-- be set for, and it is stored separately so the sentence the user read stays
-- exactly as it was.
alter table public.next_actions
  add column due_at timestamptz;

-- create_next_action, with the due moment.
--
-- The parameter list changes rather than gaining an overload: two functions of
-- the same name would leave PostgREST to guess which one a call meant.
drop function if exists public.create_next_action(uuid, text, text, text, text);

create or replace function public.create_next_action(
  p_scan_id     uuid,
  p_action_text text,
  p_timing_text text,
  p_source      text,
  p_status      text,
  p_due_at      timestamptz default null
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

  -- A due moment is only meaningful for something the user means to do.
  if p_due_at is not null and p_status <> 'accepted' then
    raise exception 'due_at requires an accepted action.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.scans
    where id = p_scan_id and user_id = v_user_id
  ) then
    return;
  end if;

  insert into public.next_actions (
    scan_id, user_id, action_text, timing_text, source, status, due_at
  ) values (
    p_scan_id, v_user_id, p_action_text, p_timing_text, p_source, p_status, p_due_at
  )
  returning id into v_action_id;

  return query select v_action_id;
end;
$$;

revoke execute on function public.create_next_action from public, anon;
grant  execute on function public.create_next_action to   authenticated;
