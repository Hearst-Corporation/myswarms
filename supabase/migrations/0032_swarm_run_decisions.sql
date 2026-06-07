-- 0032_swarm_run_decisions.sql
--
-- Human-in-the-loop (HITL) — « moments de décision » pendant un run de swarm.
-- Un agent peut s'arrêter pour demander un CHOIX de direction à l'humain ; le run
-- passe `paused_hitl` (valeur déjà présente dans l'enum crew_run_status, migration
-- 0002 — jusqu'ici code mort), la décision en attente est persistée ici, et au
-- resume la réponse rejoint state.inputs._hitl_answers.
--
-- Mécanisme moteur : exécution task-par-task au niveau Flow ; un point de décision
-- = une frontière de task. `ordinal` = index de la task qui pose la décision
-- (positionnel, déterministe — JAMAIS un hash de contenu) → la mémoïsation au resume
-- matche de façon fiable. `decision_id` = jeton opaque "dec_xxx" exposé à l'app et
-- mappé 1-1 sur (run_id, ordinal).
--
-- RLS : table interne moteur, écrite via service_role (même pattern que
-- chief_decisions / chief_run_steps, migration 0014).

create table if not exists public.swarm_run_decisions (
  run_id       uuid not null references public.swarm_runs(id) on delete cascade,
  ordinal      int  not null,                       -- index de task = decision_id déterministe
  decision_id  text not null,                       -- "dec_xxx" opaque exposé à l'app
  payload      jsonb not null,                      -- {question, hint?, options:[{value,label,sub?}]}
  answer       jsonb,                               -- {value} une fois tranché
  resolved_at  timestamptz,
  expires_at   timestamptz,                         -- TTL optionnel
  created_at   timestamptz not null default now(),
  primary key (run_id, ordinal),
  constraint swarm_run_decisions_decision_id_unique unique (decision_id)
);

create index if not exists swarm_run_decisions_run_idx
  on public.swarm_run_decisions(run_id);
-- Décision active = la plus récente non résolue d'un run.
create index if not exists swarm_run_decisions_active_idx
  on public.swarm_run_decisions(run_id, created_at desc)
  where resolved_at is null;

alter table public.swarm_run_decisions enable row level security;

-- Policy service_role via DO block (compatibilité PG < 15, cohérent avec 0014).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'swarm_run_decisions'
      and policyname = 'service_role full access swarm decisions'
  ) then
    execute $p$
      create policy "service_role full access swarm decisions"
        on public.swarm_run_decisions for all
        to service_role using (true) with check (true)
    $p$;
  end if;
end$$;

-- ── Colonnes de checkpoint / convergence sur swarm_runs ──────────────────────
-- checkpoint_index : index de la prochaine task à exécuter (reprise sans rejouer
--                    les tasks antérieures — leurs outputs vivent dans
--                    inputs_json._task_outputs).
-- resume_count     : nb de reprises HITL (borne anti-non-convergence).
-- paused_at        : horodatage de mise en pause (TTL cleanup des runs zombies).
alter table public.swarm_runs
  add column if not exists checkpoint_index int not null default 0;
alter table public.swarm_runs
  add column if not exists resume_count int not null default 0;
alter table public.swarm_runs
  add column if not exists paused_at timestamptz;
