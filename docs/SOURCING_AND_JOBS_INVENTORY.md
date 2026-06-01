# SOURCING & JOBS INVENTORY — MySwarms / hive-front-swarms

> Inventaire exhaustif du 2026-06-01. Read-only. Ne rien modifier sans audit préalable.

---

## 1. Résumé exécutif

Le repo `hive-front-swarms` est un monorepo Next.js + Python microservices dédié à :
- **Automobile (MVP produit)** : analyse de véhicules d'occasion via sourcing AutoScout24 (Apify), extraction d'URL, déduplication, intelligence marché (APM)
- **Chief of Staff** : briefing matinal/soir planifié (APScheduler cron), multi-agents (8 équipes), outils Composio (Gmail/Slack/Telegram)
- **Cockpit shell** : chat agent, dashboard multi-templates, gestion d'outils dynamique

La stack est **production-ready sur les 3 axes principaux**. Les risques critiques sont liés aux secrets exposés (Apify token en clair) et au multi-tenant Composio (user_id hardcodé). Aucun refactor global n'est nécessaire — la prochaine action est de sécuriser les secrets et de durcir le scheduler.

---

## 2. Verdict global

### Ce qui existe réellement (prod-ready, branché, testé)

| Élément | État | Notes |
|---------|------|-------|
| Sourcing AutoScout24 (Apify) | ✅ PROD | 8 pays, cache Redis 5min |
| URL Extraction | ✅ PROD | 8 domaines, JSON-LD + heuristics |
| Automobile dashboard | ✅ PROD | KPIs, decisions, market signals live |
| Swarm execution (on-demand) | ✅ PROD | CrewAI DynamicSwarmFlow |
| Chief of Staff cron | ✅ PROD | Morning/evening briefs, Telegram digest |
| Market Intel Scout | ✅ PROD (85%) | Lookup by swarm name = fragile |
| Market Intelligence APM | ✅ PROD | Read-only Supabase externe |
| Composio OAuth + tools | ⚠️ PROD/PARTIEL | Connexion ok, consumer Chief agents only |
| Cockpit chat | ⚠️ PARTIEL | Rate-limité, persistence partielle |

### Ce qui est mort / absent

| Élément | État |
|---------|------|
| Inngest jobs | ❌ MORT (env var présente, zéro implémentation) |
| Email ingestion | ❌ ABSENT |
| Price alerts / monitoring | ❌ ABSENT |
| Webhook automations | ❌ ABSENT |
| CSV import | ❌ ABSENT |

---

## 3. Scraping / Apify inventory

### 3.1 AutoScout24 — RÉEL, PROD

| Fichier | Fonction | Rôle |
|---------|----------|------|
| `src/lib/apify/client.ts` | `runActorSync()` | Client générique Apify, POST → dataset items, timeout 120s |
| `src/lib/apify/autoscout.ts` | `searchAutoScout()` | Wrapper actor `blackfalcondata~autoscout24-scraper` |
| `src/lib/apify/types.ts` | types | `AutoScoutListing`, `AutoScoutParams`, `AutoScoutRawItem` |
| `src/app/api/scrape/autoscout/route.ts` | POST handler | Route API `/api/scrape/autoscout`, auth requis, Zod validation, maxDuration 120s |

**Paramètres** : make, model, market (FR/DE/IT/ES/NL/BE/AT/CH), priceMin, priceMax, maxResults (default 25, cap 100)

**Cache** : Upstash Redis REST, TTL 5 min, graceful fallback si Redis absent

**Env vars** :
- `APIFY_TOKEN` — ⚠️ RISQUE : en clair dans `.env.local` potentiellement versionné
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Statut** : prod, manuel (déclenché par la page `/automobile/sourcing`)

**Risques** :
- Token Apify exposé si `.env.local` commité
- Pas de retry sur timeout 120s
- Cache Redis optionnel (fallback silencieux)

---

### 3.2 URL Extraction — RÉEL, PROD

| Fichier | Fonction | Rôle |
|---------|----------|------|
| `src/lib/automobile/urlExtractor.ts` | `extractVehicleFromUrl()` | Fetch HTML, parse JSON-LD, heuristics texte, normalisation |
| `src/app/api/automobile/extract-url/route.ts` | POST handler | Route `/api/automobile/extract-url`, auth requis, Zod validation |
| `src/lib/automobile/dedup.ts` | `findRecentRunByUrl()` | Soft dedup : check 25 derniers runs par `source_url` canonique |
| `src/lib/automobile/source.ts` | `getSourceName()` | Résout le nom de source depuis l'URL |
| `src/lib/automobile/prefill.ts` | `listingToPrefillHref()` | Transforme un AutoScout listing en URL `/automobile/nouvelle?...` |

