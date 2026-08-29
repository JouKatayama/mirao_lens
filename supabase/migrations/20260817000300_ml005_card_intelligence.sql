alter table public.business_cards
  alter column field_confidence set default '{
    "name": 0,
    "company": 0,
    "department": 0,
    "title": 0,
    "email": 0,
    "phone": 0,
    "website": 0,
    "address": 0
  }'::jsonb;

alter table public.business_cards
  add constraint business_cards_language_check
  check (char_length(btrim(language)) between 2 and 35),
  add constraint business_cards_extraction_json_check
  check (jsonb_typeof(extraction_json) = 'object'),
  add constraint business_cards_field_confidence_check
  check (
    jsonb_typeof(field_confidence) = 'object'
    and field_confidence ?& array[
      'name',
      'company',
      'department',
      'title',
      'email',
      'phone',
      'website',
      'address'
    ]
    and field_confidence - array[
      'name',
      'company',
      'department',
      'title',
      'email',
      'phone',
      'website',
      'address'
    ] = '{}'::jsonb
    and jsonb_typeof(field_confidence -> 'name') = 'number'
    and (field_confidence ->> 'name')::numeric between 0 and 1
    and jsonb_typeof(field_confidence -> 'company') = 'number'
    and (field_confidence ->> 'company')::numeric between 0 and 1
    and jsonb_typeof(field_confidence -> 'department') = 'number'
    and (field_confidence ->> 'department')::numeric between 0 and 1
    and jsonb_typeof(field_confidence -> 'title') = 'number'
    and (field_confidence ->> 'title')::numeric between 0 and 1
    and jsonb_typeof(field_confidence -> 'email') = 'number'
    and (field_confidence ->> 'email')::numeric between 0 and 1
    and jsonb_typeof(field_confidence -> 'phone') = 'number'
    and (field_confidence ->> 'phone')::numeric between 0 and 1
    and jsonb_typeof(field_confidence -> 'website') = 'number'
    and (field_confidence ->> 'website')::numeric between 0 and 1
    and jsonb_typeof(field_confidence -> 'address') = 'number'
    and (field_confidence ->> 'address')::numeric between 0 and 1
  );

create unique index ai_runs_one_active_card_extraction_key
  on public.ai_runs (scan_id, stage)
  where stage = 'card_extraction'
    and status in ('queued', 'running');

create or replace function public.claim_card_extraction(
  p_scan_id uuid,
  p_provider text,
  p_model_alias text
)
returns table (run_id uuid, raw_image_path text)
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

  if not found
    or v_scan.status <> 'extracting_card'
    or v_scan.raw_image_path is null then
    return;
  end if;

  update public.ai_runs
  set
    status = 'failed_retryable',
    error_code = 'stale_extraction_claim'
  where user_id = v_user_id
    and scan_id = p_scan_id
    and stage = 'card_extraction'
    and status = 'running'
    and created_at < now() - interval '10 minutes';

  if exists (
    select 1
    from public.ai_runs
    where user_id = v_user_id
      and scan_id = p_scan_id
      and stage = 'card_extraction'
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
    'card_extraction',
    btrim(p_provider),
    btrim(p_model_alias),
    'running'
  )
  returning id into v_run_id;

  return query select v_run_id, v_scan.raw_image_path;
end;
$$;

create or replace function public.persist_card_extraction(
  p_scan_id uuid,
  p_run_id uuid,
  p_extraction jsonb,
  p_latency_ms integer
)
returns setof public.business_cards
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

  perform 1
  from public.scans as scan
  where scan.id = p_scan_id
    and scan.user_id = v_user_id
    and scan.status = 'extracting_card'
  for update;

  if not found then
    return;
  end if;

  perform 1
  from public.ai_runs as run
  where run.id = p_run_id
    and run.user_id = v_user_id
    and run.scan_id = p_scan_id
    and run.stage = 'card_extraction'
    and run.status = 'running'
  for update;

  if not found then
    return;
  end if;

  insert into public.business_cards (
    scan_id,
    user_id,
    name,
    company,
    department,
    title,
    email,
    phone,
    website,
    address,
    language,
    field_confidence,
    extraction_json,
    user_corrected
  ) values (
    p_scan_id,
    v_user_id,
    nullif(btrim(p_extraction ->> 'name'), ''),
    nullif(btrim(p_extraction ->> 'company'), ''),
    nullif(btrim(p_extraction ->> 'department'), ''),
    nullif(btrim(p_extraction ->> 'title'), ''),
    nullif(btrim(p_extraction ->> 'email'), ''),
    nullif(btrim(p_extraction ->> 'phone'), ''),
    nullif(btrim(p_extraction ->> 'website'), ''),
    nullif(btrim(p_extraction ->> 'address'), ''),
    btrim(p_extraction ->> 'language'),
    p_extraction -> 'field_confidence',
    p_extraction,
    false
  )
  on conflict (scan_id) do update
  set
    name = excluded.name,
    company = excluded.company,
    department = excluded.department,
    title = excluded.title,
    email = excluded.email,
    phone = excluded.phone,
    website = excluded.website,
    address = excluded.address,
    language = excluded.language,
    field_confidence = excluded.field_confidence,
    extraction_json = excluded.extraction_json,
    user_corrected = false;

  delete from public.evidence
  where user_id = v_user_id
    and scan_id = p_scan_id
    and source_type = 'business_card'
    and source_title like 'card.%';

  insert into public.evidence (
    user_id,
    scan_id,
    source_type,
    source_title,
    excerpt,
    confidence
  )
  select
    v_user_id,
    p_scan_id,
    'business_card',
    'card.' || field.name,
    nullif(btrim(p_extraction ->> field.name), ''),
    (p_extraction -> 'field_confidence' ->> field.name)::real
  from unnest(array[
    'name',
    'company',
    'department',
    'title',
    'email',
    'phone',
    'website',
    'address'
  ]) as field(name)
  where nullif(btrim(p_extraction ->> field.name), '') is not null;

  update public.scans
  set
    status = 'card_ready',
    raw_image_expires_at = now()
  where id = p_scan_id
    and user_id = v_user_id;

  update public.ai_runs
  set
    status = 'succeeded',
    latency_ms = p_latency_ms,
    error_code = null
  where id = p_run_id
    and user_id = v_user_id;

  return query
    select card.*
    from public.business_cards as card
    where card.scan_id = p_scan_id
      and card.user_id = v_user_id;
