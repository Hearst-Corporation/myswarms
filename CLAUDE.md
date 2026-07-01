# MySwarms

> Projet créé via `/setup-adrien`. Stack : Next.js 16 (App Router) + TypeScript + Tailwind 4. Région Supabase : `eu-west-1`.

## Langue & mode
- Toutes les réponses en **français**.
- Mode **autonomie totale** : tu exécutes, tu ne demandes pas confirmation pour chaque étape.

## Stack
- **Web** : Next.js 16 (App Router, src/) + React 19 + Tailwind 4 — port `3333` (script `next dev -p 3333`)
- **API/Backend** : routes Next.js (`src/app/api/...`) — fallback port `3001` si extraction
- **DB** : Supabase Postgres 17 — projet ref `fxeibmjebvxtoazuyyvz`
- **Cache/Queue** : Upstash Redis REST (fallback — Railway Redis non provisionné, CLI v4.36 bug)
- **Hosting** : Vercel (`hearst-corporation/myswarms`, projet `prj_D7svFbXovy2hni4hAPyN2AJI5Lnq`) + Railway (`693c476c-3d0c-4213-8088-63018863fa5d`)

## 🐍 Microservice CrewAI Python — `services/crewai-engine/`

Moteur d'orchestration multi-agents pour le Daily Chief of Staff AI. **Python-only** (FastAPI + crewai + langfuse + uv). Déployé séparément sur Railway, appelé en HTTP/Bearer depuis Next.js.

### Stack microservice

- Python 3.12 + uv (lockfile `uv.lock`)
- FastAPI + uvicorn[standard]
- crewai >= 1.14.4 (orchestration Flows + Crews)
- langfuse v3 (observabilité)
- supabase-py (persistence runs / steps)

### Communication Next.js ↔ Python

- URL dev : `CREWAI_ENGINE_URL=http://localhost:8000`
- URL prod : `CREWAI_ENGINE_URL_PROD=https://crewai-engine-myswarms.up.railway.app`
- Auth : bearer token partagé `CREWAI_ENGINE_AUTH_TOKEN` (même valeur des deux côtés, généré via `openssl rand -hex 32`)
- Endpoints : `POST /v1/crews/chief-of-staff/kickoff`, `GET /v1/crews/chief-of-staff/status/{uuid}`, `GET /health`
- Wrapper TS : `src/lib/crewai/client.ts` (avec `AbortSignal.timeout(30s)` pour Railway cold starts)
- Routes API Next.js (proxy) : `src/app/api/crews/chief-of-staff/{kickoff,status/[runId]}/route.ts`

### Boot local

```bash
cd services/crewai-engine
uv sync
uv run uvicorn src.main:app --reload --port 8000
```

Le frontend Next.js (port 3333) appelle automatiquement le microservice si `CREWAI_ENGINE_URL=http://localhost:8000` dans `.env.local`.

### Doc CrewAI

Tout `docs/crewai/` (00-index + 8 sections, ~6600 lignes) contient la doc CrewAI ingérée exhaustivement avec annotation "Pertinence Daily Chief of Staff" page par page. À lire avant tout choix d'API.

### Règle absolue

JAMAIS hardcoder un secret dans `services/crewai-engine/src/` — toujours via `pydantic_settings` BaseSettings + `os.getenv()`. Même règle que Next.js (`process.env.X`).

## ⚡ MCP Supabase — règle absolue

Tu as accès au **MCP Supabase** dans cette session. Pour TOUTE opération DB, tu utilises le MCP **sans jamais demander confirmation à Adrien** :

| Opération | Tool MCP | Quand |
|---|---|---|
| Lister projets / orgs | `mcp__supabase__list_projects` / `list_organizations` | Au début si tu doutes |
| Lister tables | `mcp__supabase__list_tables` | Avant tout schema change |
| **Appliquer migration SQL** | `mcp__supabase__apply_migration` | À chaque DDL (create table, alter, etc.) |
| Exécuter une query | `mcp__supabase__execute_sql` | Lectures / data fixes |
| Générer types TS | `mcp__supabase__generate_typescript_types` | Après chaque migration |
| Logs en cas de bug | `mcp__supabase__get_logs` | Debug |
| Advisors (sécurité/perf) | `mcp__supabase__get_advisors` | Avant prod |