**Domaines whitelist** : autoscout24, mobile.de, leboncoin, la-centrale, subito, milanuncios, coches.net

**Méthodes d'extraction** : JSON-LD (Product/Car/Offer), meta tags (og:/twitter:), regex year/mileage/price/fuel

**Confidence levels** : high / medium / low

**Limites** : max 1MB HTML, timeout 8s

**Env vars** :
- `AUTOMOBILE_URL_EXTRACT_TIMEOUT_MS` (default 8000)
- `AUTOMOBILE_URL_EXTRACT_MAX_HTML_BYTES` (default 1000000)
- `AUTOMOBILE_DEDUP_SCAN_LIMIT` (default 25)
- `AUTOMOBILE_DEDUP_STATUS_TIMEOUT_MS` (default 5000)

**Statut** : prod, déclenché par saisie URL dans `/automobile/nouvelle`

---

## 4. Cron / scheduler / jobs inventory

### 4.1 APScheduler (Python microservice) — RÉEL, PROD

Fichier principal : `services/crewai-engine/src/scheduler.py`

| Job | Trigger | Fréquence | Fonction | Persistence |
|-----|---------|-----------|----------|-------------|
| Chief of Staff Morning | CronTrigger | 8h00 (configurable) | `_run_scheduled_kickoff(trigger='morning')` | `chief_run_log` + `chief_run_steps` |
| Chief of Staff Evening | CronTrigger | 18h30 (configurable) | `_run_scheduled_kickoff(trigger='evening')` | `chief_run_log` + `chief_run_steps` |
| Market Intelligence Scout | CronTrigger | 7h50 (hardcodé) | `_run_market_intel_scout()` | `swarm_runs` + `swarm_run_steps` |
| Stale-run cleanup | IntervalTrigger | 10 min | `_cleanup_stale_runs()` | `swarm_runs` + `chief_run_log` |

**Lifecycle** (`main.py:67-100`) :
```
lifespan():
  - Boot stale-run cleanup (fail-soft)
  - if SCHEDULER_ENABLED:
    - create_scheduler()
    - scheduler.start()
  - on shutdown: scheduler.shutdown(wait=False)
```

**Variables de configuration** :

| Variable | Default | Fichier |
|----------|---------|---------|
| `SCHEDULER_ENABLED` | True | `config.py:139` |
| `MORNING_HOUR` | 8 | `config.py:140` |
| `MORNING_MINUTE` | 0 | `config.py:141` |
| `EVENING_HOUR` | 18 | `config.py:142` |
| `EVENING_MINUTE` | 30 | `config.py:143` |
| `FLOW_TIMEOUT_SECONDS` | 900 | `config.py:149` |
| `PER_TASK_TIMEOUT_SECONDS` | 120 | `config.py:152` |
| `MAX_FLOW_TIMEOUT_SECONDS` | 1800 | `config.py:164` |
| `STALE_RUN_MAX_AGE_MINUTES` | 45 | `config.py:173` |
| `STALE_RUN_CLEANUP_INTERVAL_MINUTES` | 10 | `config.py:180` |
| `MISFIRE_GRACE_TIME_SECONDS` | 300 | `config.py:187` |
| `USER_TIMEZONE` | Asia/Dubai | `config.py:99` |
| `CHIEF_SCHEDULER_OWNER_ID` | e0a983da… | `config.py:136` |

**Risques scheduler** :
- **MEDIUM** : Misfire grace 300s — si pod restart dans la fenêtre, le job peut double-tourner
- **MEDIUM** : Market Intel Scout : lookup par `name = 'Market Intelligence Scout'` (fragile si renommé)
- **MEDIUM** : `7h50` hardcodé pour Market Intel Scout (pas de config env)
- **LOW** : Stale-run cleanup peut zombie-killer un vrai run si le timeout est sous-estimé (invariant 45min > 30min est respecté)

---

## 5. Sources externes inventory

