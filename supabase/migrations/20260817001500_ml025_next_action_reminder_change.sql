-- set_next_action_due_at
--
-- ML-024 let a next action carry a due moment, but only at the instant it was
-- written. A user who decided afterwards that they did want reminding, or who
-- picked "明日" and then needed "3日以内", had no way to say so: `due_at` was
-- fixed for the life of the row, and the reminder on the device could drift
-- away from the record without anything reconciling them.
--
-- Owner-scoped like the rest. Returns action_id on success and empty for an
-- unknown action or another user's, matching create_next_action's contract.
-- A null due moment clears the reminder, which is how "リマインドしない" is
-- recorded after the fact.
create or replace function public.set_next_action_due_at(
  p_action_id uuid,
  p_due_at    timestamptz default null
)
returns table (action_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_status    text;
  v_action_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select status into v_status
  from public.next_actions
  where id = p_action_id and user_id = v_user_id;

  if v_status is null then
    return;
  end if;

  -- The same invariant create_next_action enforces, applied to the later
  -- change: a due moment is only meaningful for something the user still
  -- means to do.
  if v_status <> 'accepted' then
    raise exception 'due_at requires an accepted action.' using errcode = '22023';
  end if;

  update public.next_actions
  set due_at = p_due_at
  where id = p_action_id and user_id = v_user_id
  returning id into v_action_id;

  return query select v_action_id;
end;
$$;

revoke execute on function public.set_next_action_due_at from public, anon;
grant  execute on function public.set_next_action_due_at to   authenticated;