**Règles** :
- Tu N'utilises JAMAIS `supabase db push` (interactif, risque de prompt).
- Tu utilises **toujours** `mcp__supabase__apply_migration` avec le nom de migration en `snake_case`.
- Tu versionnes en parallèle dans [supabase/migrations/NNNN_nom.sql](supabase/migrations/) pour le repo.
- Si une migration a échoué, tu lis `mcp__supabase__get_logs(service="postgres")` et tu corriges, **sans demander**.

`project_id = fxeibmjebvxtoazuyyvz` — passe-le systématiquement aux tools MCP.

Dashboard : https://app.supabase.com/project/fxeibmjebvxtoazuyyvz

## 🖥️ Infra GPU (gpu1 + gpu2)

Adrien dispose de 2 serveurs GPU + 1 Windows farm accessibles via Tailscale et LAN.

| Serveur | LAN | Tailscale | Aliases SSH | Services exposés |
|---|---|---|---|---|
| **GPU1** | `192.168.1.200` | `100.88.191.49` | `gpu1`, `gpu1-ts`, `ubuntu-comput3` | (workhorse secondaire) |
| **GPU2** | `192.168.1.150` | `100.110.74.114` | `gpu2`, `gpu2-remote` | ComfyUI :8188 · InvokeAI :9090 |
| **Windows farm** | `192.168.1.14` | — | `windows-farm`, `farm-pc` | Windows-only tasks |

### Pattern de connexion pour ce projet

Si MySwarms a besoin de GPU (génération d'image/vidéo, training, inférence locale) :

```bash
ssh -L 8188:localhost:8188 gpu2-remote -N &  # ComfyUI
ssh -L 9090:localhost:9090 gpu2-remote -N &  # InvokeAI
```

Variables d'env attendues (déjà dans `.env.local`) :
```
COMFY_BASE=http://127.0.0.1:8188
STUDIO_INVOKE_BACKEND=http://127.0.0.1:9090
STUDIO_SSH_HOST=gpu2-remote
```

Doc complète : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) section 11b.

## 🤖 Stack LLM — règle absolue

MySwarms utilise **l'API OpenAI officielle comme unique provider LLM** pour le chat, l'orchestration et les agents, avec deux tiers de modèles. Tout agent LLM DOIT utiliser ces credentials.

| Tier | Modèle | Usage | Variable env |
|---|---|---|---|
| **Conversationnel / fast / balanced** | `gpt-4o` | Chat, réponses rapides, agents peu complexes | `OPENAI_CHAT_MODEL` (Next.js), `CREWAI_DEFAULT_FAST_MODEL`/`CREWAI_DEFAULT_BALANCED_MODEL` (engine) |
| **Agentique / smart** | `gpt-5.1` | Orchestration, tool-use, Agent Architecte, agents complexes | `OPENAI_AGENT_MODEL` (Next.js), `CREWAI_DEFAULT_SMART_MODEL` (engine) |

