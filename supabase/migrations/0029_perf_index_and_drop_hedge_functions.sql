-- =====================================================================
-- 0029 — Perf : index composite hot-path + drop fonctions hedge orphelines
-- =====================================================================
-- (audit perf 2026-06-07)

-- 1. Index composite sur le hot path last_run (swarm_store.list_swarms +
--    activity/live toutes les 3s) : WHERE swarm_id=? ORDER BY started_at DESC.
--    L'index mono-colonne swarm_runs_swarm_id_idx forçait un sort à chaque
--    requête. Le composite couvre filtre + tri en un seul index ordonné.
create index if not exists swarm_runs_swarm_started_idx
  on public.swarm_runs (swarm_id, started_at desc);

-- 2. Drop des 7 fonctions hedge_* orphelines (leurs tables ont été droppées en
--    0028 ; 0 référence applicative). Inclut les trigger-functions *_touch /
--    block_mutation des tables disparues.
drop function if exists public.hedge_block_mutation()                       cascade;
drop function if exists public.hedge_canonical_json(payload jsonb)          cascade;
drop function if exists public.hedge_chain_hash(prev_hash text, payload jsonb) cascade;
drop function if exists public.hedge_current_tenant_id()                    cascade;
drop function if exists public.hedge_exec_outbox_touch()                    cascade;
drop function if exists public.hedge_is_blocked(p_tenant uuid, p_venue text) cascade;
drop function if exists public.hedge_run_jobs_touch()                       cascade;
