-- match_personal_context_items
-- Selects the Personal Context worth sending for one specific person.
--
-- Product spec 5.4 is explicit that the full profile must not go to every
-- call: the Flash Brief should see the five to ten items that actually relate
-- to the person on the card. The embedding column has existed since ML-002
-- and nothing ever wrote or read it, so every call carried every approved
-- item and the model had to find the overlap itself.
--
-- Offers are returned whatever the query says, because "what I can offer" is
-- half of the mutual value the product exists to find, and an offer that never
-- reaches the prompt cannot be proposed. They come first, then the nearest
-- items by cosine distance.
create or replace function public.match_personal_context_items(
  p_embedding extensions.vector,
  p_limit     integer default 7,
  p_offer_limit integer default 3
)
returns table (item_type text, item_text text, item_tags text[])
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

  if p_limit < 1 or p_limit > 20 or p_offer_limit < 0 or p_offer_limit > 10 then
    raise exception 'limits are out of range.' using errcode = '22023';
  end if;

  return query
  with approved as (
    select i.type, i.text, i.tags, i.embedding
    from public.personal_context_items i
    where i.user_id = v_user_id
      and i.user_approved
  ),
  offers as (
    select a.type, a.text, a.tags, 0 as group_rank, 0::double precision as distance
    from approved a
    where a.type = 'offer'
    order by a.text
    limit p_offer_limit
  ),
  nearest as (
    select
      a.type,
      a.text,
      a.tags,
      1 as group_rank,
      (a.embedding operator(extensions.<=>) p_embedding)::double precision as distance
    from approved a
    where a.embedding is not null
      and a.type <> 'offer'
    order by a.embedding operator(extensions.<=>) p_embedding
    limit p_limit
  ),
  selected as (
    select * from offers
    union all
    select * from nearest
  )
  select s.type, s.text, s.tags
  from selected s
  order by s.group_rank, s.distance, s.text;
end;
$$;

revoke execute on function public.match_personal_context_items from public, anon;
grant  execute on function public.match_personal_context_items to   authenticated;

-- No ANN index. The column has no declared dimension, which an index requires,
-- and a user's approved context is tens of rows: a sequential scan over them
-- costs less than the index would. Revisit if a profile ever grows past a few
-- hundred items.
