-- 0025_vehicle_decisions.sql
--
-- Statut de décision humaine sur une analyse véhicule (run Automobile).
-- Ferme la boucle produit : de l'annonce -> rapport -> DÉCISION tracée.
-- Une décision par (owner, run). Statut humain simple, pas un CRM.
--
-- Statuts : a_decider (défaut) | appeler | ignorer | appele | negociation | achete | perdu
-- RLS owner-scoped (le BFF écrit via service_role + owner_id explicite, cohérent
-- avec le reste de l'environnement Automobile ; la policy protège l'accès direct).

create table if not exists public.vehicle_decisions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  run_id      uuid not null references public.swarm_runs(id) on delete cascade,
  status      text not null default 'a_decider'
    check (status in ('a_decider','appeler','ignorer','appele','negociation','achete','perdu')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint vehicle_decisions_owner_run_unique unique (owner_id, run_id)
);

create index if not exists vehicle_decisions_owner_idx on public.vehicle_decisions(owner_id);
create index if not exists vehicle_decisions_run_idx   on public.vehicle_decisions(run_id);

alter table public.vehicle_decisions enable row level security;

drop policy if exists "vehicle_decisions_owner_all" on public.vehicle_decisions;
create policy "vehicle_decisions_owner_all"
  on public.vehicle_decisions
  for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop trigger if exists vehicle_decisions_set_updated_at on public.vehicle_decisions;
create trigger vehicle_decisions_set_updated_at
  before update on public.vehicle_decisions
  for each row execute function public.set_updated_at();
