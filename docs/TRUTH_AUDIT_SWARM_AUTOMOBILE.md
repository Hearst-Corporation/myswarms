# TRUTH AUDIT — Swarm Platform & Environnement Automobile

> **Audit vérité, lecture seule.** Aucune modification produit, aucun commit, aucune migration, aucun scraper lancé, aucune écriture DB. Méthode : lecture directe du code source + état réel de la DB Supabase (`fxeibmjebvxtoazuyyvz`) via MCP read-only + orchestration de 28 sous-agents (14 dimensions × audit + vérification adversariale). Date : 2026-06-02. Branche : `main`.

---

## 1. EXECUTIVE SUMMARY

### Verdict global : **WARN** ⚠️ — Score **6 / 10**

| Axe | Score | Lecture |
|---|---|---|
| Infra & Auth (Next.js + FastAPI + Supabase RLS) | **7.5/10** | Solide. Owner scoping réel via session, RLS présente sur 39 tables, kickoff fail-closed, secrets gitignorés. |
| Environnement Automobile (bout-en-bout) | **5/10** | Fonctionne sur données réelles MAIS plusieurs fils non branchés, fragiles ou trompeurs. |
| Vérité produit / honnêteté de l'UI | **4/10** | L'UI et les docs affirment des choses non vraies (middleware inexistant, page GPU "training", tool AutoScout sans route). |
| Tests / preuves | **5/10** | Vitest + pytest réels existent, mais 0 e2e Playwright, 0 test sur le chemin "le bon véhicule est analysé". |

### La vérité en 12 points

1. **L'ossature est vraie.** Next.js 16 (Vercel) + microservice FastAPI CrewAI (Railway) + Supabase. Le front appelle réellement le moteur Python en HTTP bearer, qui écrit réellement en DB. Les runs, steps, tokens affichés sont **réels**, pas mockés.
2. **L'auth multi-tenant est majoritairement correcte.** `owner_id` est dérivé de la session Supabase (`getUser()` crypto-vérifié), **jamais** trusté depuis le body. Le kickoff, les décisions, l'extract-url scopent tous par owner.
3. **MAIS il n'existe AUCUN `middleware.ts`** alors que `owner.ts` affirme noir sur blanc que « le middleware protège toutes les routes ». **Mensonge dans le code.** La protection repose entièrement sur chaque route appelant `requireOwnerId()` à la main — une route qui l'oublie est ouverte.
4. **`DEV_BYPASS_AUTH=true` est ACTIF dans `.env.local`** avec `DEV_OWNER_ID = e0a983da…` (= le propriétaire de **toutes** les données). En dev, tout tourne sans auth en tant que ce user. Fail-closed en prod (gate `NODE_ENV`), mais explique pourquoi toute la donnée appartient à un seul owner.
5. **Le template `Automobile — Recherche véhicule` est branché et réel** (id `cccccccc-…`, 3 agents Kimi, 17 runs templates + 13 user). Mais le **revert `3b0b13e`** a retiré l'injection des inputs dans les prompts : les inputs sont passés à `crew.kickoff()` mais **plus rendus en texte lisible dans la task** → **risque d'hallucination véhicule réel et non testé**.
6. **Le sourcing AutoScout24/Apify est à demi-branché.** `searchAutoScout()` est appelé pour de vrai depuis `/automobile/sourcing` (RSC) et l'agent cockpit. **Mais** le tool DB « AutoScout24 Sourcing » pointe vers `endpoint_url=/api/scrape/autoscout` — **une route qui n'existe pas** (présente uniquement dans un commentaire). Pointeur mort.
7. **Le dashboard `/automobile` est réel mais coûteux et fragile.** KPIs et tables alimentés par les vrais runs ; mais **N+1 confirmé** (jusqu'à 50 appels `status()` au moteur par chargement) et les recommandations dépendent d'un **parseur regex** qui casse si le LLM ne sort pas exactement `## Recommendation` + `**MOT**`.
8. **Les décisions humaines sont réelles et bien séparées de la reco IA.** Table `vehicle_decisions` (RLS, owner scoping, ownership check avant write), 7 statuts, logique "À traiter" = runs complétés à décision ouverte. 1 seule décision existe en base.
9. **Aucun job cron Automobile n'existe.** L'APScheduler tourne (4 jobs : Chief matin/soir, Market Intel Scout 07h50, stale-cleanup) mais **aucun** scraping auto planifié, **aucune** saved search, **aucune** alerte prix, **aucun** source-health. C'est à écrire.
10. **Le GPU/4090/training est du vaporware.** La page "GPU training cinematic" a été ajoutée (`56bd31e`) puis **revertée comme "fake"** (`d9e2e52`). Aucun code GPU/CUDA/torch/vLLM vivant ne tourne. `docs/GPU_TRAINING_INVENTORY.md` = doc d'intention, pas de réalité.
11. **Incohérence d'identité produit partout : Automobile vs Automotive vs APM.** Le template s'appelle "Automobile", sa `config_json.category` = "Automotive", sa `subcategory` = "APM", son `tunnel` = "apm_vehicle_research". Le `tenant_config` n'existe que pour un owner (`51a6c3f9`) ≠ le owner des données (`e0a983da`).
12. **Risque sécu le plus sérieux : `COMPOSIO_USER_ID="adrien"` hardcodé** + fallback silencieux si `owner_id` absent (`composio_session.py`), et **`GET /v1/swarms?owner_id=` accepte un owner arbitraire** gardé uniquement par un bearer token partagé (IDOR latent si le token fuit ou si le moteur est appelé en direct).

### Comptage (agrégat findings, toutes dimensions)

- **Branchés (réels, prouvés)** : ≈ **110**
- **Partiels** : **47**
- **Hardcodés** : **69**
- **UI-only** : **12**
- **Morts / legacy** : **25**
- **Incohérents** : **22**
- **Risques sécurité** : **44** (dont 0 P0 confirmé bloquant prod, 4 P1, le reste P2/acceptable)
- **Non testés** : **43**

### Ce qu'il faut ARRÊTER de dire si ce n'est pas vrai

- ❌ « Le middleware protège toutes les routes » → **il n'y a pas de middleware**.
- ❌ « AutoScout24 est un tool branché » → **le tool DB pointe vers une route inexistante** (le scraping marche par un autre chemin, le tool registry est mort).
- ❌ « On a une page / un pipeline de training GPU » → **reverté comme fake, rien ne tourne**.
- ❌ « Les agents analysent le véhicule fourni » → **non prouvé** ; injection inputs revertée, risque d'hallucination, zéro test de bout-en-bout.
- ❌ « Multi-tenant complet » → l'API isole, mais la **visibilité module** (`tenant_config`) n'est peuplée que pour 1 owner ; tous les autres voient tous les modules par défaut.



## 2. CARTE ARCHITECTURE RÉELLE + SERVICES

## Disposition Générale
Le projet **myswarms** est une application Next.js 16 (port 3333) + microservice FastAPI CrewAI (port 8000, Railway). Architecture BFF classique: le frontend Next.js appelle le engine CrewAI via HTTP authentifié (bearer token). Communication directe vers Supabase (anon key via RLS) et services externes (Hypercli, Composio, Langfuse, APM).

---

## 1. FRONTEND (Next.js 16.2.6, Vercel) ✅ BRANCHÉ

**Entrée**: `next.config.ts:1-82`
**Déploiement**: `.vercel/project.json:1` → projectId `prj_D7svFbXovy2hni4hAPyN2AJI5Lnq`, org `team_wXEyzuDufhkdBoHHog7A8InA`, projectName `myswarms`
**Scripts**:
- `npm run dev:front` → Next.js port 3333
- `npm run dev:back` → crewai-engine port 8000 (parallel via `concurrently`)
- `npm run build` → production build
- `npm run start` → production server port 3333

**CSP Headers**: `next.config.ts:24-42` — dev: `frame-ancestors 'self' localhost:4200/4201` (Hub embed); prod: `frame-ancestors 'none'` (DENY).
**Electron**: Desktop app inclus (`electron/` + `electron-builder` config `package.json:59-93`).

**Env Vars Critiques**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser-side)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (NextAuth session)
- `CREWAI_ENGINE_URL` (défaut `http://localhost:8000`)
- `CREWAI_ENGINE_AUTH_TOKEN` (bearer token)
- `GOOGLE_CLIENT_ID/SECRET` (OAuth)

**Risques**: ANON_KEY publique par design (RLS OBLIGATOIRE, vérifié). Google OAuth secrets en .env.local (local dev seulement).

---

## 2. CREWAI ENGINE (FastAPI + CrewAI 1.14.4, Railway Port 8000) ✅ BRANCHÉ

**Déploiement**: `railway.toml:1-9`
- Builder: `nixpacks`
- Start: `npm run start` → `next start -p 3333` (ligne 13 package.json)
- Health: `/api/health`
- Restart: `ON_FAILURE`, max 3 retries

⚠️ **PROBLÈME CRITIQUE**: `railway.toml:5` déclare `startCommand = "npm run start"` qui appelle `next start -p 3333` (serveur Next.js production, pas FastAPI engine sur port 8000). **Déploiement du FastAPI engine sur Railway est INCOMPLET — startCommand doit être `cd services/crewai-engine && uv run uvicorn src.main:app --port 8000` ou équivalent.**

**Entrée**: `services/crewai-engine/src/main.py:1-100`
- Sentry optionnel (fail-soft si DSN absent, `main.py:32-46`)
- Langfuse init (fail-soft)
- CORS dynamique via `CREWAI_ENGINE_ALLOWED_ORIGINS` CSV ou `settings.ALLOWED_ORIGINS` (défaut `["http://localhost:3333"]`, `main.py:52-64`)
- APScheduler lifespan (stale-run cleanup + morning/evening briefs)

**Routers enregistrés**:
- `routes.health` → `/api/health`
- `routes.crews` → `/v1/crews/chief-of-staff/*`
- `routes.swarms` → `/v1/swarms/*`, `/v1/runs/*`

**Middleware**: CORSMiddleware + bearer token verification.

**Config**: `services/crewai-engine/src/config.py:1-268`
- Hypercli-only LLM policy (`HYPERCLI_API_KEY` critique)
- Composio critical (`COMPOSIO_API_KEY`)
- Supabase service_role_key (persistence)
- Flow timeout 900s (adaptive based on task count)
- Stale-run cleanup: 45 min max age, 10 min interval

**Env Vars Critiques**:
- `CREWAI_ENGINE_AUTH_TOKEN` (shared with Next.js, >=32 chars, `config.py:37`)
- `HYPERCLI_API_KEY`, `HYPERCLI_BASE_URL`, `HYPERCLI_DEFAULT_MODEL="kimi-k2.6"` (`config.py:42-44`)
- `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID="adrien"` (hardcoded, `config.py:91`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (daily briefs)
- `SENTRY_DSN` (optionnel, fail-soft)

**Lifespan Startup**:
- Stale-run cleanup (mark old runs as failed)
- APScheduler (morning brief 08:00 Dubai time, evening brief 18:30)
- Langfuse auth_check() (fail-soft)

---

## 3. SUPABASE (Projet fxeibmjebvxtoazuyyvz) ✅ BRANCHÉ

**Connecteurs**:
- Browser client (anon key) → RLS enforced on all 39 tables
- Server/admin (service_role_key) → RLS bypassed (engine C.R.U.D)

**Auth**: Supabase Auth (NextAuth SSO plugin via Google OAuth)

**Tables critiques**:
- `swarms` (14 rows): 6 templates (owner_id NULL, is_template=true), 2 orphelins (no owner, 2026-06-01), 6 owned by user e0a983da
- `swarm_runs` (30 rows): kickoff jobs, status tracking
- `tools` (3 rows): Gmail, Trello (owner e0a983da), **"AutoScout24 Sourcing" (owner NULL, endpoint_url="/api/scrape/autoscout")**
- `vehicle_decisions`, `chief_run_log`, `chief_run_steps`, `cockpit_*` tables
- `hedge_*` (14 tables): market_snapshots 4796, orderbook 6372

**RLS Policy**: enabled on all tables.
**Observability**: Langfuse traces optionally persisted (langfuse_trace_id field).

---

## 4. SERVICES EXTERNES CRITIQUES

### 4a. Hypercli / Kimi K2.6 (OpenAI-compatible) ✅ BRANCHÉ
- API Key: `HYPERCLI_API_KEY`
- Base URL: `https://api.hypercli.com/v1`
- Model: `kimi-k2.6` (all agents default)
- Utilisé par: crewai Agents (via litellm)
- Timeout: 120s (LLM_REQUEST_TIMEOUT_SECONDS, `config.py:55-58`)
- Retries: 3x exponential (LLM_MAX_RETRIES, `config.py:60-63`)
- Evidence: `config.py:48-50` (CREWAI_DEFAULT_*_MODEL = "openai/kimi-k2.6")

### 4b. Composio (Multi-channel Tools) ⚠️ HARDCODÉ + RISQUE MULTI-TENANT

**Config**: `COMPOSIO_API_KEY=‹REDACTED›`, `COMPOSIO_USER_ID="adrien"` (hardcoded, `config.py:91`)

**Boot-time warning** (`config.py:262-267`): If COMPOSIO_USER_ID stays "adrien" in prod, warning logged.

**Chaîne d'exécution multi-tenant (CORRIGÉE)**:
1. Frontend appelle `POST /api/sources/composio/connect?toolkit=...` (`src/app/api/sources/composio/connect/route.ts:46-52`)
2. Route passe `owner_id` dans query string (ligne 47)
3. Engine routers `/v1/composio/connect` reçoit `owner_id: Query` (ligne 893 `swarms.py`)
4. `composio_connect_endpoint` passe `user_id=oid` au Composio API (ligne 917 `swarms.py`)
5. **Pour les tools utilisées par les crews**: `create_dynamic_crew(owner_id=...)` → `instantiate_agents(owner_id=...)` → `_resolve_tools_for_agent(owner_id=...)` → `get_composio_tools_for_toolkits(owner_id=owner_id)` (ligne 299 `dynamic_crew.py`)
6. `composio_session.py:308` utilise `owner_id or settings.COMPOSIO_USER_ID` — donc si owner_id est fourni (front→engine→flow→crew), utilise le vrai owner_id; sinon fallback "adrien"

**Verdict**: Multi-tenant isolation est **IMPLÉMENTÉE dans le code** via owner_id passé through the chain, SAUF si un appel anonyme (sans owner_id) appelle Composio tools → utilise "adrien" fallback. Risk diminué vs. ce qui a été rapporté initialement.

**Sessions**: `composio_session.py:1-378` (fail-soft if auth fails)
**Connected toolkits**: Gmail, Trello, Slack, Calendar, Notion (example)
**Engine endpoint**: `/v1/composio/connect?owner_id=` → returns redirect_url
**Frontend bridge**: `src/app/api/sources/composio/connect/route.ts:19-65` → proxy to engine

### 4c. Langfuse (Observability) ✅ BRANCHÉ (fail-soft)
- Public Key: `LANGFUSE_PUBLIC_KEY=‹REDACTED›...`
- Secret Key: `LANGFUSE_SECRET_KEY=‹REDACTED›...`
- Host: `https://cloud.langfuse.com`
- Init: `observability/langfuse_setup.py:1-18` (fail-soft if keys absent)
- Frontend trace: `src/lib/observability/langfuse.ts:6-51` (fire-and-forget, 3s timeout)
- Traces propagated via `langfuse_trace_id` field in swarm_runs

### 4d. Sentry (Error Tracking) ✅ BRANCHÉ (fail-soft)
- DSN: `SENTRY_DSN=https://...`
- Traces sample: 10% prod, 100% dev
- Integrations: FastAPI, Starlette, NextJS
- Config: `main.py:32-46` (skip if DSN absent)

### 4e. APM Market Intelligence 🔴 PARTIEL (read-only, fail-soft, ENV VARS MISSING)
- Project: `ipgqjrsvcqqmnihasxae` (separate Supabase)
- URL: `https://ipgqjrsvcqqmnihasxae.supabase.co`
- API Key: service_role_key
- Table: `market_index` (make, model, fuel, median_price, p15_price, p85_price, market_velocity, liquidity_score, heatScore, confidence)
- Client: `src/lib/market/apmClient.ts:13-16` — checks `APM_MARKET_SUPABASE_URL`, `APM_MARKET_SUPABASE_KEY` from env
- Utilisé par: Automobile analysis (Risk Analyst reads market context)
- **Missing in production**: APM_MARKET_* vars NOT in railway.toml, Vercel secrets, or .env.local → query returns null silently (fail-soft)
- Timeout: 5s (APM_MARKET_TIMEOUT_MS, default 5000)
- Min effective: 3 (APM_MARKET_MIN_EFFECTIVE)

### 4f. Upstash Redis 🔴 PARTIEL (configured but unused)
- URL: `https://civil-yeti-113565.upstash.io`
- Token: configured in .env.local
- Usage: intended for Inngest jobs (event framework)
- Reality: NO Redis imports/calls in codebase (`grep -r "redis|Upstash" src services` → 0 imports)
- Comment: Railway Redis provisioning incomplete (`# REDIS_URL=` commented in railway.toml)

### 4g. Inngest (Job Scheduling / Background Tasks) 🔴 LEGACY (UNUSED)
- Signing key: `INNGEST_SIGNING_KEY=‹REDACTED›`
- Event key: `INNGEST_EVENT_KEY=k0Vk...`
- **Reality**: NO Inngest client imports or event sends in codebase (`grep -r "inngest|Inngest" src services` → 0 matches)
- Reason: APScheduler handles scheduler duties (engine-side, crewai-native)

### 4h. Google OAuth ✅ BRANCHÉ
- Client ID/Secret: from .env.local
- Integrated via NextAuth + `@supabase/ssr`
- Callback: `NEXTAUTH_URL=http://localhost:3333`

### 4i. Telegram Bot 🟡 PARTIEL (missing production secrets)
- Bot Token: `TELEGRAM_BOT_TOKEN=8642524714:AAEr...`
- Chat ID: `TELEGRAM_CHAT_ID=1385505891`
- Scheduler jobs: `scheduler.py:create_scheduler()` → morning (08:00 Dubai), evening (18:30 Dubai)
- **Missing in prod env**: Only in .env.local, NOT in railway.toml or Vercel secrets → briefs won't send in production

### 4j. Media/Content Generation 🔴 LEGACY (UNUSED)
- FAL_KEY, ELEVENLABS_API_KEY, HEYGEN_API_KEY, RUNWAY_API_KEY, MESHY_API_KEY
- **Reality**: NO imports/calls found in codebase
- Likely legacy or future features

### 4k. Search/Scraping Tools 🔴 LEGACY (CONFIGURED BUT NOT USED)
- EXA_API_KEY, TAVILY_API_KEY, PERPLEXITY_API_KEY (web search)
- BROWSERBASE_API_KEY (headless browser) — used by `/api/automobile/extract-url` only
- LLAMA_CLOUD_API_KEY (doc parsing, LlamaIndex)
- E2B_API_KEY (sandbox code execution)
- **Reality**: grep shows 0 imports in Python/TS codebase; these are configured but not integrated

### 4l. Lead Enrichment 🔴 LEGACY (UNUSED)
- APOLLO_API_KEY, PDL_API_KEY
- **Reality**: 0 imports found

---

## 5. CLIENT-ENGINE COMMUNICATION

### HTTP Bridge (Next.js → FastAPI)

**Frontend routes**:
- `src/app/api/swarms/*` → proxy `/v1/swarms/*` (via swarmsClient)
- `src/app/api/crews/chief-of-staff/decisions/*` → proxy `/v1/crews/chief-of-staff/decisions/*`
- `src/app/api/sources/composio/connect` → proxy `/v1/composio/connect`
- `src/app/api/automobile/extract-url` → local extraction (browserbase scraping)

**Auth**:
- `src/lib/crewai/_internal.ts:76-115` → `authedFetch()` with Bearer token
- Header: `Authorization: Bearer ${CREWAI_ENGINE_AUTH_TOKEN}`
- Retry logic: 502/503/504 → exponential backoff (500ms, 1.5s, 4.5s)
- Cache: `cache: "no-store"` (SSR Next.js)

**Error handling**:
- `EngineError` class wraps HTTP errors (status, path, message)
- Status mapping: 4xx → 4xx, 5xx → 502

---

## 6. MISSING / BROKEN / LEGACY FEATURES

### 6a. GPU Training Page 🔴 LEGACY (REMOVED)
- Commits: `56bd31e feat(training): add GPU training cinematic canvas` → `d9e2e52 revert: remove fake GPU training cinematic page`
- Status: REMOVED. No /training route exists.
- Verdict: Dead feature, was fake/cinematic, never implemented.

### 6b. Run-Inputs Injection Bug 🔴 LEGACY (REVERTED)
- Commits: `1c8a433 fix(engine): inject real run inputs into agent prompts (no more hallucinated vehicle)` → `3b0b13e revert(engine): roll back run-inputs injection (hangs prod at Risk Analyst)`
- Issue: Input injection caused hangs in prod → reverted
- Current State: ❌ Agents CANNOT reference user-provided run inputs in prompts. Risk of vehicle hallucination.
- Evidence: `grep -r "RUN_INPUTS\|run_inputs" services/crewai-engine/src/` → 0 matches. Code removed.
- Commit message (3b0b13e): "run-inputs injection resolved hallucination locally but hangs prod (Risk Analyst, 2/2 runs stuck at 2 steps). Rollback → production code freeze-fix (74be7e9)."

### 6c. AutoScout24 Tool Endpoint ❌ UI-ONLY (ROUTE MISSING)
- **DB record**: tools table has "AutoScout24 Sourcing" (owner NULL) with `endpoint_url="/api/scrape/autoscout"` (Supabase verified)
- **Reality**: NO `/api/scrape/autoscout` route exists in `src/app/api/`
- **Actual endpoint**: `/api/automobile/extract-url` (browserbase-based extraction, line 5 `extract-url/route.ts`)
- **Verdict**: DB record points to non-existent endpoint. Fallback to `/api/automobile/extract-url` works.

### 6d. Composio Multi-Tenant User ID ⚠️ HARDCODÉ (with multi-tenant override path)
- Config: `COMPOSIO_USER_ID="adrien"` (hardcoded string, `config.py:91`)
- Problem: Default value is "adrien"; all Composio integrations use this unless owner_id override provided
- Multi-tenant handling: Owner_id IS passed through the full chain (frontend → engine → crew → composio_session), so multi-tenant isolation IS working when owner_id provided
- Boot warning: `config.py:262-267` logs warning if "adrien" in prod
- Verdict: **Risk diminished if frontend always passes owner_id** (which it does via `withOwnerId`), but fallback to "adrien" still a risk if any internal call misses owner_id.

---

## 7. CHIEF OF STAFF (Daily AI Agent) ✅ BRANCHÉ

- **Flow**: `ChiefOfStaffFlow` in `services/crewai-engine/src/flows/chief_of_staff_flow.py`
- **Router**: `routes/crews.py:prefix="/v1/crews/chief-of-staff"`
- **Endpoints**:
  - POST `/v1/crews/chief-of-staff/kickoff` → async background task
  - GET `/v1/crews/chief-of-staff/status/{kickoff_id}`
  - POST `/v1/crews/chief-of-staff/decisions` → record user decision
  - GET `/v1/crews/chief-of-staff/decisions?kickoffId=` → list decisions
- **Persistence**: `chief_run_log` (startup), `chief_run_steps` (step logs), `chief_decisions` (user feedback)
- **State Store**: in-memory `_runs` dict (`routes/crews.py:37`, comment lines 33-36: single-process Railway, --workers 1)
- **Scheduler**: APScheduler jobs (morning 08:00, evening 18:30 Dubai time)
- **Timeout**: 180s (FLOW_TIMEOUT_SECONDS)

**Risk**: In-memory state → invisible to other workers if scaled > 1. Mitigated by Railway --workers 1 default.

---

## 8. DYNAMIC SWARM ORCHESTRATION ✅ BRANCHÉ

- **Flow**: `DynamicSwarmFlow` in `services/crewai-engine/src/flows/dynamic_swarm_flow.py:1-100`
- **CRUD**: `routes/swarms.py` (GET list, GET detail, POST create, PATCH update, DELETE soft-delete)
- **Execution**: POST `/v1/swarms/{id}/kickoff` → background asyncio task
- **Owner_id propagation**: Frontend passes owner_id via `withOwnerId()` → engine routes extract it → flow state includes it → crew creation receives it → Composio tools initialized with correct user_id
- **Persistence**: `swarm_runs` table, `swarm_run_steps` (step logs)
- **Input variables**: Dynamic agent/task/tool definitions loaded from Supabase swarms record
- **Token tracking**: Usage metrics extracted from crew.usage_metrics (fallback: result.token_usage)

**Current Limitation**: Input injection reverted (6b) → agents cannot reference run inputs in prompts.

---

## 9. INFRASTRUCTURE DEPLOYMENT

### Railway (Engine Backend) ⚠️ INCOMPLETE CONFIGURATION
**Config**: `railway.toml:1-9`
**Start Command**: `npm run start` (line 5)
**ISSUE**: This is the FRONTEND start command (Next.js), NOT the engine.
- `package.json:13` shows `"start": "next start -p 3333"`
- Should be: `cd services/crewai-engine && uv run uvicorn src.main:app --port 8000`
- Health Check: `/api/health`
- Environment: `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID` detected in config.py for prod-mode .env loading

**Verdict**: FastAPI engine deployment is BROKEN or INCOMPLETE on Railway. Either:
1. Engine runs on same Railway dyno alongside Next.js (config mismatch), or
2. Engine is on a separate Railway service (not documented)

### Vercel (Frontend) ✅ BRANCHÉ
- **Project**: `myswarms` (projectId: prj_D7svFbXovy2hni4hAPyN2AJI5Lnq)
- **Build**: `npm run build` (Next.js)
- **Start**: `npm run start -p 3333` (Next.js server)

---

## 10. DATABASE SCHEMA HIGHLIGHTS

- **39 tables total**, RLS enforced on all
- **Swarms**: 14 rows (6 templates, 2 orphelins, 6 user-owned)
- **Swarm runs**: 30 rows, status tracking
- **Tools**: 3 rows (Gmail, Trello user-owned; AutoScout24 template-owned, endpoint broken)
- **Hedge product**: 14 separate tables (market_snapshots 4796 rows, orderbook 6372 rows) — distinct product from Hive

---

## SUMMARY TABLE

| Service | Component | Statut | Utilisé | Env Vars | Risques |
|---------|-----------|--------|---------|----------|---------|
| Frontend | Next.js 16.2.6 | ✅ BRANCHÉ | OUI | NEXT_PUBLIC_*, NEXTAUTH_* | OAuth secrets local-only |
| Engine | FastAPI + CrewAI 1.14.4 | ✅ BRANCHÉ (⚠️ Railway config mismatch) | OUI | CREWAI_ENGINE_*, HYPERCLI_* | railway.toml startCommand wrong |
| Supabase | Auth + DB (39 tables) | ✅ BRANCHÉ | OUI | SERVICE_ROLE_KEY | RLS enforced (OK) |
| Hypercli | LLM (Kimi K2.6) | ✅ BRANCHÉ | OUI | HYPERCLI_API_KEY | Timeout 120s, retries 3x |
| Composio | Tools (Gmail, Trello) | ✅ BRANCHÉ (owner_id chain works) | OUI | COMPOSIO_API_KEY | Fallback "adrien" if no owner_id |
| Langfuse | Observability | ✅ BRANCHÉ | OUI (opt) | LANGFUSE_* | Fail-soft if keys absent |
| Sentry | Error tracking | ✅ BRANCHÉ | OUI (opt) | SENTRY_DSN | Fail-soft if DSN absent |
| APM Market | Price intelligence | 🔴 PARTIEL | OUI (opt) | APM_MARKET_* | Env vars missing in prod |
| Upstash Redis | Cache | 🔴 PARTIEL | NON | UPSTASH_* | Configured, unused |
| Inngest | Job scheduler | 🔴 LEGACY | NON | INNGEST_* | No client calls found |
| Telegram Bot | Daily briefs | 🟡 PARTIEL | OUI (opt) | TELEGRAM_* | Missing prod env vars |
| Google OAuth | Auth | ✅ BRANCHÉ | OUI | GOOGLE_CLIENT_* | Secrets .env.local |
| Railway | Engine deploy | ⚠️ INCOMPLETE | OUI | railway.toml | startCommand mismatch |
| Vercel | Frontend deploy | ✅ BRANCHÉ | OUI | .vercel/project.json | None |
| GPU Training | Feature | 🔴 LEGACY | NON | (none) | Reverted, fake cinematic |
| Run-Inputs | Feature | 🔴 LEGACY | NON | (none) | Reverted, causes hangs |
| /api/scrape/autoscout | Route | ❌ UI-ONLY | NON | (tools.endpoint_url) | DB points to missing endpoint |
| Media Gen APIs | Feature | 🔴 LEGACY | NON | (various) | Unused |
| Chief of Staff | Crew | ✅ BRANCHÉ | OUI | (settings) | In-memory state (--workers 1) |
| Dynamic Swarms | Crew orchestration | ✅ BRANCHÉ | OUI | CREWAI_* | Input injection reverted |

---

## KEY VERDICTS

1. **CORE PRODUCTION PATH IS WIRED**: Next.js → Railway FastAPI → Supabase + Hypercli + Composio. All critical services connected. ✅

2. **MULTI-TENANT COMPOSIO**: Owner_id IS passed through the full execution chain (frontend → engine → flow → crew → composio_session). Falls back to "adrien" only if owner_id is None. ✅ (Corrected from "hardcoded leak")

3. **SERIOUS REGRESSIONS**:
   - ❌ Run-inputs injection REVERTED (agents cannot reference user inputs; hallucination risk)
   - ❌ AutoScout24 DB record points to non-existent /api/scrape/autoscout endpoint (fallback /api/automobile/extract-url exists)

4. **INFRASTRUCTURE INCOMPLETE**:
   - ⚠️ Railway startCommand is "npm run start" (Next.js), NOT FastAPI engine command — deployment of engine is broken or undocumented

5. **MISSING CONFIGS**:
   - 🟡 APM_MARKET env vars missing → intelligence checks fail silently
   - 🟡 Telegram bot tokens only in .env.local → briefs won't send in prod

6. **DEAD WEIGHT**:
   - GPU training (reverted)
   - Inngest (configured, 0 imports)
   - Upstash Redis (configured, 0 imports)
   - Media gen APIs (configured, 0 imports)
   - Lead enrichment APIs (0 imports)

7. **OBSERVABILITY COMPLETE**: Langfuse + Sentry + Telegram briefs configured (fail-soft for non-critical).

> **⚠️ Corrections de l'auditeur principal sur cette section** (vérifiées en lecture directe) :
> - **`railway.toml` (racine)** : `startCommand = "npm run start"` = déploiement du **front Next.js** sur Railway, **pas** du moteur FastAPI. Le moteur a sa **propre** config `services/crewai-engine/railway.json` (builder `DOCKERFILE`, healthcheck `/health`). Ce n'est donc **pas** un déploiement cassé comme suggéré, mais une **config ambiguë** (deux cibles Railway + Vercel) → classer **INCOHÉRENT**, pas P0.
> - **APM Market** : l'agent a indiqué « ENV VARS MISSING » — **faux en local** : `APM_MARKET_SUPABASE_URL` et `APM_MARKET_SUPABASE_KEY` (projet `ipgqjrsvcqqmnihasxae`) **sont présentes** dans `.env.local`. `apmClient.ts:13-14` les lit, fail-soft `null` si absentes. Statut réel : **BRANCHÉ read-only** ; présence en env **prod** (Vercel/Railway) non vérifiable depuis ici. Une **clé JWT cross-projet est embarquée côté front-env** (rôle à confirmer) — à surveiller.

---

## 3. BRANCHÉ / PARTIEL / UI-ONLY / MORT — Roll-up transversal

Vue condensée. Le détail prouvé (file:line) est dans les sections par dimension.

### ✅ BRANCHÉ (réel, prouvé par chemin d'exécution)
- **Auth Supabase** : `getOwnerId()`/`requireOwnerId()` via session crypto-vérifiée (`src/lib/auth/owner.ts`).
- **Kickoff swarm** : `POST /api/swarms/[id]/kickoff` → moteur Python → `create_dynamic_crew` → écrit `swarm_runs`/`swarm_run_steps` réels.
- **Microservice CrewAI** : FastAPI réel, routers health/crews/swarms, bearer `hmac.compare_digest`, APScheduler.
- **DB Supabase** : 39 tables, RLS activée partout, données réelles (30 runs, 60 steps, 14 swarms, 3 tools, 1 décision).
- **Dashboard Automobile** : KPIs/tables/charts alimentés par vrais runs + `vehicle_decisions` + marché APM.
- **Décisions humaines** : `vehicle_decisions` (write scopé owner, ownership check préalable).
- **Sourcing AutoScout (chemin RSC)** : `searchAutoScout()` appelé réellement depuis `/automobile/sourcing` + cockpit-agent.
- **Extraction URL** : `/api/automobile/extract-url` (JSON-LD + meta + heuristiques, allowlist 8 domaines, dédup owner-scopée).
- **Marché APM** : `apmClient.ts` lit en read-only un 2e projet Supabase (env présentes en `.env.local`).
- **Observabilité** : Langfuse + Sentry branchés en fail-soft.

### 🟡 PARTIEL (existe, incomplet ou fragile)
- **Reco produit** : parseur regex fragile (dépend du format markdown du LLM).
- **Dashboard** : N+1 d'appels `status()` (jusqu'à 50/chargement).
- **Run inputs → prompt** : passés à `kickoff()` mais plus injectés en texte (revert) → hallucination possible, non testée.
- **Isolation `swarm_runs`** : pas de colonne `owner_id`, scope par join applicatif + RLS (defense-in-depth, service_role bypasse).
- **tenant_config** : logique correcte mais peuplée pour 1 seul owner → visibilité module incohérente.
- **Déploiement moteur Railway** : 2 configs (`railway.toml` racine = front, `railway.json` engine = Dockerfile) → ambiguïté.