| Source | Type | Statut | Env vars | Consumer | Multi-tenant |
|--------|------|--------|----------|----------|--------------|
| AutoScout24 (Apify) | Scraping | PROD | `APIFY_TOKEN` | `/automobile/sourcing` | par user (auth) |
| APM Market Intelligence | API read-only | PROD | `APM_MARKET_SUPABASE_URL`, `APM_MARKET_SUPABASE_KEY` | Dashboard + marche page | par user (auth) |
| Composio (Gmail/Slack/Telegram/…) | OAuth + tools | PROD/PARTIEL | `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID` | Chief of Staff agents | ⚠️ hardcodé "adrien" |
| Cortex (Vault RAG) | API | PROD (consumer) | `CORTEX_URL`, `CORTEX_API_KEY` | Chief of Staff `vault_search.py` | non documenté |
| Hypercli (Kimi K2.6) | LLM | PROD (primary) | `HYPERCLI_API_KEY`, `HYPERCLI_BASE_URL` | Tous les agents | par session |
| Langfuse | Observabilité | PROD | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Trace tous les runs | par session |
| Sentry | Error tracking | PROD | `SENTRY_DSN` | App globale | global |
| Axiom | Logs | PROD | `AXIOM_TOKEN`, `AXIOM_DATASET` | App globale | global |

---

## 6. Routes frontend inventory

### Pages Automobile

| Page | Fichier | Input | Output | DB Write | Statut |
|------|---------|-------|--------|----------|--------|
| `/automobile` | `src/app/automobile/page.tsx` | auth (ownerId) | KPIs, decisions, market signals, 12 runs | NON | PROD |
| `/automobile/nouvelle` | `src/app/automobile/nouvelle/page.tsx` | query params prefill | SwarmInputForm + dedup warning | NON (kickoff → write) | PROD |
| `/automobile/sourcing` | `src/app/automobile/sourcing/page.tsx` | make/model/market/prices | Tableau listings AutoScout24 | NON | PROD |
| `/automobile/marche` | `src/app/automobile/marche/page.tsx` | make/model/fuel | Market index APM | NON | PROD |
| `/automobile/historique` | `src/app/automobile/historique/page.tsx` | auth | List/filter runs | NON | PROD |
| `/automobile/[runId]` | `src/app/automobile/[runId]/page.tsx` | runId | Rapport complet + steps | NON | PROD |

### Composants Automobile

| Composant | Fichier | Rôle |
|-----------|---------|------|
| `AutomobileUrlFirstForm` | `src/components/automobile/AutomobileUrlFirstForm.tsx` | Two-step : URL → extraction → formulaire |
| `SourcingSearchForm` | `src/components/automobile/SourcingSearchForm.tsx` | Form make/model/market/prices |
| `MarketSearchForm` | `src/components/automobile/MarketSearchForm.tsx` | Form make/model/fuel → marché |
| `BrandLogo` | `src/components/automobile/BrandLogo.tsx` | Logo marque SVG/fallback |
| `HistoriqueExplorer` | `src/components/automobile/HistoriqueExplorer.tsx` | Filter/sort runs |

---

## 7. Routes backend inventory

### API Next.js

| Route | Méthode | Input | Output | Auth | DB |
|-------|---------|-------|--------|------|-----|
| `/api/scrape/autoscout` | POST | `{make, model, market, priceMin, priceMax, maxResults}` | `{listings, count}` | oui | NON |
| `/api/automobile/extract-url` | POST | `{url}` | `{fields, confidence, warnings, duplicate}` | oui | READ (dedup) |
| `/api/sources/composio/connect` | POST | `{toolkit, auth_config_id?}` | `{redirect_url}` | oui | NON |

### CrewAI Engine (FastAPI Python)

| Route | Méthode | Input | Output | Fichier |
|-------|---------|-------|--------|---------|
| `/health` | GET | — | `{status, uptime}` | `routes/health.py` |
| `/v1/swarms` | GET/POST | SwarmInputSchema | list / swarm object | `routes/swarms.py` |
| `/v1/swarms/{id}` | GET/PUT/DELETE | — / swarm data | swarm object | `routes/swarms.py` |
| `/v1/swarms/{id}/kickoff` | POST | `{trigger, inputs}` | `{run_id, status}` | `routes/swarms.py` |
| `/v1/swarms/{id}/status/{run_id}` | GET | — | SwarmRun full | `routes/swarms.py` |
| `/v1/crews/chief-of-staff/decide` | GET | — | list chief_decisions | `routes/crews.py` |
| `/v1/composio/connect` | POST | `{toolkit, auth_config_id?}` | `{redirect_url}` | `routes/swarms.py` |
| `/v1/tools` | GET | — | `[]` (stub, non implémenté) | `routes/swarms.py` |

---

## 8. Tables Supabase inventory

### Tables Swarms (core)

