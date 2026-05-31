# Week 1 Stability — Quick Wins Status

> Audit 2026-06-01 — maturité 7/10

## 1. Observabilité LLM

**État** : Langfuse v3 auto-instrumentation câblé via OpenTelemetry (`init_observability()` au boot).
Traces visibles dans Langfuse cloud pour chaque kickoff.

**Coût Kimi/Hypercli** : non disponible — le provider ne retourne pas de pricing via LiteLLM.
`total_cost_usd` reste `0.0` en DB. L'UI affiche `—` quand tokens > 0 et coût = 0.
Règle documentée : no-magic-number — on n'invente pas de prix.
**Action requise V2** : surveiller si Hypercli expose pricing dans les réponses LiteLLM.

## 2. CI Python engine

**État** : ajouté dans `.github/workflows/ci.yml` — job `engine` séparé.
- `ruff check src/` + `ruff format --check src/`
- `pytest tests/ -q --ignore=test_vault_search.py --ignore=test_composio_session.py`
- Env minimal : seul `CREWAI_ENGINE_AUTH_TOKEN` requis (stub 32 chars).
- Supabase/LLM absents → tests mockent via `patch.object`.

## 3. Runs orphelins

**État** : **déjà implémenté**. Deux niveaux :
- Boot : `cleanup_stale_runs(STALE_RUN_MAX_AGE_MINUTES)` dans `lifespan()` de `main.py`.
- Périodique : APScheduler job `stale-run-cleanup` toutes les N minutes.
- Marque les rows `status='running'` trop anciennes en `failed` avec `error_text='Run abandoned — no heartbeat (stale cleanup)'`.
**Pas d'action requise.**

## 4. Event loop

**État** : les routes FastAPI impactées (`GET /v1/swarms`, `GET /v1/runs`) sont des handlers sync (`def`, pas `async def`). FastAPI exécute les fonctions sync dans un thread pool — pas de blocage de l'event loop.
Le seul appel async réel (`_execute_dynamic_flow_background`) est déjà wrappé dans `asyncio.to_thread()`.
**Pas d'action requise.**

## 5. UI model picker

**État** : corrigé. `LLMPicker.tsx` affiche maintenant :
- Notice "Provider enforced at runtime : Hypercli · Kimi K2.6"
- Provider list : `openai (→ Hypercli)` / `hypercli` / `kimi (legacy)` / `anthropic (legacy)`
- Modèles : uniquement les modèles Hypercli/Kimi (plus Claude ni GPT)
- `DEFAULT_AGENT` dans `SwarmAgentForm.tsx` : `openai / kimi-k2.6`

## 6. DEV_BYPASS_AUTH

**État** :
- `.env.local` est gitignored — jamais commité.
- Warning console ajouté dans `src/lib/auth/owner.ts` quand bypass actif.
- Fail-closed : `NODE_ENV === 'production'` empêche le bypass en prod.
- Pas d'action code supplémentaire nécessaire.

## Sujets hors scope Week 1

- Multi-tenant réel (org_id, organizations table) → chantier XL, phase future
- Temporal/queue pour event loop → chantier V2
- Parts Search APM → non démarré
- Electron hardening → confirmé déjà durci
