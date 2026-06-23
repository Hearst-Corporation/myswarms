-- 0034_backfill_swarm_runs_owner_id.sql
--
-- R1 (IDOR cross-tenant sur les runs) — étape A : backfill.
--
-- Contexte : la colonne `swarm_runs.owner_id` a été ajoutée par 0033 mais n'a
-- jamais été renseignée sur les runs historiques (37/37 NULL). La lecture des
-- runs retombait alors sur un fallback `is_template` qui exposait les runs de
-- templates globaux à n'importe quel tenant authentifié.
--
-- Cette migration renseigne `swarm_runs.owner_id` à partir de l'owner du swarm
-- parent, UNIQUEMENT pour les runs legacy (owner_id NULL) dont le swarm a un
-- owner connu. C'est une assignation déterministe 1:1 (swarm_id = PK).
--
-- Les runs lancés sur des templates globaux (swarm.owner_id NULL) sont
-- VOLONTAIREMENT laissés à NULL : ils n'appartiennent à aucun tenant et
-- deviennent inaccessibles via le chemin de lecture owner-scopé (le code
-- supprime le fallback is_template). Ils restent atteignables uniquement en
-- service_role / SQL direct (admin). On NE force PAS de contrainte NOT NULL
-- (cela casserait ces runs historiques + les runs système sans owner).
--
-- Idempotente : un second passage ne matche plus aucune ligne (les runs
-- rattachables ont déjà un owner_id). Ne touche jamais au contenu des runs.

UPDATE public.swarm_runs AS r
SET owner_id = s.owner_id
FROM public.swarms AS s
WHERE s.id = r.swarm_id
  AND r.owner_id IS NULL
  AND s.owner_id IS NOT NULL;
