-- 0035_drop_llm_cost_columns.sql
--
-- Supprime définitivement les colonnes de coût LLM (total_cost_usd / cost_usd).
-- Le pricing Hypercli/Kimi n'est pas publié ; ces colonnes sont restées à 0
-- partout (jamais calculées, règle no-magic-number). On retire le concept de
-- coût en monnaie du modèle de données — seuls les tokens (total_tokens_in/out,
-- tokens_in/out) sont conservés comme métrique d'usage.
--
-- Irréversible : DROP COLUMN. Aucune perte de donnée signifiante (valeurs = 0).
-- Tables concernées : crew_runs, crew_run_steps (0002), swarm_runs,
-- swarm_run_steps (0006), chief_run_steps (0014).

ALTER TABLE crew_runs        DROP COLUMN IF EXISTS total_cost_usd;
ALTER TABLE crew_run_steps   DROP COLUMN IF EXISTS cost_usd;
ALTER TABLE swarm_runs       DROP COLUMN IF EXISTS total_cost_usd;
ALTER TABLE swarm_run_steps  DROP COLUMN IF EXISTS cost_usd;
ALTER TABLE chief_run_steps  DROP COLUMN IF EXISTS cost_usd;
