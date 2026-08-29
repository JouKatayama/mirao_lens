-- ML-008: Company / Role Context
-- Adds a fast-context AI stage between card extraction and Flash Brief
-- generation. Company context is generated from the card's company and title
-- fields and stored in relationship_analyses.company_context_json. The Flash
-- Brief stage then reads this context to produce richer WHO/WHY YOU/SAY THIS
-- sections.
--
-- Status flow with ML-008:
--   card_ready → fast_context (company context running)
--              → generating_brief (company context done or gracefully skipped)
--              → brief_ready (flash brief done)

alter table public.relationship_analyses
  add column company_context_json jsonb not null default '{}'::jsonb;

-- Unique index: at most one active company_context ai_run per scan.
create unique index ai_runs_one_active_company_context_key
  on public.ai_runs (scan_id, stage)
  where stage = 'company_context'
    and status in ('queued', 'running');

-- claim_company_context
-- Atomically advances a card_ready scan to fast_context and creates an ai_run.
-- Returns run_id, or empty if the scan cannot be claimed.
create or replace function public.claim_company_context(
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

  if not found or v_scan.status <> 'card_ready' then
    return;
  end if;

  -- Clean up stale running claims (> 10 minutes old).
  update public.ai_runs
  set
    status = 'failed_retryable',
    error_code = 'stale_company_context_claim'
  where user_id = v_user_id
    and scan_id = p_scan_id
    and stage = 'company_context'
    and status = 'running'
    and created_at < now() - interval '10 minutes';

  if exists (
    select 1
    from public.ai_runs
    where user_id = v_user_id
      and scan_id = p_scan_id
      and stage = 'company_context'
      and status in ('queued', 'running')
  ) then
    return;
  end if;

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
    'company_context',
    btrim(p_provider),
    btrim(p_model_alias),
    'running'
  )
  returning id into v_run_id;

  return query select v_run_id;
end;
$$;

-- persist_company_context
-- Stores the generated company context, then advances scan to generating_brief
-- so Flash Brief can be claimed.
create or replace function public.persist_company_context(
  p_scan_id uuid,
  p_run_id uuid,
  p_context_json jsonb,
  p_latency_ms integer
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

  if p_latency_ms < 0 then
    raise exception 'Latency cannot be negative.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_context_json) is distinct from 'object' then
    raise exception 'Context JSON must be an object.' using errcode = '22023';
  end if;

  perform 1
  from public.scans as scan
  where scan.id = p_scan_id
    and scan.user_id = v_user_id
    and scan.status = 'fast_context'
  for update;

  if not found then
    return false;
  end if;

  perform 1
  from public.ai_runs as run
  where run.id = p_run_id
    and run.user_id = v_user_id
    and run.scan_id = p_scan_id
    and run.stage = 'company_context'
    and run.status = 'running'
  for update;

  if not found then
    return false;
  end if;

  insert into public.relationship_analyses (
    user_id,
    scan_id,
    company_context_json
  ) values (
    v_user_id,
    p_scan_id,
    p_context_json
  )
  on conflict (scan_id) do update
  set company_context_json = excluded.company_context_json;

  update public.scans
  set status = 'generating_brief'
  where id = p_scan_id
    and user_id = v_user_id;

  update public.ai_runs
  set
    status = 'succeeded',
    latency_ms = p_latency_ms,
    error_code = null
  where id = p_run_id
    and user_id = v_user_id;

  return true;
end;
$$;

-- fail_company_context
-- Gracefully skips company context by advancing scan to generating_brief so
-- Flash Brief can still run without company context enrichment.
create or replace function public.fail_company_context(
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
    and stage = 'company_context'
    and status = 'running';

  if not found then
    return false;
  end if;

  -- Gracefully advance so Flash Brief still runs without context.
  update public.scans
  set status = 'generating_brief'
  where id = p_scan_id
    and user_id = v_user_id
    and status = 'fast_context';

  return true;
end;
$$;

-- Update claim_flash_brief to claim from generating_brief (set by company
-- context stage) instead of card_ready. Status stays at generating_brief while
-- the brief is generated; persist_flash_brief transitions to brief_ready.
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

  if not found or v_scan.status <> 'generating_brief' then
    return;
  end if;

  update public.ai_runs
  set
    status = 'failed_retryable',
    error_code = 'stale_brief_claim'
  where user_id = v_user_id
    and scan_id = p_scan_id
    and stage = 'flash_brief'
    and status = 'running'
    and created_at < now() - interval '15 minutes';

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

revoke all on function public.claim_company_context(uuid, text, text)
  from public, anon;
revoke all on function public.persist_company_context(uuid, uuid, jsonb, integer)
  from public, anon;
revoke all on function public.fail_company_context(uuid, uuid, text)
  from public, anon;

grant execute on function public.claim_company_context(uuid, text, text)
  to authenticated;
grant execute on function public.persist_company_context(uuid, uuid, jsonb, integer)
  to authenticated;
grant execute on function public.fail_company_context(uuid, uuid, text)
  to authenticated;