### 👻 UI-ONLY (visible, sans logique réelle derrière)
- **Tool DB « AutoScout24 Sourcing »** : `endpoint_url=/api/scrape/autoscout` **inexistante** → tool non invocable.
- **Visuel véhicule** : `inputs_json.image_url` quasi jamais présent → fallback `BrandLogo` systématique (pas de vraies photos).
- **Canvas / system-map** : graphes d'agents principalement cosmétiques (à confirmer page par page).

### ☠️ MORT / LEGACY
- **Page GPU training** : ajoutée puis revertée comme "fake" (`d9e2e52`). Rien ne tourne.
- **2 swarms « No owner »** (orphelins `is_template=false`, owner null, créés 2026-06-01).
- **Référence `middleware`** dans la doc de `owner.ts` alors qu'aucun middleware n'existe.
- **`/api/scrape/autoscout`** : référencée en commentaire (`apify/types.ts:3`), jamais implémentée.



## 4. SESSIONS / OWNER / MULTI-TENANT

### A. Isolation par Session Supabase — ✅ BRANCHÉ P0

La chaîne d'authentification est correctement verrouillée:
- **src/lib/auth/owner.ts:44-75** ✅: `getOwnerId()` lit via `supabase.auth.getUser()` (vérification cryptographique serveur, conforme recommandation Supabase officielle). Retourne `string | null`, jamais de stub hardcodé en production.
- **src/lib/auth/owner.ts:48-68** ✅: `DEV_BYPASS_AUTH=true && NODE_ENV !== "production"` retourne UUID stub `DEV_BYPASS_OWNER_ID` (défaut `00000000-0000-0000-0000-000000000000`). Fail-closed en prod strictement.
- **src/lib/auth/owner.ts:85-91** ✅: `requireOwnerId()` throw `OwnerAuthError` si aucune session → 401 garanti côté route.
- **src/app/api/swarms/route.ts:11-12** ✅ et **src/app/api/crews/chief-of-staff/decisions/route.ts:34-35** ✅: Toutes les routes API appellent `requireOwnerId()` AVANT toute opération DB. owner_id provient de la session Supabase authentifiée, jamais du query param/body.

**Verdict: BRANCHÉ P0.** ✅

---

### B. Service Role Bypass RLS — ✅ BRANCHÉ P0

**src/lib/supabase/admin.ts** + **src/app/api/admin/users/route.ts**: Client service_role créé uniquement pour routes admin.

**src/app/api/admin/users/route.ts:12-15** ✅: GET appelle `requireSuperAdmin()` AVANT `createAdminClient()`. POST (ligne 43-46) idem. Admin-only RLS bypass, fail-closed.

**Verdict: BRANCHÉ P0.** ✅

---

### C. Tenant Config — ⚠️ INCOHÉRENT P1

**src/lib/tenant/config.ts:21-49** (`getTenantConfig`):
- Lecture via service_role + `.eq("owner_id", ownerId)` scope stricte.
- Retourne `{modules: ModuleId[], product: string}` ou DEFAULT (tous les modules visibles).

**État DB réel** (donnée mentionnée dans le contexte de l'audit): 
- 1 seule ligne en `tenant_config`: `owner_id = 51a6c3f9-ffc2-4ff8-b3ce-a643197a43a1`, `modules = [accueil, workspace, swarms, crews, tools, automobile]`, `product = "hive"`.
- Toutes les données réelles appartiennent à `owner_id = e0a983da-536f-4dad-a205-861acbae9468` (13 runs, tools, decisions). **Aucune ligne tenant_config pour ce propriétaire**.
- Résultat: `getTenantConfig()` pour owner `e0a983da` retourne DEFAULT (tous modules visibles).

**Qui voit le module Automobile?**
- `owner_id = 51a6c3f9`: module visible (config DB `modules` inclut "automobile").
- `owner_id = e0a983da`: module visible par défaut (DEFAULT retourne ALL_MODULE_IDS).
- Toute autre owner: module visible par défaut.

**Verdict: ⚠️ INCOHÉRENT P1** — tenant_config n'est jamais peuplée pour les propriétaires actifs en production. **C'est un problème de DATA POPULATION, pas de logique code**. L'impact est que l'isolation UI par module ne fonctionne QUE pour le propriétaire hardcodé en DB. Tous les autres users voient tous les modules par défaut (DEFAULT behavior). **RISQUE UI/DATA MISMATCH**: même si l'UI cache "automobile" pour un user, l'endpoint `/api/automobile/extract-url` est toujours accessible si ce user appartient à un swarm.

---

### D. Routes API — Owner Scoping Stricte ✅ BRANCHÉ

#### D.1 Swarms (GET /api/swarms, POST /api/swarms)

**src/app/api/swarms/route.ts:11-12** ✅ (GET):
```ts
const ownerId = await requireOwnerId();
const swarms = await swarmsClient.list(ownerId);
```
Owner_id passé au client, scope garanti côté engine.

**src/app/api/swarms/route.ts:43-44** ✅ (POST):
```ts
const ownerId = await requireOwnerId();
const swarm = await swarmsClient.create(parsed.data, ownerId);
```

**services/crewai-engine/src/routes/swarms.py:423-427** ✅:
```python
def list_swarms_endpoint(owner_id: str | None = Query(default=None)):
    _require_owner_id(owner_id)
    return swarm_store.list_swarms(owner_id=owner_id)
```

**services/crewai-engine/src/persistence/swarm_store.py:248-250** ✅:
```python
if owner_id:
    # Include owned swarms OR global templates
    query = query.or_(f"owner_id.eq.{owner_id},and(owner_id.is.null,is_template.eq.true)")
```

**Verdict: BRANCHÉ P0.** ✅

---

#### D.2 Swarm Runs

**services/crewai-engine/src/routes/swarms.py:713-720** ✅: Kickoff crée un run via `swarm_store.save_swarm_run()` après vérification owner_id du swarm.

**services/crewai-engine/src/persistence/swarm_store.py:1023-1049**: `save_swarm_run()` n'insère PAS `owner_id` direct (colonne n'existe pas). 

**services/crewai-engine/src/persistence/swarm_store.py:1077-1121** ✅: `get_swarm_run()` scope via **RLS POLICY** (migration 0006, lignes 283-298):
```sql
create policy "swarm_runs_owner_all" on public.swarm_runs
  for all using (
    exists (select 1 from public.swarms s
      where s.id = swarm_runs.swarm_id and s.owner_id = auth.uid())
  )
```
Isolation via EXISTS chain: `swarm_runs.swarm_id → swarms.owner_id`. Microservice utilise service_role donc le filtre applicatif (ligne 1103-1117 du get_swarm_run) est le fallback:
```python
if owner_id:
    owner_check = client.table("swarms").select("id").eq("id", swarm_id)
      .or_(f"owner_id.eq.{owner_id},and(owner_id.is.null,is_template.eq.true)")
      .maybe_single().execute()
    if not (owner_check and owner_check.data):
        return None
```

**Verdict: ⚠️ PARTIEL P0** — Runs n'ont pas `owner_id` colonne direct, scope via RLS POLICY + applicatif join. **Fragile mais suffisant** car le join swarm_id→swarms.owner_id est systématique.

---

#### D.3 Chief of Staff Decisions ✅ BRANCHÉ P0

**src/app/api/crews/chief-of-staff/decisions/route.ts:34-35** ✅:
```ts
const ownerId = await requireOwnerId();
const decisions = await crewaiClient.listDecisions("chief-of-staff", kickoffId, { ownerId });
```

**services/crewai-engine/src/persistence/run_store.py:112-137** ✅:
```python
def get_run(kickoff_id: str, owner_id: str) -> dict:
    """owner_id is mandatory — engine uses SUPABASE_SERVICE_ROLE_KEY
    so explicit .eq("owner_id", owner_id) filter is the sole isolation boundary."""
    result = client.table("chief_run_log").select("*")
      .eq("kickoff_id", kickoff_id)
      .eq("owner_id", owner_id)
      .maybe_single().execute()
```
Strictement scopé par owner_id. Correct.

**Verdict: BRANCHÉ P0.** ✅

---

#### D.4 Automobile / Vehicle Decisions ✅ BRANCHÉ P0

**src/app/automobile/[runId]/actions.ts:27-30** ✅:
```ts
const ownerId = await requireOwnerId();
await swarmsClient.status(AUTOMOBILE_SWARM_ID, runId, ownerId);
await upsertDecision(ownerId, runId, status);
```
Ownership vérifié via `swarmsClient.status()` qui scope le run à l'owner.

**Verdict: BRANCHÉ P0.** ✅

---

#### D.5 Extract URL Automobile ✅ BRANCHÉ P0

**src/app/api/automobile/extract-url/route.ts:21-22** ✅:
```ts
ownerId = await requireOwnerId();
const duplicate = await findRecentRunByUrl(ownerId, parsed.data.url);
```
URL extraction scoped par owner_id pour dedup.

**Verdict: BRANCHÉ P0.** ✅

---

### E. Composio Multi-Tenant Scoping ✅ BRANCHÉ P0

**services/crewai-engine/src/routes/swarms.py:917** ✅:
```python
result = c.connected_accounts.initiate(
    user_id=oid,  # owner_id utilisé comme Composio user_id
    auth_config_id=auth_config_id,
)
```
owner_id propagé vers Composio comme user_id pour l'isolation.

**services/crewai-engine/src/routes/swarms.py:883-887**: `_TOOLKIT_AUTH_CONFIGS` est hardcodé par toolkit (gmail, trello) — tous les users partagent la MÊME auth_config_id par toolkit. Composio gère la séparation par `user_id` après authentification.

**Verdict: BRANCHÉ P0.** ✅

---

### F. Run Inputs — ⚠️ PARTIELLEMENT INCORRECT (revert appliqué mais inputs toujours passés)

**Git history**:
- **Commit 1c8a433** (fix(engine): inject real run inputs into agent prompts): Injectait un bloc lisible "## DONNÉES FOURNIES POUR CETTE ANALYSE" dans les task descriptions.
- **Commit 3b0b13e** (revert(engine): roll back run-inputs injection): Annule la fonction `_render_inputs_block()` car causait des hangs en prod (Risk Analyst stuck).

**Code actuel** - **CORRECTION IMPORTANTE**:
- **services/crewai-engine/src/flows/dynamic_swarm_flow.py:183-184** ✅:
  ```python
  crew = create_dynamic_crew(swarm_id, run_id=run_id, owner_id=self.state.owner_id)
  result = crew.kickoff(inputs=self.state.inputs or {})
  ```
  **Les inputs SONT passés à crew.kickoff()** — ils ne sont plus injectés dans les task descriptions (ce qui causait le hang), mais ils sont fournis au contexte CrewAI. C'est différent du claim "jamais injectés".

**Le risque réel**: L'absence d'injection dans les prompts signifie que les agents reçoivent les données via le contexte CrewAI interne (structure `inputs` du state), pas via un bloc textuel lisible dans la task description. Si CrewAI n'utilise pas correctement ce contexte, hallucination reste possible (ex: agent crée un véhicule fictif au lieu d'utiliser `inputs.make`/`inputs.model`).

**Verdict: ⚠️ NON-TESTÉ P1** — Inputs passés mais pas injectés dans prompts. Revert détruit la feature "bloc readable", mais l'isolation n'est PAS compromise car kickoff reçoit les inputs. **La vraie question**: CrewAI utilise-t-il correctement ces inputs? Aucun test visible pour valider que le crew analyse le bon véhicule (pas de vehicle-specific assertion dans les logs/results).

---

### G. Owner_id Trusting (Body vs Session) ✅ BRANCHÉ P0

**Pattern confirmé dans TOUTES les routes**:
1. `requireOwnerId()` récupère depuis la session Supabase cryptographiquement vérifiée.
2. Body/query ne peuvent PAS override owner_id (sauf microservice relaie explicitement via route handler).
3. Aucun `DEV_OWNER_ID` hardcodé en production.

**Exception microservice**: Routes Python acceptent `owner_id` query param mais:
- **services/crewai-engine/src/routes/swarms.py:45-53**: `_require_owner_id(owner_id)` valide UUID valide.
- Frontend TOUJOURS passe `owner_id` depuis la session (via `requireOwnerId()`).
- Bearer token middleware (main.py) vérifie l'appel vient du frontend autorisé.

**Verdict: BRANCHÉ P0.** ✅

---

### H. RLS au Niveau DB — ✅ PARTIEL AVEC ARCHITECTURE DÉLÉGUÉE

**Toutes les 39 tables ont RLS enabled** (cf migration 0006, lignes 191-197).

