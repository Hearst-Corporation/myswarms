# Plan de purge gaté — tables `hedge_*` legacy (DB MySwarms)

> **Statut : NON APPLIQUÉ.** Action gatée — croise la fontaine HEDGE. Ne rien exécuter sans feu vert explicite d'Adrien.
> Rédigé le 2026-06-07.

## Constat

La DB MySwarms (`fxeibmjebvxtoazuyyvz`) contient **17 tables `hedge_*`** qui :

1. **Ne sont dans AUCUNE migration du repo** (0001→0027 ne contient qu'un *seed* de template hedge en 0024 — pas le DDL de ces tables). Créées hors-bande.
2. **Ne sont lues/écrites par AUCUN code MySwarms** — les 47 occurrences de `hedge_` dans `src/` sont toutes dans `src/lib/supabase/types.ts` (fichier généré automatiquement depuis la DB). Zéro référence applicative.
3. **Sont gelées depuis le 2026-05-27** (orchestration : `hedge_run_jobs`, `hedge_swarm_signals`, `hedge_strategy_requests`, `hedge_run_events`). Seul `hedge_market_snapshots` a une écriture résiduelle au 2026-06-01 (collecteur market-data encore pointé sur l'ancienne DB ?).
4. **Sont un sous-ensemble plus ancien et plus pauvre** que la DB Hedge dédiée `oblwrgtfjkqixakuunaj` (LIVE : 54 965 market_snapshots vs 4 796 ici, + tables de cognition `hedge_cognitive_feedback/outcomes` + vrai `hedge_tenants` ABSENTS ici). La vraie Hedge a déménagé.

→ **Vestige legacy d'avant le split.** Candidat à la purge pour rendre la DB MySwarms = control-plane propre.

## Les 17 tables concernées

```
hedge_audit_log               hedge_orderbook_snapshots      hedge_run_jobs
hedge_exec_orders_outbox      hedge_portfolio_snapshots      hedge_strategy_requests
hedge_execution_alerts        hedge_position_reconciliations hedge_strategy_specs
hedge_execution_reports       hedge_risk_decisions           hedge_swarm_signals
hedge_kill_switches           hedge_run_events               hedge_tenant_risk_profiles
hedge_market_events           hedge_market_snapshots
```

> `vehicle_decisions` **N'EST PAS** dans ce plan : contrairement à ce qu'avait suggéré l'audit cleanup, elle est utilisée en vrai par `src/lib/automobile/decisions.ts` (le store de décisions du module Automobile natif). **On n'y touche pas.**

## Pré-requis AVANT tout DROP (obligatoires)

1. **Stopper l'écriture résiduelle** sur `hedge_market_snapshots` : identifier le process/collecteur qui écrit encore (probablement côté projet HEDGE ou un cron market-data) et le repointer sur `oblwrgtfjkqixakuunaj`, sinon il recréera/réalimentera.
2. **Backup horodaté** des 17 tables (précaution même si superset existe dans la DB Hedge) — via SQL editor Supabase :
   - soit `pg_dump` ciblé (`--table 'public.hedge_*'`) depuis le dashboard,
   - soit export JSON par table (`select json_agg(t) from public.hedge_xxx t`).
3. **Vérifier l'absence de FK entrantes** depuis des tables non-hedge :
   ```sql
   select conrelid::regclass as from_table, confrelid::regclass as to_table, conname
   from pg_constraint
   where contype='f' and confrelid::regclass::text like 'public.hedge_%'
     and conrelid::regclass::text not like 'public.hedge_%';
   -- attendu : 0 ligne (les FK hedge ne pointent qu'entre tables hedge)
   ```
4. **Confirmer 0 référence applicative** (re-grep `hedge_` hors `types.ts`) — déjà vérifié 2026-06-07, à re-confirmer au moment T.

## SQL de purge (PRÊT — NE PAS EXÉCUTER sans feu vert)

À appliquer en migration `0028_drop_legacy_hedge_tables.sql` UNE FOIS les pré-requis validés.
`cascade` gère les FK inter-hedge ; l'ordre n'a donc pas d'importance.

```sql
-- 0028 — Drop des 17 tables hedge_* legacy (orphelines, hors migrations, gelées 2026-05-27).
-- La vraie Hedge vit dans oblwrgtfjkqixakuunaj. Backup effectué le <DATE>.
drop table if exists public.hedge_exec_orders_outbox        cascade;
drop table if exists public.hedge_execution_reports         cascade;
drop table if exists public.hedge_execution_alerts          cascade;
drop table if exists public.hedge_risk_decisions            cascade;
drop table if exists public.hedge_strategy_specs            cascade;
drop table if exists public.hedge_strategy_requests         cascade;
drop table if exists public.hedge_swarm_signals             cascade;
drop table if exists public.hedge_run_events                cascade;
drop table if exists public.hedge_run_jobs                  cascade;
drop table if exists public.hedge_kill_switches             cascade;
drop table if exists public.hedge_position_reconciliations  cascade;
drop table if exists public.hedge_portfolio_snapshots       cascade;
drop table if exists public.hedge_orderbook_snapshots       cascade;
drop table if exists public.hedge_market_snapshots          cascade;
drop table if exists public.hedge_market_events             cascade;
drop table if exists public.hedge_tenant_risk_profiles      cascade;
drop table if exists public.hedge_audit_log                 cascade;
```

## Post-purge

1. `mcp__supabase__generate_typescript_types` → régénérer `src/lib/supabase/types.ts` (les `hedge_*` disparaissent).
2. `tsc --noEmit` + `eslint` → vérifier que rien ne casse (attendu : OK, zéro réf applicative).
3. `mcp__supabase__get_advisors security` → confirmer 0 lint.
4. Enregistrer Hedge proprement comme tenant externe : il l'est déjà dans `tenants` (`hedge` → `oblwrgtfjkqixakuunaj`). La DB MySwarms ne porte plus aucune donnée hedge.

## Rollback

Restaurer depuis le backup de l'étape 2. Les `cascade` n'affectent que des objets `hedge_*` (vérifié pré-requis #3), donc le blast radius est confiné à la fontaine HEDGE.
