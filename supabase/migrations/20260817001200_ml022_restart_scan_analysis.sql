-- restart_scan_analysis
-- Re-runs the analysis for a scan under a different meeting goal.
--
-- The goal is an input to the Flash Brief and Mutual Value prompts, so a scan
-- captured as "networking" that turned into a sales conversation carries a
-- brief written for the wrong situation, with no way to correct it. The card
-- itself is unaffected, and so is the company context, which is derived from
-- the card rather than the goal: only the two goal-dependent analyses are
-- cleared and regenerated.
--
-- Returns the new status, or empty for an unknown scan, another user's scan,
-- or one that is not in a settled analysis state. Restarting mid-pipeline
-- would race the run that is still working.
create or replace function public.restart_scan_analysis(
  p_scan_id      uuid,
  p_meeting_goal text
)
returns table (status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status  text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_meeting_goal not in (
    'networking',
    'sales',
    'recruiting',
    'partnership',
    'learning_information_exchange',
    'other'
  ) then
    raise exception 'meeting_goal is not a known value.' using errcode = '22023';
  end if;

  update public.scans
  set meeting_goal = p_meeting_goal,
      status       = 'card_ready'
  where id = p_scan_id
    and user_id = v_user_id
    and status in ('brief_ready', 'deep_ready')
  returning scans.status into v_status;

  if v_status is null then
    return;
  end if;

  -- The columns are not null, so the stored analyses are emptied rather than
  -- removed: an empty object fails the Flash Brief schema, which is how every
  -- reader already recognises "not generated yet".
  update public.relationship_analyses
  set flash_brief_json  = '{}'::jsonb,
      mutual_value_json = '{}'::jsonb
  where scan_id = p_scan_id
    and user_id = v_user_id;

  return query select v_status;
end;
$$;

revoke execute on function public.restart_scan_analysis from public, anon;
grant  execute on function public.restart_scan_analysis to   authenticated;