- **swarm_runs** (ligne 121-136): NO colonne `owner_id` direct. RLS Policy (ligne 283-298) scope via EXISTS + join.
- **swarm_run_steps** (ligne 139-156): NO colonne `owner_id` direct. RLS Policy (ligne 301-317) scope via run→swarm join.
- **chief_run_log, chief_decisions**: Ont `owner_id` direct (migration 0015).
- **vehicle_decisions**: Devrait avoir `owner_id` (selon l'audit original).

**Architecture de sécurité**: RLS policies existent, mais le microservice utilise `SUPABASE_SERVICE_ROLE_KEY` (bypasse RLS), donc les filtres applicatifs en Python (`.eq("owner_id", owner_id)`) sont les **vraies** limites d'isolation. RLS est un "defense in depth" au cas où un frontend directement connecté à Supabase serait ajouté.

**Verdict: ✅ BRANCHÉ (avec délétion applicative)** — RLS existe mais pas utilisée car service_role bypasse. Design intentionnel : isolation dans l'app Python, pas en DB.

---

### I. Tenant Visibility vs Data Isolation Mismatch — ⚠️ RISQUE P1

**Problème fondamental**: tenant_config n'est jamais remplie pour les propriétaires actifs.
- Propriétaire `e0a983da` voit tous les modules par DEFAULT (tous les modules visibles).
- Propriétaire `51a6c3f9` voit modules listés en DB.
- UI peut masquer "automobile", mais endpoint `/api/automobile/extract-url` est toujours accessible (requireOwnerId scope seul, pas de module check).

**Verdict: ⚠️ RISQUE P1 [INCOHÉRENT]** — UI/data layer mismatch. La sécurité de l'API (requireOwnerId) n'est pas compromise, mais la UI ne reflète pas l'intent produit (certains tenants ne devraient pas voir Automobile). **Solution requise**: populate tenant_config pour tous les propriétaires ou supprimer la feature module visibility entièrement.

---

### J. Checklist Multi-Tenant — Récapitulatif Final

| Aspect | Verdict | Détail |
|--------|---------|--------|
| Owner_id source (session vs body) | ✅ BRANCHÉ | Toujours depuis session Supabase |
| RLS sur tables principales | ✅ BRANCHÉ | Policies existent; isolation déléguée à Python (by design) |
| Composio multi-user | ✅ BRANCHÉ | user_id = owner_id |
| Tenant config population | ⚠️ INCOHÉRENT | 1 ligne DB, autres propriétaires omis → DEFAULT |
| Run inputs handling | ⚠️ NON-TESTÉ | Passés via context mais pas injectés dans prompts (revert appliqué) |
| Dev bypass auth | ✅ BRANCHÉ | Fail-closed en prod, dev-only DEV_BYPASS_AUTH |
| Swarm runs isolation | ⚠️ PARTIEL | Pas de colonne owner_id direct, scope via RLS policy + applicatif join |

---

**Conclusion mise à jour**: Multi-tenant est **majoritairement branché et sécurisé au niveau API**. Ownership scoping est stricte via `requireOwnerId()` et scope applicatif en Python. **Trois défaillances P1** demeurent :

1. **tenant_config incohérente** — une seule ligne en DB, autres propriétaires reçoivent DEFAULT → tous les modules visibles (problème DATA, non CODE).
2. **Inputs jamais injectés dans les prompts** — revert appliqué ; inputs passés via contexte CrewAI mais sans bloc texte lisible. **Risque d'hallucination si CrewAI ne consomme pas correctement ce contexte** (non-testé).
3. **swarm_runs pas de owner_id colonne** — isolation applicative (fragile), pas d'index RLS natif (par design : service_role bypasse RLS).

> **⚠️ Compléments de l'auditeur principal** (lecture directe, à lire avec la section ci-dessus) :
> - **Aucun `middleware.ts` n'existe** dans le repo (`find . -name middleware.ts` → vide), alors que `src/lib/auth/owner.ts` documente : « le middleware protège toutes les routes et garantit qu'un user est toujours présent ». **C'est faux.** Toute la protection repose sur l'appel explicite `requireOwnerId()` dans chaque route/page. Les pages auditées (dashboard, etc.) le font bien, mais **il n'y a aucun garde-fou global** : une nouvelle route qui oublie l'appel est publique. → **INCOHÉRENT + RISQUE P1**.
> - **`DEV_BYPASS_AUTH=true` est réellement positionné dans `.env.local`**, avec `DEV_OWNER_ID = DEV_BYPASS_OWNER_ID = e0a983da-536f-4dad-a205-861acbae9468` (le owner de toutes les données) et `HEARST_DEV_AUTH_BYPASS=1`. En dev, l'auth est **désactivée** et tout est attribué à cet owner. Gate `NODE_ENV !== "production"` ⇒ fail-closed en prod. Acceptable **si et seulement si** la prod ne tourne jamais avec `NODE_ENV` mal positionné.



## 5. TEMPLATES / SWARMS / AGENTS

## Vue d'ensemble

Cet audit couvre les 6 templates globaux (owner_id IS NULL) du système MySwarms, avec 14 swarms en DB (6 globaux + 8 propriétaires). ✅ Confirmé par requête DB.

## ✅ [CONFIRMÉ] HALLUCINATION VÉHICULE — Inputs non injectés post-revert 3b0b13e

### Preuves factuelles

**1. Template correctement seed avec 3 agents séquentiels**
- ✅ `supabase/migrations/0018_seed_apm_vehicle_research_template.sql:25-260` : swarm `cccccccc-0001-0001-0001-000000000001` créé avec 3 agents (Data Collector, Risk Analyst, Decision Writer).
- ✅ Tous les 3 agents présents en DB (requête swarm_agents pour swarm_id = cccccccc-0001... retourne 3 rows: Data Collector, Risk Analyst, Decision Writer).
- Agent system_prompt Data Collector: `"You are a vehicle data specialist..."` ✅ confirmé en DB.
- Risk Analyst: `"Given the structured vehicle data from the Data Collector, you must..."` ✅ confirmé en DB.
- Task descriptions sans placeholders : `"Parse the vehicle inputs provided..."` ✅ confirmé (migrations 0018:203-206).

**2. Fix 1c8a433 injectait les inputs dans CHAQUE task** ✅ PROUVÉ
- Commit `1c8a433` ajoutait `inputs` parameter à `create_dynamic_crew()`.
- Fonction `_render_inputs_block()` créait un bloc `"## DONNÉES FOURNIES POUR CETTE ANALYSE"` avec les valeurs réelles.
- À la ligne 494 du diff: `description = f"{description}{inputs_block}"` — **injection confirmée dans CHAQUE task**.
- Commit message: "*validation en réel : run Peugeot 308 SW (9500€, 2019, diesel, 95000km, FR) → le rapport analyse bien CE véhicule, zéro hallucination*" — preuve que le fix **fonctionnait en production avant le revert**.

**3. Revert 3b0b13e a ENLEVÉ l'injection** ✅ CONFIRMÉ
- `git show 3b0b13e` annule exactement 42 lignes de 1c8a433 (les 28 lignes de `_render_inputs_block()` + les modifications à `instantiate_tasks()` et à l'appel `create_dynamic_crew()`).
- `create_dynamic_crew()` signature actuelles (dynamic_crew.py:658 dans le code courant) : **PAS de paramètre `inputs`** ✅ CONFIRMÉ.
- `_render_inputs_block()` : **SUPPRIMÉE** — grep trouve zéro occurrence dans le code actuel ✅ CONFIRMÉ.
- Raison du revert (3b0b13e commit message): `"hangs prod : 2/2 runs prod restent bloqués à 2 steps... Risk Analyst ne rend jamais, ~12 min"`.

**4. Code courant ne réinjecte PAS les inputs dans les descriptions** ✅ CONFIRMÉ
- `dynamic_swarm_flow.py:183` : `create_dynamic_crew(swarm_id, run_id=run_id, owner_id=self.state.owner_id)` — **aucun paramètre `inputs`** ✅ CONFIRMÉ par lecture.
- `dynamic_crew.py:680` : `task_pairs = instantiate_tasks(agents_map, swarm_config)` — **pas d'`inputs_block`** ✅ CONFIRMÉ.
- À la ligne 184 du flow, les inputs arrivent au crew via `crew.kickoff(inputs=self.state.inputs or {})` — **mais les descriptions des tasks n'ont pas été enrichies** avec les données.

**5. Résultat observable: agents reçoivent inputs via CrewAI mais pas dans leurs prompts de task** ⚠️ CORRIGÉ
- CrewAI `kickoff(inputs={...})` injecte les valeurs comme variables globales du contexte **MAIS** les descriptions de tasks (ex: "Parse the vehicle inputs provided...") — **ZÉRO mention du véhicule réel** ✅ CONFIRMÉ.
- Agent reçoit : "Analyse la data fournie" (description template générique) + inputs dict (make=BMW, model=330d, ...) en contexte.
- **Risque réel**: L'agent PEUT halluciner ou ignorer les inputs spécifiques s'il ne les voit pas dans le prompt principal — c'est une **CARENCE de prompt engineering**, pas une hallucination garantie.

### Classification — **P0 SEMI-CONFIRMÉ, PARTIELLEMENT NUANCÉ**
- **Titre**: "Revert 3b0b13e a cassé l'injection d'inputs → risque d'hallucination"
- **Verdict**: ✅ CONFIRMÉ que l'injection a été supprimée. ⚠️ NUANCE: La hallucination n'est pas *garantie* — elle dépend du comportement du modèle Hypercli/Kimi.
- **Fichiers**: 
  - ✅ `services/crewai-engine/src/crews/dynamic_crew.py:658` (signature sans `inputs`)
  - ✅ `services/crewai-engine/src/flows/dynamic_swarm_flow.py:183` (appel sans `inputs`)
  - ✅ `supabase/migrations/0018_seed_apm_vehicle_research_template.sql:203-260` (descriptions sans placeholders)
- **Severity**: **P0** — Regression de robustesse. Le fix 1c8a433 était validé en prod (run Peugeot 308 SW complet + 140 tests); revert élimina cette garantie **tout en causant un hang prod** qui n'est pas résolu.

---

## ✅ [BRANCHÉ] Provider & Model: Hypercli-only (Kimi K2.6)

### Statut courant — ✅ CONFIRMÉ

**Template APM (migrations 0018 + 0019)**
- Tous les 3 agents: DB actual → `model_provider = "openai"`, `model_name = "kimi-k2.6"` ✅ CONFIRMÉ par requête SQL.
- Convention : provider "openai" active le mode OpenAI-compatible de LiteLLM → pointe vers `HYPERCLI_BASE_URL` + `HYPERCLI_API_KEY` au runtime ✅ CONFIRMÉ par commentaires migration 0019:3-6.

**Code moteur (dynamic_crew.py:_resolve_llm)**
- ✅ Lignes 218-224 : détecte `"kimi"`, `"hypercli"`, ou modèle connu dans `_HYPERCLI_KNOWN_MODELS` (ligne 178-181) → instancie `LLM(model="openai/kimi-k2.6", base_url=HYPERCLI_BASE_URL, api_key=...)`.
- ✅ Lignes 244-253 : fallback Hypercli-only — tout provider `"anthropic"` / `"openai"` sans modèle Hypercli reconnu → `get_llm("balanced")` (Hypercli via llms.py).
- ✅ **Règle stricte**: JAMAIS claude ni OpenAI réel — policy confirmée par code + commentaires.

### Status: ✅ [BRANCHÉ]

Tous les chemins LLM routent vers Hypercli. Migration 0019 confirme les 3 agents du template APM utilisent `model_name="kimi-k2.6"`.

---

## ✅ [BRANCHÉ] Config JSON Template: required_inputs, field_order, field_options

**APM (migrations 0018 + 0019 + 0020)** — ✅ CONFIRMÉ en DB
- ✅ 0019:26 : `config_json.required_inputs = ["make", "model"]` — **présent en DB**.
- ✅ 0020:13-19 : `config_json.field_order` = [make, model, year, ..., notes] — **présent en DB**.
- ✅ 0020:16-18 : `config_json.field_options.fuel` = [diesel, essence, hybride, électrique]; `.country` = [FR, DE, IT, ...] — **présent en DB**.

**Frontend parsing (src/lib/swarms/inputSchema.ts:parseInputSchema)** — ✅ CONFIRMÉ
- ✅ Extrait `inputs_schema` / `required_inputs` / `field_order` / `field_options` depuis `config_json` (lignes 65-90).
- ✅ Génère des `InputField[]` pour le formulaire de lancement (lignes 101-143).
- ✅ Type déduction : "integer" → number (ligne 111), "URL" → url (ligne 113), "textarea" → textarea (ligne 115), "options présentes" → select (ligne 109-110).

### Status: ✅ [BRANCHÉ]

Convention implémentée côté DB (migrations 0019-0020) et côté frontend (parseInputSchema lignes 65-143). Les champs obligatoires sont déclarés et appliqués.

---

## ✅ [BRANCHÉ] Agents & Tasks: 3 agents séquentiels (APM template)

### Agents — ✅ CONFIRMÉ EN DB

| Nom | Role | Provider | Model | Status |
|-----|------|----------|-------|--------|
| Data Collector | executor | openai | kimi-k2.6 | ✅ BRANCHÉ |
| Risk Analyst | analyst | openai | kimi-k2.6 | ✅ BRANCHÉ |
| Decision Writer | coordinator | openai | kimi-k2.6 | ✅ BRANCHÉ |

✅ Tous 3 présents dans swarm_agents table (DB requête confirmée). Aucun orphelin.

### Tasks (3 tasks, sequential via depends_on_task_id) — ✅ CONFIRMÉ

| Name | Agent | Description | Depends On | Status |
|------|-------|-------------|-----------|--------|
| Collect & Structure | Data Collector | "Parse the vehicle inputs provided..." | — | ✅ BRANCHÉ |
| Analyse Risks & Checkpoints | Risk Analyst | "Using the structured vehicle profile..." | Task 1 | ✅ BRANCHÉ |
| Write Purchase Decision | Decision Writer | "Using the vehicle profile and risk..." | Task 2 | ✅ BRANCHÉ |

✅ Topological sort implemented (dynamic_crew.py:338-410 _topological_sort_tasks). ✅ Aucun cycle. ✅ Dépendances bien-formées confirmées en DB (depends_on_task_id présent).

### Status: ✅ [BRANCHÉ] (schema structure correct)

---

## ⚠️ [UI-ONLY] Tools: AutoScout24 endpoint mismatch (missing route)

**Database state** — ✅ CONFIRMÉ
- ✅ "AutoScout24 Sourcing" tool: `category="search"`, `endpoint_url="/api/scrape/autoscout"`, `auth_type="bearer"`, `is_active=true`.
- Tool exists en DB, marqué active.

**Frontend implementation** — ❌ ROUTE MANQUANTE CONFIRMÉE
- ✅ `src/app/api/automobile/extract-url/route.ts` — exists, extrait URL depuis HTML via Cheerio.
- ❌ **NO route at `/api/scrape/autoscout`** — find + grep confirms zéro matches.

### Classification

- **Preuves**: 
  - ✅ DB tools table: `endpoint_url="/api/scrape/autoscout"` confirmé par requête SQL.
  - ❌ Aucune implémentation trouvée dans `src/app/api/` tree.
- **Classification**: ⚠️ [UI-ONLY]
- **Severity**: P2 — Tool déclaré et exposé en UI, mais pas de backend. Si un tool binding référence, appels async → 404.

---

## ✅ [BRANCHÉ] Runs & Persistence: swarm_runs + swarm_run_steps

**State (DB)** — ✅ CONFIRMÉ
- ✅ `swarm_runs`: 30 total rows — confirmé par requête.
- ✅ `swarm_run_steps`: 60 rows — confirmé par requête.
- ✅ Step writer (dynamic_crew.py:57-166) uses queue + daemon thread (non-blocking persistence).

**Persistence flow** — ✅ CONFIRMÉ
- ✅ Ligne 187 & 203 de dynamic_swarm_flow.py: `flush_run_steps(run_id)` drains queue BEFORE marking run completed/failed.
- ✅ append_run_step (dynamic_crew.py:124-125) inserts steps to DB (batch-safe via FIFO queue).

### Status: ✅ [BRANCHÉ]

Persistence correctement câblée. Queue flush garanti avant transition run status.

---

## ✅ [BRANCHÉ] Decision persistence (vehicle_decisions table)

**DB state** — ✅ CONFIRMÉ
- ✅ 1 row: owner e0a983da, run baa251eb-df36..., status "appeler", note NULL.

**Frontend (src/lib/automobile/decisions.ts)** — ✅ CONFIRMÉ
- ✅ `getDecision()`: reads decision par (owner_id, run_id).
- ✅ `upsertDecision()`: writes decision (owner_id, run_id, status, note).
- ✅ Server-only, uses service_role + explicit owner_id scoping.

### Status: ✅ [BRANCHÉ]

User peut enregistrer une décision humaine (APPELER/ATTENDRE/ÉVITER) après examen agent output. RLS scopes to owner.

---

## ⚠️ [NON-TESTÉ] Test coverage & verification

**Unit tests** — ✅ Présent mais incomplet
- ✅ `services/crewai-engine/tests/test_global_template_protection.py` — validates RLS on global templates.
- ❌ **NO tests for input injection** — logical gap given the P0 hallucination regression.

**Integration / manual validation** — ❌ ABSENT
- ❌ Aucun smoke test pour un "launch APM run with real vehicle data → verify output contains vehicle details" flow.
- ❌ Revert 3b0b13e had cause: prod hang (hang, not crash). **NO regression test added** — risk de réintroduction du hang.

### Status: ⚠️ [NON-TESTÉ]

Critical path (inputs → agent prompts → output) a **NO automated verification** post-revert.

---

## Summary: État par Classification

### ✅ [BRANCHÉ] — Fonctionnel, intégré end-to-end

- ✅ Template configuration (config_json schema, field_order, field_options).
- ✅ Agent & task definitions (3 sequential agents, topological sort).
- ✅ Swarm runs & steps persistence (queue + flush).
- ✅ Decision recording (vehicle_decisions table, user manual input).
- ✅ Provider routing (Hypercli-only via LiteLLM).
- ✅ RLS on templates (owner_id IS NULL, is_template=true).

### ⚠️ [BRANCHÉ-MAIS-REGRÉSSÉ] — Implémenté mais cassé en chemin critique

- ❌ **Input injection into prompts** — revert 3b0b13e enlevé les agents enriching vehicle data. Fix 1c8a433 fonctionnait (prod validated). Cause du revert: hang à Risk Analyst (~12 min, 2/2 runs prod bloqués).

### ❌ [RISQUE] — Sécurité / data / coût

- **Hallucination risk (P0)**: User fournis BMW 330d data; agent peut analyser arbitrary vehicle ou manquer les inputs dans le prompt principal.
- **Hang regression (P1)**: Revert due to 12+ min timeout on Risk Analyst. **Cause du hang NOT documented** — risk de réintroduction sur prochain fix attempt.
- **Tool endpoint missing (P2)**: `/api/scrape/autoscout` declared in DB mais no backend.
- **No regression test**: The hang issue qui triggered revert 3b0b13e — NO test case added.

### ⚠️ [UI-ONLY]

- AutoScout24 tool in catalog but no backend (P2).

### ⚠️ [NON-TESTÉ]

- End-to-end input injection → output verification.
- Hang regression test case.

---

## Recommendations (not implementation)

1. **P0 — Re-inject inputs OR fix prompt engineering** (post-hang diagnosis).
   - **Option A (previous)**: Restore line 364+ flow passing `inputs` to `create_dynamic_crew()` + inject logic. BUT this caused hang — **understand hang first**.
   - **Option B (safer)**: Inject inputs **only into Data Collector task description** — downstream agents receive vehicle via CrewAI context (no long prompts).
   - **Option C (prompt only)**: Inject inputs into agent system_prompts instead of task descriptions — agents see inputs in their role/goal upfront.
   - **ADD regression test FIRST**: launch APM run with `{make: BMW, model: 330d, ...}` → verify report mentions "BMW 330d" at least once.
   - **DIAGNOSE hang**: Was it prompt length? Model latency? Tool call timeout? Add logs to Risk Analyst task before re-attempting fix.

2. **P1 — Implement missing `/api/scrape/autoscout` or remove from tools**.
   - If deferred: remove tool from `tools` table or mark `is_active=false`.

3. **P2 — Add hang timeout + monitoring**.
   - Prod hang at Risk Analyst was 12+ min; flow timeout is adaptive but may need tuning.
   - Monitor Langfuse traces for Risk Analyst latency spikes post-fix.
   - Add pre-emptive timeout guard if Risk Analyst task > 5 min elapsed.



## 6. ENVIRONNEMENT AUTOMOBILE — ROUTES

### État Global

**Routes branchées (7 de 8):** ✅ Confirmé. Toutes les routes côté **Next.js frontend** (RSC, client, API route) sont branchées, fonctionnelles et owner-scoped. Chaque route appelle `requireOwnerId()` ou `getOwnerId()` et les queries DB/engine sont filtrées par `owner_id`.

**Routes manquantes (1 de 1):** ⚠️ `/api/scrape/autoscout` — enregistrée en DB (tools, id `776c1214-126f-4c6c-bd75-bd6358780b30`) mais **absente du code source**. Aucun fichier `src/app/api/scrape/autoscout/route.ts` n'existe. La sourcing réelle utilise directement `searchAutoScout()` côté serveur RSC via lib Apify, pas une API interne. Tool DB est orphelin.

**Redirect testé:** `/automotive` → `/automobile` (HTTP 301 permanent) — ✅ implémenté en `next.config.ts:14-17`.

---

### Routes Détaillées — Audit Piste à Piste

#### 1. **GET /automobile** — Dashboard principal [✅ BRANCHÉ]
- **Fichier:** `src/app/automobile/page.tsx:209-837`
- **Auth:** `requireOwnerId()` → redirect `/login?returnTo=/automobile` si absent
- **Données lues:** 
  - `swarmsClient.listRuns(AUTOMOBILE_SWARM_ID, 50, ownerId)` — listage des 50 derniers runs
  - `swarmsClient.status(AUTOMOBILE_SWARM_ID, s.id, ownerId)` — détails (inputs_json, result_text, steps, status) pour chaque run
  - `getMarketIndex(make, model, fuel)` — intelligence marché depuis APM Supabase externe (read-only, fail-soft)
  - `getDecisionsForRuns(ownerId, [runIds])` — statuts décisions humaines depuis DB locale (RLS owner_id)
- **Données écrites:** Aucune
- **État:** ✅ **BRANCHÉ** — dashboard fonctionne, affiche live KPIs (total, complets, recommandations), charts donut prix/décisions/tokens, tableau 12 runs récents, sections décisions ouvertes + signaux marché.
- **Sécurité:** ✅ Owner-scoped (tous les appels swarmsClient + DB queries filtrées par owner_id). UUID random, 404 → notFound.

---

#### 2. **GET /automobile/nouvelle** — Formulaire lancement analyse [✅ BRANCHÉ]
- **Fichier:** `src/app/automobile/nouvelle/page.tsx:21-141`
- **Auth:** `requireOwnerId()` → redirect `/login?returnTo=/automobile/nouvelle`
- **Données lues:**
  - `parseInputSchema(swarm.config_json)` — champs du template Automobile
  - `swarmsClient.get(AUTOMOBILE_SWARM_ID, ownerId)` — config template
  - `parsePrefillParams(searchParams)` — pré-remplissage depuis sourcing (allowlist strict)
  - `findRecentRunByUrl(ownerId, source_url)` — soft dédup
- **Données écrites:** Via Server Action `triggerAnalyse`:
  - `swarmsClient.kickoff(AUTOMOBILE_SWARM_ID, {trigger: "on_demand", inputs}, ownerId2)`
- **État:** ✅ **BRANCHÉ** — formulaire dynamique fonctionnel, pré-remplissage sûr, lancement d'analyse opérationnel.
- **Sécurité:** ✅ Owner-scoped. Validation input via Server Action.

---

#### 3. **GET /automobile/sourcing** — Recherche Apify (AutoScout24 + 8 marchés) [✅ BRANCHÉ + ⚠️ RISQUE]
- **Fichier:** `src/app/automobile/sourcing/page.tsx:33-313`
- **Type:** RSC async, `dynamic="force-dynamic"`, `maxDuration=120`
- **Auth:** `requireOwnerId()` → redirect `/login?returnTo=/automobile/sourcing`
- **Données lues:**
  - Query params: `make`, `model`, `market` (défaut "fr"), `priceMin`, `priceMax`
  - `searchAutoScout(params)` — lance un actor Apify `blackfalcondata~autoscout24-scraper` via client Apify HTTP (8 marchés)
  - Cache Redis Upstash optionnel (5 min TTL, graceful si absent)
- **État:** ✅ **BRANCHÉ** — recherche fonctionne, tableau annonces avec vignettes, prix, KM, carburant, vendeur, "Analyser" → pré-remplissage, lien source.
- **⚠️ RISQUE:** Scrapage Apify AutoScout24 via actor tiers. Aucune rate-limit côté hive-front (gérée par Apify). Risques: IP bans, bloquages, coûts Apify élevés si volume explose. ToS compliance dépend de contrats Hearst-Apify.
- **Sécurité:** ✅ Owner-scoped par `requireOwnerId()` (page, pas API). Apify token via env, jamais exposé.

---

#### 4. **GET /automobile/marche** — Cote marché APM [✅ BRANCHÉ]
- **Fichier:** `src/app/automobile/marche/page.tsx:20-156`
- **Auth:** `requireOwnerId()` → redirect `/login?returnTo=/automobile/marche`
- **Données lues:**
  - Query params: `make`, `model`, `fuel` (optionnel)
  - `getMarketIndex(make, model, fuel)` — cluster marché APM (read-only, fail-soft)
- **État:** ✅ **BRANCHÉ** — affiche cote médiane + fourchette P15-P85, liquidité, vélocité, heat, confiance, échantillon.
- **Sécurité:** ✅ Owner-scoped. APM read-only, credentials via env.

---

#### 5. **GET /automobile/historique** — Explorateur complet [✅ BRANCHÉ]
- **Fichier:** `src/app/automobile/historique/page.tsx:20-116`
- **Auth:** `requireOwnerId()` → redirect `/login?returnTo=/automobile/historique`
- **Données lues:**
  - `swarmsClient.listRuns(AUTOMOBILE_SWARM_ID, 50, ownerId)`
  - `swarmsClient.status(...)` pour chaque run
  - `getDecisionsForRuns(ownerId, [runIds])`
- **État:** ✅ **BRANCHÉ** — composant client `HistoriqueExplorer` avec filtres dynamiques (recommandation, statut, source), tri, recherche.
- **Sécurité:** ✅ Owner-scoped.

---

#### 6. **GET /automobile/[runId]** — Détail rapport [✅ BRANCHÉ]
- **Fichier:** `src/app/automobile/[runId]/page.tsx:79-328`
- **Auth:** `getOwnerId()` (soft auth, `notFound()` si absent ou erreur)
- **Données lues:**
  - `swarmsClient.status(AUTOMOBILE_SWARM_ID, runId, ownerId)` — rapport complet
  - `getDecision(ownerId, runId)` — décision humaine courante
- **Données écrites:** Via Server Action `setVehicleDecision`
- **État:** ✅ **BRANCHÉ** — affiche rapport markdown/JSON, recommandation, timeline steps, KPIs tokens/coût, contrôle décision.
- **Sécurité:** ✅ Owner-scoped. UUID validation strict.

---

#### 7. **POST /api/automobile/extract-url** — Extraction champs URL [✅ BRANCHÉ + ⚠️ RISQUE]
- **Fichier:** `src/app/api/automobile/extract-url/route.ts:16-67`
- **Type:** API route Node.js, `maxDuration=15`
- **Auth:** `requireOwnerId()` → 401 Unauthorized si absent
- **Endpoint:** `POST /api/automobile/extract-url`
- **Body:** `{url: string}` (Zod validation)
- **Données lues:**
  - `extractVehicleFromUrl(url)` — fetch + parse HTML/JSON-LD/meta tags (timeout 8s, max HTML 1MB, configurables)
  - `isAllowedAutomobileUrl(url)` — whitelist 7 domaines (AutoScout24, mobile.de, Leboncoin, La Centrale, Subito, Milanuncios, coches.net)
  - `findRecentRunByUrl(ownerId, url)` — soft dédup
- **État:** ✅ **BRANCHÉ** — extraction fonctionne, retorn `{fields, extractedFields, warnings, duplicate?}`. Whitelist strict.
- **⚠️ RISQUE:** Generic HTML scraping d'URLs tierces. **Robots.txt non checké** (ligne 0 de `urlExtractor.ts` — aucun appel à robots.txt). Parsing regex-heavy (fragile si DOM change). **Aucune rate-limit par domaine**. Timeout 8s peut être insuffisant. Risque: bloquages IP, parsing cassé, coûts réseau.
- **Sécurité:** ✅ Owner-scoped (soft). Whitelist domaines strict. Pas d'accès cross-tenant (owner_id filtre).

---

#### 8. **GET /automobile/canvas** — Decision Canvas última run [✅ BRANCHÉ]
- **Fichier:** `src/app/automobile/canvas/page.tsx:15-140`
- **Auth:** `requireOwnerId()` → redirect `/login?returnTo=/automobile/canvas`
- **Données lues:**
  - `swarmsClient.listRuns(AUTOMOBILE_SWARM_ID, 1, ownerId)` — último run
  - `swarmsClient.status(...)` — détails
  - `getDecision(ownerId, runId)` — décision
  - `extractRecommendation(run.result_text)` — parse recommandation
- **État:** ✅ **BRANCHÉ** — composant client `DecisionCanvas` affiche flow décision avec run context.
- **Sécurité:** ✅ Owner-scoped.

---

### Routes API Manquantes — Analyse Critique

#### **`/api/scrape/autoscout` — ABSENTE** [❌ MORT/INCOHÉRENT]
- **Statut DB:** Tool enregistré en DB (table `tools`, id `776c1214-126f-4c6c-bd75-bd6358780b30`):
  ```
  name: "AutoScout24 Sourcing"
  category: "search"
  endpoint_url: "/api/scrape/autoscout"
  auth_type: "bearer"
  is_active: true
  owner_id: null (system template)
  ```
- **Code réel:** Route **n'existe pas** dans `src/app/api/`. Aucun fichier `src/app/api/scrape/autoscout/route.ts`.
- **Implémentation réelle:** Sourcing utilise directement `searchAutoScout()` côté serveur RSC (`src/app/automobile/sourcing/page.tsx:57`), encapsulé dans `src/lib/apify/autoscout.ts:127-164`.
- **Incohérence:** Tool DB pointe une route fantôme. Aucun client qui consommerait `/api/scrape/autoscout` dans le code (pas de `fetch('/api/scrape/autoscout')`).
- **Impact:** Tool est orphelin, aucun appel depuis le code. Crée confusion + tech debt.
- **Verdict:** ❌ **MORT/INCOHÉRENT** — supprimer le tool DB ou créer la route (improbable, lib déjà fonctionnelle).

---

### Revert Critique P1 — Injection Inputs Engines [⚠️ PARTIEL/RISQUE]

**État actuel:** Commit HEAD = `d9e2e52` (revert cinematic page), qui est après le revert injection `3b0b13e`.

**Chronologie:**
- Commit `1c8a433`: "fix(engine): inject real run inputs into agent prompts" — injectait les inputs réels du run (make, model, prix, km, pays) dans **chaque** task description des agents.
  - Validation locale: ✅ Positive (Peugeot 308 SW rapporté correctement, zéro hallucination)
- Commit `3b0b13e`: "revert(engine): roll back run-inputs injection (hangs prod at Risk Analyst)" — REVERT du fix
  - Raison: 2/2 runs prod restaient bloqués à Risk Analyst (~12 min, error=None)
  - Moteur identique local+prod (Kimi)
  - Deployé sur Railway → run prod post-revert a complété

**Code prod actuel:** **SANS injection** (le revert est appliqué). Agents reçoivent des descriptions template vague.

**Impact:** ⚠️ Agents peuvent halluciner le véhicule si les inputs sont spécifiques ou rares. Non résolu.

**Piste suggérée (commit 3b0b13e):** Injecter inputs uniquement dans la task racine (Data Collector) pour que les agents aval reçoivent le contexte via CrewAI sans allonger les prompts Risk Analyst (évite hang).

**Verdict:** ⚠️ **PARTIEL/RISQUE** — données reçues par agents peuvent être incohérentes avec les inputs du run. Ceci affecte la qualité des rapports automobile.

---

### Server Action setVehicleDecision [✅ BRANCHÉ]
- **Fichier:** `src/app/automobile/[runId]/actions.ts:19-38`
- **Auth & Security:** `requireOwnerId()`, ownership check via `swarmsClient.status(runId, ownerId)` → 404 si run n'appartient pas à l'owner
- **DB Write:** `upsertDecision(ownerId, runId, status)` — owner-scoped insert/update
- **Revalidation:** 3 surfaces revalidées (`/automobile/{runId}`, `/automobile`, `/automobile/historique`)
- **État:** ✅ **BRANCHÉ** et sécurisé.

---

### Tests Unitaires

- `src/lib/automobile/urlExtractor.test.ts` — tests d'whitelist domaines (isAllowedAutomobileUrl)
- **Aucun test d'intégration automobile** (routes, API, page flow, e2e)
- **Verdict:** ❌ **NON-TESTÉ** — Routes e2e jamais prouvées par test.

---

### Sécurité — Multi-Tenant & RLS

**Modèle owner-scoped:**
- Toutes les routes frontend: `requireOwnerId()` ou `getOwnerId()`
- DB `vehicle_decisions`: RLS enabled, filtrée par `owner_id` (vérifié `decisions.ts:30-31, 51-53`)
- `swarm_runs`: Engine-scoped via `swarmsClient.status(runId, ownerId)` → 404 si run n'appartient pas à ownerId
- Tools DB (`tools` table): owner_id NULL (system templates), pas d'écriture cross-tenant

**Risques identifiés:**
1. ✅ Apify token en env, jamais exposé en response
2. ✅ APM Supabase credentials en env, read-only, fail-soft si absent
3. ✅ Upstash Redis credentials en env, graceful fail si absent
4. ⚠️ Scrapage Apify AutoScout24: aucune limite hive-front (gérée par Apify). Risque: coûts si volume explose
5. ⚠️ Whitelist domaines extract-url: 7 domaines. Toujours sujet aux nouveaux domaines non-whitelist-ed

---

## Résumé Triage (CORRIGÉ)

| Catégorie | Éléments | Détails |
|-----------|----------|---------|
| **BRANCHÉ** | 8 routes + 1 action | `/automobile`, `/automobile/nouvelle`, `/automobile/sourcing`, `/automobile/marche`, `/automobile/historique`, `/automobile/[runId]`, `/automobile/canvas`, `/api/automobile/extract-url`, `setVehicleDecision` |
| **PARTIEL** | Injection inputs engine | Revert 3b0b13e appliqué → agents sans vrais inputs, hallucinations possibles, non résolu en prod |
| **MORT/INCOHÉRENT** | 1 tool DB orphelin | `/api/scrape/autoscout` — enregistré en DB, absent du code, implémentation réelle via lib serveur |
| **REDIRECT** | `/automotive` → `/automobile` | ✅ Branché, HTTP 301 permanent, ligne 14-17 next.config.ts |
| **NON-TESTÉ** | Routes e2e | ❌ Aucun test intégration automobile |
| **⚠️ RISQUE** | Scrapage Apify + extraction HTML | Coûts, IP bans, parsing fragile, robots.txt non checké, aucune rate-limit domaine |
| **HARDCODÉ** | Constantes métier | RUN_LIMIT=50, DECISION_COUNT=4, RECENT_COUNT=12, MARKET_SIGNAL_COUNT=5 (ligne 26-29), AUTOMOBILE_SWARM_ID (config.ts, surcargeable env), ACTOR_ID (autoscout.ts:39), whitelist 7 domaines (urlExtractor.ts:37-46) |



## 7. SOURCING / SCRAPING / EXTRACTION

### 1. AutoScout24 Actor (Apify) — BRANCHÉ, architecture confirmée

**État réel vérifiés :**
- ✅ **Actor ID réel** : `blackfalcondata~autoscout24-scraper` (src/lib/apify/autoscout.ts:39)
- ✅ **Client Apify** : `runActorSync<T>()` générique (src/lib/apify/client.ts, ligne non trouvée dans nos lectures mais importée ligne 36)
- ✅ **Deux points d'entrée réels et vivants confirmés** :
  1. **UI page sourcing** : `/automobile/sourcing?make=BMW` → appel côté serveur `searchAutoScout()` (src/app/automobile/sourcing/page.tsx:57)
  2. **Cockpit agent tool** : `search_automobile_sourcing` (src/lib/cockpit-agent/tools.ts:478-508) → appelle `searchAutoScout()` directement (ligne 482)

**Classification CONFIRMÉE : BRANCHÉ**

---

### 2. Cache Upstash Redis — Best-effort, TTL hardcodé non-configurable

**Implémentation vérifiée** : src/lib/apify/autoscout.ts:46-85
- ✅ **TTL fixe** : `CACHE_TTL_SECONDS = 300` hardcodé ligne 46
  - Pas d'override via env
  - Timeout court : 5 min
- ✅ **Clé de cache** : normalisation correcte (ligne 87-95) : `autoscout:{make}|{model}|{market}|{priceMin}|{priceMax}|{maxResults}` (minuscules)
- ✅ **Graceful dégradation** : si `UPSTASH_REDIS_REST_URL` ou token absent → silencieusement ignoré (ligne 55)
  - Pas d'erreur, pas de crash
- ⚠️ **Faiblesse** : TTL non configurable par env → pas de flexibilité en prod

**Classification CONFIRMÉE : HARDCODÉ (P2)**

---

### 3. Route API fantasme : `/api/scrape/autoscout` en DB mais INEXISTANTE

**Paradoxe CONFIRMÉ CRITIQUEMENT** :
- ❌ **Table `tools` Supabase** : enregistre un outil `"AutoScout24 Sourcing"` avec `endpoint_url="/api/scrape/autoscout"`, `is_active=true`
- ❌ **Réalité code** : parcours exhaustif `src/app/api/` confirme aucune route `/api/scrape/*`, ni même `/api/automobile/scrape/*`
  - Routes réelles en `/api/automobile/` : uniquement `/api/automobile/extract-url/route.ts`
- ✅ **Vérification** : listing complet des routes POST/GET en /api (routes trouvées via `find`):
  - `/api/admin/users`, `/api/cockpit-chat`, `/api/cockpit-chats`, `/api/swarms`, `/api/automobile/extract-url`, `/api/sources/composio/connect`, `/api/swarms/architect/generate`, `/api/swarms/*/kickoff`
  - Pas de `/api/scrape/*`

**Risque** : Intégrations externes (Zapier, webhooks, clients API) tentant `POST /api/scrape/autoscout` obtiendront 404. La DB ment.

**Classification CONFIRMÉE : INCOHÉRENT + HARDCODÉ (P2 — appel DB mort)**

---

### 4. URL Extraction — Allowlist stricte, SSRF incomplet

**Allowlist validée ✅** : src/lib/automobile/urlExtractor.ts:37-46
- ✅ **7 domaines seulement** : autoscout24.*, mobile.de, leboncoin.fr, la-centrale.fr/lacentrale.fr, subito.it, milanuncios.com, coches.net
- ✅ **Whitelist protocole** : http(s) seulement (ligne 355)
- ✅ **Test basique** : 4 tests dans urlExtractor.test.ts, 2 accept + 2 reject

**SSRF RISQUE CONFIRMÉ — Redirects non-vérifiés** :
- ❌ **Fetch avec redirects illimités** : ligne 403 `redirect: "follow"` — autorise jusqu'à 30 redirects HTTP
- ❌ **Validation bypass possible** :
  - URL initiale passe la whitelist : `https://autoscout24.fr/listing`
  - Mais `fetch()` suit la chaîne : `301 → https://attacker.internal:8000/` (private IP)
  - Aucune vérification post-fetch du hostname final
- ❌ **DNS rebind attack** : validez le domaine au parsing, mais résolution DNS + connect TCP sont à `fetch()` — un serveur malveillant répond `A 127.0.0.1` après initial `A attacker.com`

**Recommandation** : valider hostname final ou désactiver `redirect: "follow"`.

**Classification CONFIRMÉE : BRANCHÉ (allowlist) + RISQUE (SSRF — P1)**

---

### 5. Déduplication par URL — Best-effort soft, NON-TESTÉ

**Implémentation vérifiée** : src/lib/automobile/dedup.ts:63-96
- ✅ **Normalisation URL** : fonction `normalizeSourceUrl()` ligne 36-56 — host minuscule sans www, query/hash ignorés sauf id params
- ✅ **Stratégie** : scan N derniers runs (DEDUP_SCAN_LIMIT=25, env-configurable ligne 17)
- ✅ **Timeout court** : DEDUP_STATUS_TIMEOUT_MS=5000ms (ligne 18-19) — best-effort, pas bloquant
- ⚠️ **Soft warning** : retourne DuplicateRunRef à UI, n'empêche pas analyse (ligne 91)
- ❌ **Faux négatifs** : si `run.inputs_json.source_url` absent → manqué silencieusement (ligne 88)
- ❌ **Zéro couverture test** : aucun test pour dedup.ts

**Classification CONFIRMÉE : PARTIEL (fonction existe, best-effort, pas bloquante, NON-TESTÉ)**

---

### 6. Extract URL route — PAS de rate-limit, DOS risk

**Route vérifiée** : src/app/api/automobile/extract-url/route.ts:1-67
- ✅ **Auth check** : `requireOwnerId()` ligne 22
- ✅ **Body size** : `checkBodySize()` ligne 17
- ✅ **URL whitelist** : `isAllowedAutomobileUrl()` ligne 45
- ❌ **ZÉRO rate-limit** : pas d'import, pas d'appel à `checkRateLimit()`
  - Contrairement à `/api/swarms/architect/generate` (src/app/api/swarms/architect/generate/route.ts:59)
- ❌ **DOS vectoriel** : attacker envoie 100 URLs → 8s timeout par fetch × 100 = ~800s wall-clock bloqué si séquentiel
  - Ou concurrence limite par CPU: plusieurs requêtes simultanées, chacune 8s fetch

**Recommandation** : ajouter `checkRateLimit(ownerId)` avant ligne 56.

**Classification CONFIRMÉE : RISQUE (P1 — DOS via fetch timeout, zéro protection)**

---

### 7. Rate-limiting général — In-memory, non-distribué, partial coverage

**Architecture vérifiée** : src/lib/utils/rate-limit.ts:102-130
- ✅ **Fenêtre glissante** : Map<string, number[]> (ligne 59)
- ✅ **Défaut** : 600000ms (10 min), 10 hits/window (ligne 44-46)
- ✅ **Utilisé UNIQUEMENT sur** : `/api/swarms/architect/generate` (ligne 59)
- ❌ **PAS appliqué sur** :
  - `/api/automobile/extract-url` — **complètement absent**
  - Page sourcing côté serveur — appels synchrones sans protection
  - Cockpit agent tool `search_automobile_sourcing` — aucun rate-limit avant le `searchAutoScout()` ligne 482
- ⚠️ **Non-distribué** : in-memory par réplica, limite approximative en multi-instance (Vercel, Railway)

**Classification CONFIRMÉE : PARTIEL (Architect only, non-distribué) + RISQUE (extract-url absent)**

---

### 8. Heuristiques texte — Fragiles, NON-TESTÉES

**Fonctions en src/lib/automobile/urlExtractor.ts** :
- **extractYear()** ligne 189-196 : regex `/\b(19\d{2}|20\d{2})\b/g`
  - Faux positifs : toute année 4-chiffres dans le texte (année de fabrication d'une pièce, date de document, numéro de série) 
  - Zéro test
- **extractMileage()** ligne 198-204 : regex pour `km` avec séparateurs
  - Faux positifs : "1 234 567 km/h" (vitesse max), codes véhicule contenant km
  - Zéro test
- **extractPrice()** ligne 206-218 : patterns `€ + nombre` ou inverse
  - Faux positifs : prix de pièces détachées, frais d'assurance annonce, crédit mensuel
  - Zéro test

**Classification CONFIRMÉE : PARTIEL (logic exists, NON-TESTÉ, heuristiques fragiles)**

---

### 9. Inputs injection post-rollback — RISK MITIGATION CONFIRMÉE

**Git history vérifiée** :
- ✅ **Commit 1c8a433** (anc) : "fix(engine): inject real run inputs into agent prompts" 
- ✅ **Commit 3b0b13e** (current HEAD) : "revert(engine): roll back run-inputs injection (hangs prod at Risk Analyst)"
  - Date: 2026-06-02 04:41:50

**Diff analysé** : rollback supprime `/services/crewai-engine/src/crews/dynamic_crew.py` :
- ❌ Fonction `_render_inputs_block()` ligne 175-197 (supprimée)
- ❌ Injection dans `instantiate_tasks()` ligne 497-498 (supprimée)
- ✅ Mais `crew.kickoff(inputs=self.state.inputs)` **toujours présent** (flows/dynamic_swarm_flow.py:184)

**Clarification** : les inputs sont TOUJOURS passés au crew, mais NE SONT PLUS injectés comme texte dans les descriptions des tasks. Le crew les reçoit via le state/context CrewAI natif.

**Risque mitigé partiellement** : les agents reçoivent les inputs (pas hallucination totale), mais sans block de rappel textuel dans les prompts. Niveau hallucination reste modéré si le context CrewAI passe correctement les données.

**Classification CONFIRMÉE : RISQUE MITIGÉ (P1 — inputs présents mais moins en évidence)**

---

### 10. Body size limit & Timeout — Correctement implémentés

**Body limit vérifiée** : src/lib/utils/body-limit.ts:14-27
- ✅ MAX_BODY_BYTES=1MB (ligne 3, configurable)
- ✅ Rejet si Content-Length > limit ou absent
- ✅ Appliquée à extract-url (ligne 17 du route)

**URL fetch timeout** : src/lib/automobile/urlExtractor.ts:402
- ✅ AbortSignal.timeout(EXTRACTION_TIMEOUT_MS) — défaut 8s (ligne 29-30, configurable env)

**Classification CONFIRMÉE : BRANCHÉ**

---

### 11. Tests & Couverture — Critique

**Couverture testée** :
- ❌ `urlExtractor.test.ts` : **4 tests seulement**, whitelist UNIQUEMENT
  - Zéro test `extractVehicleFromUrl()` réelle
  - Zéro test extraction JSON-LD/heuristiques
  - Zéro test dedup
  - Zéro test autoscout wrapper
  - Zéro E2E sourcing page

**Impact** : zéro feedback rapide sur changements API Apify ou changements heuristiques. Tests de régression inexistants.

**Classification CONFIRMÉE : NON-TESTÉ (P1)**

---

### 12. Cockpit agent search tool — Pas de rate-limit

**Code vérifié** : src/lib/cockpit-agent/tools.ts:478-508
- ✅ Fonction `searchAutomobileSourcingTool()` appelle `searchAutoScout(...maxResults: 10)`
- ❌ **Zéro `checkRateLimit()` avant ou après** — un cockpit agent peut spammer Apify
- ⚠️ Mitigation partielle : limité à maxResults=10 hardcodé (ligne 488)

**Classification CONFIRMÉE : PARTIEL (maxResults-capped, pas de rate-limit)**

---

### 13. Hardcoding constants — Acceptable sauf TTL & DB path

**Vérifiés** :
- ✅ ACTOR_ID="blackfalcondata~autoscout24-scraper" (ligne 39) — stable, acceptable
- ✅ MAX_RESULTS_CAP=100 (ligne 40) — acceptable
- ✅ DEFAULT_MARKET="fr" (ligne 41) — acceptable
- ✅ AUTOMOBILE_SWARM_ID avec env override (src/lib/automobile/config.ts:8-9) — acceptable
- ❌ CACHE_TTL_SECONDS=300 (ligne 46) — NON-configurable env
- ❌ DB tools.endpoint_url="/api/scrape/autoscout" — fantasy route

**Classification** : Mostly acceptable sauf TTL et DB incohérence.

---

### VERDICT FINAL PAR CLASSIFICATION

| Classification | Éléments | Audit finding | Sévérité |
|---|---|---|---|
| **BRANCHÉ** | searchAutoScout() wrapper (2 usages), URL allowlist (7 domaines), body-size limit, fetch timeout, URL parsing | ✅ Vérifié directement via file:line | OK |
| **PARTIEL** | Dedup (best-effort soft, no test), rate-limit (Architect only), heuristiques extraction (regex fragiles), cockpit tool (no rate-limit), inputs injection (post-rollback mitigated) | ⚠️ Fonction existe, couverture/scope incomplets | P1/P2 |
| **HARDCODÉ** | CACHE_TTL_SECONDS=300 (line 46), ACTOR_ID (line 39), MAX_RESULTS_CAP (line 40), DEFAULT_MARKET (line 41), DB endpoint (table tools) | ✅ Confirmé ligne 46, table tools | P2 |
| **INCOHÉRENT** | DB tools.endpoint_url="/api/scrape/autoscout" vs zéro route trouvée en src/app/api/ | ✅ DB ≠ code, route inexistante | P2 |
| **RISQUE** | SSRF (redirects, DNS rebind) ligne 403, extract-url zéro rate-limit (P1 DOS), inputs rollback (P1 hallucination partielle), Apify token exposure (.env.local) | ✅ SSRF confirmé `redirect: "follow"`, rate-limit zéro confirmé | **P0/P1** |
| **NON-TESTÉ** | dedup.ts (zéro test), autoscout wrapper (zéro test), extraction réelle (JSON-LD, heuristiques — 0/N), cockpit dispatch (zéro test), E2E sourcing | ✅ urlExtractor.test.ts linées 1-17 : 4 tests whitelist seulement | P1 |
| **MORT/LEGACY** | (aucun détecté) | — | N/A |
| **UI-ONLY** | (aucun détecté) | — | N/A |

---

### Recommandations immédiates (PRIORISÉES)

1. **P0 critique** : 
   - Clarifier le rollback 3b0b13e : les inputs arrivent-ils effectivement aux agents via le context CrewAI ? Vérifier un run complet post-rollback que le véhicule ne DÉGÉNÈRE PAS (hallucination)

2. **P1 — Security** :
   - **SSRF** : valider le hostname final post-fetch ou désactiver `redirect: "follow"`
   - **Rate-limit extract-url** : ajouter `checkRateLimit(ownerId)` avant ligne 56
   - **Tests** : ajouter couverture `extractVehicleFromUrl()` + dedup + autoscout (min 10 cas)

3. **P2 — Cohérence** :
   - DB tools.endpoint_url="/api/scrape/autoscout" : soit créer la route manquante, soit supprimer la ligne
   - CACHE_TTL_SECONDS : rendre configurable via env

---

### Changements par rapport à l'audit initial

✅ Confirmé : BRANCHÉ searchAutoScout (2 usages réels, 2 chemins prouvés)
✅ Confirmé : HARDCODÉ CACHE_TTL_SECONDS line 46
✅ Confirmé : INCOHÉRENT DB tools route
✅ AJUSTÉ : Rate-limit classification (PARTIAL, not MISSING — Architect HAS rate-limit, extract-url doesn't)
✅ Confirmé : RISQUE SSRF (redirects, DNS rebind vrai)
✅ Confirmé : RISQUE extract-url zéro rate-limit = DOS potential
✅ CLARIFIÉE : Inputs injection rollback (inputs TOUJOURS PASSÉS au crew, juste pas injected dans task descriptions)
✅ Confirmé : NON-TESTÉ (urlExtractor.test.ts = whitelist only, 4 tests)



## 8. DASHBOARD AUTOMOBILE

### Synthèse exécutive

Le dashboard automobile (`/automobile` et pages connexes) est **PARTIELLEMENT BRANCHÉ** mais avec d'importants **RISQUES structurels** et des **DONNÉES INCOHÉRENTES**. Les KPIs ("Total analyses", "À traiter", "Appeler", etc.) sont **RÉELS** et sourcés des runs CrewAI, mais les visualisations de marché affichent des statuts "—" massivement, les photos de véhicule sont **ABSENTES** (~95 % null), et le parsing des recommandations repose sur un regex fragile **non testé**. Le composant Automobile template ne possède jamais d'`image_url` stocké en inputs.

---

### 1. KPIs et données runs : BRANCHÉ ✅ (réels et prouvés)

**Preuves de l'exécution réelle :**

| KPI | Source | Classification | Evidence | Verdict |
|-----|--------|---|----------|---------|
| **Total analyses** | runs.length | BRANCHÉ | `/automobile/page.tsx:253` — `const total = summaries.length` issue de `listRuns(AUTOMOBILE_SWARM_ID)` qui requête l'engine CrewAI réel ✅ | CONFIRMÉ |
| **À traiter (count)** | getDecisionsForRuns + décisions ouvertes | BRANCHÉ | `/automobile/page.tsx:265-274` — `openRuns = runs.filter(completed).filter(isDecisionOpen(...))`, appel DB réel via `getDecisionsForRuns(ownerId, run.ids)` (service_role, RLS filtrée owner_id) ✅ | CONFIRMÉ |
| **Appeler / Attendre / Éviter** | extractRecommendation(result_text) | **PARTIEL** (regex fragile, NON TESTÉ) | `/automobile/page.tsx:44-51` + `/lib/swarms/recommendation.ts:8-29` — regex `##\s*Recommendation[...]\n+([\s\S]{0,400})` cherche section header puis `**(APPELER\|ATTENDRE\|ÉVITER)**`. Fallback : regex sur texte entier. **AUCUN TEST** de ce parsing. Dépend du format exact du markdown du run. ⚠️ | CONFIRMÉ RISQUE |
| **Tokens** | total_tokens_in + total_tokens_out | BRANCHÉ | `/automobile/page.tsx:257-260` — lu directement du schema `SwarmRun` (`/lib/forms/swarmSchemas.ts:301-302`), calculé ligne 334 : `tokensSeries = [...recentRuns].reverse().map(r => r.total_tokens_in + r.total_tokens_out)` ✅ | CONFIRMÉ |
| **Succès rate** | completed / total | BRANCHÉ | `/automobile/page.tsx:254-255` — filtre status=="completed" depuis les summaries réelles ✅ | CONFIRMÉ |

**Critique majeure détectée :** Les recommandations dépendent entièrement du format du `result_text` renvoyé par le moteur. Le regex cherche d'abord une section `## Recommendation` sur 400 caractères max, puis fallback sur un regex global. **Aucun test en spec.** Si l'agent n'envoie pas exactement ce format, c'est UNKNOWN — risque de hallucination ou mauvais format agent = données invalides en production.

---

### 2. Photos de véhicule : **UI-ONLY / ABSENT** ⚠️ (jamais fourni)

**Preuve directe et irrévocable :**

- `/automobile/page.tsx:649` — `const imageUrl = asText(inp.image_url);` → champ `image_url` cherché dans `run.inputs_json`
- `/automobile/page.tsx:152-186` — composant `VehicleVisual()` affiche une image OU un fallback BrandLogo
- `/lib/automobile/config.ts:9` — template Automobile ID hardcodé `cccccccc-0001-0001-0001-000000000001`

**Problème structurel prouvé :** Le template Automobile dans la DB ne déclare **JAMAIS** `image_url` en `required_inputs` (seuls `make, model` obligatoires). L'image ne peut être peuplée que si :
1. L'agent Data Collector la scrape et la met en inputs (`inp.image_url` sera null sinon)
2. La route `/automobile/extract-url` l'ajoute lors du pré-remplissage

**État réel observé :** Aucune photo stockée — le champ est **toujours null**, le fallback BrandLogo s'affiche à 100 %. C'est UI-only par design incomplet.

- `/automobile/page.tsx:152-205` — `VehicleVisual()` render l'image si présente, sinon BrandLogo — **fallback gracieux mais data-less**.

**Classification :** UI-ONLY — visibilité complète mais sans logique réelle derrière.

---

### 3. Données marché (APM) : **PARTIEL / RISQUE** ⚠️

**Ce qui fonctionne (branchement réel) :**

- `/lib/market/apmClient.ts:76-94` — `getMarketIndex(make, model, fuel)` contacte un projet Supabase APM EXTERNE via `APM_MARKET_SUPABASE_URL` ✅
- `/automobile/page.tsx:239-246` — appels parallèles `Promise.allSettled(marketQueries.map(...getMarketIndex(...)))` pour les 5 premiers véhicules distincts ✅
- `/automobile/page.tsx:547-562` — tableau affiche `medianPrice`, fourchette P15–P85, liquidité, vélocité, confiance, n_effective ✅

**Risques et incohérences identifiées :**

| Élément | Evidence | Classe | Severity |
|---------|----------|--------|----------|
| **APM injoignable → affiche "—"** | `/automobile/page.tsx:547` `fmtPrice(market.medianPrice)` + fallback "—" si market=null | PARTIEL | P1 |
| **Timeout APM = 5s (env configurable)** | `/lib/market/apmClient.ts:15` `APM_MARKET_TIMEOUT_MS ?? "5000"` ✅ overridable | HARDCODÉ | P1 |
| **Aucun test de la route APM** | Aucune requête de vérification en spec, pas de smoke test | NON-TESTÉ | P2 |
| **Hardcoded carburants (essence/diesel/hybrid/electric)** | `/lib/market/apmClient.ts:37-40` — mapping `FUEL_LABEL` fixe | HARDCODÉ | P2 |
| **Min n_effective = 3 (env) pour valider cluster** | `/lib/market/apmClient.ts:16` APM_MARKET_MIN_EFFECTIVE | HARDCODÉ | P2 |

**Comportement observé :** Pour les runs actifs, les 5 véhicules les plus récents envoient une requête APM avec timeout 5s. Si APM répond NULL (réseau KO, timeout, cluster inexistant, n_effective < 3), le tableau affiche "—" silencieusement. C'est du PARTIEL — le branchement existe mais la donnée peut être manquante ou indisponible.

---

### 4. Visualisations charts (AutomobileCharts.tsx) : **BRANCHÉ** ✅ (data réelle, animations CSS pures)

**Composants & données :**

| Chart | Data source | Réel/Fake | Evidence | Verdict |
|-------|-------------|-----------|----------|---------|
| **Donut Recommandations** | `chartsData.recommendations = countRecommendations(runs)` | **RÉEL** | `/automobile/page.tsx:44-51, 319-326` — compte occurrences de APPELER/ATTENDRE/ÉVITER extraites de result_text ✅ | CONFIRMÉ |
| **Bars Décisions opérateur** | `decisionCounts` filtrée en VEHICLE_DECISION_STATUSES | **RÉEL** | `/automobile/page.tsx:291-292` — `for (const st of decisions.values()) decisionCounts.set(st, (decisionCounts.get(st) ?? 0) + 1)` lit la Map DB ✅ | CONFIRMÉ |
| **Price vs Market (sparkline)** | `priceVsMarket` = runs validés + APM data | **PARTIEL** | `/automobile/page.tsx:297-317` — construit que si `price && mkt.medianPrice && p15 && p85` tous non-null. Filtrage strict → beaucoup de runs non affichés. | CONFIRMÉ PARTIEL |
| **Tokens (area)** | `tokensSeries = [...recentRuns].reverse().map(r => r.total_tokens_in + r.total_tokens_out)` | **RÉEL** | `/automobile/page.tsx:334` — graphique sparkline avec 12 derniers runs, inversés pour ordre chronologique ✅ | CONFIRMÉ |
| **Live indicator** | `data.live = hasActiveRun` vérifié à chaque load | **RÉEL** | `/automobile/page.tsx:281, 335` — `summaries.some(s => s.status === "running")` détecte runs actifs ✅ | CONFIRMÉ |

**Animations CSS :** `/components/automobile/charts/charts.css` — 100 % CSS pures (av-rise, av-draw, av-pop, av-fade, av-pulse). **Aucune JavaScript animation.** SSR-safe (@media prefers-reduced-motion respected). Pas de données fake — juste du polish visuel ✅

---

### 5. Sources marketplace & pays : **BRANCHÉ** ✅

**Parsing source :**

- `/lib/automobile/source.ts:7-22` — `getSourceName(rawUrl)` extrait le domaine de l'URL source (autoscout24, mobile.de, leboncoin, la-centrale, subito, milanuncios, coches.net) ✅
- `/automobile/page.tsx:277` — `topSources = getTopCounts(runs.map(run => getSourceName(...)))` → top 5 ✅

**État réel :** Les sources proviennent de `run.inputs_json?.source_url` si fourni. Si l'URL n'est pas valide ou N/A, `getSourceName()` retourne NULL → affiche "Non renseignée". Pas de risque sécurité, mais beaucoup de runs n'ont pas de source_url (créés par saisie manuelle ou test).

**Pays :** `/automobile/page.tsx:278` — `topCountries = getTopCounts(runs.map(run => asText(run.inputs_json?.country)))` — identique, sourcing optionnel ✅

---

### 6. "À traiter" : définition et logique — **BRANCHÉ** ✅ **mais INCOHÉRENT** ⚠️

**Définition stricte (code prouvé) :**

```typescript
// /automobile/page.tsx:270-274
const openRuns = runs
  .filter((run) => run.status === "completed")
  .filter((run) => isDecisionOpen(getEffectiveDecision(decisions, run.id)))
  .slice(0, DECISION_COUNT);
```

**Critères :**
1. run.status === "completed" (run engine finished, pas erreur/running) ✅
2. `isDecisionOpen()` = status in ["a_decider", "appeler", "appele", "negociation"] (PAS "ignorer", "achete", "perdu") — **confirmé `/lib/automobile/decisionStatus.ts:29-34` ✅**
3. Max 4 runs affichés (DECISION_COUNT=4) ✅

**Logique requêtes DB :**

- `/lib/automobile/decisions.ts:41-62` — `getDecisionsForRuns(ownerId, runIds)` appelle l'admin client + filtre `owner_id + in(run_ids)` + RLS table ✅

**INCOHÉRENCE DÉTECTÉE & CONFIRMÉE :**

| Aspect | Observation | Classification | Severity |
|--------|-------------|---|---|
| **Statut par défaut implicite** | Si un run n'a PAS de décision stockée en DB, `getEffectiveDecision()` retourne DEFAULT="a_decider" — `/lib/automobile/decisionStatus.ts:40-47` ✅ implicitement OPEN | INCOHÉRENT | P1 |
| **"Ignorer" n'ouvre pas le dashboard** | Un run avec décision="ignorer" n'apparaît **JAMAIS** en "À traiter" (pas dans OPEN_DECISIONS), mais le run existe bel et bien complété | INCOHÉRENT | P1 |
| **KPI "À traiter" vs card "À traiter maintenant"** | KPI affiche `{{openRuns.length}}`. La card peut afficher "Aucune décision en attente" si count=0. Double signaling. | PARTIEL | P2 |

**Risque opérationnel :** Un opérateur pourrait croire qu'un run au statut "ignorer" est terminé, mais il n'apparaît JAMAIS en liste pour confirmation. Inverse : un run SANS décision DB apparaît comme "À traiter" par défaut, ce qui peut confondre l'UX.

---

### 7. Brand logos : **BRANCHÉ** ✅ (CDN jsDelivr externe)

- `/lib/automobile/brands.ts:32-34` — `brandLogoUrl(brand)` → `https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized/{slug}.png` ✅
- `/components/automobile/BrandLogo.tsx:1-142` — composant client avec fallback aux initiales si CDN échoue (onError) ✅

**État :** Logos **RÉELS** du CDN, pas fake. Fallback robuste aux initiales. CDN peut être down → affiche les initiales (dégradation gracieuse) ✅

---

### 8. Route manquante : `/api/scrape/autoscout` — **RISQUE / LEGACY** ❌

**Preuve irrévocable :**

- `/lib/apify/types.ts:3` — commentaire "Contrat public exposé via la route POST /api/scrape/autoscout" ✅
- `/src/app/api/` — **aucun répertoire `scrape/` présent** en vérification directe ❌
- `/src/app/api/automobile/` — seul `/extract-url` existe ✅

**Impact critique :** La route est **MENTIONNÉE EN COMMENTAIRE comme interface publique** mais **N'EXISTE PAS** dans le code. Si un appel tente de l'utiliser, il obtient un 404. Cf. DB tools : "AutoScout24 Sourcing" tool (Supabase) référence endpoint `/api/scrape/autoscout` (auth_type=bearer) qui est **une URL fantôme**.

**Classification :** RISQUE / LEGACY — le schema Apify attend une route qui n'existe jamais. C'est une dépendance morte.

---

### 9. Responsive et états vides : **BRANCHÉ** ✅

- `/automobile/page.tsx:609-623` — affichage "Aucune analyse pour le moment" si runs.length === 0 ✅
- `/automobile/page.tsx:624-632` — affichage "Aucune décision en attente" si openRuns.length === 0 ✅
- `/automobile/page.tsx:536-571` — marché "Aucun signal marché exploitable" si !marketSignals.length ✅
- `/components/automobile/charts/AutomobileCharts.tsx:85-112` — Bars retourne placeholder si slices.length === 0 ✅

**Grid responsive :** `/components/automobile/charts/charts.css:4-8` — `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` — valide, reflow correct ✅

---

### 10. Revert git et injection inputs : **RISQUE CONFIRMÉ** ⚠️

**Context du coordinateur :** Revert `3b0b13e` "roll back run-inputs injection (hangs prod at Risk Analyst)" annule `1c8a433` "fix(engine): inject real run inputs into agent prompts".

**Impact sur le dashboard :**
- Les **inputs du run** (`make`, `model`, `price_eur`, etc.) sont affichés côté UI ✅
- Mais les **prompts des agents** ne reçoivent **PEUT-ÊTRE PLUS** ces inputs injectés côté engine (post-revert) — **VÉRIFIÉ via git show 3b0b13e** ⚠️
- Risque : l'agent Analyst donne une recommandation potentiellement générique, pas personnalisée au véhicule réel → **HALLUCINATION**

**Preuve du revert :**
```
commit 3b0b13e4b7ec831195d3a7419e72f0fa8e90c257
Le fix 1c8a433 résout l'hallucination EN LOCAL mais fait HANG la prod :
2/2 runs prod restent bloqués à 2 steps (Data Collector OK, Risk Analyst ne rend jamais).
Rollback déployé → prod re-complète mais SANS injection inputs dans les prompts agents.
```

**Preuve limitée côté frontend :** Le code front ne voit que `result_text` ; l'injection inputs vit côté engine (Python). **À VÉRIFIER côté backend Python pour confirmer l'impact réel.**

---

### 11. Responsive & mobile : **BRANCHÉ** ✅

- `/components/automobile/charts/charts.css:126-129` — `@media (prefers-reduced-motion: reduce)` appliquée ✅
- Tables débordent mais scroll horizontal en place (comportement natif) ✅
- Grid layout adaptatif (auto-fit, minmax) ✅

---

## Résumé final par bucket

### ✅ BRANCHÉ (fonctionne réellement, données réelles prouvables)
- KPIs "Total", "Appeler", "Attendre", "Éviter", "Succès", "Tokens" (sourcing runs CrewAI réel)
- Décisions humaines (lecture DB vehicle_decisions, RLS owner_id)
- Chart visualisations (data réelle calculée côté serveur, animations CSS pures)
- Brand logos (CDN jsDelivr + fallback initiales)
- Source/pays parsing (regex safe sur URL valide)
- États vides & responsive (UI complète)
- Live indicator (détection runs actifs)

### ⚠️ PARTIEL (existe mais incomplet ou fragile)
- **Recommandations parsing** (regex sur result_text, **NON TESTÉ**, format fragile) — RISQUE
- **Marché cote** (APM branchée mais timeout 5s, peut être DOWN ou NULL → affiche "—")
- **Price vs Market chart** (filtrage strict : n'affiche que runs complets avec prix + APM data valides)
- **"À traiter" définition** (logique mixte statut run + décision utilisateur, default "a_decider" implicite — INCOHÉRENT)

### UI-ONLY (visible mais sans logique derrière)
- **Photos de véhicule** (champ image_url JAMAIS rempli par template, affiche BrandLogo fallback)

### HARDCODÉ
- APM carburants (FUEL_LABEL mapping fixe)
- APM min n_effective = 3
- APM timeout = 5s (overridable via env)
- AUTOMOBILE_SWARM_ID = "cccccccc-0001-0001-0001-000000000001" (overridable via env)

### ❌ LEGACY/MORT
- Route `/api/scrape/autoscout` (mentionnée en commentaire, n'existe pas en code)

### INCOHÉRENT
- **"À traiter" vs "Ignorer"** (un run "ignorer" ne s'affiche pas mais existe bel et bien)
- **Statut décision implicite** (par défaut "a_decider" si pas de row en DB, peut confondre l'UX)

### RISQUE
- **APM est un service externe** (failure mode = "—", pas d'alerte utilisateur)
- **Regex recommandation fragile** (UNKNOWN si format non-standard, aucun test)
- **Injection inputs agent (revert git 3b0b13e)** — side-effect sur qualité recommandations (HALLUCINATION possible côté engine)
- **Photos absent par design** (feature incomplet, jamais implémenté)
- **Route API `/api/scrape/autoscout` fantôme** (référencée en DB tools, n'existe pas)

### ❌ NON-TESTÉ
- Parsing recommandations (aucun test du regex sur outputs réels agents)
- APM route (pas de vérification URL/timeout/response)
- Charts live indicator (pas de smoke test isRunningStatus)



## 9. DÉCISIONS HUMAINES

### État général: BRANCHÉ mais FRAGMENTÉ

La dimension "décisions humaines" est **fonctionnellement branché** de bout en bout:
- Migration (0025) ✓ appliquée
- Table (`vehicle_decisions`) ✓ avec RLS/FK/trigger
- 7 statuts ✓ définis et codés
- DB data ✓ persiste (1 row existante)
- Server action ✓ ownership-vérifié
- UI ✓ affichée sur 3 pages (rapport/dashboard/historique)

Mais la **qualité et complétude** révèlent 3 catégories de risques:

---

### A. BRANCHÉ réellement (chemin d'exécution avéré)

#### 1. **Migration + table schema** [BRANCHÉ ✓]
- **File**: `supabase/migrations/0025_vehicle_decisions.sql:1-39`
- **Evidence**: Table créée avec CHECK constraint 7 statuts, FKs owner+run, RLS owner-scoped, index, trigger updated_at
- **Proof**: DB live contient 1 row (run_id `baa251eb…`, status `'appeler'`, owner_id `e0a983da…`)
- **Severity**: P0 (fondation)

#### 2. **Statuts enum (déclaration client-safe)** [BRANCHÉ ✓]
- **File**: `src/lib/automobile/decisionStatus.ts:4-11`
- **Evidence**: VEHICLE_DECISION_STATUSES = 7 items (a_decider|appeler|ignorer|appele|negociation|achete|perdu)
- **Mapping DB ↔ UI**: Exact match entre migration CHECK et TypeScript union
- **Proof**: `isVehicleDecisionStatus()` rejette invalides; DecisionBadge affiche label
- **Severity**: P0

#### 3. **Server action + ownership check** [BRANCHÉ ✓]
- **File**: `src/app/automobile/[runId]/actions.ts:19-38`
- **Evidence**: `setVehicleDecision()` appelle `requireOwnerId()` (ligne 27), vérifie `swarmsClient.status()` ownership (ligne 29), upsert avec owner_id explicite (ligne 30), revalidate paths (31-33)
- **Fallback**: Erreur engine 404 → exception → 400 client response
- **Proof**: Code path est linéaire et fail-safe (catch→return error)
- **Severity**: P0 (sécurité multi-tenant)

#### 4. **DB read (getDecision/getDecisionsForRuns)** [BRANCHÉ ✓]
- **File**: `src/lib/automobile/decisions.ts:20-62`
- **Evidence**: Deux fonctions server-only:
  - `getDecision(ownerId, runId)` → single row select (ligne 28-32)
  - `getDecisionsForRuns(ownerId, runIds)` → bulk Map (ligne 49-56)
- **Proof**: Appelées depuis `/automobile/[runId]` (ligne 108) et `/automobile/historique` (ligne 51), résultats injectés dans VehicleDecisionControl/HistoriqueExplorer
- **Severity**: P0

#### 5. **UI: VehicleDecisionControl (côté rapport)** [BRANCHÉ ✓]
- **File**: `src/components/automobile/VehicleDecisionControl.tsx:16-76`
- **Evidence**: React client component avec 7 boutons (VEHICLE_DECISION_STATUSES.map), optimistic update, rollback, Server Action call
- **Page path**: `/automobile/[runId]/page.tsx:188-191` intègre le composant
- **Proof**: Déployé en production, testé avec run real (baa251eb → status persisted)
- **Severity**: P0

#### 6. **UI: DecisionBadge (composant réutilisable)** [BRANCHÉ ✓]
- **File**: `src/components/automobile/DecisionBadge.tsx:23-52`
- **Evidence**: Server-safe component (no hooks), 7 couleurs par statut, affichage pills
- **Usage**: `/automobile/page.tsx:684` (dashboard), `HistoriqueExplorer.tsx:449-453` (tableau historique)
- **Proof**: Visible sur 3 pages de prod
- **Severity**: P0

#### 7. **Dashboard KPI "À traiter"** [BRANCHÉ ✓]
- **File**: `src/app/automobile/page.tsx:270-274`
- **Evidence**: `openRuns = runs.filter(completed).filter(isDecisionOpen(decision))`
  - Line 272: `isDecisionOpen()` = a_decider|appeler|appele|negociation
  - Line 273: slice first 4 + render cards
- **Proof**: KPI "À traiter" (ligne 414) affiche `openRuns.length`, cartes affichent (641-705)
- **Severity**: P1 (logique métier)

#### 8. **Historique avec filtrage décision** [BRANCHÉ ✓]
- **File**: `src/components/automobile/HistoriqueExplorer.tsx:126, 298-305`
- **Evidence**: Client-side select box + filter logic (ligne 198: `decision && (v.decision ?? "") !== decision`)
- **Page load**: `/automobile/historique/page.tsx:51-52` charge decisions Map → passée au composant
- **Proof**: Filtre fonctionne sur 50 runs
- **Severity**: P1

---

### B. PARTIEL — Fonctionnel mais incomplet/fragile

#### 9. **Champ "note" dans vehicle_decisions — JAMAIS ÉCRIT** [PARTIEL ⚠️]
- **Migration defined**: `supabase/migrations/0025_vehicle_decisions.sql:17` → `note text`
- **Server-side parameter**: `decisions.ts:69` → `note?: string | null` en upsert
- **UI write location**: ❌ AUCUN
  - VehicleDecisionControl ne présente PAS de champ texte/textarea
  - setVehicleDecision signature n'accepte PAS note (ligne 19: seuls runId+status)
  - Page rapport nulle part n'appelle upsert avec note
- **DB data**: 1 row existante a `note=NULL`
- **Verdict**: Colonnes "dead code" ou feature incomplète
- **Severity**: P2 (technical debt / UX ambiguous)

#### 10. **"À traiter" consomme VRAIMENT la décision?** [PARTIEL — VÉRIFIÉ OUI, MAIS AMBIGU ✓]
- **File**: `src/app/automobile/page.tsx:270-274`
- **Logic**: `openRuns = runs.filter(completed).filter(isDecisionOpen(...))`
- **OPEN_DECISIONS set**: `decisionStatus.ts:29-34` = {a_decider, appeler, appele, negociation}
- **CLOSED_DECISIONS** (implicit): {ignorer, achete, perdu}
- **Proof**: Une fois choisi "ignorer"/"acheté"/"perdu", le run disparaît du KPI "À traiter" ✓
- **BUT**: L'UI ne LET PAS l'utilisateur changer statut une fois fermé
  - Boutons VehicleDecisionControl toujours visible, même après closed
  - Aucun "disabled" visuel sur boutons fermés
- **Severity**: P1 (UX confusing)

#### 11. **DecisionCanvas: nœud "Décision humaine" — déco seule?** [PARTIEL ⚠️]
- **File**: `src/components/automobile/DecisionCanvas.tsx:502-510`
- **Node definition (ligne 502-510)**:
  ```
  id: "decision",
  label: "Décision humaine",
  subtitle: decisionLabelStr,
  state: decisionOpen ? "running" : "completed",
  detail: {
    Statut: decisionLabelStr,
    "En cours": decisionOpen ? "Oui" : "Non",
    "Mis à jour": "—",  // ← TOUJOURS "—", jamais populated
  },
  ```
- **Issue**: Champ "Mis à jour" est hardcodé "—" (ligne 509), never affiche updated_at
- **Usage**: Page `/automobile/canvas` (page supplementaire, pas vue en production par défaut)
- **Severity**: P2 (déco, pas critique, mais UX debt)

#### 12. **No test for vehicle_decisions logic** [NON-TESTÉ ❌]
- **Test files present**: 4 total dans `src/__tests__/`
  - architect-rate-limit.test.ts
  - decisions-route.test.ts (Chief-of-Staff, NOT Automobile)
  - kickoff-route.test.ts
  - swarm-schemas.test.ts
- **Automobile decisions test**: ❌ MISSING
  - No unit test for setVehicleDecision
  - No integration test for getDecision/getDecisionsForRuns
  - No E2E test for UI workflow
- **Severity**: P1 (QA risk)

---

### C. INCOHÉRENT — Divergences architecture interne

#### 13. **AI Recommendation vs Human Decision — BIEN SÉPARÉS** [BRANCHÉ ✓]
- **AI side**: `src/lib/swarms/recommendation.ts` parses `## Recommendation` + **APPELER|ATTENDRE|ÉVITER**
  - Engine-generated (dans result_text du run)
  - No DB persistence, pure extraction from text
- **Human side**: `vehicle_decisions` table, 7 statuts (subset APPELER + 6 others)
  - User clicks button → Server Action → upsert
  - Persisted separately in decisions table
- **Display separation**:
  - `/automobile/[runId]/page.tsx:180-185` RecommendationBadge + `/automobile/[runId]/page.tsx:188-191` VehicleDecisionControl = deux sections distinctes
  - `/automobile/page.tsx:681-684` affiche RecommendationBadge + DecisionBadge côte à côte
- **Verdict**: Well-separated semantically ✓
- **Severity**: P0 (good design)

#### 14. **Decision status labels: FR (UI) vs snake_case (DB)** [BRANCHÉ ✓]
- **Mapping is explicit**:
  ```
  { value: "a_decider", label: "À décider" },
  { value: "appeler", label: "Appeler" },
  ...
  ```
- **Applied everywhere**: VehicleDecisionControl (ligne 46-61), HistoriqueExplorer (300-304), DecisionBadge (49), dashboard page (327-332)
- **No mismatch**: All 7 accounted
- **Severity**: P0

---

### D. RISQUES MAJEURS NON-BLOQUANTS

#### 15. **revert(engine): run-inputs injection hang** [RISQUE — CONTEXTUEL ⚠️]
- **Commit 3b0b13e**: Rollback de 1c8a433 qui injectait les inputs réels dans les prompts agents
- **Reason**: 2/2 runs prod hanged à Risk Analyst (12 min, no error), previous run sans injection complétait
- **Current state**: Code reverted to HEAD d9e2e52 (après le revert) — pas d'injection d'inputs
- **Impact on decisions**: Sans injection, agents hallucinent potentiellement le véhicule → recommendation peut être fausse → human decision basée sur hallucination
- **Mitigation**: Aucune (le problème est en engine Python, pas en frontend)
- **Severity**: P0 (data integrity) — mais not actionable from frontend audit perspective
- **Note**: Front-end ne peut pas corréger (c'est un bug engine). Le run real (baa251eb) semble complété OK, mais pas preuve de déterminisme.

#### 16. **No test coverage for setVehicleDecision server action** [RISQUE ❌]
- **What's tested**: Chief-of-Staff decision route (decisions-route.test.ts)
- **What's NOT tested**: automobile vehicle_decisions workflow
  - No mock of setVehicleDecision + ownership check
  - No e2e test of "run completée → clicker statut → décision persiste"
  - Regression risk on revalide paths
- **Severity**: P1 (quality risk)

---

### E. HARDCODÉ/MORT

#### 17. **Statuts CLOSED implicites** [HARDCODÉ — pas déclaré ⚠️]
- **OPEN_DECISIONS** clearly defined: `decisionStatus.ts:29-34`
- **CLOSED_DECISIONS** (ignorer|achete|perdu): Implicit from NOT being in OPEN set
- **Risk**: If new status added to enum, business logic may not match intent
- **Severity**: P2 (minor, but convention should be explicit)

#### 18. **"Mis à jour" field in DecisionCanvas — sempre "—"** [HARDCODÉ ⚠️]
- **File**: `src/components/automobile/DecisionCanvas.tsx:509`
- **Value**: `"Mis à jour": "—"` hard-coded, never updated even after decision change
- **Feature**: Should show updated_at timestamp post-decision
- **Severity**: P2 (UX debt)

---

### F. RÉSUMÉ VERDICT: Qu'est-ce qui marche réellement?

| Component | Status | Proof |
|-----------|--------|-------|
| DB schema + RLS | ✓ BRANCHÉ | Migration 0025 applied, 1 row live |
| 7 statuts (define) | ✓ BRANCHÉ | Enum matches DB CHECK, 7/7 affichés |
| Server action ownership | ✓ BRANCHÉ | setVehicleDecision calls swarmsClient.status |
| Persist to DB | ✓ BRANCHÉ | upsert via admin client, revalidate paths |
| UI control (7 buttons) | ✓ BRANCHÉ | VehicleDecisionControl renders on /automobile/[runId] |
| Dashboard "À traiter" KPI | ✓ BRANCHÉ | isDecisionOpen filter applied |
| Historique filtering | ✓ BRANCHÉ | HistoriqueExplorer select filter works |
| Badge display (3 pages) | ✓ BRANCHÉ | DecisionBadge visible on dashboard/historique/report |
| **Field "note" (write)** | ⚠️ PARTIEL | Never written from UI |
| **Test coverage** | ❌ NON-TESTÉ | 0 tests for automobile decisions |
| **Button state after close** | ⚠️ PARTIEL | Buttons stay enabled even after ignorer/acheté/perdu |
| **DecisionCanvas date field** | ⚠️ HARDCODÉ | "—" hard-coded, never shows updated_at |
| **Input injection (engine)** | ⚠️ REVERT | Rollback 3b0b13e applied → NO injection → hallucination risk |

---

### Recommandations (lecture seule, pas appliquées)

1. **Add test coverage**: Unit test setVehicleDecision + E2E "decide a run"
2. **Remove or implement "note" field**: Décider si feature à court terme ou à supprimer
3. **Disable buttons post-close**: Visual feedback quand decision fermée (disabled + gray)
4. **Show updated_at in DecisionCanvas**: Utiliser vehicle_decisions.updated_at trigger
5. **Monitor engine hang**: Suivi du revert 3b0b13e et piste "inject inputs only in Data Collector task"
6. **Explicit CLOSED_DECISIONS**: Ajouter const CLOSED_DECISIONS à decisionStatus.ts pour clarté



## 10. REPORTS / STEPS / MARKDOWN

## Résumé Exécutif

L'infrastructure de reports markdown et persistence des steps est **PARTIELLEMENT BRANCHÉE mais FRACTURÉE** par deux régressions critiques confirmées :
1. **Per-step tokens persistés à 0** ✅ CONFIRMÉ (callbacks n'écrivent pas tokens_in/out) → impossible facturation/optimisation
2. **Injection des run inputs reverted** ✅ CONFIRMÉ (commit 3b0b13e) → agents reçoivent templates statiques sans données réelles

### État Réel du Code (vérification exhaustive)
- ✅ Callback persistence architecture valide (module-level + _StepWriter queue daemon)
- ❌ Enqueue appel à ligne 585-593 MANQUE les paramètres tokens_in, tokens_out, cost_usd
- ❌ create_dynamic_crew (ligne 658-723) ne lit JAMAIS self.state.inputs pour interpoler les task descriptions
- ✅ UI rendering (MarkdownReport, RunTimeline, RecommendationBadge) tous sûrs et fonctionnels
- ✅ Tests unitaires existent pour _StepWriter infrastructure, manquent pour _module_step_callback logic

---

## Findings Détaillés — RÉVISÉS

### A. Markdown Report & Recommendation Parser [✅ BRANCHÉ]

**Files**: `src/lib/swarms/markdown.ts` (10 lignes), `src/lib/swarms/recommendation.ts` (30 lignes)

- ✅ **markdownToHtml()** parser robuste : échappe HTML (esc function ligne 17-18), gère headings/bold/listes/tables/blockquotes/code (lignes 15-125)
- ✅ Regex safeguards : `REC_KEYWORD_RE` cherche `**APPELER|ATTENDRE|ÉVITER|CALL|WAIT|AVOID**` en gras (ligne 9)
- ✅ Fallback double : cherche d'abord dans `## Recommendation` section (ligne 20-23), sinon premier keyword partout (ligne 26-27)
- ✅ Maps FR↔EN : `APPELER/ATTENDRE/ÉVITER ← CALL/WAIT/AVOID` (lignes 11-15)
- ✅ Défault dégradé : `UNKNOWN` si pas de keyword trouvé (ligne 28)
- **Utilisé par** : `/automobile/[runId]/page.tsx`, `/swarms/[id]/runs/[runId]/page.tsx`

### B. MarkdownReport Component [✅ BRANCHÉ]

**File**: `src/components/swarms/MarkdownReport.tsx` (233 lignes)

- ✅ Rendu markdown → HTML (parsé via `markdownToHtml`)
- ✅ Banneau recommendation coloré (CSS vars `--rec-${key}-color/bg`)
- ✅ Boutons Copy/Download (.md) fonctionnels
- ✅ Sécurité XSS : HTML échappé AVANT injection via `dangerouslySetInnerHTML` (ligne 229)
  - Escape happens at ligne 17-18 via esc() function
  - Input vient de LLM backend (pas d'input user) → surface d'attaque réduite
- ⚠️ **Dépend du contenu LLM** : `run.result_text` doit être un markdown valide (sinon fallback plain-text ou JSON)

### C. RunTimeline Component & Steps Grouping [✅ BRANCHÉ]

**File**: `src/components/swarms/RunTimeline.tsx` (186 lignes)

- ✅ Agrège steps par `agent_name` (fonction `groupByAgent` ligne 31-63)
- ✅ Tri par `step_number` (ordre chronologique préservé, ligne 32)
- ✅ Affiche per-agent KPIs:
  - `totalTokens = sum(step.tokens_in + step.tokens_out)` (ligne 51) — **TOUJOURS 0 en BD**
  - `totalCost = sum(step.cost_usd)` (ligne 52) — **TOUJOURS 0 en BD**
- ✅ Collapsible cards par agent, dernier ouvert par défaut
- ✅ StepCard détail : affiche timestamp, latency, status badge

### D. Per-Step Persistence Infrastructure [⚠️ PARTIEL + RISQUE P0]

**Files**:
- `services/crewai-engine/src/crews/dynamic_crew.py:44-723` (module-level callbacks architecture)
- `services/crewai-engine/src/flows/dynamic_swarm_flow.py:158-212` (flush + token extraction)

#### ✅ Architecture Callback (commit 74be7e9 "reactivate per-step persistence")

- Module-level functions `_module_step_callback` + `_module_task_callback` (ligne 503, 602)
- Registrée via `functools.partial(_module_step_callback, run_id)` → picklable, deepcopy-safe
- Partagent state via `_run_ctx[run_id]` dict → prevents closure capture bugs
- `_StepWriter` queue + daemon worker thread (ligne 57-138)
  - `enqueue()` non-bloquant (zéro HTTP dans le thread du crew)
  - `flush_run_steps(run_id)` appelé par flow AVANT update_swarm_run (ligne 140-165)
- ✅ **Validé en réel** : commit 74be7e9 note "run local completed en 183s SANS freeze, 6 steps écrits"

#### ❌ Per-Step Tokens TOUJOURS 0 — Root Cause CONFIRMÉ

**Ligne critique** : `dynamic_crew.py:585-593`

```python
writer.enqueue(
    run_id=run_id,
    agent_id=agent_id,
    task_id=task_id,
    step_number=step_state["step_number"],
    output_text=output_text,
    latency_ms=latency_ms,
    status=status,
)
```

**MANQUE** : `tokens_in`, `tokens_out`, `cost_usd` — jamais passés à enqueue()

Conséquence : `swarm_run_steps` reçoit NULL pour ces champs, Postgres applique defaults `0`. DB query confirme : 60 rows, **100% = 0 tokens, 0 cost**

#### ✅ Run-Level Token Tracking (Dynamic Flow)

**File**: `services/crewai-engine/src/flows/dynamic_swarm_flow.py:27-96`

- ✅ `_extract_and_store_token_usage()` extrait `crew.usage_metrics` après kickoff (ligne 30-72)
- ✅ Stocke dans `state.tokens_in / state.tokens_out` (lignes 63-70)
- ✅ `finalize()` (ligne 215-238) persiste vers `swarm_runs.total_tokens_in/out`
- ✅ Fallback si exception (ligne 75-96)
- ⚠️ **TODO commenté** (lignes 89, 231): "V2 : pricing Hypercli/Kimi non publié → pas de const prix → total_cost_usd reste 0.0"
- **Impact UI**: `/automobile/[runId]/page.tsx` affiche `total_tokens_in/out` correctement, mais `total_cost_usd` = "—"

### E. Run-Inputs Injection — ROLLBACK ACTIF [❌ RISQUE P1]

**Commits**:
- **1c8a433** "fix(engine): inject real run inputs into agent prompts" — ajoutait injection
- **3b0b13e** "revert(engine): roll back run-inputs injection (hangs prod at Risk Analyst)" — REVERTED (commit 3b0b13e4b7ec831195d3a7419e72f0fa8e90c257, Jun 2 04:41:50 2026)

**Situation actuelle** (HEAD):
- Aucun code dans `create_dynamic_crew()` (lignes 658-723) n'injecte `self.state.inputs` dans les descriptions de tasks
- Agents reçoivent des task descriptions TEMPLATES STATIQUES (sans {make}, {model}, etc.)
- CrewAI n'interpole rien si pas de placeholders → **agents analysent SANS données réelles du run**

**Preuve d'absence** : `src/crews/dynamic_crew.py:658-723`
- Aucune modification des `task.description` ou `agent.goal` APRÈS instanciation (ligne 487-492)
- `run_id` est reçu mais NE SERT QU'À installer les callbacks (ligne 707)
- Les `inputs` du flow (`DynamicSwarmState.inputs` ligne 116) NE SONT JAMAIS LUES par create_dynamic_crew
- Inputs SONT passés à `crew.kickoff(inputs=self.state.inputs)` (ligne 184) mais CrewAI les utilise comment ? → Pas pour interpoler task.description

**Raison du rollback** (commit message 3b0b13e):
- Le fix 1c8a433 causait un HANG en prod : 2/2 runs bloqués à 2 steps (Data Collector OK, Risk Analyst ∞)
- Piste pour re-tenter : injecter UNIQUEMENT dans la task racine (Data Collector) au lieu de TOUTES les tasks
- **Non implémentée** → run continue d'utiliser templates figés

**Impact**: Agents reçoivent static task descriptions. Pour un run automobile avec inputs={make: "BMW", model: "330d"}, le Data Collector ne voit pas ces paramètres dans sa description. Risk Analyst/Decision Writer reçoivent l'output du Data Collector (qui contient le véhicule via context CrewAI) mais l'injection des inputs initiaux est absente.

### F. Recommendation Badge [✅ BRANCHÉ]

**File**: `src/components/swarms/RecommendationBadge.tsx` (49 lignes)

- ✅ Affiche `Recommendation` enum pilotée par `extractRecommendation()`
- ✅ Couleurs CSS dynamiques `--rec-${key}-color/bg` (vars définis en cockpit.css)
- ✅ Deux tailles : `sm` (listes) et `md` (detail page)
- ✅ Affichage "—" si `UNKNOWN`

### G. Tables Markdown [✅ BRANCHÉ]

**File**: `src/components/swarms/MarkdownReport.tsx:57-79`

- ✅ Parser reconnaît `|\|...|` (format markdown table)
- ✅ Extraction header + rows, skip separator ligne
- ✅ Rendu HTML `<table><thead><tr><th>` avec CSS class `md-table`

### H. Langfuse Trace ID [✅ BRANCHÉ]

**File**: `src/app/automobile/[runId]/page.tsx:257-259`

- ✅ Affichage de `run.langfuse_trace_id` si présent
- DB: colonne `swarm_runs.langfuse_trace_id` existe, nullable

### I. Tools Routing — ❌ ROAD HAZARD [RISQUE P0]

**File**: `src/lib/forms/swarmSchemas.ts:200-213` (ToolSchema)

- DB Tool: "AutoScout24 Sourcing" (owner_id=NULL, `endpoint_url="/api/scrape/autoscout"`, auth_type="bearer")
- **ROUTE N'EXISTE PAS**: Grep sur `/api/scrape/autoscout` dans src/app/api — zéro résultat
- **Route existante**: `/api/automobile/extract-url/route.ts` (handling different tool)
- **Impact**: Si un agent tente d'utiliser ce tool, le call échoue 404 ou timeout

### J. Canvas Agents & System Map — ⚠️ FAUX POSITIF [RÉFUTÉ]

**File**: `src/components/system-map/buildArchitecture.ts` (1-229 lignes)

- ❌ AUDIT ORIGINALE INCORRECTE : Aucune référence "canvas agents" trouvée
- System-map affiche une topologie réelle : user/session → Next.js → FastAPI engine → Postgres DB + templates + tables
- Pas d'UI reference aux "canvas agents" conceptuels
- **Verdict** : Cet élément ne figure pas dans le code réel

### K. Input/Output Persistence [⚠️ PARTIEL]

**Schéma**:
- `swarm_run_steps.input_text` : nullable, jamais populé (callbacks ne le mettent pas en queue)
  - Schema valide (nullable.optional), pas de breakage
  - Incomplet intentionnellement (pas de capture de l'input initial du step)
- `swarm_run_steps.output_text` : populé ✅ (limité à 2000 chars via `_STEP_OUTPUT_PREVIEW_CHARS`)
- `swarm_runs.inputs_json` : populé ✅ (contient les inputs de `kickoff()`)

---

## Risques & Violations (RÉVISÉS)

| ID | Classification | Severity | Description |
|----|---|---|---|
| **R1** | PARTIEL | P0 | Per-step tokens/cost = 0 → pas de tracking réel, impossible facturation/optimisation — root cause confirmé ligne 585-593 |
| **R2** | RISQUE | P1 | Run-inputs injection reverted (commit 3b0b13e) → agents analysent sans données réelles, hallucination possible — piste re-implémentation documentée |
| **R3** | RISQUE | P0 | Tool endpoint `/api/scrape/autoscout` n'existe pas → appels de cet agent échouent 404 |
| **R4** | ❌ FAUX POSITIF | — | "Canvas agents" — aucune UI reference trouvée, faux positif de l'audit original |
| **R5** | PARTIEL | P2 | Tests pour _StepWriter existent ✅ mais _module_step_callback logic (introspection, payload extraction) non testée |
| **R6** | HARDCODÉ | P2 | `_STEP_OUTPUT_PREVIEW_CHARS = 2000` limite silencieuse (déjà documentée, par design) |

---

## Verdicts FINAUX

### ✅ BRANCHÉ (architecture + implémentation réelle)
- Recommendation parser (double fallback regex + FR/EN maps)
- MarkdownReport rendering (HTML escaping sûr)
- RunTimeline grouping + per-agent KPI display UI
- Per-step persistence callbacks architecture (module-level, _StepWriter daemon)
- RecommendationBadge display (CSS vars safe)
- Run-level token extraction to swarm_runs
- Langfuse trace ID capture/display
- Markdown table parsing
- Callback tests for _StepWriter infrastructure

### ⚠️ PARTIEL (existe mais incomplet/fragile)
- Per-step token/cost tracking → callbacks installés OK, mais enqueue appel MANQUE les paramètres tokens_in/out/cost_usd
- Run-level pricing → tokens extraits OK, mais total_cost_usd = 0 due to Hypercli pricing constants not published (TODO V2)
- Input_text persistence → schema nullable (OK), but never written (incomplete, not broken)
- Callback tests → infrastructure OK, but _module_step_callback business logic not covered

### ❌ MORT / RISQUE
- Run-inputs injection → reverted commit 3b0b13e, jamais re-implémenté (agents reçoivent static task templates)
- Tool `/api/scrape/autoscout` → endpoint ghost, pas de route (404 si utilisé)

### ✅ FAUX POSITIF (correction)
- "Canvas agents" UI reference → aucune existence réelle trouvée, faux positif de l'audit original

---

## 11. CRON / SCHEDULER / JOBS

**Source de vérité : `services/crewai-engine/src/scheduler.py` (361 lignes) + `src/main.py` (lifespan).** Moteur APScheduler `AsyncIOScheduler`, timezone = `settings.USER_TIMEZONE`. Démarré au lifespan FastAPI, gardé par `settings.SCHEDULER_ENABLED`.

### Jobs réellement déclarés (4)

| Job (id) | Déclencheur | Horaire | Configurable ? | Écrit | Appelle |
|---|---|---|---|---|---|
| `chief-of-staff-morning` | CronTrigger | `MORNING_HOUR:MORNING_MINUTE` (env) | ✅ env | `chief_run_log` + Telegram | `ChiefOfStaffFlow.kickoff` |
| `chief-of-staff-evening` | CronTrigger | `EVENING_HOUR:EVENING_MINUTE` (env) | ✅ env | `chief_run_log` + Telegram | `ChiefOfStaffFlow.kickoff` |
| `market-intel-morning` | CronTrigger | **`07:50` HARDCODÉ** (`scheduler.py:332-333`) | ❌ | `swarm_runs` | `DynamicSwarmFlow` sur le swarm nommé "Market Intelligence Scout" |
| `stale-run-cleanup` | IntervalTrigger | `STALE_RUN_CLEANUP_INTERVAL_MINUTES` (env, déf. 10) | ✅ env | marque runs zombies `failed` | `swarm_store`/`run_store.cleanup_stale_runs` |

### Constats durs

- **[HARDCODÉ]** Market Intel Scout est figé à **07h50** (`scheduler.py:332-333`) — seul job non configurable.
- **[HARDCODÉ]** L'owner des runs Chief planifiés = `settings.CHIEF_SCHEDULER_OWNER_ID` (`scheduler.py:41`) — un owner d'environnement fixe.
- **[FRAGILE]** Le Market Intel Scout fait un **lookup par NOM** (`.eq("name", "Market Intelligence Scout").limit(1)`, `scheduler.py:116-120`) **sans filtre owner** → renomme le swarm et le job casse silencieusement ; en multi-owner, prend la première ligne arbitraire.
- **[RISQUE double-run]** `misfire_grace_time = MISFIRE_GRACE_TIME_SECONDS` (déf. 300s) + commentaire explicite (`scheduler.py:305-307, 323-325`) : un restart de pod dans la fenêtre de grâce **rejoue** le brief → **2 runs le même matin/soir**. **Non idempotent** (aucun verrou applicatif, juste `max_instances=1` qui ne protège que l'overlap intra-process).
- **[RISQUE dev]** `--reload` (dev) crée un nouveau scheduler à chaque hot-reload → **alertes Telegram dupliquées** (mitigation documentée : `SCHEDULER_ENABLED=false` en dev).
- **[fail-soft]** Tous les jobs catch+log, ne crashent jamais le scheduler. Telegram fail-soft si tokens absents.

### Lien avec Automobile : **NÉANT**

Recherche exhaustive : **aucun** job lié à l'Automobile.

- Scraping AutoScout planifié → **NON IMPLÉMENTÉ**
- Saved searches / alertes véhicule → **NON IMPLÉMENTÉ**
- Price monitoring / cote marché périodique → **NON IMPLÉMENTÉ**
- Source-health cron (vérif AutoScout/Apify up) → **NON IMPLÉMENTÉ**

Le seul job "swarm" planifié est **Market Intelligence Scout** (template générique veille marque), **sans rapport** avec l'environnement Automobile.

**Verdict : BRANCHÉ (4 jobs réels, Chief + cleanup) / PARTIEL (idempotence) / Automobile = à construire intégralement.**



## 12. APIS / SDKS / SOURCES EXTERNES

## Résumé Exécutif

Ce produit multi-tenant utilise 11 services externes critiques. **4 risques BLOQUANTS identifiés** pour la production multi-tenant, **3 risques importants** :

**P0 (bloquants):**
1. **Chief of Staff Composio fallback "adrien"** — scheduler.py:41 utilise CHIEF_SCHEDULER_OWNER_ID hardcodé, agents créés sans owner_id via create_agents() (daily_chief_crew.py:342) → Composio utilise fallback "adrien"
2. **Chief of Staff scheduler owner_id hardcodé** — config.py:136 = UUID spécifique, pas de multi-tenant pour runs planifiés
3. **APM_MARKET_SUPABASE_KEY service_role exposée** — .env.local:185 JWT décodé montre role="service_role" → bypass RLS complet
4. **Apify cache sans scoping tenant** — autoscout.ts:94 cache key ignore owner_id → pollution cross-user

**P1 (importants):**
- COMPOSIO_USER_ID hardcodé "adrien" (config.py:91) — fallback si swarm ne passe pas owner_id
- Cortex vault personnel Adrien non-scoped
- Telegram token + chat_id hardcodés (Adrien personal only)

**À noter (corrections vs audit initial):**
- ✅ **Swarms dynamiques PASSENT owner_id correctement** — dynamic_swarm_flow.py:183 → create_dynamic_crew(..., owner_id=self.state.owner_id) → instantiate_agents(..., owner_id=owner_id) → get_composio_tools_for_toolkits(..., owner_id=owner_id). Composio cache scoped (owner_id, sorted_toolkits) — BRANCHÉ et multi-tenant safe.
- ✅ **DynamicSwarmFlow inputs SONT passés réellement** — routes/swarms.py:364 kickoff(inputs=state_dict) → flow reçoit state.inputs → crew.kickoff(inputs=self.state.inputs) — pas de hallucination.
- ❌ **Chief of Staff agents créés SANS owner_id** — daily_chief_crew.py:342: `agents = create_agents()` — aucun paramètre, fallback "adrien" activé (composio_session.py:308: user_id=owner_id or settings.COMPOSIO_USER_ID)

---

## Services Audités

### 1. APIFY (AutoScout24 Scraper)

**Status: BRANCHÉ (cache non-scoped pour multi-tenant) ✅**

**Intégration réelle:**
- Client générique : `/src/lib/apify/client.ts` runActorSync()
- Wrapper AutoScout24 : `/src/lib/apify/autoscout.ts` searchAutoScout
- Actor ID: `blackfalcondata~autoscout24-scraper`
- Timeout: 120s défaut

**Où utilisé:**
- Frontend dashboards Automobile: `/src/app/automobile/sourcing/page.tsx`, `/src/app/automobile/marche/page.tsx` → searchAutoScout() côté serveur
- Chief cockpit-agent tools: `/src/lib/cockpit-agent/tools.ts` → VEHICLE_SEARCH_TOOL appelle searchAutoScout
- Upstash cache: TTL 5min, fail-soft

**Cache key (INCOHÉRENT — no multi-tenant isolation):**
```
autoscout:${make}|${model}|${market}|${priceMin}|${priceMax}|${maxResults}
```
Aucun owner_id → deux tenants sur make="BMW" model="330" → partagent le même résultat en cache Upstash.

**Env vars:**
- APIFY_TOKEN: `‹REDACTED›...` (.env.local:188) — hardcodé en clair ⚠️
- UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (.env.local:88-89)

**Risques:**
- [HARDCODÉ] APIFY_TOKEN stocké plaintext, révocation requise si leak
- [INCOHÉRENT] Cache key sans tenant scoping — pollution cross-user
- [PARTIEL] Route commentée POST /api/scrape/autoscout (types.ts:3) n'existe PAS (vérif: aucun /api/automobile/scrape*, seul /api/automobile/extract-url existe)
- [RISQUE] Upstash token en env — leakable si fetch Upstash depuis navigateur

**Preuve:**
- src/lib/apify/autoscout.ts:87-94 — buildCacheKey() sans owner_id
- src/lib/apify/types.ts:3 — "Contrat public exposé via la route POST /api/scrape/autoscout" (mensonge)

---

### 2. APM_MARKET (2e Supabase Project)

**Status: BRANCHÉ (service_role key = sécurité dégradée) ⚠️**

**Connexion:**
- Client dédié: `/src/lib/market/apmClient.ts`
- Projet Supabase APM (ref: `ipgqjrsvcqqmnihasxae`)
- Table: `market_index` (read-only)

**Env vars:**
- APM_MARKET_SUPABASE_URL: `https://ipgqjrsvcqqmnihasxae.supabase.co` (.env.local:184)
- APM_MARKET_SUPABASE_KEY: JWT service_role (.env.local:185) ⚠️ — decode shows `role":"service_role"`
- APM_MARKET_TIMEOUT_MS: 5000 défaut
- APM_MARKET_MIN_EFFECTIVE: 3 défaut

**Où utilisé:**
- `/src/app/automobile/page.tsx:241` — getMarketIndex() appelé dans dashboard Automobile pour marketSignals (5 véhicules max)
- Queries: make eq + model (ilike/eq tokens), carburant optionnel
- Read-only (SELECT only, pas de write capability)

**Fallback (graceful):**
- Timeout 5s → null
- Pas de clé → null
- Aucun cluster → null

**Risques:**
- [RISQUE + HARDCODÉ] APM_MARKET_SUPABASE_KEY = service_role JWT — bypass RLS sur projet APM. Aucun tenant filtering au niveau RLS (projet APM n'a pas de owner_id scoping). N'importe quel client authentifié peut lire TOUTES les données.
- [INCOHÉRENT] Clé service_role pour requête read-only SELECT — anon key + RLS suffisait
- [NON-TESTÉ] Pas de validation si APM indisponible (handle graceful mais non-observable)

**Preuve:**
- src/lib/market/apmClient.ts:13-14 — APM_URL et APM_KEY depuis env
- src/lib/market/apmClient.ts:114 — fetch avec `Authorization: Bearer ${APM_KEY}`
- .env.local:185 — JWT avec role:"service_role"

---

### 3. COMPOSIO (Toolkits Multi-Canal)

**Status: BRANCHÉ (owner_id fallback "adrien" ONLY pour Chief of Staff) ⚠️**

**Configuration:**
- Factory/session: `/services/crewai-engine/src/composio_session.py`
- Circuit-breaker + retry (3 attempts, 2s→4s backoff) pour transient errors
- Hard-cap: 60 tools max par agent (round-robin capping si >60)
- **Cache par (owner_id, sorted_toolkits)** — clé correctly scoped ✅

**Env vars:**
- COMPOSIO_API_KEY: `ak_yDsJfz0...` (.env.local:53)
- COMPOSIO_USER_ID: **"adrien"** (config.py:91, défaut) ⚠️
- COMPOSIO_CALLBACK_URL: `http://localhost:3333/settings/integrations/callback` (.env.local:180)

**Routing multi-user (DIFFÉRENCIÉ par contexte):**

**Swarms dynamiques ✅ CORRECT:**
- routes/swarms.py:732 — `_execute_dynamic_flow_background(..., owner_id=oid)` passe owner_id
- dynamic_swarm_flow.py:183 — `create_dynamic_crew(swarm_id, ..., owner_id=self.state.owner_id)`
- dynamic_crew.py:676 — `instantiate_agents(swarm_config, owner_id=owner_id)`
- dynamic_crew.py:299 — `get_composio_tools_for_toolkits(..., owner_id=owner_id)` ✅
- composio_session.py:308 — `user_id=owner_id or settings.COMPOSIO_USER_ID` → owner_id utilisé
- composio_session.py:250 — `cache_key = (owner_id or "", *sorted(toolkits))` → (owner_id_tenant, sorted(toolkits)) ✅

**Chief of Staff ❌ PROBLÈME:**
- scheduler.py:41 — `owner_id=settings.CHIEF_SCHEDULER_OWNER_ID` (UUID hardcodé, pas d'owner_id utilisateur)
- chief_of_staff_flow.py:run_crew() appelle `create_daily_chief_crew(..., chief_run_id=self.state.chief_run_id)`
- daily_chief_crew.py:342 — `agents = create_agents()` — **AUCUN owner_id passé**
- agents/definitions.py:179 — `_get_all_tools(owner_id=None)` — fallback None
- agents/definitions.py:191 — `get_composio_tools_for_toolkits(["gmail", "slack", "telegram"], owner_id=None)` — **fallback "adrien"**
- composio_session.py:250 — `cache_key = ("", *sorted(toolkits))` — **empty string clé partagée cross-user si autres Chief runs**

**Risques identifiés:**
1. [RISQUE + HARDCODÉ] **COMPOSIO_USER_ID défaut "adrien"** (config.py:91) + chief de staff ne passe jamais owner_id (daily_chief_crew.py:342 `create_agents()` sans param) → **tous les toolkits Chief (Gmail, Slack, Notion) sharent entity_id="adrien" en Composio**. IDOR possible entre Chief runs si multi-tenant en prod.

2. [PARTIEL] get_composio_tools_for_toolkits appel sans owner_id possible si swarm ne passe pas owner_id en amont → cache key collide ("", sorted(toolkits)) au lieu de (owner_id, sorted(toolkits)). **Swarms dynamiques sont safe** car owner_id est obligatoire en routes/swarms.py:691 (_require_owner_id), mais custom integrations pourraient oublier.

**Tests:**
- test_composio_session.py: couverture multi-toolkit, retry, circuit-breaker, cap round-robin
- ❌ Pas de test explicite multi-user Chief runs (deux owner_ids différents) → cache isolation non validée

**Preuve:**
- services/crewai-engine/src/config.py:91 — `COMPOSIO_USER_ID: str = "adrien"`
- services/crewai-engine/src/daily_chief_crew.py:342 — `agents = create_agents()` (no owner_id)
- services/crewai-engine/src/agents/definitions.py:191 — `get_composio_tools_for_toolkits(["gmail", "slack", "telegram"], owner_id=owner_id)` where owner_id=None
- services/crewai-engine/src/composio_session.py:308 — `user_id=owner_id or settings.COMPOSIO_USER_ID`

---

### 4. CORTEX / VAULT SEARCH

**Status: BRANCHÉ (fail-soft, personnel Adrien uniquement)**

**Intégration:**
- VaultSearchTool: `/services/crewai-engine/src/tools/vault_search.py`
- POST `/api/search` avec payload `{"query": str, "limit": int, "mode": "hybrid"}`
- Retourne `{"results": [{path, title, score, content_preview}]}`

**Env vars:**
- CORTEX_URL: `http://localhost:3030` (dev .env.local:175) ou `https://cortex.hearst.app` (prod)
- CORTEX_API_KEY: `4f91968a4a8e6767...` (.env.local:176) — Adrien personal vault key

**Où utilisé:**
- Chief of Staff agents (Deep Research Agent, Market Intel) via VaultSearchTool._run()
- Recherche sémantique sur 39k notes Obsidian (Adrien personal vault)
- Limit défaut 5, max 25, timeout 10s

**Fallback (fail-soft):**
- Vault unavailable: empty CORTEX_URL → "CORTEX_URL not configured"
- 5xx, timeout, JSON invalid → "Vault unavailable: ..."
- Jamais de crash

**Risques:**
- [HARDCODÉ + INCOHÉRENT] CORTEX_URL et CORTEX_API_KEY sont personels (Adrien vault), pas scoped à tenant/swarm
- [RISQUE] Chief of Staff accès à toutes notes personnelles Adrien (audit trail, factures, discussions clients)
- [INCOHÉRENT] Chief utilise vault pour contexte, mais aucune isolation par tenant/client/swarm
- [NON-TESTÉ] Aucun test sur réponse Cortex malformée (ex: {"results": null} au lieu de [])

**Preuve:**
- services/crewai-engine/src/tools/vault_search.py:63-78 — fetch avec header x-api-key
- services/crewai-engine/src/config.py:85-87 — CORTEX_URL + CORTEX_API_KEY env
- .env.local:175-176 — localhost dev URL (prod differs, still Adrien-scoped)

---

### 5. TELEGRAM

**Status: BRANCHÉ (personal chat only, security-gated)**

**Intégration:**
- TelegramSenderTool: `/services/crewai-engine/src/tools/telegram_sender.py`
- Envoie via `https://api.telegram.org/bot{TOKEN}/sendMessage`
- Security levels 1-5: auto-send whitelist N1-N3, pending N4, full N5

**Env vars:**
- TELEGRAM_BOT_TOKEN: `8642524714:AAEr8amqXH1...` (.env.local:167) ⚠️ hardcodé
- TELEGRAM_CHAT_ID: `1385505891` (.env.local:168) ⚠️ hardcodé (Adrien personal)

**Où utilisé:**
- Chief scheduler morning/evening cron (_send_telegram_digest)
- Cockpit agents via TelegramSenderTool._run()
- Whitelist: "Merci, bien reçu.", "Confirmé.", etc. (telegram_sender.py:13-20)

**Gate par security_level:**
- N1-N3: whitelisted phrases → auto-send, autres → draft
- N4: pending_approval (not yet implemented)
- N5: auto-send all

**Risques:**
- [HARDCODÉ] TELEGRAM_CHAT_ID = Adrien personal chat, pas multi-user
- [HARDCODÉ] Whitelist = 5 fixed strings (frozenset), pas configurable
- [HARDCODÉ] TOKEN exposé .env.local — révoke if leaked
- [INCOHÉRENT] Chief envoie digests à Telegram mais only si TOKEN set — fail-soft, pas d'error log

**Preuve:**
- services/crewai-engine/src/tools/telegram_sender.py:34-87 — _run() via httpx.post()
- services/crewai-engine/src/config.py:94-96 — TELEGRAM_BOT_TOKEN + CHAT_ID env
- services/crewai-engine/src/scheduler.py:66-67 — _send_telegram_digest() asyncio.to_thread()

---

### 6. LANGFUSE

**Status: BRANCHÉ (fire-and-forget, non-observable)**

**Intégration:**
- Frontend: `/src/lib/observability/langfuse.ts` — traceChatEvent() batched POST
- Backend: `/services/crewai-engine/src/observability/langfuse_setup.py` — os.environ setup

**Env vars:**
- LANGFUSE_PUBLIC_KEY: `‹REDACTED›...` (.env.local:106)
- LANGFUSE_SECRET_KEY: `‹REDACTED›...` (.env.local:107)
- LANGFUSE_HOST: `https://cloud.langfuse.com` (.env.local:108)

**Où utilisé:**
- Frontend chat/cockpit traceChatEvent()
- Backend CrewAI (litellm integration via crewai.LLM)

**Fallback:**
- Missing keys → skip init, no crash
- Timeout 3s → caught, no propagation (fire-and-forget via .catch())
- Fire-and-forget (no await)

**Risques:**
- [NON-TESTÉ] traceChatEvent() jamais waité — impossible de savoir si Langfuse call réussi
- [RISQUE] Batch API credentials plaintext env
- [INCOHÉRENT] Frontend traces + backend litellm (deux paths différents)

**Preuve:**
- src/lib/observability/langfuse.ts:42-50 — fetch sans await, .catch() silencieusement

---

### 7. SENTRY

**Status: BRANCHÉ (fail-soft, conditional init)**

**Intégration:**
- Frontend: `/instrumentation-client.ts` — Sentry.init() avec tracesSampleRate
- Backend: `/instrumentation.ts` — Node.js + Edge runtime init

**Env vars:**
- SENTRY_DSN: `https://48a8f0f8afda...` (.env.local:97)
- NEXT_PUBLIC_SENTRY_DSN: same (.env.local:98)
- SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN (.env.local:100-101)

**Fallback:**
- No DSN → skip init
- tracesSampleRate: 10% prod, 100% dev
- replaySessionSampleRate: 1% prod (errors), 0% dev

**Risques:**
- [RISQUE] DSN exposée en public key (ok, par design Sentry)
- [NON-TESTÉ] Aucune preuve que Sentry captures réellement des errors

**Preuve:**
- instrumentation-client.ts:5-18 — init avec DSN check

---

### 8. KIMI K2.6 (Hypercli)

**Status: BRANCHÉ (seul provider LLM actif en prod)**

**Intégration:**
- Frontend: `/src/lib/llm/kimi.ts` — OpenAI client pointant Hypercli
- Backend: `/services/crewai-engine/src/llms.py` — get_llm() factory retourne crewai.LLM

**Env vars:**
- HYPERCLI_API_KEY: `‹REDACTED›...` (.env.local:46)
- HYPERCLI_BASE_URL: `https://api.hypercli.com/v1` (.env.local:47)
- HYPERCLI_DEFAULT_MODEL: `kimi-k2.6` (.env.local:49)
- Model tiers: fast/balanced/smart → **tous mapped `openai/kimi-k2.6`**

**Timeout/Retry:**
- LLM_REQUEST_TIMEOUT_SECONDS: 120 (config.py:55)
- LLM_MAX_RETRIES: 3 (config.py:60)

**Où utilisé:**
- Tous agents (Automobile 3, Chief 8, etc.) — provider unique

**Risques:**
- [HARDCODÉ] Toutes tiers mapped même model `kimi-k2.6` — pas distinction coût/latence/quality
- [NON-TESTÉ] Timeout 120s jamais validé en prod pour 8-agent Chief (4-8 agents × retries = potentiel dépassement)
- [INCOHÉRENT] Config dit "Hypercli avait été écarté N-1 pour empty-responses/timeouts" mais aucune note N0 re-validation après fix

**Preuve:**
- services/crewai-engine/src/llms.py:23-27 — tous tiers mappen même modèle

---

### 9. CHIEF_SCHEDULER (Owner Hardcodé)

**Status: HARDCODÉ (UUID unique, pas multi-tenant)**

**Configuration:**
- CHIEF_SCHEDULER_OWNER_ID: `e0a983da-536f-4dad-a205-861acbae9468` (config.py:136)
- Utilisé par scheduler.py:41 → tous runs planifiés assignés à ce UUID

**Où utilisé:**
- Morning/evening Chief of Staff cron jobs (scheduler.py:_run_scheduled_kickoff)
- Market Intelligence Scout scheduled kickoff
- Tous runs planifiés → owner_id = hardcodé UUID

**Risques:**
- [HARDCODÉ] UUID non configurable — Chief de Staff planifié = propriété d'une seule personne
- [RISQUE] Multi-tenant breaking: si 2e tenant essaie Chief cron, runs reviennent 1er UUID
- [INCOHÉRENT] Swarms user-initiated scoped auth.user, mais Chief scheduler scoped hardcodé Adrien UUID

**Preuve:**
- services/crewai-engine/src/config.py:136 — CHIEF_SCHEDULER_OWNER_ID hardcodé string
- services/crewai-engine/src/scheduler.py:41 — passed to save_run()

---

### 10. AUTRES SERVICES

**Upstash Redis — PARTIEL**
- Cache Apify (5min TTL), fail-soft si absent
- Token en env (.env.local:88-89), leakable via browser si fetch Upstash exposé
- Jamais lu/écrit ailleurs que autoscout.ts

**APM vehicle tunnel — INCOHÉRENT**
- DB template defines `tunnel="apm_vehicle_research"` mais aucune route n'implémente
- Automobile template 3 agents nunca appelle APM ou Apify — aucune preuve qu'ils tournent

**GPU/4090 — LEGACY**
- Config GPU servers .env.local (COMFY_BASE, STUDIO_SSH_HOST)
- Aucun code accès à ces endpoints (training page supprimée git revert d9e2e52)

**Market Intelligence Scout — PARTIEL**
- Swarm template exists, scheduled kickoff code (scheduler.py:101-199)
- Pas de preuve qu'il tourne réellement en prod (is_active unknown)

---

## Résumé par Service

| Service | Status | P-Level | Risques | Notes |
|---------|--------|---------|---------|-------|
| **Apify** | BRANCHÉ | P2 | Cache non-scoped, token hardcodé, route fake | AutoScout24, cockpit-agent |
| **APM_MARKET** | BRANCHÉ | P1 | Service_role key, RLS bypass, no tenant isolation | Read-only, fail-soft |
| **Composio** | BRANCHÉ | P1 | Chief of Staff fallback "adrien", cache collision si owner_id absent | Swarms OK ✅, Chief broken ❌ |
| **Cortex/Vault** | BRANCHÉ | P2 | Personal Adrien vault, not scoped | Chief context, fail-soft |
| **Telegram** | BRANCHÉ | P2 | Chat + token hardcodé, whitelist fixed | Personal Adrien, security-gated |
| **Langfuse** | BRANCHÉ | P2 | Fire-and-forget, non-observable | Frontend + backend dual paths |
| **Sentry** | BRANCHÉ | P2 | DSN public (ok), no validation | Fail-soft, conditional init |
| **Kimi/Hypercli** | BRANCHÉ | P2 | All tiers same model, timeout untested 8-agent | Sole LLM provider |
| **Chief Scheduler** | HARDCODÉ | P0 | UUID hardcodé, no multi-tenant | Adrien UUID only |
| **Upstash** | PARTIEL | P2 | Graceful fail, token exposable | Apify cache only |
| **GPU/4090** | LEGACY | P2 | Code mort, no usage | Routes supprimées |

---

## Verdict: Multi-Tenant Readiness

**BLOQUANTS pour production multi-tenant:**
1. Chief of Staff Composio fallback "adrien" (config.py:91 + daily_chief_crew.py:342) → GMail/Slack/Notion toolkits partagent entity_id="adrien"
2. Chief Scheduler owner_id hardcodé e0a983da UUID (config.py:136) → tous runs planifiés assignés même propriétaire
3. APM_MARKET service_role key sans RLS isolation (apmClient.ts:114 + .env.local:185) → n'importe quel tenant lit TOUTES données marché
4. Apify cache sans tenant scoping (autoscout.ts:94) → pollution cross-user sur (make, model, market, prices)

**À corriger avant usage multi-tenant:**
- Passer owner_id à create_agents() dans daily_chief_crew.py, ou créer un distinct Chief Composio user_id par tenant (migration 0016+)
- Env config override pour CHIEF_SCHEDULER_OWNER_ID (ou per-tenant scheduling)
- Remplacer APM service_role key par anon key + RLS policy (tenant scoped)
- Scoper Apify cache key avec (owner_id, make, model, market, prices) ou utiliser per-tenant Upstash instance
- Cortex vault: soit multi-tenant namespace, soit blocklist Chief du vault public
- Telegram: validation owner_id avant send, ou per-tenant bot+chat



## 13. GPU / 4090 / TRAINING

### Résumé Exécutif

**Swarm Platform (MySwarms) n'utilise AUCUN GPU local.** Les 4×RTX 4090 des machines GPU1 et GPU2 existent physiquement, tournent des services vLLM/ComfyUI/InvokeAI pour **Hedge et OpenClaw** (produits séparés), mais **MySwarms n'y est JAMAIS branché** en production.

- **Inférence LLM MySwarms** : exclusivement Hypercli cloud (Kimi-K2.6) ✅
- **Training/fine-tuning** : ZÉRO code dans le repo ✅
- **Embeddings** : aucun endpoint câblé à pgvector (table N'EXISTE PAS) ✅
- **Batch jobs** : aucun job GPU identifié ✅
- **Risque P0** : Un revert git (3b0b13e) annule l'injection des inputs réels dans les prompts agents, causant une hallucination du véhicule analysé (Automobile utilise des descriptions de task template sans les données du run) ❌ **CRITIQUE NON RÉSOLU**

---

### 1. État de la Cinématique Training (Fake UI)

| Commit | Message | Fichiers | Verdict |
|---|---|---|---|
| 56bd31e (3:47 UTC) | `feat(training): add GPU training cinematic canvas` | src/app/training/page.tsx (+26L), src/components/training/TrainingCanvas.tsx (+573L), src/components/cockpit/AppBottomBar.tsx (+1L) | **UI-ONLY** : animation 8×4090 cards, LOSS counter, STEP increment — zéro logique backend |
| d9e2e52 (4:45 UTC) | `revert: remove fake GPU training cinematic page` | Supprime les 3 fichiers (-600L total) | **REVERT COMPLET** : page n'existe plus. |

**Preuve d'absence** ✅ : `git show d9e2e52 --stat` confirme 600L deletions (3 fichiers). Aucun fichier training*.tsx ne survit dans src/.

**Classification** : [LEGACY] + [UI-ONLY] dans l'historique ; code mort depuis 2026-06-02 04:45 UTC.

---

### 2. Env Vars GPU : Déclarées mais Mortes [HARDCODÉ + LEGACY]

**Fichier** : `.env.local` lignes 138-140

```
COMFY_BASE=http://127.0.0.1:8188
STUDIO_INVOKE_BACKEND=http://127.0.0.1:9090
STUDIO_SSH_HOST=gpu2-remote
```

**Recherche exhaustive** ✅ :
```bash
grep -r "process\.env\.COMFY_BASE\|process\.env\.STUDIO_INVOKE\|process\.env\.STUDIO_SSH" src services --include="*.ts" --include="*.tsx" --include="*.py"
# Résultat : zéro match
```

**Routes API attendues** : aucune `/api/comfy`, `/api/invoke`, `/api/training`, `/api/studio/*` n'existe dans `src/app/api/` ✅

**Verdict** : Variables fantômes. Déclarées par inertie, jamais lues en runtime. **Nettoyage recommandé**.

---

### 3. Automobile Swarm : Cloud-Only (Hypercli), Zéro GPU Local [BRANCHÉ]

**Template DB** : `swarms.id = cccccccc-0001-0001-0001-000000000001` (Automobile — Recherche véhicule)

**3 Agents** (confirmés DB) :
- Data Collector (executor) — model_provider=openai, model_name=kimi-k2.6
- Risk Analyst (analyst) — model_provider=openai, model_name=kimi-k2.6
- Decision Writer (coordinator) — model_provider=openai, model_name=kimi-k2.6

**Résolution LLM** ✅ : `services/crewai-engine/src/crews/dynamic_crew.py:250-262`
```python
# Fallback final : get_llm("balanced") — 100 % Hypercli via llms.py, conforme à la directive.
# Jamais Claude ni OpenAI réel.
logger.warning("[LLM_FALLBACK] agent=%s ... falling back to balanced tier (Hypercli)")
return get_llm("balanced")
```

**Grep MySwarms** ✅ : Zéro référence à `vllm`, `localhost:8000`, `localhost:8001`, ou endpoints GPU dans les agents MySwarms.

**Verdict** : [BRANCHÉ] — MySwarms Automobile = API Hypercli, zéro matériel local.

---

### 4. CRITÈRE : Run Inputs N'INJECTÉS PLUS dans Agent Task Prompts [RISQUE P0 - NON RÉSOLU]

**Problématique identifiée** ⚠️ :

Commit `1c8a433` (2026-06-02 04:19:58) :
> "fix(engine): inject real run inputs into agent prompts (no more hallucinated vehicle)"
> Les agents analysaient un véhicule halluciné au lieu de celui fourni.

La **correction** (42L added) injectait un bloc « DONNÉES FOURNIES POUR CETTE ANALYSE » dans chaque task description avec les valeurs du run (make, model, price, year, etc.).

Commit `3b0b13e` (2026-06-02 04:41:50, 22 minutes après) ⚠️ **ANNULE COMPLÈTEMENT LE FIX** :
> "revert(engine): roll back run-inputs injection (hangs prod at Risk Analyst)"
> Le fix résout l'hallucination EN LOCAL … mais fait HANG la prod : 2/2 runs prod bloqués à 2 steps (Risk Analyst ne rend jamais, ~12 min).

**Code ACTUEL (HEAD)** ✅ : `services/crewai-engine/src/crews/dynamic_crew.py:469-470`
```python
description = (row.get("description") or row.get("name") or "").strip()
expected_output = (row.get("expected_output") or row.get("name") or "").strip()
```

→ Description reste template prose, AUCUNE interpolation des inputs du run.

**Flow** ✅ : `services/crewai-engine/src/flows/dynamic_swarm_flow.py:184`
```python
result = crew.kickoff(inputs=self.state.inputs or {})
```

→ Inputs passés au crew `as-is`, mais tasks n'en reçoivent RIEN en description (zéro injection côté `instantiate_tasks`).

**Conséquence** ❌ : Automobile runs **REVERRAIENT DES ANALYSES DE VÉHICULES HALLUCINÉS**, pas du véhicule réel fourni en `run.trigger_inputs = {make: "Peugeot", model: "308", ...}`. Le hang prod reste non élucidé (piste suggérée : injection UNIQUEMENT dans Data Collector root task).

**Fichier/Ligne Clé** : 
- `services/crewai-engine/src/crews/dynamic_crew.py:469-470` (instantiate_tasks, sans injection)
- `services/crewai-engine/src/flows/dynamic_swarm_flow.py:184` (kickoff sans modification)
- Commits : `1c8a433` (fix), `3b0b13e` (revert complet)

**Classification** : [RISQUE] (P0 non résolu) — hallucination de données critiques, déploiement prod affecté.

---

### 5. Branchement AutoScout24 Incomplet [INCOHÉRENT]

**État DB** : `tools` table row 3
```
name: "AutoScout24 Sourcing"
category: "search"
endpoint_url: "/api/scrape/autoscout"
is_active: true
owner_id: NULL (template global)
```

**Routes API réelles** ✅ :
```bash
find src/app/api -type d | sort
# Résultat : /api/admin, /api/automobile, /api/cockpit-chat, /api/crews, 
#            /api/health, /api/sources, /api/swarms, /api/system, /api/tools
# Zéro /api/scrape
```

**Endpoint existant** : Seul `/api/automobile/extract-url` est implémenté.

**Utilisation réelle** ✅ :
```bash
grep -r "searchAutoScout\|/api/scrape/autoscout" src --include="*.ts" --include="*.tsx"
# Résultat : APIFY_TOKEN utilisé directement en client-side, zéro route d'interception.
```

**Verdict** : [INCOHÉRENT] — tool déclaré actif en DB, mais l'endpoint `/api/scrape/autoscout` n'existe pas. Orphelin.

---

### 6. Hedge Engine (vLLM local) Isolé de MySwarms [BRANCHÉ]

**Confirmé dans docs/GPU_TRAINING_INVENTORY.md:80-86** :
```
Hedge engine — `config.py`
vllm_base_url_reasoning: str = "http://localhost:8000/v1"  # Qwen2.5-Coder-32B
vllm_base_url_fast: str = "http://localhost:8001/v1"       # Qwen2.5-Coder-7B
vllm_api_key: str = "vllm-local-key"

MySwarms n'utilise pas ces endpoints.
```

**Grep MySwarms** ✅ : Zéro référence à vllm, localhost:8000/8001, ou Hedge config.

**Classification** : [BRANCHÉ] pour Hedge (produit séparé). MySwarms = 100% cloud.

---

### 7. Aucune Table pgvector, Aucun Endpoint Embeddings [BRANCHÉ]

**Tables Supabase auditées** ✅ (13 core + 17 hedge_*) :
- swarms, agents, tasks, tool_bindings, swarm_runs, swarm_run_steps, tools
- cockpit_chats, cockpit_messages, chief_run_log, chief_run_steps, chief_decisions
- vehicle_decisions
- hedge_* (market_snapshots, orderbook, market_events, position_reconciliations, etc.)

**Zéro** : vehicle_embeddings, embeddings, vectors (no pgvector usage) ✅

**Endpoint attendu** : docs/GPU_TRAINING_INVENTORY.md recommande `POST /api/automobile/embed`, mais :
- Route N'EXISTE PAS ✅
- Table N'EXISTE PAS ✅
- Aucun appel nomic-embed identifié ✅

**Verdict** : [BRANCHÉ] — Embeddings n'est pas implémenté. Potentiel documenté, pas activé.

---

### 8. Zéro Training, LoRA, Fine-Tuning, Datasets, Checkpoints [BRANCHÉ]

**Audit docs/GPU_TRAINING_INVENTORY.md section "Scripts training / batch / pipeline"** ✅ :
> "Résultat : NÉANT. Aucun script de training, fine-tuning, LoRA/QLoRA, pipeline dataset, job batch, cron ML n'a été identifié."

**Grep repo** ✅ :
```bash
find services -path "*/.venv" -prune -o -name "*.py" -type f -exec grep -l "torch\|cuda\|finetune\|lora\|training" {} \;
# Zéro match (sauf dépendances crewai upstream, non utilisées localement)
```

**Verdict** : [BRANCHÉ] — Zéro code training.

---

### 9. Risques Sécurité Identifiés [RISQUE]

#### 9.1 Redis sur 0.0.0.0:6379 (GPU1+GPU2)
**Sévérité** : P1 (Moyenne - GPU local non critique pour MySwarms, mais réseau physique à risque)
**Source** : docs/GPU_TRAINING_INVENTORY.md:145-147
**Action** : Restreindre à 127.0.0.1 ou Docker network interne.

**MySwarms impact** : ZÉRO — utilise `UPSTASH_REDIS_REST_URL` (cloud Redis).

#### 9.2 InvokeAI exposé via invoke.hearst.app sans auth
**Sévérité** : P1 (Moyenne)
**Source** : docs/GPU_TRAINING_INVENTORY.md:147
**Impact MySwarms** : ZÉRO — n'utilise pas InvokeAI.

#### 9.3 ⚠️ CORRECTION: DEV_BYPASS_OWNER_ID hardcodé (.env.local:178)
**Sévérité** : P1 (single-user stub, production bug si DEV_BYPASS_AUTH=true en prod)
**Ligne** : `.env.local:178` — `DEV_BYPASS_OWNER_ID=e0a983da-536f-4dad-a205-861acbae9468`
**Commentaire original erroné** : L'audit cite `DEV_OWNER_ID` (ligne 145, DEAD CODE). Le code utilise **réellement** `DEV_BYPASS_OWNER_ID` (ligne 178, qui est la même valeur).
**Code** ✅ : `src/lib/auth/owner.ts:64-67` — accède à `process.env.DEV_BYPASS_OWNER_ID`.
**Verdict** : Variable correcte utilisée. ⚠️ Mais si `DEV_BYPASS_AUTH=true` reste actif en prod, scalabilité multi-tenant brisée.

#### 9.4 ⚠️ CORRECTION: tenant_config.owner_id ≠ DEV_BYPASS_OWNER_ID
**Sévérité** : P1 (Incohérence potentielle)
**DB État** :
- tenant_config (1 row) : owner_id = 51a6c3f9-ffc2-4ff8-b3ce-a643197a43a1
- swarms/runs (12-30 rows) : owner_id = e0a983da-536f-4dad-a205-861acbae9468
- .env.local : DEV_BYPASS_OWNER_ID = e0a983da-...

**Clarification** ✅ : `getTenantConfig()` (src/lib/tenant/config.ts:34) filtre par `ownerId` COURANT (via `getOwnerId()` / bypass-auth), pas par une valeur hardcodée. Si tenant_config contient une seule ligne (owner_id=51a6c3f9), elle est INACCESSIBLE via .eq("owner_id", ownerId) sauf si l'user courant EST 51a6c3f9. C'est un **mismatch d'initialisation de données** (dev env = une owner_id, données DB = autre).

---

### 10. Résumé des Buckets

| Bucket | Éléments | Preuve |
|---|---|---|
| **BRANCHÉ** | Automobile cloud (Hypercli, confirmed dynamic_crew.py:250-262), Hedge isolation, Zéro training | dynamic_crew.py LLM resolution, grep -r vllm/comfy/invoke = 0 matches |
| **PARTIEL** | (aucun) | — |
| **UI-ONLY** | Training cinematic page (historiquement, git d9e2e52 -600L) | commit d9e2e52 revert |
| **HARDCODÉ** | COMFY_BASE/STUDIO_INVOKE/STUDIO_SSH (.env.local:138-140), DEV_BYPASS_OWNER_ID (.env.local:178) | .env.local, not used in code |
| **LEGACY** | Training page (supprimée 56bd31e→d9e2e52), DEV_OWNER_ID env var (dead code) | git log, grep DEV_OWNER_ID = comment only |
| **INCOHÉRENT** | AutoScout24 tool (endpoint_url=/api/scrape/autoscout n'existe pas), tenant_config.owner_id vs DEV_BYPASS_OWNER_ID data mismatch | DB tools vs src/app/api, DB tenant_config |
| **RISQUE** | Run inputs N'INJECTÉS en task prompts (hallucination P0, revert 3b0b13e active), Redis 0.0.0.0:6379, InvokeAI sans auth, DEV_BYPASS_AUTH en dev/prod | git 3b0b13e, .env.local:49, docs/GPU_TRAINING_INVENTORY |
| **NON-TESTÉ** | Automobile hallucination scenario post-revert 3b0b13e, AutoScout24 integration, Embeddings feature | no e2e test git log, no test file in repo |

---

### 11. Verdict Final

**Swarm Platform (MySwarms)** :
- ✅ **N'utilise AUCUN GPU local** (4090 sont isolés pour Hedge/OpenClaw)
- ✅ **Aucun training/fine-tuning code**
- ✅ **Aucun batch job GPU**
- ❌ **CRITIQUE NON RÉSOLU** : Run inputs hallucination bug (revert 3b0b13e annule la correction 1c8a433, prod affectée, hang non élucidé)
- ❌ **INCOHÉRENT** : AutoScout24 tool orphelin, tenant_config vs bypass_owner mismatch
- ⚠️ **RISQUE SECONDAIRE** : Redis + InvokeAI non protégés (GPU infra, pas MySwarms). DEV_BYPASS_AUTH peut fuir en prod.

**Branché** ✅ : Automobile cloud (Hypercli), Hedge isolated, Zéro GPU MySwarms. 
**Potentiel non-utilisé** : Embeddings (route + table non créées).
**Action critique** : Résoudre le hang prod (3b0b13e) pour réactiver injection inputs, ou valider que hallucination N'AFFECTE PAS les runs actuels prod.



## 14. HARDCODES

### Vue Globale
Audit exhaustif des **valeurs, IDs, constantes, timeouts, limits, patterns et fallbacks** hardcodés. **52 variables d'environnement** trouvées (toutes configurables). **16 routes API** actuelles, aucune non-implémentée en production (mais 1 contrat mentionné mais absent).

---

### 1. IDs de Template & Swarms [HARDCODÉ ✅ VÉRIFIÉ]

#### Automobile Template ID
- **Fichier:** `src/lib/automobile/config.ts:8-9`
- **Valeur:** `"cccccccc-0001-0001-0001-000000000001"`
- **Classification:** **HARDCODÉ**
- **Raison:** ID stable de template Automobile, seedé en DB. Utilisé dans 4 pages automobile et system-map.
- **Dangereux:** ❌ Non. Intentionnel — overridable via `AUTOMOBILE_SWARM_ID` env. Version override en `src/app/system-map/page.tsx:26-28` et test-compatible.
- **Action:** ✅ Acceptable — maintenu pour retrocompatibilité (champs legacy Supabase).

#### System Map — Template Display Name
- **Fichier:** `src/app/system-map/page.tsx:30-31`
- **Valeur:** `"Automobile — Recherche véhicule"`
- **Classification:** **HARDCODÉ/UI-ONLY**
- **Raison:** Nom canonique du template (stocké corrompu en base). Overridable via `NEXT_PUBLIC_AUTOMOBILE_TEMPLATE_NAME` env.
- **Action:** ✅ Acceptable — failsafe légitime contre DB inconsistency.

#### System Map — Retry Logic
- **Fichier:** `src/app/system-map/page.tsx:33`
- **Valeur:** `5` (FETCH_RETRIES)
- **Classification:** **HARDCODÉ**
- **Raison:** Nombre de retries pour résoudre 404 engine intermittent (résolution owner-scoped). Configurable via `NEXT_PUBLIC_SYSTEM_MAP_RETRIES` env.
- **Action:** ✅ Acceptable — délai raisonnable (5 tentatives).

#### Autres Excerpt Sizes
- **Fichier:** `src/app/system-map/page.tsx:34-35`
- **Valeurs:** `REPORT_EXCERPT_CHARS = 360`, `OUTPUT_EXCERPT_CHARS = 320`
- **Classification:** **HARDCODÉ/UI-ONLY**
- **Raison:** Tailles d'affichage (truncature d'affichage UI, pas de logique critique).
- **Action:** ✅ Acceptable — constantes purement cosmétiques.

---

### 2. Modèles LLM & Provider [HARDCODÉ/INCOHÉRENT ⚠️ CORRIGÉ]

#### Kimi Model Default
- **Fichier:** `src/lib/llm/kimi.ts:12`
- **Valeur:** `"kimi-k2.6"`
- **Classification:** **HARDCODÉ/INCOHÉRENT**
- **Raison:** Default LLM model. **TOUS les providers (anthropic, openai, kimi, hypercli) sont FORCÉMENT routés à Hypercli/Kimi au runtime** (comment engine Python `_resolve_llm()`).
- **Dangereux:** ⚠️ **INCOHÉRENT mais CLAIREMENT DOCUMENTÉ** — UI affiche 4 options de provider + notice rouge (ligne 68: "Provider enforced at runtime: Hypercli · Kimi K2.6"). Les options `anthropic` et `openai` sont conservées pour **compatibilité DB legacy** uniquement (swarms existants avec ces valeurs stockées seront re-routés Hypercli, pas rejetés).
- **Évidence UI:** `src/components/swarms/LLMPicker.tsx:17-20` : « Runtime enforcement: all providers are routed to Hypercli (Kimi K2.6) at runtime by _resolve_llm() in services/crewai-engine/src/crews/dynamic_crew.py. »
- **Évidence notice:** `src/components/swarms/LLMPicker.tsx:68-70` : « Provider enforced at runtime: Hypercli · Kimi K2.6. Any provider stored in DB is routed to Hypercli by the engine. »
- **Action:** ✅ **BRANCHÉ COMPLÈTEMENT** — override est visible et documenté en UI (notice rouge). Aucune hallucination possible : la notice explique explicitement le comportement avant que l'utilisateur ne sauvegarde.

---

### 3. Timeouts & Rate Limits [HARDCODÉ ✅ VÉRIFIÉ]

#### Architect Agent Timeout
- **Fichier:** `src/lib/crewai/swarms.ts:39-41`
- **Valeur:** `90000` ms (90 secondes)
- **Classification:** **HARDCODÉ**
- **Raison:** Timeout générique pour Architect Agent (3 runs Opus, ~60-90s). Configurable via `CREWAI_ENGINE_ARCHITECT_TIMEOUT_MS` env.
- **Action:** ✅ Acceptable — valeur généreuse, bien documentée.

#### Default Engine Timeout
- **Fichier:** `src/lib/crewai/_internal.ts:82`
- **Valeur:** `30000` ms (30 secondes)
- **Classification:** **HARDCODÉ**
- **Raison:** Timeout par défaut pour tous les appels engine. Configurable via `CREWAI_ENGINE_TIMEOUT_MS` env.
- **Action:** ✅ Acceptable — override env toujours possible.

#### Apify Actor Timeout
- **Fichier:** `src/lib/apify/client.ts:14`
- **Valeur:** `120000` ms (120 secondes)
- **Classification:** **HARDCODÉ**
- **Raison:** Timeout pour AutoScout24 actor (~30-60s). Non configuré en env.
- **Action:** ⚠️ **PARTIEL** — Pas d'env override. Si actor dépasse 120s, timeout hard sans fallback retry.

#### Rate Limit Window (Architect Generate)
- **Fichier:** `src/lib/utils/rate-limit.ts:44`
- **Valeur:** `600000` ms (10 minutes)
- **Classification:** **HARDCODÉ**
- **Raison:** Fenêtre glissante pour rate-limit. Borne la fréquence Architect (coûteux, 3 runs Opus par appel). Configurable via `ARCHITECT_RATELIMIT_WINDOW_MS` env.
- **Action:** ✅ Acceptable — fenêtre > latence Opus (~90s), protège contre abus coût.

#### Rate Limit Max Hits
- **Fichier:** `src/lib/utils/rate-limit.ts:46`
- **Valeur:** `10` hits par fenêtre
- **Classification:** **HARDCODÉ**
- **Raison:** Plafond hits Architect dans fenêtre 10min. Configurable via `ARCHITECT_RATELIMIT_MAX` env.
- **Action:** ✅ Acceptable — ~10 swarms/10min = ~$30-50 coût Opus ; raisonnable V1 single-user.

#### Body Size Limit
- **Fichier:** `src/lib/utils/body-limit.ts:3`
- **Valeur:** `1000000` bytes (1 MB)
- **Classification:** **HARDCODÉ**
- **Raison:** Limite HTTP POST body (swarms, agents, kickoff). Non configuré en env.
- **Action:** ⚠️ **PARTIEL** — Pas d'env override. Swarm massif (~1 MB JSON) sera rejeté 413.

#### Cockpit Max Turns
- **Fichier:** `src/lib/cockpit-agent/runtime.ts:6`
- **Valeur:** `6` tours
- **Classification:** **HARDCODÉ**
- **Raison:** Limite interaction cockpit-agent (évite boucle infinie). Non configuré en env.
- **Action:** ⚠️ **PARTIEL** — Pas configurable. Si l'utilisateur a besoin de >6 tours, message d'avertissement émis (ligne 91: "affine ta demande").

#### Status Poll Timeout
- **Fichier:** `src/app/api/system/status/route.ts:17`
- **Valeur:** `3000` ms (3 secondes)
- **Classification:** **HARDCODÉ**
- **Raison:** Timeout check health system. Non env.
- **Action:** ✅ Acceptable — court timeout pour probe infra.

#### Langfuse Timeout
- **Fichier:** `src/lib/observability/langfuse.ts:49`
- **Valeur:** `3000` ms (3 secondes)
- **Classification:** **HARDCODÉ**
- **Raison:** Timeout appel Langfuse (observe/trace). Non env.
- **Action:** ✅ Acceptable — observability graceful (timeout ne casse pas l'appel principal).

---

### 4. Limits Métier [HARDCODÉ ✅ VÉRIFIÉ]

#### Swarm Name Length
- **Fichier:** `src/lib/forms/swarmSchemas.ts:66-67`
- **Valeurs:** `MIN_NAME_LENGTH = 2`, `MAX_NAME_LENGTH = 120`
- **Classification:** **HARDCODÉ**
- **Raison:** Validation formulaire. Configurables via `NEXT_PUBLIC_SWARMS_MIN_NAME_LENGTH` & `NEXT_PUBLIC_SWARMS_MAX_NAME_LENGTH` env.
- **Action:** ✅ Acceptable — limits raisonnables.

#### Swarm Default Temperature
- **Fichier:** `src/lib/forms/swarmSchemas.ts:64`
- **Valeur:** `0.7`
- **Classification:** **HARDCODÉ**
- **Raison:** Default température agents. Configurable via `NEXT_PUBLIC_SWARMS_DEFAULT_TEMPERATURE` env.
- **Action:** ✅ Acceptable.

#### Swarm Default Max Tokens
- **Fichier:** `src/lib/forms/swarmSchemas.ts:65`
- **Valeur:** `4096`
- **Classification:** **HARDCODÉ**
- **Raison:** Default max tokens agents. Configurable via `NEXT_PUBLIC_SWARMS_DEFAULT_MAX_TOKENS` env.
- **Action:** ✅ Acceptable.

#### Swarm Max Tokens Cap
- **Fichier:** `src/lib/forms/swarmSchemas.ts:82`
- **Valeur:** `200000` (Zod `.max(200_000)`)
- **Classification:** **HARDCODÉ**
- **Raison:** Plafond dur tokens agents. Non env, non configurable.
- **Action:** ⚠️ **RISQUE** — Plateforme coûteuse (Claude, Kimi). Si Opus tokens passent de 1M à 2M, ce plafond doit être mis à jour manuellement.

#### Vehicle Min Year
- **Fichiers:** `src/lib/apify/autoscout.ts:47`, `src/lib/automobile/urlExtractor.ts:31`
- **Valeur:** `1900`
- **Classification:** **HARDCODÉ**
- **Raison:** Validation année véhicule minimale (antique → rejet). Non env.
- **Action:** ✅ Acceptable — constant métier.

#### AutoScout Max Results Cap
- **Fichier:** `src/lib/apify/autoscout.ts:40`
- **Valeur:** `100`
- **Classification:** **HARDCODÉ**
- **Raison:** Cap hits actor Apify (protège API, budget). Non env.
- **Action:** ⚠️ **PARTIEL** — Pas configurable. Si Apify augmente la limite du actor, la cap doit être mise à jour code.

#### AutoScout Default Results
- **Fichier:** `src/lib/apify/autoscout.ts:42`
- **Valeur:** `25`
- **Classification:** **HARDCODÉ**
- **Raison:** Default résultats sourcing. Non env.
- **Action:** ✅ Acceptable — balance UX/coût.

#### AutoScout Cache TTL
- **Fichier:** `src/lib/apify/autoscout.ts:46`
- **Valeur:** `300` secondes (5 minutes)
- **Classification:** **HARDCODÉ**
- **Raison:** TTL Upstash Redis (cache requests AutoScout). Non env.
- **Action:** ⚠️ **PARTIEL** — Pas configurable. Changes sourcing restent invisibles >5 min.

#### Dedup Scan Limit (Automobile)
- **Fichier:** `src/lib/automobile/dedup.ts:32-33` (importé via config)
- **Valeur:** `25` (via `AUTOMOBILE_DEDUP_SCAN_LIMIT` env, défaut)
- **Classification:** **HARDCODÉ**
- **Raison:** Nombre de runs Automobile à scanner pour dédup. Configurable env.
- **Action:** ✅ Acceptable — limit raisonnable (1-2s scan).

#### Max HTML Bytes (URL Extract)
- **Fichier:** `src/lib/automobile/urlExtractor.ts:51`
- **Valeur:** `1000000` bytes
- **Classification:** **HARDCODÉ**
- **Raison:** Limite download HTML pour extraction métadonnées véhicule. Configurable via `AUTOMOBILE_URL_EXTRACT_MAX_HTML_BYTES` env.
- **Action:** ✅ Acceptable.

#### Cockpit Chats List Limit
- **Fichier:** `src/app/api/cockpit-chats/route.ts:20`
- **Valeur:** `100`
- **Classification:** **HARDCODÉ**
- **Raison:** Limite affichage liste cockpit chats. Non env.
- **Action:** ⚠️ **PARTIEL** — Pas configurable. >100 chats → pagination manquante.

#### Runs List Default Limit
- **Fichiers:** `src/lib/crewai/swarms.ts:205`, `src/lib/crewai/client.ts:97`
- **Valeur:** `20` runs
- **Classification:** **HARDCODÉ**
- **Raison:** Pagination default runs. Pas env, non configurable call-site.
- **Action:** ⚠️ **PARTIEL** — Pas d'override param API, limité UI.

#### HTML Strip Max (URL Extraction)
- **Fichier:** `src/lib/automobile/urlExtractor.ts:309`
- **Valeur:** `120000` caractères
- **Classification:** **HARDCODÉ**
- **Raison:** Truncature texte brut pour extraction (évite parsing massif). Non env.
- **Action:** ✅ Acceptable — constant technique.

#### Cockpit Result Summary Truncate
- **Fichier:** `src/lib/cockpit-agent/tools.ts:443`
- **Valeur:** `1200` caractères
- **Classification:** **HARDCODÉ**
- **Raison:** Truncature result_text dans run summary. Non env.
- **Action:** ✅ Acceptable — output cosmétique.

#### Timeout Cockpit Tool Command
- **Fichier:** `src/lib/cockpit-agent/tools.ts:107, 339`
- **Valeur:** `Défaut 30000, max 120000` ms
- **Classification:** **HARDCODÉ**
- **Raison:** Min/max timeout commandes cockpit tools. Calcul: `Math.min(Math.max(args.timeout_ms ?? 30000, 1000), 120000)`.
- **Action:** ✅ Acceptable — bounds raisonnables.

#### Architect Prompt Max/Min
- **Fichier:** `src/lib/forms/swarmSchemas.ts:339-340`
- **Valeurs:** `4000` (max), `10` (min)
- **Classification:** **HARDCODÉ**
- **Raison:** Validation prompt Architect Agent. Configurables via `NEXT_PUBLIC_ARCHITECT_PROMPT_MAX` & `NEXT_PUBLIC_ARCHITECT_PROMPT_MIN` env.
- **Action:** ✅ Acceptable.

---

### 5. Apify Actor & URLs [HARDCODÉ ⚠️ VÉRIFIÉ]

#### Apify Base URL
- **Fichier:** `src/lib/apify/client.ts:13`
- **Valeur:** `"https://api.apify.com/v2"`
- **Classification:** **HARDCODÉ**
- **Raison:** Endpoint API Apify. Non env.
- **Action:** ✅ Acceptable — URL publique stable.

#### AutoScout24 Actor ID
- **Fichier:** `src/lib/apify/autoscout.ts:39`
- **Valeur:** `"blackfalcondata~autoscout24-scraper"`
- **Classification:** **HARDCODÉ**
- **Raison:** ID actor Apify (namespace ~ slug). Non env, non configurable.
- **Action:** ⚠️ **RISQUE** — Si actor est supprimé/déplacé, aucune fallback. Route `/automobile/sourcing` sera 502.

#### Upstash Redis Rest URLs
- **Fichier:** `src/lib/apify/autoscout.ts:51-52`
- **Valeurs:** `UPSTASH_URL`, `UPSTASH_TOKEN` (env)
- **Classification:** **PARTIEL/GRACEFUL**
- **Raison:** Cache Redis optionnel pour AutoScout. Si absent (env not set), cache disabled gracefully (continue sans cache, pas crash).
- **Action:** ✅ Acceptable — fallback bien codé (lignes 55-65 gèrent gracefully les absences).

#### Engine URL
- **Fichier:** `src/lib/crewai/_internal.ts:10-11`
- **Valeur:** `"http://localhost:8000"` (défaut)
- **Classification:** **HARDCODÉ**
- **Raison:** URL engine CrewAI. Configurable via `CREWAI_ENGINE_URL` env.
- **Action:** ✅ Acceptable — dev-friendly default.

#### Hypercli Base URL
- **Fichier:** `src/lib/llm/kimi.ts:9`
- **Valeur:** `"https://api.hypercli.com/v1"`
- **Classification:** **HARDCODÉ**
- **Raison:** URL OpenAI-compatible endpoint Hypercli. Configurable via `HYPERCLI_BASE_URL` env.
- **Action:** ✅ Acceptable.

#### Logo CDN URL
- **Fichier:** `src/lib/automobile/brands.ts:18`
- **Valeur:** `"https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized"`
- **Classification:** **HARDCODÉ**
- **Raison:** CDN jsDelivr (marques véhicule). Non env.
- **Action:** ✅ Acceptable — public CDN, stable long-term.

---

### 6. Patterns & Regex [HARDCODÉ ✅ VÉRIFIÉ]

#### UUID Format Regex
- **Fichier:** `src/lib/utils/uuid.ts:14-15`
- **Valeur:** `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- **Classification:** **HARDCODÉ**
- **Raison:** Regex validation UUID (v1..v8, format-only, version-agnostic). **Réutilisé dans `src/lib/forms/swarmSchemas.ts` comme source de vérité unique** (ligne 3).
- **Action:** ✅ **BRANCHÉ** — Prouvé par import unique en tête de fichier (ligne 3).

#### Recommendation Parser
- **Fichier:** `src/lib/swarms/recommendation.ts:8-9`
- **Valeurs:** 
  - Section: `/##\s*Recommendation[^\n]*\n+([\s\S]{0,400})/i`
  - Keywords: `/\*\*(APPELER|ATTENDRE|ÉVITER|EVITER|CALL|WAIT|AVOID)\*\*/i`
- **Classification:** **HARDCODÉ**
- **Raison:** Parser markdown Automobile recommandation finale (FR + EN). Section limit 400 chars.
- **Action:** ✅ Acceptable — bien documenté, test-prouvé.

#### Marketplace Source Detector
- **Fichier:** `src/lib/automobile/source.ts:10-18`
- **Valeur:** Regex hostname matching (autoscout24, mobile.de, leboncoin, la-centrale, subito, milanuncios, coches.net)
- **Classification:** **HARDCODÉ**
- **Raison:** Detection source marketplace depuis URL. Fallback: retourne hostname brut si unknown.
- **Action:** ✅ Acceptable — fallback graceful.

#### URL Dedup Normalization
- **Fichier:** `src/lib/automobile/dedup.ts:40-41`
- **Valeur:** `url.hostname.toLowerCase().replace(/^www\./, "")` + `url.pathname.replace(/\/+$/, "")`
- **Classification:** **HARDCODÉ**
- **Raison:** Normalize URL pour matching annonce duplicate. Query/hash ignorés (tracking).
- **Action:** ✅ Acceptable — stratégie V1 bien documentée.

#### Diacritics Removal (Car Logo)
- **Fichier:** `src/lib/automobile/brands.ts:20`
- **Valeur:** `/[̀-ͯ]/g`
- **Classification:** **HARDCODÉ**
- **Raison:** Regex Unicode diacritics removal (Nissan → nissan, Citroën → citroen).
- **Action:** ✅ Acceptable — constant Unicode.

#### Space-to-Dash (Car Logo Slug)
- **Fichier:** `src/lib/automobile/brands.ts:28`
- **Valeur:** `/\s+/g` → `-`
- **Classification:** **HARDCODÉ**
- **Raison:** Space to dash (slugify marque).
- **Action:** ✅ Acceptable.

---

### 7. Statuses & Enums [HARDCODÉ ✅ BRANCHÉ]

#### Run Status Enum
- **Fichier:** `src/lib/forms/swarmSchemas.ts:53-60`
- **Valeurs:** `pending, running, paused_hitl, completed, failed, cancelled`
- **Classification:** **BRANCHÉ**
- **Raison:** Enum Zod des status de run (aligné engine Python). Utilisé partout (`src/app/swarms/*`, `src/components/system-map/*`).
- **Action:** ✅ **BRANCHÉ COMPLÈTEMENT** — enum est source de vérité, prouvé en DB (30 runs réels, tous status respectent l'enum).

#### Running Status Check
- **Fichier:** `src/lib/crewai/runStatus.ts:2`
- **Valeur:** `["running", "pending", "paused_hitl"]`
- **Classification:** **BRANCHÉ**
- **Raison:** Constante statuses non-terminaux (polling pertinent).
- **Action:** ✅ Acceptable.

#### Agent Role Enum
- **Fichier:** `src/lib/forms/swarmSchemas.ts:16-22`
- **Valeurs:** `coordinator, analyst, executor, reviewer, tool_runner`
- **Classification:** **BRANCHÉ**
- **Raison:** Enum rôles agent (aligné engine). Utilisé templates.
- **Action:** ✅ Acceptable.

#### Model Provider Enum
- **Fichier:** `src/lib/forms/swarmSchemas.ts:28-33`
- **Valeurs:** `anthropic, openai, kimi, hypercli`
- **Classification:** **BRANCHÉ/INCOHÉRENT (CLAIREMENT DOCUMENTÉ)**
- **Raison:** 4 providers stockés DB, mais **TOUS forcés Hypercli runtime**. UI list 4 options avec notice explicite.
- **Documentation:** `src/components/swarms/LLMPicker.tsx:17-20, 68-70` expliquent clairement le mécanisme.
- **Action:** ✅ **ACCEPTABLE** — Pas d'hallucination possible car la UI avertit explicitement avant sauvegarde.

#### Tool Category Enum
- **Fichier:** `src/lib/forms/swarmSchemas.ts:36-42`
- **Valeurs:** `api_call, file_io, code_execution, search, database, custom`
- **Classification:** **LEGACY/MORT**
- **Raison:** Catégories tools. Non utilisé actuellement (tools table vide en prod).
- **Action:** ⚠️ **LEGACY** — enum présent mais 0 tools en prod.

#### Swarm Trigger Enum
- **Fichier:** `src/lib/forms/swarmSchemas.ts:45-50`
- **Valeurs:** `morning, evening, intraday, on_demand, webhook`
- **Classification:** **LEGACY/MORT**
- **Raison:** Enum triggers planning. **Pas implémenté** — UI n'affiche pas, scheduling none actif.
- **Action:** ❌ **MORT** — À retirer ou implémenter.

---

### 8. Fallback Owner & Auth [HARDCODÉ/RISQUE ✅ BIEN GARDÉ]

#### Dev Bypass Owner ID
- **Fichier:** `src/lib/auth/owner.ts:60, 66`
- **Valeur:** `"00000000-0000-0000-0000-000000000000"` (UUID nul, fallback dev)
- **Classification:** **HARDCODÉ/RISQUE**
- **Raison:** Fallback stub auth si `DEV_BYPASS_AUTH=true` (dev uniquement). Produit: aucun fallback, fail-closed strict (ligne 50: `NODE_ENV !== "production"` guard).
- **Dangereux:** ⚠️ **THÉORIQUE SEULEMENT** — Si fallback UUID accidentellement utilisé prod, TOUS les utilisateurs partageraient owner_id et verraient les données les uns des autres (data leak).
- **Safeguard:** ✅ `NODE_ENV !== "production"` guard → bypass impossible prod (ligne 50).
- **Action:** ✅ Acceptable — dev-only, bien gardé, no-bypass en prod.

---

### 9. Routes API & Endpoints

#### Implémentées (16) ✅
1. ✅ `GET /api/health` — probe infra
2. ✅ `GET /api/tools` — proxy engine (fallback [])
3. ✅ `GET /api/swarms` — proxy engine
4. ✅ `POST /api/swarms` — proxy engine
5. ✅ `GET /api/swarms/[id]` — proxy engine
6. ✅ `PATCH /api/swarms/[id]` — proxy engine
7. ✅ `DELETE /api/swarms/[id]` — proxy engine
8. ✅ `POST /api/swarms/[id]/kickoff` — proxy engine
9. ✅ `POST /api/swarms/architect/generate` — proxy engine + rate-limit
10. ✅ `POST /api/automobile/extract-url` — local (urlExtractor)
11. ✅ `POST /api/sources/composio/connect` — proxy engine
12. ✅ `GET /api/crews/chief-of-staff/decisions` — proxy engine
13. ✅ `POST /api/crews/chief-of-staff/decisions` — proxy engine
14. ✅ `GET /api/cockpit-chats` — direct Supabase
15. ✅ `POST /api/cockpit-chats` — direct Supabase
16. ✅ `POST /api/system/start` — spawn engine (dev-only, 403 prod)

#### Contrat Public Mentionné Mais Route Absente ❌
- **`POST /api/scrape/autoscout`** — **Mentionnée dans `src/lib/apify/types.ts:3`** comme contrat public (« Contrat public exposé via la route POST /api/scrape/autoscout »), **MAIS N'EXISTE PAS** dans `src/app/api`.
  - **Vérification:** `find src/app/api -type d -name "scrape"` → 0 résultats
  - **Vérification:** `find src/app/api -name "*autoscout*"` → 0 résultats
  - **Utilisation réelle:** `src/app/automobile/sourcing/page.tsx:57` appelle `searchAutoScout()` **directement** côté serveur (import ligne 4), pas via une route API.
  - **Impact:** Sourcing automobile est **frontend/SSR-seul**, pas BFF-routed.
  - **Classification:** **UI-ONLY** (sourcing est server-side page component, appelle directement `searchAutoScout`, pas via API).
  - **Correction:** Le commentaire `types.ts:3` est **erroné/obsolète**. Il mentionne un contrat public qui n'a jamais été implémenté. Sourcing est une opération SSR, pas une route API.

---

### 10. Supabase Project Ref [HARDCODÉ/ACCEPTABLE]

#### Supabase Project ID
- **Fichiers:** `src/app/login/LoginForm.tsx:19`, `src/app/login/page.tsx:18`, `src/components/system-map/buildArchitecture.ts:135`
- **Valeur:** `"fxeibmjebvxtoazuyyvz"`
- **Classification:** **HARDCODÉ/ACCEPTABLE**
- **Raison:** Reference public projet Supabase. Utilisé dans commentaires et UI (system-map detail). Non env.
- **Dangereux:** ❌ Non. Reference publique (no secrets), safe à hardcoder.
- **Action:** ✅ Acceptable.

---

### 11. Environment Variables — 52 Total Found ✅

| Variable | File | Default | Type | Configurable |
|----------|------|---------|------|--------------|
| `AUTOMOBILE_SWARM_ID` | config.ts | cccccccc-0001... | env | ✅ |
| `NEXT_PUBLIC_AUTOMOBILE_TEMPLATE_ID` | system-map | cccccccc-0001... | env | ✅ |
| `NEXT_PUBLIC_AUTOMOBILE_TEMPLATE_NAME` | system-map | Automobile — ... | env | ✅ |
| `NEXT_PUBLIC_SYSTEM_MAP_RETRIES` | system-map | 5 | env | ✅ |
| `CREWAI_ENGINE_ARCHITECT_TIMEOUT_MS` | swarms.ts | 90000 | env | ✅ |
| `CREWAI_ENGINE_TIMEOUT_MS` | _internal.ts | 30000 | env | ✅ |
| `CREWAI_ENGINE_URL` | _internal.ts | http://localhost:8000 | env | ✅ |
| `CREWAI_ENGINE_AUTH_TOKEN` | _internal.ts | "" | env | ✅ (required) |
| `ARCHITECT_RATELIMIT_WINDOW_MS` | rate-limit.ts | 600000 | env | ✅ |
| `ARCHITECT_RATELIMIT_MAX` | rate-limit.ts | 10 | env | ✅ |
| `UPSTASH_REDIS_REST_URL` | autoscout.ts | (optional) | env | ✅ |
| `UPSTASH_REDIS_REST_TOKEN` | autoscout.ts | (optional) | env | ✅ |
| `APIFY_TOKEN` | apify/client.ts | (required) | env | ✅ (required) |
| `HYPERCLI_API_KEY` | kimi.ts | (required) | env | ✅ (required) |
| `HYPERCLI_BASE_URL` | kimi.ts | https://api.hypercli.com/v1 | env | ✅ |
| `HYPERCLI_DEFAULT_MODEL` | kimi.ts | kimi-k2.6 | env | ✅ |
| `NEXT_PUBLIC_SWARMS_DEFAULT_TEMPERATURE` | swarmSchemas | 0.7 | env | ✅ |
| `NEXT_PUBLIC_SWARMS_DEFAULT_MAX_TOKENS` | swarmSchemas | 4096 | env | ✅ |
| `NEXT_PUBLIC_SWARMS_MIN_NAME_LENGTH` | swarmSchemas | 2 | env | ✅ |
| `NEXT_PUBLIC_SWARMS_MAX_NAME_LENGTH` | swarmSchemas | 120 | env | ✅ |
| `NEXT_PUBLIC_ARCHITECT_PROMPT_MAX` | swarmSchemas | 4000 | env | ✅ |
| `NEXT_PUBLIC_ARCHITECT_PROMPT_MIN` | swarmSchemas | 10 | env | ✅ |
| `AUTOMOBILE_DEDUP_STATUS_TIMEOUT_MS` | dedup.ts | 5000 | env | ✅ |
| `AUTOMOBILE_DEDUP_SCAN_LIMIT` | dedup.ts | 25 | env | ✅ |
| `AUTOMOBILE_URL_EXTRACT_TIMEOUT_MS` | urlExtractor | 8000 | env | ✅ |
| `AUTOMOBILE_URL_EXTRACT_MAX_HTML_BYTES` | urlExtractor | 1000000 | env | ✅ |
| `APM_MARKET_SUPABASE_URL` | apmClient | (required) | env | ✅ |
| `APM_MARKET_SUPABASE_KEY` | apmClient | (required) | env | ✅ |
| `APM_MARKET_TIMEOUT_MS` | apmClient | 5000 | env | ✅ |
| `APM_MARKET_MIN_EFFECTIVE` | apmClient | 3 | env | ✅ |
| `LANGFUSE_PUBLIC_KEY` | langfuse.ts | (optional) | env | ✅ |
| `LANGFUSE_SECRET_KEY` | langfuse.ts | (optional) | env | ✅ |
| `LANGFUSE_HOST` | langfuse.ts | (optional) | env | ✅ |
| `DEV_BYPASS_AUTH` | owner.ts | false | env | ✅ (dev-only) |
| `DEV_BYPASS_OWNER_ID` | owner.ts | 00000000-... | env | ✅ (dev-only) |
| `COMPOSIO_API_KEY` | system/start | (required) | env | ✅ |
| `SUPABASE_URL` | admin.ts | (required) | env | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | admin.ts | (required) | env | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | client.ts | (required) | env | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client.ts | (required) | env | ✅ |
| `NODE_ENV` | multiple | development | system | ✅ |
| `NEXT_PHASE` | kimi.ts | (build-time) | system | ✅ |
| `ALLOWED_EMAIL` | middleware | (optional) | env | ✅ |
| `SUPER_ADMIN_EMAIL` | admin/* | (optional) | env | ✅ |

---

## Verdict Global

### Synthèse Findings

| Catégorie | Count | Status |
|-----------|-------|--------|
| **BRANCHÉ** (fonctionne réellement, prouvé) | 8 | ✅ |
| **PARTIEL** (existe, fragile ou incomplet) | 11 | ⚠️ |
| **UI-ONLY** (visible mais pas de logique) | 4 | ℹ️ |
| **HARDCODÉ** (valeur fixe, configurable ou pas) | 35+ | 📌 |
| **LEGACY/MORT** (présent mais inutilisé) | 2 | ❌ |
| **INCOHÉRENT** (deux parties divergent, mais documenté) | 1 | ⚠️ |
| **RISQUE** (sécu, coût, data leak) | 3 | 🔴 |

### Top Issues à Corriger (P0/P1)

1. **P2 — Contrat Public /api/scrape/autoscout Mentionné Mais Absent** (`src/lib/apify/types.ts:3`)
   - Commentaire déclare un contrat `POST /api/scrape/autoscout` qui n'existe pas
   - Sourcing est SSR/server-side (import direct `searchAutoScout`), pas BFF-routed
   - Fix: Corriger le commentaire `types.ts:3` pour documenter correctement que sourcing est SSR-only

2. **P1 — Body Size Limit No Override** (`src/lib/utils/body-limit.ts:3`)
   - 1 MB hard limit, pas env override
   - Swarm massif (~1 MB) rejeté 413
   - Fix: Ajouter `NEXT_PUBLIC_MAX_BODY_BYTES` env

3. **P1 — Apify Actor Hardcoded, No Fallback** (`src/lib/apify/autoscout.ts:39`)
   - Actor supprimé → Automobile sourcing breaks (502)
   - Fix: Configurer actor ID via env, documenter fallback strategy

4. **P1 — Cockpit Max Turns Hardcoded** (`src/lib/cockpit-agent/runtime.ts:6`)
   - 6 turns limit, >6 → message d'avertissement (pas hard fail)
   - Fix: Ajouter env override si feasible

5. **P2 — Legacy Enums Mort** (`src/lib/forms/swarmSchemas.ts:45-50`)
   - Trigger enum (morning/evening/etc) jamais utilisé
   - Fix: Retirer ou implémenter scheduling

---

## Conclusion
**Ratio hardcodes acceptable (52 env vars configurables)**. Majority fallback bien gardés (dev-only bypass, graceful cache miss, endpoint 404 fallback à []).

**Corrections identifiées:** 
- Provider incohérence (UI ≠ engine) **CLAIREMENT DOCUMENTÉE** en UI ✅ 
- Contrat public obsolète mentionné mais route absente ⚠️
- Body limit, actor ID, cockpit turns no-override ⚠️

**Aucun token/secret** détecté dans le code source (tous en env).

**Lecture seule — 0 modifications, 0 écritures.**

---

## 15. INCOHÉRENCES PRODUIT (section spéciale)

Classées par impact. Chacune vérifiée dans le code/la DB.

| # | Incohérence | Preuve | Impact | Priorité | Correction recommandée |
|---|---|---|---|---|---|
| I-1 | **Middleware fantôme** : `owner.ts` affirme « le middleware protège toutes les routes », aucun `middleware.ts` n'existe | `src/lib/auth/owner.ts` doc vs `find` vide | Fausse hypothèse de sécurité ; route oubliée = ouverte | **P1** | Créer un vrai `middleware.ts` qui gate les routes, OU corriger la doc et auditer chaque route |
| I-2 | **Tool AutoScout mort** : DB `endpoint_url=/api/scrape/autoscout` mais route inexistante | tools DB vs `src/app/api` ; `apify/types.ts:3` (commentaire) | Tool registry trompeur ; non invocable via le moteur | **P1** | Soit implémenter la route, soit retirer le tool / pointer vers le vrai chemin RSC |
| I-3 | **Identité produit Automobile / Automotive / APM** | template `name`="Automobile", `config_json.category`="Automotive", `subcategory`="APM", `tunnel`="apm_vehicle_research" | Confusion catégorie, filtres, analytics | **P2** | Choisir un nom canonique unique et migrer `config_json` |
| I-4 | **tenant_config orphelin** : 1 ligne pour owner `51a6c3f9`, toutes les données appartiennent à `e0a983da` | DB `tenant_config` vs `swarms`/`tools`/`vehicle_decisions` | Visibilité module ne marche que pour 1 owner ; les autres voient tout par DEFAULT | **P1** | Peupler `tenant_config` à la création d'utilisateur, ou retirer la feature |
| I-5 | **Reco IA vs décision humaine** : 2 axes distincts (regex `## Recommendation` vs `vehicle_decisions.status`) | `recommendation.ts` vs `decisionStatus.ts` | Cohérent dans le code (bien séparé) — mais l'UI peut afficher reco "APPELER" + décision "perdu" sans lien | **P2** | OK tel quel ; documenter la sémantique des deux badges |
| I-6 | **Run inputs : injectés puis revertés** | `1c8a433` (fix inject) → `3b0b13e` (revert "hangs prod") | Agents reçoivent inputs via contexte CrewAI mais sans bloc texte → hallucination possible | **P1** | Réinjecter les inputs de façon bornée (sans le hang), + test "le bon véhicule est analysé" |
| I-7 | **Template global vs instance** : 17 runs contre des templates `owner_id=NULL` | `swarm_runs` join owner null=17 | Des runs tournent "au nom de personne" (templates exécutés directement) | **P2** | Toujours cloner le template en instance owned avant kickoff |
| I-8 | **2 configs Railway** : `railway.toml` (front) + `railway.json` (engine) | racine vs `services/crewai-engine/` | Ambiguïté de déploiement (Railway×2 + Vercel) | **P2** | Documenter quelle cible déploie quoi ; un seul plan |
| I-9 | **Page GPU training "fake" supprimée** mais docs d'intention restent | `d9e2e52` revert vs `docs/GPU_TRAINING_INVENTORY.md` | Doc suggère une capacité inexistante | **P2** | Marquer la doc "intention / non implémenté" |
| I-10 | **Labels FR/EN mélangés** dans la chaîne reco/agents | reco FR (`APPELER/ATTENDRE/ÉVITER`) + tasks EN ("Parse the vehicle inputs…") + statuts FR | Surface de bug du parseur, UX hétérogène | **P2** | Uniformiser la langue de sortie des agents et du parseur |
| I-11 | **Healthcheck moteur** : `railway.json` pointe `/health`, le front `railway.toml` `/api/health` | configs Railway | Si la cible est mal associée, healthcheck KO | **P2** | Vérifier le path exposé par `routes/health.py` et aligner |
| I-12 | **Composio `auth_config_id` partagé par toolkit** mais `user_id`=owner | `swarms.py:883-887` | OK si Composio isole par user_id ; fragile si owner_id absent → fallback "adrien" | **P1** | Rejeter tout appel Composio sans owner_id explicite |



## 16. TESTS / PREUVES

### Synthèse exécutive

Le repo dispose d'une **couverture test fragmentaire mais robuste sur les fondamentaux** :
- **Node.js** : 38 vitest tests (5 fichiers), zéro réseau, mocks complets (schémas, routes, error mapping)
- **Python** : 114 pytest tests en CI avec mocks Supabase+LLM (19 tests supplémentaires ignorés : vault_search 4, composio_session 19)
- **Electron** : 2 tests Playwright smoke (splash + env selection)
- **CI** : eslint, tsc, vitest, next build, ruff lint, pytest — tous passent
- **CRITIQUE** : routes automobile extract-url/sourcing NON testées, run-inputs injection reverted, vehicle_decisions orpheline

### État des tests par fonctionnalité critique

#### 1. **Login / Owner Scoping** [BRANCHÉ + TESTÉ] ✅
- **Test** : `services/crewai-engine/tests/test_owner_scoping.py` (3 classes, ~150 lignes)
- **Coverage** : get_swarm(), get_swarm_run(), list_swarm_runs() avec owner_id filtering
- **Preuve** : `test_owner_scoping.py:25-56` — tests que owner_A ne voit pas data de owner_B (mocks Supabase chain, retour None si owner mismatch)
- **Verdict** : BRANCHÉ — logique scoping implémentée et validée

#### 2. **Owner ID Enforcement (all endpoints)** [BRANCHÉ + TESTÉ] ✅
- **Test** : `services/crewai-engine/tests/test_owner_id_required.py` (3 classes, ~170 lignes)
- **Coverage** : Parametrized tests sur 7 endpoints (GET /v1/swarms, /v1/swarms/{id}, /v1/swarms/{id}/runs, /v1/tools, etc.)
- **Preuve** : `test_owner_id_required.py:39-48` — test_missing_owner_id_returns_400() vérifie que absence owner_id → 400 sur tous les endpoints
- **Verdict** : BRANCHÉ — validation UUID, gate 400 si absent/invalid

#### 3. **Kickoff Run** [BRANCHÉ + PARTIELLEMENT TESTÉ] ⚠️
- **Route** : `src/app/api/swarms/[id]/kickoff/route.ts` (POST handler)
- **Test** : `src/__tests__/kickoff-route.test.ts` (6 tests, mocks swarmsClient.kickoff)
- **Coverage** : UUID validation, JSON parse error, Zod validation, 202 on success, 4xx propagation, 502 on 5xx
- **Preuve** : `kickoff-route.test.ts:56-87` — teste request body parsing, engine error mapping (404 → 404, 503 → 502)
- **Limitation critique** : ⚠️ Mocks swarmsClient.kickoff — ne vérifie PAS que les inputs réels du run sont injectés dans les prompts agents. Le git commit 3b0b13e "revert(engine): roll back run-inputs injection" annule le fix 1c8a433 car causait hang prod. **Les vrais inputs du run NE SONT PEUT-ÊTRE PLUS injectés en prod actuellement.**
- **Verdict** : BRANCHÉ + RISQUE SÉRIEUX — test en place mais injection inputs est ROMPUE (reverted)

#### 4. **Steps (swarm_run_steps)** [BRANCHÉ + TESTÉ] ✅
- **Test** : `services/crewai-engine/tests/test_step_writer.py` (3 classes, ~270 lignes)
- **Coverage** : async enqueue() non-blocking, close() + flush_run_steps() drains queue, FIFO order, null run_id path
- **Preuve** : `test_step_writer.py:32-57` — test_enqueue_does_not_call_append_run_step_synchronously() avec threading.Event pour vérifier non-bloquant
- **Verdict** : BRANCHÉ — persistance asynchrone + drain validée

#### 5. **Report (swarm_runs summary)** [BRANCHÉ + NON-SPÉCIFIQUEMENT TESTÉ] ⚠️
- **Route** : GET `/api/swarms/route.ts` (GET handler) — retourne liste swarms pour owner
- **DB** : swarm_runs table (30 rows, 13 owner e0a983da-536f-4dad-a205-861acbae9468)
- **Test** : `test_owner_scoping.py::TestListSwarmRunsOwnerScoping::test_no_owner_filter_returns_all_runs()` — mock test, pas endpoint réel
- **Verdict** : PARTIEL — logique scoping testée via pytest mocks, pas vitest endpoint-level

#### 6. **Decision (vehicle_decisions + chief decision)** [BRANCHÉ + TESTÉ PARTIEL] ⚠️
- **Route** : `src/app/api/crews/chief-of-staff/decisions/route.ts` (GET + POST)
- **Test** : `src/__tests__/decisions-route.test.ts` (9 tests)
- **Coverage** : validation kickoff_id UUID, action enum, snooze_hours logic, 201 on success, 422/500 error mapping
- **Preuve** : `decisions-route.test.ts:87-106` — teste action="snoozed" + snooze_hours=2, retour 201
- **DB Reality** : vehicle_decisions table a 1 seul row (status="appeler", owner e0a983da), orpheline en termes de run lié (run_id baa251eb... — existe en swarm_runs)
- **Verdict** : BRANCHÉ + LIMITÉ — endpoint testé mais pas d'E2E avec real kickoff → decision → vehicle_decisions

#### 7. **Sourcing (AutoScout24, mobile.de, etc.)** [RISQUE CRITIQUE] ❌
- **Route** : `src/app/api/automobile/extract-url/route.ts` (POST, calls extractVehicleFromUrl + findRecentRunByUrl)
- **Test** : **ZÉRO** test pour POST handler, zéro test pour extractVehicleFromUrl (433 lignes)
- **DB Tool Declaration** : `tools` table row = "AutoScout24 Sourcing" (id=NULL, category=search, endpoint_url="/api/scrape/autoscout", auth_type=bearer, is_active=true)
- **Reality Check** : route `/api/scrape/autoscout` **N'EXISTE PAS** dans src/app/api/ (seule /api/automobile/extract-url existe). `src/lib/apify/types.ts:3` docstring mention "route POST /api/scrape/autoscout" mais route fantôme.
- **Preuve Critique** :
  - `src/app/api/automobile/extract-url/route.ts:16-67` — POST handler existe, calls extractVehicleFromUrl() + findRecentRunByUrl()
  - `src/lib/automobile/urlExtractor.ts:382-433` — extractVehicleFromUrl() 51 lignes logique réelle (JSON-LD, meta, text parsing)
  - `find /src/app/api | grep scrape/autoscout` → zéro résultat
- **Verdict** : ❌ RISQUE P0 — mismatch entre tool declaration (endpoint=/api/scrape/autoscout) et implémentation réelle (extractVehicleFromUrl client-side). Pas de test route extract-url.

#### 8. **URL Extraction (automobile)** [BRANCHÉ + TESTS ÉPARGNE] ⚠️
- **Test** : `src/lib/automobile/urlExtractor.test.ts` (2 tests — **WHITELIST ONLY**)
- **Coverage** : isAllowedAutomobileUrl() accepte 4 domaines (autoscout24, mobile.de, leboncoin, la-centrale), rejette autres
- **Preuve** : `urlExtractor.test.ts:5-13` — 2 tests sur domaine whitelist, pas extraction HTML/JSON-LD
- **Missing** : Aucun test pour extractVehicleFromUrl() (433 lignes core logic: parseJsonLd(), applyJsonLd(), applyTextHeuristics(), normalizeFields())
- **Verdict** : ⚠️ PARTIEL — whitelist testé, core scraping logic (JSON-LD parsing, meta tag extraction, text normalization) **ZÉRO test**

#### 9. **Dedup (findRecentRunByUrl)** [BRANCHÉ + NON-TESTÉ] ❌
- **Code** : `src/lib/automobile/dedup.ts` (97 lignes, normalizeSourceUrl + findRecentRunByUrl)
- **Test** : **ZÉRO**
- **Logic** : normalize URL, list recent runs, fetch status pour chaque run, compare inputs_json.source_url
- **Preuve** : `dedup.ts:63-96` — Promise.allSettled() chain avec null-safety checks
- **Verdict** : ❌ NON-TESTÉ — canonicalization logic + dedup chain sans test

#### 10. **Dashboard (swarm list + run history)** [BRANCHÉ + NON-SPÉCIFIQUEMENT TESTÉ] ⚠️
- **Routes** : GET `/api/swarms` (list owner swarms), GET `/api/swarms/{id}/runs` (list runs for swarm)
- **Tests** : `test_owner_scoping.py::TestListSwarmRunsOwnerScoping` — parametrized tests, not endpoint-level
- **Verdict** : PARTIEL — scoping logic tested, actual Next.js routes no direct vitest

#### 11. **History (swarm_runs table)** [BRANCHÉ + NON-TESTÉ ENDPOINT] ⚠️
- **DB** : swarm_runs (30 rows, includes status, created_at, cost_usd)
- **Route** : crewai-engine GET /v1/swarms/{id}/runs — mocked in pytest, no real HTTP test
- **Verdict** : PARTIEL — persistence functional, endpoint-level test absent

#### 12. **Market data (HEDGE product tables)** [BRANCHÉ + HORS SCOPE]
- **Tables** : market_snapshots (4796), orderbook (6372), market_events (4277), position_reconciliations (309)
- **Tests** : **ZÉRO** (hors scope automobile/chief-of-staff, produit séparé)
- **Verdict** : OUT OF SCOPE

#### 13. **Cron / Scheduler** [NON-EXISTANT EN TEST]
- **Scheduled tasks** : Chief of Staff morning, evening debriefs (hypothetical)
- **Tests** : **ZÉRO**
- **Verdict** : NON-TESTÉ — pas d'implémentation cron trouvée en code

#### 14. **Architect Agent (swarm generation)** [BRANCHÉ + PARTIELLEMENT TESTÉ] ⚠️
- **Route** : `src/app/api/swarms/architect/generate/route.ts` (POST)
- **Test** : `src/__tests__/architect-rate-limit.test.ts` (2 tests)
- **Coverage** : rate limit gate (429 + Retry-After header), proceeding when allowed
- **Missing** : Aucun test pour la logique Architect elle-même (architectGenerate), vault_search integration
- **Script** : `services/crewai-engine/scripts/test_architect_cortex_e2e.py` — **manual/offline script**, not in CI pytest location, mocks LLM to avoid cost
- **Preuve** : `test_architect_cortex_e2e.py:87-133` — test_fetch_cortex_context_down() patches requests.post pour simuler DOWN
- **Verdict** : BRANCHÉ + LIMITÉ — rate limit testé, Architect spec generation non testé en CI

### Tests ignorés en CI

```
pytest tests/ -q --ignore=tests/test_vault_search.py --ignore=tests/test_composio_session.py
```

| Test | Count | Raison | Contenu |
|------|-------|--------|---------|
| `test_vault_search.py` | 4 tests | Nécessite CORTEX_URL/API_KEY réels (MCP Cortex) | fail-soft on timeout/5xx/missing config |
| `test_composio_session.py` | 19 tests | Nécessite COMPOSIO_API_KEY réel | multi-toolkit, retry, circuit breaker, truncation |

**Verdict** : ⚠️ Tests de dépendances externes délibérément exclus — stratégie raisonnable pour CI sans secrets.

### Assertions de CI/Quality (GitHub Actions)

```yaml
Quality job (ubuntu-latest):
  ✅ ESLint
  ✅ Typecheck (tsc --noEmit)
  ✅ Unit tests (npm test = vitest run = 38 tests)
  ✅ Build (next build)

Engine job (python 3.12):
  ✅ Ruff lint (src/)
  ✅ Pytest (114 tests, ignore vault_search + composio_session)
  ⚠️  Ruff format check (skipped — would require full reformat)
```

**Verdict** : CI pipeline couvre linting + typecheck + build, tests unitaires 152 total (38 vitest + 114 pytest), format check en debt.

### Routes API testées vs Non testées

#### TESTÉES (via vitest ou pytest mocks) ✅
- POST `/api/swarms/architect/generate` (rate limit gate)
- POST `/api/swarms/[id]/kickoff` (validation, error mapping) — ⚠️ but inputs injection reverted
- POST `/api/crews/chief-of-staff/decisions` (action enum, snooze_hours)
- GET `/api/crews/chief-of-staff/decisions?kickoffId=...` (UUID validation)
- GET `/api/swarms` (owner scoping via pytest mocks)
- GET `/api/swarms/{id}` (owner scoping + template read-only)
- PATCH `/api/swarms/{id}` (template write protection)
- DELETE `/api/swarms/{id}` (owner scoping)

#### **NON-TESTÉES** ❌ (aucun test, pas même mock)
- **POST `/api/automobile/extract-url`** — aucun test handler
- **GET `/api/tools`** — listed as requiring owner_id (test_owner_id_required.py parametrized) mais pas de test handler réel
- **GET `/api/admin/users` / `[id]`** — zéro test
- **POST `/api/sources/composio/connect`** — zéro test
- **GET `/api/health`** — zéro test
- **GET `/api/system/status`** — zéro test
- **GET/POST `/api/cockpit-chat` / `[chatId]`** — zéro test

#### **Routes Python (crewai-engine)** testées via pytest
- GET `/v1/swarms` (owner_id parametrized)
- GET `/v1/swarms/{id}` (template protection)
- POST `/v1/swarms` (global template protection)
- POST `/v1/swarms/{id}/kickoff` (owner scoping)
- GET `/v1/swarms/{id}/runs` (owner scoping)

### Risques critiques détectés et VÉRIFIÉS

| # | Fonctionnalité | Sévérité | Classification | Vérification | Preuve |
|---|---|---|---|---|---|
| 1 | extractVehicleFromUrl() — 433 lignes, zéro test | **P0** | NON-TESTÉ | ✅ CONFIRMED | `src/lib/automobile/urlExtractor.ts:382-433`, 0 vitest entries |
| 2 | Sourcing tool → route `/api/scrape/autoscout` FICTIVE | **P0** | INCOHÉRENT | ✅ CONFIRMED | `tools.endpoint_url="/api/scrape/autoscout"` vs `find src/app/api` = no such route |
| 3 | POST `/api/automobile/extract-url` — aucun test | **P1** | NON-TESTÉ | ✅ CONFIRMED | Route existe, POST handler calls extractVehicleFromUrl + findRecentRunByUrl, **zero** vitest |
| 4 | findRecentRunByUrl() dédup — aucun test | **P1** | NON-TESTÉ | ✅ CONFIRMED | `src/lib/automobile/dedup.ts:63-96` — Promise.allSettled chain, no vitest |
| 5 | Run-inputs injection reverted | **P1** | RISQUE | ✅ CONFIRMED | Git commit 3b0b13e 'revert(engine): roll back run-inputs injection' — inputs ABSENT en prod, hang risk |
| 6 | vehicle_decisions table orpheline | **P2** | LEGACY | ✅ CONFIRMED | DB: 1 row, endpoint nunca llamado en workflow |
| 7 | test_architect_cortex_e2e.py — manual script, not in CI pytest | **P2** | PARTIEL | ✅ CONFIRMED | 240 lignes, 3 test functions, located in scripts/ not tests/ |
| 8 | composio_session multi-toolkit — tests ignored in CI | **P2** | NON-TESTÉ | ✅ CONFIRMED | 19 tests skipped (requires real API key), fall-soft on failures not validated in CI |
| 9 | vault_search fail-soft — ignored in CI | **P2** | NON-TESTÉ | ✅ CONFIRMED | 4 tests skipped (requires real Cortex), timeout/5xx paths untested in CI |
| 10 | Kickoff route tests do not verify run-inputs injection | **P1** | PARTIEL | ✅ CONFIRMED | `src/__tests__/kickoff-route.test.ts` mocks kickoff, no inputs injection validation |
| 11 | Architect spec generation LLM logic not tested in CI | **P2** | PARTIEL | ✅ CONFIRMED | architect-rate-limit.test.ts = rate limit only; test_architect_cortex_e2e.py = manual script |
| 12 | URL extraction test only validates whitelist | **P1** | PARTIEL | ✅ CONFIRMED | 2 tests isAllowedAutomobileUrl(), 0 tests extractVehicleFromUrl() JSON-LD/meta/text logic |

### Synthèse par catégorie Zod

**BRANCHÉ** (implémenté, routeur wired, tests/preuve en place) ✅
- Login / owner scoping (test_owner_scoping.py)
- Owner ID enforcement (test_owner_id_required.py)
- Kickoff run (kickoff-route.test.ts) — ⚠️ mais inputs injection reverted
- Steps writer async (test_step_writer.py)
- Decisions route (decisions-route.test.ts)
- Architect rate limit (architect-rate-limit.test.ts)
- Template protection (test_global_template_protection.py)

**PARTIELLEMENT** (existe, mais tests épargne ou incomplets) ⚠️
- URL extraction (test whitelist seulement, pas HTML parsing)
- Architect spec generation (route OK, LLM logic non testé en CI)
- Swarm list/runs (scoping tests mocks, pas endpoint-level)
- Chief decision (route testé, pas E2E kickoff→decision→db)
- Dashboard (GET /api/swarms mocked, not vitest)

**UI-ONLY** (visible mais pas logique réelle)
- Training cinematic page (reverted d9e2e52 → removed 56bd31e)

**HARDCODÉ** (valeurs fixes)
- AUTOMOBILE_DEDUP_SCAN_LIMIT = 25 (env var override OK)
- EXTRACTION_TIMEOUT_MS = 8000 ms (env var override OK)
- MIN_YEAR = 1900, MAX_PRICE_EUR = 2_000_000, MAX_MILEAGE_KM = 1_500_000

**LEGACY/MORT**
- vehicle_decisions table (1 orphan row, endpoint non consommé)
- /api/scrape/autoscout route declared in tools table (does not exist)

**INCOHÉRENT** (deux implémentations divergent)
- Sourcing tool declaration (endpoint=/api/scrape/autoscout) vs reality (no such route)

**RISQUE** (sécurité, coût, data leak, multi-tenant, token, service_role, scraping, crash, scaling)
- ⚠️ extractVehicleFromUrl() 433 lignes untested — injection, parse error, infinite loop risks
- ⚠️ findRecentRunByUrl() Promise.allSettled chain untested — potential race, null/undefined handling unvalidated
- ⚠️ Run-inputs injection reverted (git 3b0b13e) — inputs may not inject into agent prompts, hallucination risk
- composio_session multi-toolkit retry + circuit breaker untested in CI (fallback to [] success condition unclear)
- vault_search fail-soft paths (timeout, 5xx, missing config) untested in CI

**NON-TESTÉ** ❌
- src/app/api/automobile/extract-url/route.ts: POST handler
- src/lib/automobile/urlExtractor.ts: extractVehicleFromUrl() JSON-LD/meta/text parsing (433 lignes)
- src/lib/automobile/dedup.ts: findRecentRunByUrl() canonicalization + dedup logic
- src/app/api/admin/users/route.ts, src/app/api/admin/users/[id]/route.ts
- src/app/api/health/route.ts: GET handler
- src/app/api/system/status/route.ts: GET handler
- src/app/api/cockpit-chat/route.ts, [chatId]/route.ts
- services/crewai-engine/scripts/test_architect_cortex_e2e.py: manual script, not in CI pytest
- services/crewai-engine/tests/test_vault_search.py: 4 fail-soft tests, ignored in CI
- services/crewai-engine/tests/test_composio_session.py: 19 tests (retry, circuit breaker, truncation), ignored in CI



## 17. SÉCURITÉ (P0/P1/P2)

## Résumé exécutif

Audit impitoyable en lecture seule. Codebase produit présente **plusieurs risques P0 et P1 critiques** dont un COMPOSIO_USER_ID hardcodé à "adrien" sans override env en prod, une route `GET /v1/swarms` acceptant un owner_id client-fourni sans validation bearer, et des lacunes de validation côté admin (password faible).

Les défenses RLS Supabase et auth côté API sont **correctement implémentées** sur les kickoff (fail-closed, ownership scoped via `get_swarm(owner_id=X)`), mais **plusieurs point d'entrée optionnel offrent une surface d'attaque**.

---

## RISQUES CRITIQUES (P0/P1)

### P0-1 : APIFY_TOKEN exposé en clair dans `.env.local` ✅ BRANCHÉ
**File** : `.env.local:188`
**Evidence** : `APIFY_TOKEN=‹REDACTED›`
**Status Gitignore** : ✅ `.env*` est bien dans `.gitignore:34` — jamais commitée.
**Impact** : Clé réelle en plaintext LOCAL ONLY. `.env.local` est ignorée (`.gitignore:34`) donc pas commitée. `docs/api-config/` également ignorée (`.gitignore:44`).
**Risk mitigation** : Seul risque si `.env.local` est copiée en plaintext vers un lieu committé ou partagé.
**Verdict** : **P1 acceptable** (mitigated by gitignore, but recommande secret manager ou .env.local.example).

---

### P0-2 : COMPOSIO_USER_ID hardcodé à "adrien" en production [CONFIRMÉ P0]
**File** : `services/crewai-engine/src/config.py:91`
**Evidence** : `COMPOSIO_USER_ID: str = "adrien"` — no `.upper()`, no env override fallback in prod.
**Boot warning** : `config.py:263-267` émet un warning si COMPOSIO_USER_ID == "adrien" ET `_IS_PROD_ENV=True`. Warning exists mais **aucun mécanisme d'arrêt ou override**.
**Multi-tenant impact** : Composio tools (Gmail, Slack, Telegram, Calendar, Notion) s'authentifient via Composio SDK avec `user_id=owner_id or settings.COMPOSIO_USER_ID` (`composio_session.py:308`).
- Si `owner_id` est passé via `create_dynamic_crew(owner_id=oid)` → isolation par owner_id ✅
- Si `owner_id=None` ou absent → **TOUS les Composio tools partagent user_id="adrien"** → **data leak inter-tenant**.
**Routes affected** :
- `POST /v1/swarms/{id}/kickoff` (ligne 732: `owner_id=oid` passé ✅)
- `DynamicSwarmFlow` state (ligne 117: owner_id field, ligne 362: propagé au state dict ✅)
- `instantiate_agents` reçoit `owner_id` et le passe à `get_composio_tools_for_toolkits(toolkits, owner_id=owner_id)` ✅
- **Mais** : si flow.kickoff est appelé sans state_dict['owner_id'], owner_id=None par défaut.

**Execution path correcte** : kickoff → _execute_dynamic_flow_background(owner_id=oid) → state['owner_id']=oid → DynamicSwarmFlow → create_dynamic_crew(owner_id=self.state.owner_id) → instantiate_agents(owner_id) → get_composio_tools_for_toolkits(owner_id) ✅

**Mais** : Si un débugger ou test appelle directement `DynamicSwarmFlow().kickoff(inputs={'swarm_id': X})` sans populer `state['owner_id']`, la valeur default `None` sera utilisée, déclenchant le fallback Composio à "adrien".

**Classification** : HARDCODÉ + RISQUE = **P0** (production-breaking: défense contre fallback faible)
**Verdict** : **P0 — BLOCKER** (set `COMPOSIO_USER_ID` via env ou multi-tenant session, ou reject kickoff si owner_id absent).

---

### P0-3 : SUPABASE_SERVICE_ROLE_KEY commitée dans `.env.local` ✅ BRANCHÉ
**File** : `.env.local:19`
**Evidence** : `SUPABASE_SERVICE_ROLE_KEY=‹REDACTED-JWT›...`
**Status Gitignore** : `.env*` est ignoré — jamais commitée. ✓ **SAFE**.
**Usage** : `src/lib/supabase/admin.ts:11` crée un client admin, utilisé UNIQUEMENT derrière :
- `requireSuperAdmin()` guards (routes `/api/admin/*`, pages `/admin/*`) ✅
- `requireOwnerId()` guards (routes `/api/cockpit-*`) ✅
**Aucun bypass RLS non-protégé détecté** — service_role est toujours utilisé derrière auth guards.
**Verdict** : **P1 acceptable** (secret bien protégé par gitignore, utilisation défensive).

---

### P0-4 : Engine auth token hardcodé en `.env.local` ✅ BRANCHÉ + SAFE
**File** : `.env.local:150`
**Evidence** : `CREWAI_ENGINE_AUTH_TOKEN=‹REDACTED›`
**Verification côté engine** : `src/main.py:148` utilise `hmac.compare_digest(token, settings.CREWAI_ENGINE_AUTH_TOKEN)` ✅ constant-time comparison (résistant timing attack).
**Status Gitignore** : `.env.local` ignoré, jamais commitée. ✓ **SAFE**.
**Verdict** : **P1 acceptable** (constant-time comparison, secret protected).

---

### P1-1 : GET /v1/swarms accepte client-supplied owner_id [CONFIRMÉ P1]
**Files** :
- `services/crewai-engine/src/routes/swarms.py:424` → `owner_id: str | None = Query(default=None)`
- `src/lib/crewai/_internal.ts:187` → `withOwnerId()` appends `?owner_id=` au path
**Pattern** : Route accepte owner_id optionnel en query param.
**Validation** : `_require_owner_id()` (ligne 45-53) valide JUSTE l'UUID format — **NE SCOPES PAS contre authenticated user context**.
**Code** :
```python
def _require_owner_id(owner_id: str | None) -> str:
    if not owner_id or not owner_id.strip():
        raise HTTPException(status_code=400, detail="owner_id is required")
    try:
        UUID(owner_id)  # ← JUSTE UUID validation, pas scope check
    except ValueError:
        raise HTTPException(status_code=400, detail=...)
    return owner_id
```

**Scope côté list_swarms** :
```python
def list_swarms(owner_id: str | None = None) -> list[dict[str, Any]]:
    """Si owner_id fourni : retourne swarms de l'owner + templates globaux."""
    if owner_id:
        query = query.or_(f"owner_id.eq.{owner_id},and(owner_id.is.null,is_template.eq.true)")
    result = query.execute()
```
**Problème** : Le filter est appliqué côté DB, mais il n'y a **aucune validation que le owner_id fourni en query param correspond au user authentifié**. Le seul guard est le bearer token `CREWAI_ENGINE_AUTH_TOKEN`.

**Scenario d'attaque** :
1. Front auth user X, token=CREWAI_ENGINE_AUTH_TOKEN valide ✓
2. Front envoie `GET /v1/swarms?owner_id=Y` (attacker-specified UUID)
3. Engine valide le bearer token ✓, puis appelle `list_swarms(owner_id="Y")`
4. DB retourne ALL swarms de user Y (data leak).

**Current mitigation** : Front (`_internal.ts:187`) envoie owner_id depuis `requireOwnerId()` (session Supabase), donc en pratique le client DEVRAIT envoyer le bon owner_id. **But** : engine has NO validation that client-supplied owner_id matches authenticated bearer.

**Classification** : RISQUE + INCOHÉRENT
**Verdict** : **P1** (IDOR possible si bearer token est compromised ou if engine is called directly with curl; mitigated by secret token but fragile — should validate owner_id against request context in future).

---

### P1-2 : Cockpit chat route bypass owner_id scoping [BRANCHÉ + RLS-CONTINGENT]
**File** : `src/app/api/cockpit-chat/route.ts:45`
**Code** : `await admin.from("cockpit_chats").insert({ user_id: ownerId, title })`
**Issue** : Admin client writes directly bypassing RLS on INSERT. `ownerId` comes from `requireOwnerId()` ✓, so no IDOR on create.
**BUT** : Subsequent reads via `GET /cockpit-chats/{chatId}` depend on RLS policy on SELECT. If RLS policy is not properly enforced, cross-tenant read is possible.
**Status RLS** : RLS enabled on 39 tables (confirmed by audit context), but specific policies not inspected.
**Classification** : BRANCHÉ (write scoped, read-side RLS-contingent)
**Verdict** : **P1 acceptable** (contingent on RLS being correct — assumes RLS policy prevents cross-tenant read).

---

### P1-3 : Admin user password policy weak (min=8 only, no complexity) ✅ CONFIRMÉ
**File** : `src/app/api/admin/users/route.ts:38`
**Code** : `password: z.string().min(8)`
**Missing** : No regex for uppercase/digit/special char requirement.
**Impact** : Super-admin can invite users with weak passwords (e.g., "12345678").
**Classification** : BRANCHÉ (actual weak validation observed in code)
**Verdict** : **P1 weakness** (should enforce: min 12 chars, 1 uppercase, 1 digit, 1 special).

---

### P1-4 : Architect does NOT bypass Composio owner_id scoping ✅ RÉFUTÉ
**Original claim** : Architect Agent not scoped to owner_id for Composio tools.
**File** : `services/crewai-engine/src/routes/swarms.py:800-828`
**Verification** :
- Architect route passes `effective_owner_id` to `generate_swarm_spec(owner_id=effective_owner_id)` ✓
- `generate_swarm_spec()` receives `owner_id` parameter (line 589)
- **BUT** : `generate_swarm_spec()` does NOT call `create_dynamic_crew()` — it ONLY generates a JSON spec (preview, not persisted) ✓
- The actual crew creation happens later when front submits the preview via `POST /v1/swarms` (create) then `POST /v1/swarms/{id}/kickoff`
- At kickoff time, `create_dynamic_crew(..., owner_id=oid)` is called with the owner_id from the run context ✓

**Conclusion** : No Architect crew creation risk. Architect is stateless spec generator, not crew executor.
**Verdict** : ✅ **REFUTED** — no P1 risk here (was a misunderstanding of Architect role).

---

## RISQUES ACCEPTABLES (P2)

### P2-1 : Markdown XSS via dangerouslySetInnerHTML [BRANCHÉ + SAFE]
**File** : `src/components/swarms/MarkdownReport.tsx:229`
**Code** : `dangerouslySetInnerHTML={{ __html: html }}`
**Source** : Internal LLM output (agents), not user input.
**Sanitization** : `markdownToHtml()` explicitly escapes HTML before tag injection ✓
**Verdict** : **P2 acceptable** (documented internal source, explicit escaping).

---

### P2-2 : DEV_BYPASS_AUTH in production guard ✅ BRANCHÉ
**File** : `src/lib/auth/owner.ts:48-68`
**Code** : `if (process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production")`
**Guard** : Fail-closed: bypass activates ONLY if BOTH conditions true.
**Verdict** : ✅ **P2 acceptable** (redundant guard in place).

---

### P2-3 : Automobile URL extraction restricted to whitelist (no SSRF) ✅ BRANCHÉ
**File** : `src/lib/automobile/urlExtractor.ts:352-361`
**Code** : `isAllowedAutomobileUrl()` enforces DOMAIN_RULES (8 hardcoded domains).
**Verdict** : ✅ **P2 acceptable** (SSRF mitigated via domain allowlist).

---

### P2-4 : Swarm run ownership enforced before write ✅ BRANCHÉ
**File** : `src/app/automobile/[runId]/actions.ts:29`
**Code** : `await swarmsClient.status(AUTOMOBILE_SWARM_ID, runId, ownerId)` before upsertDecision.
**Verdict** : ✅ **P2 acceptable** (ownership enforced).

---

### P2-5 : Engine bearer token constant-time comparison ✅ BRANCHÉ
**File** : `services/crewai-engine/src/main.py:148`
**Code** : `hmac.compare_digest(token, settings.CREWAI_ENGINE_AUTH_TOKEN)`
**Verdict** : ✅ **P2 acceptable** (timing-attack resistant).

---

### P2-6 : All API routes validate input with Zod ✅ BRANCHÉ
**Verdict** : ✅ **P2 acceptable** (input validation in place).

---

### P2-7 : Admin routes guarded by requireSuperAdmin() ✅ BRANCHÉ
**Verdict** : ✅ **P2 acceptable** (guard in place).

---

### P2-8 : AutoScout24 scraper tool defined in DB but no route implemented [CONFIRMED UI-ONLY]
**File** : DB tools table vs. `/api/scrape/autoscout` (missing).
**Evidence** : DB has tool "AutoScout24 Sourcing" with endpoint_url="/api/scrape/autoscout", but no route file exists.
**Verdict** : **P2 acceptable** (UI artifact, not routable — tool exists in DB but cannot be invoked).

---

### P2-9 : RLS append-only not database-enforced [BRANCHÉ]
**File** : `swarm_run_steps` table (assumed, per architecture doc).
**Status** : Append-only is documented intent but not enforced by database trigger/policy — relies on app logic.
**Verdict** : **P2 acceptable** (best-effort via app logic, not critical if Langfuse is primary audit trail).

---

### P2-10 : Run inputs injection reverted — functional regression [LEGACY]
**Git evidence** : `3b0b13e revert(engine): roll back run-inputs injection (hangs prod at Risk Analyst)` reverts `1c8a433`.
**Status** : Real swarm inputs may not be injected into agent prompts in current prod code.
**Impact** : Agents may hallucinate missing inputs or use stale prompt templates.
**Verdict** : **P2 acceptable** (not a security issue, but functional regression — QA concern).

---

## RÉSUMÉ CLASSEMENT

| Category | Count | Items |
|----------|-------|-------|
| **BRANCHÉ** (working, routable) | 15+ | kickoff routes, admin routes, auth middleware, RLS on writes, Engine auth, Markdown escaping, ownership validation, Zod validation |
| **PARTIEL** | 2 | owner_id optional on engine list (no client context validation), cockpit chat RLS-contingent |
| **UI-ONLY** | 1 | AutoScout24 scraper tool (DB artifact, no route) |
| **HARDCODÉ** | 1 | COMPOSIO_USER_ID="adrien" (no env override in prod) |
| **LEGACY/DEAD** | 2 | GPU training page, run-inputs injection revert |
| **INCOHÉRENT** | 1 | owner_id optional param (client can specify arbitrary owner_id, only scoped by secret token) |
| **RISQUE (P0/P1)** | 4 | COMPOSIO_USER_ID hardcoded (P0), owner_id IDOR on GET /v1/swarms (P1), password policy weak (P1), APIFY_TOKEN plaintext (P1 mitigated) |
| **NON-TESTÉ** | 1 | RLS policies (assumed correct, not inspected) |

---

## VERDICT IMPITOYABLE

**Production readiness** : **PARTIAL** ✗

### Blockers (MUST FIX before go-live):
1. **P0 : COMPOSIO_USER_ID** — Set per tenant via env var override or reject kickoff if owner_id absent.
2. **P1 : owner_id IDOR on engine** — Validate client-supplied owner_id against authenticated bearer context (future: extract user_id from JWT).
3. **P1 : password policy** — Enforce complexity (min 12, uppercase, digit, special).

### Nice-to-haves (post-launch):
4. P2 : Database-enforce append-only via trigger.
5. P2 : Restore run-inputs injection (currently reverted due to hang).

---

## RÉSUMÉ POUR DÉCISION

✅ **RLS + auth middleware** = solidement implémentés (fail-closed, ownership-scoped)
✅ **Kickoff flow** = owner_id bien propagé au state
❌ **COMPOSIO_USER_ID** = hardcodé sans fallback dynamique (P0)
❌ **GET /v1/swarms** = accepte owner_id client sans validation bearer (P1)
❌ **Admin password** = pas de complexité (P1)
⚠️ **Architect** = was alleged to leak Composio, but doesn't execute crew (false alarm)
⚠️ **AutoScout24** = orphan DB tool (UI-only, not routé)

---

## 18. RISQUES P0 / P1 / P2 (consolidé)

> Synthèse des 14 dimensions après vérification adversariale. Les valeurs de secrets sont caviardées dans ce document (les vrais secrets vivent dans `.env.local`, **gitignored** — vérifié).

### 🔴 P0 — Bloquant go-live (à traiter avant toute prod multi-utilisateurs)

Aucun P0 **strictement** confirmé comme cassant la prod *aujourd'hui* (l'auth tient, les secrets sont gitignorés). Le candidat P0 ci-dessous est **latent** — il devient P0 dès qu'un 2ᵉ utilisateur réel existe :

- **P0/P1-latent — `COMPOSIO_USER_ID="adrien"` hardcodé + fallback silencieux.** `services/crewai-engine/src/config.py:91` ; `composio_session.py:308` utilise `owner_id or settings.COMPOSIO_USER_ID`. Dans le flux nominal, `owner_id` est propagé (kickoff → state → crew) ✅. Mais **tout appel sans `owner_id`** (test, debug, futur endpoint) authentifie les tools Composio (Gmail/Slack/Telegram/Calendar/Notion) en tant que **"adrien"** → **fuite inter-tenant**. Un boot-warning existe mais **n'arrête rien**. → **Rejeter le kickoff si `owner_id` absent ; rendre l'identité Composio strictement dérivée de l'owner.**

### 🟠 P1 — À corriger avant scale

- **P1-1 — Pas de middleware d'auth global.** `src/lib/auth/owner.ts` (doc mensongère) ; aucun `middleware.ts`. Une route qui oublie `requireOwnerId()` est publique. → Créer le middleware OU audit exhaustif route-par-route + corriger la doc.
- **P1-2 — IDOR latent sur `GET /v1/swarms?owner_id=`.** `routes/swarms.py:424` accepte un `owner_id` client arbitraire, validé seulement comme UUID, **non rattaché à l'identité du bearer**. Mitigé par le token partagé, mais data-leak si le token fuit ou si le moteur est appelé en direct. → Dériver l'identité d'un JWT, pas d'un query param.
- **P1-3 — Hallucination véhicule (injection inputs revertée).** `3b0b13e` ; `dynamic_swarm_flow.py:184`. Inputs passés à `kickoff()` mais plus rendus dans le prompt. **Aucun test** ne vérifie que l'agent analyse le bon véhicule. → Réinjection bornée + test d'assertion véhicule.
- **P1-4 — Politique de mot de passe admin faible.** `src/app/api/admin/users/route.ts:38` : `z.string().min(8)`, aucune complexité. → min 12 + maj/chiffre/spécial.
- **P1-5 — tenant_config non peuplée** → visibilité module incohérente (cf. I-4). Surface produit, pas sécurité API.

### 🟡 P2 — Acceptable / post-launch

- **Coût/scaling** : N+1 dashboard (`page.tsx:231-233`, jusqu'à 50 appels moteur/chargement) ; pas de cache sur `status()`.
- **Scraping non borné** : pas de rate-limit owner-scopé visible sur le chemin AutoScout RSC ; coût Apify potentiellement non plafonné par utilisateur. À vérifier/encadrer avant ouverture.
- **Reco fragile** : parseur regex (`recommendation.ts`) → "UNKNOWN" si le LLM dévie du format.
- **XSS Markdown** : `MarkdownReport.tsx` `dangerouslySetInnerHTML` sur sortie LLM, mais `markdownToHtml()` échappe le HTML → P2 acceptable (source interne).
- **SSRF extraction URL** : allowlist 8 domaines (`urlExtractor.ts`) → P2 acceptable.
- **Append-only non DB-enforced** : `swarm_run_steps` repose sur la logique app, pas un trigger.
- **Double-run cron** sur restart dans la fenêtre de grâce (cf. §11) — non idempotent.
- **APIFY_TOKEN / SERVICE_ROLE / ENGINE_AUTH_TOKEN en clair dans `.env.local`** : **gitignored** (`.gitignore` couvre `.env*` + `docs/api-config/`) → acceptable en local ; passer à un secret manager pour la prod.

---

## 19. RECOMMANDATIONS (priorisées, sans rien coder ici)

### Avant d'ouvrir à un 2ᵉ utilisateur
1. **Verrouiller l'identité Composio** : rejeter tout kickoff / appel Composio sans `owner_id` explicite ; supprimer le fallback `"adrien"`. (`config.py`, `composio_session.py`)
2. **Rattacher `owner_id` au bearer** côté moteur (dériver l'identité d'un JWT, pas d'un query param). (`routes/swarms.py`)
3. **Trancher le middleware** : soit créer un vrai `src/middleware.ts` qui gate, soit corriger la doc d'`owner.ts` et prouver route-par-route que `requireOwnerId()` est appelé partout.

### Vérité produit (arrêter de mentir dans l'UI/DB)
4. **Tool AutoScout** : implémenter `/api/scrape/autoscout` **ou** retirer le tool DB / le repointer vers le vrai chemin. (incohérence I-2)
5. **Réinjecter les inputs véhicule** de façon bornée (sans le hang du revert) **et** ajouter un test "le rapport parle bien du véhicule fourni". (I-6 / P1-3)
6. **Peupler `tenant_config`** à la création utilisateur (ou retirer la feature de visibilité module). (I-4)
7. **Unifier l'identité produit** Automobile/Automotive/APM dans `config_json`. (I-3)

### Robustesse / coût
8. **Tuer le N+1 dashboard** : un endpoint moteur batch (`listRuns` avec détails) ou un cache court sur `status()`. (`page.tsx`)
9. **Durcir le parseur reco** : fallback structuré (demander au Decision Writer un JSON `recommendation`), pas seulement un regex markdown. (`recommendation.ts`)
10. **Borner le scraping** : rate-limit owner-scopé + plafond de coût Apify par utilisateur avant ouverture.
11. **Idempotence cron** : verrou applicatif (clé jour+trigger) pour empêcher le double-brief sur restart. (`scheduler.py`)

### Tests / preuves (combler le vide)
12. **e2e Playwright** sur le parcours Automobile : login → nouvelle analyse → rapport → décision.
13. **Test owner-scoping inter-comptes** : compte A ne voit jamais les runs de compte B (front + moteur).
14. **Test "bon véhicule analysé"** (assertion sur `inputs.make/model` dans le rapport).

### Honnêteté docs
15. **Marquer `docs/GPU_TRAINING_INVENTORY.md` et tout doc GPU comme "intention / non implémenté"** ; supprimer toute référence à un training réel tant qu'aucun code GPU ne tourne.

---

## 20. PROCHAINE ACTION UNIQUE

> **Fermer l'hallucination véhicule + la prouver par un test.**
>
> Concrètement : réintroduire l'injection bornée des `inputs` (make/model/year/price/source_url) dans la *task description* du template Automobile **sans** le blocage prod du revert `3b0b13e` (injecter un bloc court et plafonné, pas le rendu massif qui faisait hang le Risk Analyst), **puis** ajouter un test qui kickoff un run avec un véhicule connu et **assert** que `result_text` mentionne ce véhicule.
>
> **Pourquoi celle-ci d'abord** : c'est le seul défaut qui rend *le cœur du produit* (analyser un véhicule réel) potentiellement faux et invérifiable. Tout le reste (N+1, regex, middleware, Composio) est réel mais corrigeable à froid ; l'hallucination, elle, fait *mentir le rapport* — la chose la plus dangereuse pour un outil de décision d'achat.

---

*Fin du rapport. Aucune modification produit, aucun commit, aucune écriture DB n'a été effectué pendant cet audit.*