| Table | Clé | RLS | Rôle | Utile Automobile |
|-------|-----|-----|------|------------------|
| `swarms` | id (uuid) | owner-scoped | Définition des swarms | ✅ (swarm Automobile) |
| `swarm_agents` | id | owner-scoped (via swarm_id) | Agents d'un swarm | ✅ |
| `swarm_tasks` | id | owner-scoped (via swarm_id) | Tâches d'un swarm | ✅ |
| `swarm_runs` | id | owner-scoped | Runs déclenchés | ✅ (source vérité runs) |
| `swarm_run_steps` | id | owner-scoped (via run_id) | Steps détaillés | ✅ |
| `tools` | id | public read / owner write | Outils disponibles | indirect |
| `swarm_tool_bindings` | id | owner-scoped | Liaison swarm ↔ tool | indirect |

### Tables Chief of Staff

| Table | Clé | RLS | Rôle |
|-------|-----|-----|------|
| `chief_run_log` | id | owner-scoped | Runs cron morning/evening |
| `chief_run_steps` | id | owner-scoped | Steps détaillés CoS |
| `chief_decisions` | id | owner-scoped | Décisions générées par CoS |

### Tables Cockpit / Config

| Table | Clé | RLS | Rôle |
|-------|-----|-----|------|
| `cockpit_chats` | id | owner-scoped | Sessions chat cockpit |
| `cockpit_messages` | id | owner-scoped | Messages par chat |
| `tenant_config` | — | global read | Feature flags / workspace config |
| `audit_template_access` | — | audit trail | Logs d'accès templates |

---

## 9. État exact Automobile

### Ce qui marche (production, branché, données réelles)

- ✅ **Sourcing** : recherche AutoScout24 live via Apify, 8 pays, cache Redis
- ✅ **URL Extraction** : extraction depuis URL annonce (8 domaines), JSON-LD + text heuristics
- ✅ **Déduplication** : soft warning si source_url déjà vue dans les 25 derniers runs
- ✅ **Prefill** : paramètres query → formulaire pré-rempli automatiquement
- ✅ **Kickoff analyse** : formulaire → SwarmRun → CrewAI → résultat + recommandation
- ✅ **Dashboard** : KPIs, décisions (APPELER/ATTENDRE/ÉVITER), market signals (5 modèles), 12 derniers runs
- ✅ **Market intelligence** : cotation APM live (prix médian, fourchette, liquidité, vélocité, confiance)
- ✅ **Historique** : liste + filter + sort de tous les runs, token accounting
- ✅ **Rapport run** : résultat complet, steps, recommandation extraite du Markdown

### Ce qui est partiel