Clé unique : `OPENAI_API_KEY` (API officielle, pas d'endpoint custom). SDK : `openai` (Next.js), `litellm` via `crewai.LLM` (moteur Python).

> Hypercli/Kimi reste câblé en **legacy/rollback uniquement**, gated par `CREWAI_LLM_PROVIDER=hypercli` (défaut `openai`). Ne jamais y revenir sans directive explicite d'Adrien. `ANTHROPIC_API_KEY` peut rester vide — le SDK Anthropic n'est pas utilisé pour le chat/les agents dans ce projet.

### Variables d'environnement

```
OPENAI_API_KEY=<secret>
OPENAI_CHAT_MODEL=gpt-4o
OPENAI_AGENT_MODEL=gpt-5.1

# crewai-engine (services/crewai-engine/.env)
CREWAI_LLM_PROVIDER=openai
CREWAI_DEFAULT_FAST_MODEL=gpt-4o
CREWAI_DEFAULT_BALANCED_MODEL=gpt-4o
CREWAI_DEFAULT_SMART_MODEL=gpt-5.1
```

### Côté Next.js — client OpenAI officiel

```typescript
// src/lib/llm/openai.ts
import OpenAI from "openai";

export const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o";
export const OPENAI_AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-5.1";

const response = await openaiClient.chat.completions.create({
  model: OPENAI_CHAT_MODEL, // gpt-4o pour du chat, OPENAI_AGENT_MODEL pour de l'agentique
  messages: [{ role: "user", content: "..." }],
});
```

### Côté moteur CrewAI Python — litellm via crewai.LLM

```python
# services/crewai-engine/src/llms.py — get_llm(tier) fait déjà ce routage
from crewai import LLM

llm = LLM(
    model="gpt-4o",  # ou "gpt-5.1" pour le tier smart/agentique
    api_key=os.getenv("OPENAI_API_KEY"),
)
```

### Embeddings

Embeddings via Hypercli modèle `qwen3-embedding-4b` (endpoint OpenAI-compatible, champ `model`) — **hors scope de cette migration**, non concerné par le passage à OpenAI officiel pour le chat/agentique. Si Hypercli est indisponible et qu'un embedding est requis, marquer en TODO — ne pas réintroduire OpenAI par défaut pour les embeddings sans confirmation explicite d'Adrien.

### Modèles OpenAI disponibles

`gpt-4o` (conversationnel) · `gpt-5.1` (agentique)

### Historique

Hypercli/Kimi K2.6 a été le provider unique de N-1 à ce changement (2026-07). Migré vers l'API OpenAI officielle sur directive explicite d'Adrien — GPT-4o pour le conversationnel, GPT-5.1 pour l'agentique. Le routage runtime `_resolve_llm()` (`services/crewai-engine/src/crews/crew_helpers.py`) redirige automatiquement tout agent DB legacy (provider/model Hypercli/Kimi/Claude) vers OpenAI — aucune migration DB requise. **Surveiller la fiabilité** en production et consigner tout incident dans Langfuse.

### Règles strictes

- **JAMAIS** hardcoder une clé API dans le code — toujours `process.env.X` (Next.js) ou `pydantic_settings` BaseSettings + `os.getenv()` (Python).
- **JAMAIS** créer un client LLM sans passer par `src/lib/llm/` (factory centralisée côté TS).
- **JAMAIS** appeler un provider non listé sans validation explicite d'Adrien.
- Tracer chaque run LLM (model, tokens, latency, cost) dans Langfuse via les vars `LANGFUSE_*`.

## Commandes

- `npm run dev` — Next dev sur port 3333
- `npm run build` — build prod
- `npm run lint` — ESLint
- `npm run electron:dev` — Electron desktop (après scaffold `/electron`)
- `/dev-adrien` — kill total + relance dev + ouvre Chrome

## Conventions

- Pas de magic numbers. Tout via `.env.local` ou `config/`.
- **RLS Supabase activée par défaut** sur toutes les tables — toute nouvelle table DOIT avoir une policy (voir [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) pour le pattern).
- Tokens OAuth chiffrés avec `TOKEN_ENCRYPTION_KEY` avant insertion DB.
- Tous les secrets dans `.env.local` (gitignored) et `docs/api-config/SERVICES.md` (gitignored).

## Référentiels

- Services & API keys : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) *(gitignored)*
- Variables locales : [.env.local](.env.local) *(gitignored)*

## Dashboard de référence

Le UI du dashboard est calé sur le template visuel :
`/Users/adrienbeyondcrypto/Dev/hearst-os/docs/visual/dashboard-template.html`

Adrien peut modifier ce fichier à tout moment — `/setup` prend toujours la dernière version au moment de l'invocation.

## URL & dashboards

- Supabase : https://app.supabase.com/project/fxeibmjebvxtoazuyyvz
- Railway : https://railway.app/project/693c476c-3d0c-4213-8088-63018863fa5d
- Vercel : https://vercel.com/hearst-corporation/myswarms
