-- Unique index: at most one active mutual_value ai_run per scan.
create unique index ai_runs_one_active_mutual_value_key
  on public.ai_runs (scan_id, stage)
  where stage = 'mutual_value'
    and status in ('queued', 'running');

-- claim_mutual_value
-- Atomically advances a brief_ready scan to deep_enrichment and creates an
-- ai_run. Returns run_id, or empty if the scan cannot be claimed (wrong status,
-- already claimed, or not owned by the caller).
create or replace function public.claim_mutual_value(
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

  -- Only claim when the Flash Brief is ready for deep enrichment.
  if not found or v_scan.status <> 'brief_ready' then
    return;
  end if;

  -- Clean up stale running claims (> 20 minutes old).
  update public.ai_runs
  set
    status = 'failed_retryable',
    error_code = 'stale_mutual_value_claim'
  where user_id = v_user_id
    and scan_id = p_scan_id
    and stage = 'mutual_value'
    and status = 'running'
    and created_at < now() - interval '20 minutes';

  -- Dedup: return nothing if a claim is already active.
  if exists (
    select 1
    from public.ai_runs
    where user_id = v_user_id
      and scan_id = p_scan_id
      and stage = 'mutual_value'
      and status in ('queued', 'running')
  ) then
    return;
  end if;

  -- Advance scan status to deep_enrichment.
  update public.scans
  set status = 'deep_enrichment'
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
    'mutual_value',
    btrim(p_provider),
    btrim(p_model_alias),
    'running'
  )
  returning id into v_run_id;

  return query select v_run_id;
end;
$$;

-- persist_mutual_value
-- Atomically stores the generated mutual value in relationship_analyses,
-- advances scan to deep_ready, and marks the ai_run as succeeded.
-- Returns the upserted relationship_analyses row id on success, empty otherwise.
create or replace function public.persist_mutual_value(
  p_scan_id uuid,
  p_run_id uuid,
  p_mutual_value_json jsonb,
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

  if jsonb_typeof(p_mutual_value_json) is distinct from 'object' then
    raise exception 'Mutual value JSON must be an object.' using errcode = '22023';
  end if;

  -- Lock the scan (must still be in deep_enrichment).
  perform 1
  from public.scans as scan
  where scan.id = p_scan_id
    and scan.user_id = v_user_id
    and scan.status = 'deep_enrichment'
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
    and run.stage = 'mutual_value'
    and run.status = 'running'
  for update;

  if not found then
    return;
  end if;

  insert into public.relationship_analyses (
    user_id,
    scan_id,
    mutual_value_json
  ) values (
    v_user_id,
    p_scan_id,
    p_mutual_value_json
  )
  on conflict (scan_id) do update
  set
    mutual_value_json = excluded.mutual_value_json,
    generated_at = now()
  returning id into v_analysis_id;

  update public.scans
  set status = 'deep_ready'
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

-- fail_mutual_value
-- Marks the ai_run as failed and rolls the scan back to brief_ready so the
-- Flash Brief remains accessible without a mutual value.
create or replace function public.fail_mutual_value(
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
    and stage = 'mutual_value'
    and status = 'running';

  if not found then
    return false;
  end if;

  -- Roll back to brief_ready so the user can still see the Flash Brief.
  update public.scans
  set status = 'brief_ready'
  where id = p_scan_id
    and user_id = v_user_id
    and status = 'deep_enrichment';

  return true;
end;
$$;

revoke all on function public.claim_mutual_value(uuid, text, text)
  from public, anon;
revoke all on function public.persist_mutual_value(uuid, uuid, jsonb, integer)
  from public, anon;
revoke all on function public.fail_mutual_value(uuid, uuid, text)
  from public, anon;

grant execute on function public.claim_mutual_value(uuid, text, text)
  to authenticated;
grant execute on function public.persist_mutual_value(uuid, uuid, jsonb, integer)
  to authenticated;
grant execute on function public.fail_mutual_value(uuid, uuid, text)
  to authenticated;