- ⚠️ **Dedup** : soft warning only (jamais bloquant — c'est un choix délibéré)
- ⚠️ **Confidence extraction URL** : dépend de la richesse de la page source

### Ce qui est absent / non implémenté

- ❌ Ingestion batch (CSV/JSON/API bulk)
- ❌ Alertes prix (monitoring automatique)
- ❌ Notifications push (Telegram = oui via Chief, push app = non)
- ❌ Webhook entrant (aucun `/api/webhooks/*`)

---

## 10. Flux actuel

```
Utilisateur
│
├─ /automobile/sourcing
│   ├─ SourcingSearchForm (make/model/market/prices)
│   └─ POST /api/scrape/autoscout
│       └─ Apify actor blackfalcondata~autoscout24-scraper
│           └─ Cache Upstash Redis (TTL 5min)
│           └─ Retourne: AutoScoutListing[]
│               └─ "Analyser" → /automobile/nouvelle?make=...&source_url=...
│
└─ /automobile/nouvelle
    ├─ Si URL en query param:
    │   └─ POST /api/automobile/extract-url
    │       └─ urlExtractor.ts (JSON-LD + heuristics)
    │       └─ dedup.ts (soft check swarm_runs)
    │       └─ Retourne: VehicleData + confidence + warnings
    │
    ├─ Formulaire préfillé (prefill.ts)
    │
    └─ Submit → triggerAnalyse() [Server Action]
        └─ swarmsClient.kickoff(AUTOMOBILE_SWARM_ID, inputs, ownerId)
            └─ POST /api/swarms/[id]/kickoff [Next.js API]
                └─ FastAPI Engine /v1/swarms/{id}/kickoff
                    ├─ DynamicSwarmFlow
                    │   ├─ CrewAI agents (make/model/year/mileage/fuel/price)
                    │   └─ Persist: swarm_runs + swarm_run_steps
                    └─ Retourne: run_id
                        └─ redirect /automobile/{runId}

/automobile/{runId}
    └─ Lit swarm_runs + swarm_run_steps
    └─ extractRecommendation(result_text) → APPELER/ATTENDRE/ÉVITER/UNKNOWN

/automobile (dashboard)
    └─ Liste swarm_runs
    └─ Calcule KPIs
    └─ getMarketIndex() → APM read-only (5 modèles)

─────────────────────────────────────────────────────
BRANCHE CRON (automatique, pas dans le flux Automobile)
─────────────────────────────────────────────────────

APScheduler (Python microservice)
    ├─ 8h00 → ChiefOfStaffFlow → chief_run_log → Telegram digest
    ├─ 18h30 → ChiefOfStaffFlow → chief_run_log → Telegram digest
    ├─ 7h50 → Market Intel Scout → swarm_runs → Telegram digest
    └─ every 10min → Stale-run cleanup → swarm_runs / chief_run_log

─────────────────────────────────────────────────────
NON IMPLÉMENTÉ
─────────────────────────────────────────────────────
- Cron Automobile : non implémenté
- Scraping automatique : non implémenté
- Email ingestion : non implémenté
- Price alerts : non implémenté
```

---

## 11. Réel vs partiel vs mort

| Élément | Verdict | % |
|---------|---------|---|
| Sourcing AutoScout24 | RÉEL | 100% |
| URL Extraction | RÉEL | 100% |
| Automobile dashboard | RÉEL | 100% |
| Swarm execution on-demand | RÉEL | 100% |
| Chief of Staff cron | RÉEL | 100% |
| Market Intel Scout cron | RÉEL (fragile) | 85% |
| Market Intelligence APM | RÉEL | 100% |
| Composio OAuth + tools | PARTIEL | 60% |
| Cockpit chat persistence | PARTIEL | 70% |
| Inngest | MORT | 0% |
| Email ingestion | ABSENT | 0% |
| Price alerts | ABSENT | 0% |
| Webhook automations | ABSENT | 0% |

---

## 12. Risques

| Risque | Sévérité | Action |
|--------|----------|--------|
| Apify token en clair dans `.env.local` (potentiellement versionné) | 🔴 HIGH | Déplacer vers Railway/Vercel secrets, rotater le token |
| `COMPOSIO_USER_ID` hardcodé "adrien" dans config.py prod | 🔴 HIGH | Scoping session-based immédiat |
| Misfired jobs : double-run possible si pod restart dans grace period (300s) | 🟡 MED | Ajouter idempotency check (run_id uniqueness + created_at guard) |
| Market Intel Scout lookup by name (couplage fragile) | 🟡 MED | Passer à lookup by `swarm_id` configurable |
| Heure 7h50 hardcodée pour Market Intel Scout | 🟡 MED | Externaliser vers env var ou config table |
| APM fallback silencieux (null → UI dégradée sans alerte) | 🟡 MED | Ajouter telemetry + tracking fallback |
| Cache Redis optionnel (graceful fallback = ralentissement silencieux) | 🟡 MED | Monitorer taux de fallback |

---

## 13. Opportunités

1. **Ingestion email** : webhook Gmail → parsing annonce → prefill automobile
2. **Price alerts** : background job APScheduler → monitor prix AutoScout24 → notif Telegram/push
3. **Composio frontend** : consumer direct pour Gmail scan / Slack post depuis l'UI
4. **Market Intel hardening** : table `market_intel_runs` distincte + lookup par ID config
5. **Inngest** : remplacer APScheduler par Inngest pour distributed job queue (Railway-native, meilleure observabilité)

---

## 14. Recommandation unique

**Ne pas refactor depuis zéro.** La stack est solide. Le seul chantier prioritaire est la sécurisation des secrets et le durcissement du scheduler.

**Phase 1 — Immédiat (< 24h)** :
1. Rotater le token Apify et le déplacer vers Railway/Vercel secrets
2. Corriger `COMPOSIO_USER_ID` hardcodé en prod (session-based scoping)
3. Auditer `.env.local` pour vérifier si commité

**Phase 2 — Semaine 1** :
1. Ajouter idempotency check sur Chief of Staff cron (run_id uniqueness)
2. Externaliser l'heure du Market Intel Scout (env var ou config table)
3. Ajouter observabilité sur les fallbacks (Redis + APM)

**Phase 3 — Suite** :
1. Email ingestion webhook
2. Price alerts background job
3. Inngest migration (si Railway instable)

---

## 15. Première action recommandée

**Rotater et sécuriser le token Apify (`APIFY_TOKEN`).**

C'est le risque le plus élevé (token en clair + potentiellement versionné). Prend 10 minutes. Bloque tout le sourcing si compromis.

Procédure :
1. `git log --all --grep="APIFY"` — vérifier si jamais commité
2. Si oui : rotater le token sur apify.com immédiatement
3. Mettre le nouveau token dans Railway/Vercel secrets (pas dans `.env.local`)
4. Supprimer `APIFY_TOKEN` du `.env.local` versionné si présent

---

*Rapport généré le 2026-06-01 — inventaire exhaustif, read-only.*
