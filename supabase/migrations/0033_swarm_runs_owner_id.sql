-- R07 — IDOR fix: ajoute owner_id sur swarm_runs pour un scoping direct
-- (sans JOIN swarms) dans get_swarm_run. Évite qu'un tenant puisse résoudre
-- la décision HITL du run d'un autre tenant lancé sur un template global.
--
-- owner_id NULL = run créé avant cette migration (legacy) — le fallback
-- via swarm parent reste actif pour ces rows (cf swarm_store.get_swarm_run).

alter table public.swarm_runs
  add column if not exists owner_id uuid;

create index if not exists swarm_runs_owner_idx
  on public.swarm_runs (owner_id);