end;
$$;

create or replace function public.fail_card_extraction(
  p_scan_id uuid,
  p_run_id uuid,
  p_error_code text,
  p_terminal boolean
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := case when p_terminal then 'failed_terminal' else 'failed_retryable' end;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_error_code), '') is null then
    raise exception 'Error code is required.' using errcode = '22023';
  end if;

  update public.ai_runs
  set
    status = v_status,
    error_code = left(btrim(p_error_code), 100)
  where id = p_run_id
    and user_id = v_user_id
    and scan_id = p_scan_id
    and stage = 'card_extraction'
    and status = 'running';

  if not found then
    return false;
  end if;

  update public.scans
  set status = v_status
  where id = p_scan_id
    and user_id = v_user_id
    and status = 'extracting_card';

  return found;
end;
$$;

create or replace function public.correct_business_card(
  p_scan_id uuid,
  p_corrections jsonb
)
returns setof public.business_cards
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_confidence jsonb;
  v_field text;
  v_value text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_corrections) is distinct from 'object'
    or p_corrections = '{}'::jsonb
    or exists (
      select 1
      from jsonb_object_keys(p_corrections) as key(name)
      where key.name <> all (array[
        'name',
        'company',
        'department',
        'title',
        'email',
        'phone',
        'website',
        'address'
      ])
    ) then
    raise exception 'Invalid card corrections.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each(p_corrections) as correction(field, value)
    where jsonb_typeof(correction.value) not in ('string', 'null')
      or (
        jsonb_typeof(correction.value) = 'string'
        and nullif(btrim(correction.value #>> '{}'), '') is null
      )
  ) then
    raise exception 'Invalid card correction value.' using errcode = '22023';
  end if;

  select card.field_confidence
  into v_confidence
  from public.business_cards as card
  where card.scan_id = p_scan_id
    and card.user_id = v_user_id
  for update;

  if not found then
    return;
  end if;

  for v_field, v_value in
    select
      correction.field,
      case
        when jsonb_typeof(correction.value) = 'null' then null
        else btrim(correction.value #>> '{}')
      end
    from jsonb_each(p_corrections) as correction(field, value)
  loop
    v_confidence := jsonb_set(
      v_confidence,
      array[v_field],
      to_jsonb(case when v_value is null then 0 else 1 end),
      false
    );

    insert into public.evidence (
      user_id,
      scan_id,
      source_type,
      source_title,
      excerpt,
      confidence
    ) values (
      v_user_id,
      p_scan_id,
      'user_correction',
      'card.' || v_field,
      coalesce(v_value, '[cleared]'),
      1
    );
  end loop;

  update public.business_cards
  set
    name = case when p_corrections ? 'name'
      then nullif(btrim(p_corrections ->> 'name'), '') else name end,
    company = case when p_corrections ? 'company'
      then nullif(btrim(p_corrections ->> 'company'), '') else company end,
    department = case when p_corrections ? 'department'
      then nullif(btrim(p_corrections ->> 'department'), '') else department end,
    title = case when p_corrections ? 'title'
      then nullif(btrim(p_corrections ->> 'title'), '') else title end,
    email = case when p_corrections ? 'email'
      then nullif(btrim(p_corrections ->> 'email'), '') else email end,
    phone = case when p_corrections ? 'phone'
      then nullif(btrim(p_corrections ->> 'phone'), '') else phone end,
    website = case when p_corrections ? 'website'
      then nullif(btrim(p_corrections ->> 'website'), '') else website end,
    address = case when p_corrections ? 'address'
      then nullif(btrim(p_corrections ->> 'address'), '') else address end,
    field_confidence = v_confidence,
    user_corrected = true
  where scan_id = p_scan_id
    and user_id = v_user_id;

  return query
    select card.*
    from public.business_cards as card
    where card.scan_id = p_scan_id
      and card.user_id = v_user_id;
end;
$$;

revoke all on function public.claim_card_extraction(uuid, text, text)
  from public, anon;
revoke all on function public.persist_card_extraction(uuid, uuid, jsonb, integer)
  from public, anon;
revoke all on function public.fail_card_extraction(uuid, uuid, text, boolean)
  from public, anon;
revoke all on function public.correct_business_card(uuid, jsonb)
  from public, anon;

grant execute on function public.claim_card_extraction(uuid, text, text)
  to authenticated;
grant execute on function public.persist_card_extraction(uuid, uuid, jsonb, integer)
  to authenticated;
grant execute on function public.fail_card_extraction(uuid, uuid, text, boolean)
  to authenticated;
grant execute on function public.correct_business_card(uuid, jsonb)
  to authenticated;
