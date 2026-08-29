-- ML-009: Identity Resolution
-- Links business_cards to user-scoped people and organizations records.
-- people.identity_status serves as the resolved confidence floor that
-- Flash Brief reads via business_cards.person_id.

alter table public.business_cards
  add column person_id uuid references public.people(id) on delete set null;

alter table public.business_cards
  add column organization_id uuid references public.organizations(id) on delete set null;

-- Speeds up count queries that check for prior scans of the same person.
create index idx_business_cards_person_id
  on public.business_cards(person_id)
  where person_id is not null;
