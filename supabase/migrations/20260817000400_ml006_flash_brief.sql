-- Unique index: at most one active flash_brief ai_run per scan.
create unique index ai_runs_one_active_flash_brief_key
  on public.ai_runs (scan_id, stage)
  where stage = 'flash_brief'
    and status in ('queued', 'running');

-- claim_flash_brief
-- Atomically advances a card_ready scan to fast_context and creates an ai_run.
-- Returns run_id, or empty if the scan cannot be claimed (wrong status, already
-- claimed, or not owned by the caller).
create or replace function public.claim_flash_brief(
  p_scan_id uuid,
  p_provider text,
  p_model_alias text
)
returns table (run_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scan public.scans%rowtype;
  v_run_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_provider), '') is null
    or nullif(btrim(p_model_alias), '') is null then
    raise exception 'Provider and model alias are required.' using errcode = '22023';
  end if;

  select scan.*
  into v_scan
  from public.scans as scan
  where scan.id = p_scan_id
    and scan.user_id = v_user_id
  for update;

  -- Only claim when the card has just been extracted.
  if not found or v_scan.status <> 'card_ready' then
    return;
  end if;

  -- Clean up stale running claims (> 15 minutes old).
  update public.ai_runs
  set
    status = 'failed_retryable',
    error_code = 'stale_brief_claim'
  where user_id = v_user_id
    and scan_id = p_scan_id
    and stage = 'flash_brief'
    and status = 'running'
    and created_at < now() - interval '15 minutes';

  -- Dedup: return nothing if a claim is already active.
  if exists (
    select 1
    from public.ai_runs
    where user_id = v_user_id
      and scan_id = p_scan_id
      and stage = 'flash_brief'
      and status in ('queued', 'running')
  ) then
    return;
  end if;

  -- Advance scan status to fast_context.
  update public.scans
  set status = 'fast_context'
  where id = p_scan_id
    and user_id = v_user_id;

  insert into public.ai_runs (
    user_id,
    scan_id,
    stage,
    provider,
    model_alias,
    status
  ) values (
    v_user_id,
    p_scan_id,
    'flash_brief',
    btrim(p_provider),
    btrim(p_model_alias),
    'running'
  )
  returning id into v_run_id;

  return query select v_run_id;
end;
$$;

-- persist_flash_brief
-- Atomically stores the generated brief in relationship_analyses, advances scan
-- to brief_ready, and marks the ai_run as succeeded.
-- Returns the upserted relationship_analyses row id on success, empty otherwise.
create or replace function public.persist_flash_brief(
  p_scan_id uuid,
  p_run_id uuid,
  p_brief_json jsonb,
  p_latency_ms integer
)
returns table (analysis_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_analysis_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_latency_ms < 0 then
    raise exception 'Latency cannot be negative.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_brief_json) is distinct from 'object' then
    raise exception 'Brief JSON must be an object.' using errcode = '22023';
  end if;

  -- Lock the scan (must still be in fast_context or generating_brief).
  perform 1
  from public.scans as scan
  where scan.id = p_scan_id
    and scan.user_id = v_user_id
    and scan.status in ('fast_context', 'generating_brief')
  for update;

  if not found then
    return;
  end if;

  -- Lock the ai_run (must be the claimed run, still running).
  perform 1
  from public.ai_runs as run
  where run.id = p_run_id
    and run.user_id = v_user_id
    and run.scan_id = p_scan_id
    and run.stage = 'flash_brief'
    and run.status = 'running'
  for update;

  if not found then
    return;
  end if;

  insert into public.relationship_analyses (
    user_id,
    scan_id,
    flash_brief_json
  ) values (
    v_user_id,
    p_scan_id,
    p_brief_json
  )
  on conflict (scan_id) do update
  set
    flash_brief_json = excluded.flash_brief_json,
    generated_at = now()
  returning id into v_analysis_id;

  update public.scans
  set status = 'brief_ready'
  where id = p_scan_id
    and user_id = v_user_id;

  update public.ai_runs
  set
    status = 'succeeded',
    latency_ms = p_latency_ms,
    error_code = null
  where id = p_run_id
    and user_id = v_user_id;

  return query select v_analysis_id;
end;
$$;

-- fail_flash_brief
-- Marks the ai_run as failed and rolls the scan back to card_ready so the card
-- data is still accessible without a brief.
create or replace function public.fail_flash_brief(
  p_scan_id uuid,
  p_run_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_error_code), '') is null then
    raise exception 'Error code is required.' using errcode = '22023';
  end if;

  update public.ai_runs
  set
    status = 'failed_retryable',
    error_code = left(btrim(p_error_code), 100)
  where id = p_run_id
    and user_id = v_user_id
    and scan_id = p_scan_id
    and stage = 'flash_brief'
    and status = 'running';

  if not found then
    return false;
  end if;

  -- Roll back to card_ready so the user can still see the card.
  update public.scans
  set status = 'card_ready'
  where id = p_scan_id
    and user_id = v_user_id
    and status in ('fast_context', 'generating_brief');

  return true;
end;
$$;

revoke all on function public.claim_flash_brief(uuid, text, text)
  from public, anon;
revoke all on function public.persist_flash_brief(uuid, uuid, jsonb, integer)
  from public, anon;
revoke all on function public.fail_flash_brief(uuid, uuid, text)
  from public, anon;

grant execute on function public.claim_flash_brief(uuid, text, text)
  to authenticated;
grant execute on function public.persist_flash_brief(uuid, uuid, jsonb, integer)
  to authenticated;
grant execute on function public.fail_flash_brief(uuid, uuid, text)
  to authenticated;
