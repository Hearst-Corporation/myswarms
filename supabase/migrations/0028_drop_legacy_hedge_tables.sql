-- =====================================================================
-- 0028 — Drop des 17 tables hedge_* legacy (DB MySwarms)
-- =====================================================================
-- WHY: vestige d'avant le split. Ces tables ne sont dans AUCUNE migration
-- du repo, ne sont lues/écrites par AUCUN code MySwarms (0 réf hors types.ts
-- généré), et sont gelées depuis 2026-05-27. La vraie Hedge vit dans la DB
-- dédiée oblwrgtfjkqixakuunaj (superset LIVE : 54 965 market_snapshots,
-- tables de cognition, hedge_tenants) — qui sert de filet de rollback.
-- FK check (2026-06-07) : 0 FK entrante depuis une table non-hedge → CASCADE
-- confiné à la fontaine HEDGE.
--
-- Row-counts MySwarms avant DROP (2026-06-07) :
--   orderbook_snapshots 6372 · market_snapshots 4796 · market_events 4277
--   position_reconciliations 309 · run_events 55 · swarm_signals 40
--   strategy_requests 12 · run_jobs 10 · strategy_specs 8 · risk_decisions 4
--   portfolio_snapshots 3 · kill_switches 2 · exec_orders_outbox 1
--   execution_reports 1 · tenant_risk_profiles 1 · audit_log 0 · execution_alerts 0
--
-- NB: vehicle_decisions N'EST PAS concernée (utilisée par le module Automobile
-- natif, src/lib/automobile/decisions.ts).
-- =====================================================================

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
