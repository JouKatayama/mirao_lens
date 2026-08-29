alter table public.personal_context_items
  add constraint personal_context_items_type_check
  check (
    type in (
      'past_experience',
      'expertise',
      'strong_skill',
      'current_theme',
      'offer',
      'seeking',
      'free_text'
    )
  );

alter table public.personal_context_items
  add column onboarding_request_id uuid,
  add column onboarding_position integer
    check (onboarding_position is null or onboarding_position >= 0);

create unique index personal_context_items_onboarding_request_position_key
  on public.personal_context_items (
    user_id,
    onboarding_request_id,
    onboarding_position
  )
  where onboarding_request_id is not null;

create or replace function public.persist_personal_context_onboarding(
  p_request_id uuid,
  p_current_company text,
  p_current_role text,
  p_suggestions jsonb
)
returns setof public.personal_context_items
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

  if p_request_id is null then
    raise exception 'An onboarding request ID is required.' using errcode = '22023';
  end if;

  if nullif(btrim(p_current_role), '') is null then
    raise exception 'Current role is required.' using errcode = '23514';
  end if;

  if jsonb_typeof(p_suggestions) is distinct from 'array'
    or jsonb_array_length(p_suggestions) = 0 then
    raise exception 'At least one suggestion is required.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.personal_context_items
    where user_id = v_user_id
      and onboarding_request_id = p_request_id
  ) then
    return query
      select item.*
      from public.personal_context_items as item
      where item.user_id = v_user_id
        and item.onboarding_request_id = p_request_id
      order by item.onboarding_position;
    return;
  end if;

  insert into public.profiles (user_id, current_company, "current_role")
  values (
    v_user_id,
    nullif(btrim(p_current_company), ''),
    btrim(p_current_role)
  )
  on conflict (user_id) do update
  set
    current_company = excluded.current_company,
    "current_role" = excluded."current_role";

  insert into public.personal_context_items (
    user_id,
    type,
    text,
    tags,
    source_type,
    user_approved,
    onboarding_request_id,
    onboarding_position
  )
  select
    v_user_id,
    suggestion.value ->> 'type',
    btrim(suggestion.value ->> 'text'),
    coalesce(
      array(
        select jsonb_array_elements_text(
          case
            when jsonb_typeof(suggestion.value -> 'tags') = 'array'
              then suggestion.value -> 'tags'
            else '[]'::jsonb
          end
        )
      ),
      '{}'::text[]
    ),
    'ai_suggested',
    false,
    p_request_id,
    suggestion.position - 1
  from jsonb_array_elements(p_suggestions)
    with ordinality as suggestion(value, position);

  return query
    select item.*
    from public.personal_context_items as item
    where item.user_id = v_user_id
      and item.onboarding_request_id = p_request_id
    order by item.onboarding_position;
end;
$$;

revoke all on function public.persist_personal_context_onboarding(
  uuid,
  text,
  text,
  jsonb
) from public, anon;

grant execute on function public.persist_personal_context_onboarding(
  uuid,
  text,
  text,
  jsonb
) to authenticated;
