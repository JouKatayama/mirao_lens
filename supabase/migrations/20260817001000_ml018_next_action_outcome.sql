-- update_next_action_status
-- Records what actually happened to a next action. `next_actions.status`
-- already allowed 'completed', but create_next_action only ever wrote
-- 'accepted' or 'dismissed' and nothing could change a row afterwards, so an
-- action could be promised and never settled. Outcome data is the point of
-- recording the action at all.
--
-- Returns action_id on success, empty for an unknown action or one owned by
-- another user, matching create_next_action's contract.
create or replace function public.update_next_action_status(
  p_action_id uuid,
  p_status    text
)
returns table (action_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_action_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- 'suggested' is the state an action starts in; moving back to it would
  -- erase a decision the user already made.
  if p_status not in ('accepted', 'dismissed', 'completed') then
    raise exception 'status must be accepted, dismissed or completed.' using errcode = '22023';
  end if;

  update public.next_actions
  set status = p_status
  where id = p_action_id and user_id = v_user_id
  returning id into v_action_id;

  if v_action_id is null then
    return;
  end if;

  return query select v_action_id;
end;
$$;

revoke execute on function public.update_next_action_status from public, anon;
grant  execute on function public.update_next_action_status to   authenticated;
