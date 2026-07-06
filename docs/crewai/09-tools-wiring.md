# 09 — Tools wiring : capacité `api_call` (swarms → Strategy Platform)

> **Périmètre** : comment un agent d'un swarm CrewAI appelle une API HTTP du
> Strategy Platform (`strategy.hearst.app`) via un **tool `api_call`** persisté
> en base. Couvre le modèle de données, le flux runtime (de `get_swarm` jusqu'au
> `fetch`), la procédure d'ajout d'un tool, l'authentification, et le correctif
> `list_tools` global-inclusive.
>
> **Code de référence** (repo moteur `services/crewai-engine/`) :
> - `src/tools/vault_search.py` — patron exact d'un `BaseTool` HTTP custom (fail-soft, timeout, aucun raise).
> - `src/crews/crew_helpers.py` — `_resolve_tools_for_agent` (l.155-189), map binding → tool CrewAI.
> - `src/persistence/swarm_store_impl/swarms_crud.py` — `get_swarm` hydrate `binding["tool"]` (l.92-118).
> - `src/persistence/swarm_store_impl/tools_crud.py` — `list_tools` (l.13-31).
> - `src/routes/swarms/tools.py` — `GET /v1/tools` (l.23-28).
> - `src/config.py` — `Settings` (`STRATEGY_PLATFORM_URL` l.93, `STRATEGY_PLATFORM_TOKEN` l.96).
> - `supabase/migrations/0006_swarms_dynamic.sql` (table `tools` + enum `tool_category`, l.31-106),
>   `0022_tools_global_read_policy.sql`, `0023_seed_autoscout_tool.sql` (seed global idempotent),
>   `0024_seed_hedge_crypto_analysis_template.sql` (do-block idempotent).

---

## 0. TL;DR

Un **tool `api_call`** = une ligne de la table `tools` avec :
- `category = 'api_call'`,
- `endpoint_url` **relatif** (ex. `/api/market/candles`), résolu au runtime contre `STRATEGY_PLATFORM_URL`,
- `schema_json.params` décrivant les paramètres exposés au LLM.

Au runtime, `get_swarm` charge les `swarm_tool_bindings` et **hydrate** chaque
binding avec sa ligne `tools` (`binding["tool"]`). `_resolve_tools_for_agent`
lit `binding["tool"]`, et pour `category == "api_call"` avec un `endpoint_url`
non vide, instancie un `HttpApiCallTool` (un `BaseTool` HTTP fail-soft, calqué
sur `vault_search.py`) qui `fetch` `STRATEGY_PLATFORM_URL + endpoint_url` avec un
bearer optionnel (`STRATEGY_PLATFORM_TOKEN`).

Trois tools globaux couvrent les trois profils advisory du produit — **Market**,
**Yield**, **Mining** — chacun câblé sur les endpoints de données du Strategy
Platform (§3). Les tools globaux (`owner_id IS NULL`) sont visibles par tous les
owners : `list_tools` DOIT donc être **global-inclusive** (§5).

---

## 1. Modèle de données

### 1.1 Table `tools` (migration 0006, l.93-106)

```sql
create table if not exists public.tools (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users(id) on delete cascade,  -- NULL = tool GLOBAL
  name         text not null,
  category     public.tool_category not null,                     -- 'api_call' | 'search' | ...
  description  text,                                              -- lu par le LLM (quand appeler)
  endpoint_url text,                                              -- RELATIF, ex. '/api/market/candles'
  auth_type    text,                                              -- 'bearer' | NULL
  schema_json  jsonb not null default '{}'::jsonb,                -- { "params": { ... } }
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tools_owner_name_unique unique (owner_id, name)
);
```

### 1.2 Enum `tool_category` (migration 0006, l.31-35)

```sql
create type public.tool_category as enum (
  'api_call', 'file_io', 'code_execution', 'search', 'database', 'custom'
);
```

Deux catégories déclenchent une résolution HTTP vers le Strategy Platform :

| `category`  | Sémantique                                              | Résolu en           |
|-------------|--------------------------------------------------------|---------------------|
| `api_call`  | Appel POST/GET d'une API interne (données ou action)   | `HttpApiCallTool`   |
| `search`    | Sous-cas d'`api_call` orienté recherche/listing        | `HttpApiCallTool`   |

> **Note** : le seed AutoScout (`0023`) utilise `category = 'search'` avec
> `endpoint_url = '/api/scrape/autoscout'`. `search` et `api_call` partagent la
> même mécanique HTTP ; la distinction est purement descriptive (aide le LLM et
> l'UI à ranger le tool). Le résolveur traite les deux via `HttpApiCallTool`.

### 1.3 `schema_json.params` — contrat des paramètres

Le LLM doit savoir **quels arguments** passer. Convention (identique au seed
`0023_seed_autoscout_tool.sql`) : un objet `params`, une clé par paramètre.

```jsonc
{
  "params": {
    "symbol":   { "type": "string", "required": true },
    "interval": { "type": "string", "required": false, "default": "1h",
                  "enum": ["1m","5m","15m","1h","4h","1d"] },
    "limit":    { "type": "number", "required": false, "default": 500, "max": 1000 }
  }
}
```

Champs par paramètre : `type` (`string`/`number`/`boolean`), `required` (bool),
`default` (optionnel), `enum` (optionnel), `max`/`min` (optionnel, borne
défensive). `HttpApiCallTool` construit son `args_schema` Pydantic à partir de
ce bloc (les `required` deviennent obligatoires, les `default` sont injectés).

### 1.4 `endpoint_url` relatif + `STRATEGY_PLATFORM_URL`

`endpoint_url` est **toujours relatif** (commence par `/api/...`). Le host n'est
jamais stocké en base — il est résolu au runtime :

```
url = settings.STRATEGY_PLATFORM_URL.rstrip("/") + endpoint_url
```

`STRATEGY_PLATFORM_URL` (config.py l.93) vaut `https://strategy.hearst.app` par
défaut, overridable par env (dev local → `http://localhost:3101`, staging, etc.).
**Pourquoi relatif** : le même seed de tool fonctionne en dev, staging et prod
sans réécriture ; changer d'environnement = changer une seule variable d'env.

### 1.5 `swarm_tool_bindings` — assignation agent ↔ tool (migration 0006, l.108-118)

```sql
create table if not exists public.swarm_tool_bindings (
  id        uuid primary key default gen_random_uuid(),
  swarm_id  uuid not null references public.swarms(id) on delete cascade,
  agent_id  uuid not null references public.swarm_agents(id) on delete cascade,
  tool_id   uuid not null references public.tools(id) on delete cascade,
  priority  int  not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint swarm_tool_bindings_unique unique (swarm_id, agent_id, tool_id)
);
```

Un binding relie **un agent d'un swarm** à **un tool**. Le tool lui-même est
réutilisable (un tool global peut être bindé par N swarms de N owners).

---

## 2. Flux runtime (de la DB au `fetch`)

```
POST /v1/swarms/{id}/kickoff  (JWT interne owner-scopé)
      │
      ▼
get_swarm(swarm_id, owner_id)                         swarms_crud.py l.41
   ├─ SELECT swarms  (owner OU template global)
   ├─ SELECT swarm_agents
   ├─ SELECT swarm_tasks
   ├─ SELECT swarm_tool_bindings   WHERE swarm_id = …          (l.95-101)
   └─ SELECT tools WHERE id IN (binding.tool_id …)             (l.103-116)
        for b in bindings: b["tool"] = tools_map.get(b.tool_id)   ← HYDRATATION (l.117-118)
      │
      ▼   swarm_config = { swarm, agents, tasks, tool_bindings: [ { …, tool: {…} } ] }
instantiate_agents(swarm_config, owner_id)            crew_helpers.py l.192
   for each agent:
      tools = _resolve_tools_for_agent(agent_id, tool_bindings, owner_id)   l.155-189
                for binding where binding.agent_id == agent_id:
                    tool = binding["tool"]                        ← lit l'objet hydraté
                    category = tool["category"].lower()
                    if category in {"api_call","search"} and tool["endpoint_url"]:
                        → HttpApiCallTool(tool=tool, owner_id=owner_id)
                    elif category == "api_call" and name in _COMPOSIO_TOOLKITS:
                        → Composio bridge (gmail/slack/telegram/calendar/notion)
      Agent(role=…, goal=…, tools=tools, llm=…)
      │
      ▼
crew.kickoff()  →  le LLM décide d'appeler le tool  →  HttpApiCallTool._run(**params)
      │
      ▼
requests.<get|post>(STRATEGY_PLATFORM_URL + endpoint_url,
                    params/json=validated_params,
                    headers={"Authorization": f"Bearer {STRATEGY_PLATFORM_TOKEN}"} if token,
                    timeout=_HTTP_TIMEOUT_S)                  ← calqué sur vault_search.py
      │
      ▼
strategy.hearst.app/api/…  →  JSON  →  formaté en markdown LLM-lisible (fail-soft)
```

### 2.1 Hydratation `binding["tool"]` — le point-clé

`get_swarm` **ne fait pas** de jointure PostgREST (fragile aux noms de FK) : il
fait 2 selects + merge Python (`swarms_crud.py` l.92-118), fail-soft par tool :

```python
tool_ids = list({b["tool_id"] for b in bindings if b.get("tool_id")})
tools_map = {t["id"]: t for t in (tools_res.data or [])}   # SELECT tools WHERE id IN (…)
for b in bindings:
    b["tool"] = tools_map.get(b.get("tool_id"))            # None si tool absent/inactif
```

Conséquence : `_resolve_tools_for_agent` reçoit chaque binding **déjà enrichi**
de sa ligne `tools` complète (`category`, `endpoint_url`, `schema_json`, …). Si
un tool est introuvable, `binding["tool"]` vaut `None` et le binding est ignoré
(log debug) — jamais de crash.

### 2.2 `HttpApiCallTool` — le `BaseTool` HTTP (patron `vault_search.py`)

Le résolveur instancie un `HttpApiCallTool` calqué **trait pour trait** sur
`VaultSearchTool` (`src/tools/vault_search.py`). Invariants repris du patron :

- Sous-classe `crewai.tools.BaseTool` ; `name`/`description` viennent de la ligne
  `tools` (le LLM lit `description` pour décider quand appeler l'outil).
- `_run(...)` est **fail-soft** : retourne toujours une string explicative,
  **ne lève jamais** — timeout, 5xx, JSON invalide, connexion refusée sont
  renvoyés comme `"<Tool> unavailable: <raison>"` (cf. `_VAULT_UNAVAILABLE_PREFIX`).
- **Timeout explicite** (`_HTTP_TIMEOUT_S`, 10 s dans le patron) sur chaque appel
  `requests`.
- `owner_id: str | None` porté sur l'instance (résolu côté serveur, jamais
  surchargé par le LLM/client) — utile pour le scoping et l'observabilité.
- Bornage des entrées avant l'appel (clamp `limit`, validation `required`,
  application des `default`/`enum` de `schema_json.params`).
- Formatage de la réponse en markdown lisible (comme `_format_results`), borné
  en taille pour ne pas gonfler le prompt.

> **Règle d'or** : un tool HTTP ne casse **jamais** un run. Une API down = une
> string « unavailable » que l'agent lit et gère, exactement comme le vault.

---

## 3. Ajouter un tool

Deux voies, selon la portée voulue :

### Voie A — tool **owner-scopé** via `POST /v1/tools`

Pour un tool propre à un owner (créé depuis l'UI ou un script owner-scopé). Body
minimal :

```json
{
  "name": "Mon endpoint custom",
  "category": "api_call",
  "description": "À quoi sert ce tool — le LLM lit ceci pour décider quand l'appeler.",
  "endpoint_url": "/api/market/prices/latest",
  "auth_type": "bearer",
  "schema_json": { "params": { "symbol": { "type": "string", "required": true } } }
}
```

La ligne est créée avec `owner_id = <owner du JWT>` → visible **uniquement** de
cet owner. La contrainte `tools_owner_name_unique (owner_id, name)` garantit
l'unicité par owner.

### Voie B — tool **global** via migration seed (`owner_id IS NULL`)

Pour un tool partagé par **tous** les owners (les 3 profils advisory du produit).
Patron idempotent (calqué sur `0023_seed_autoscout_tool.sql`) — `WHERE NOT
EXISTS` car `ON CONFLICT (owner_id, name)` ne dédoublonne pas quand
`owner_id IS NULL` (`NULL = NULL` est faux en contrainte UNIQUE) :

```sql
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Market Candles',
  'api_call',
  'Bougies OHLCV d''un symbole marché (BTCUSDT, ETHUSDT…) — contexte régime/volatilité.',
  '/api/market/candles',
  'bearer',
  '{
    "params": {
      "symbol":   {"type": "string", "required": true},
      "interval": {"type": "string", "required": false, "default": "1h",
                   "enum": ["1m","5m","15m","1h","4h","1d"]},
      "limit":    {"type": "number", "required": false, "default": 500, "max": 1000}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools WHERE endpoint_url = '/api/market/candles' AND owner_id IS NULL
);
```

Un tool global est **lisible** par tous (policy `tools_global_read`, `0022`) mais
**non modifiable/supprimable** par un user (l'écriture reste `owner_id =
auth.uid()`). Pour binder un tool global à un agent d'un swarm, insérer une ligne
`swarm_tool_bindings` (idempotente via un do-block, cf. `0024` pour le patron
`on conflict … do nothing`).

### 3.1 Les 3 profils advisory & les 10 endpoints Strategy Platform

Les trois swarms advisory du produit (specs dans
`strategy-platform/src/lib/crewai/advisory-presets.ts`) mappent chacun sur les
endpoints de données **lecture seule** du Strategy Platform :

| Profil (swarm)             | Rosace   | Endpoints `api_call` associés                                             |
|----------------------------|----------|---------------------------------------------------------------------------|
| **Market Advisory**        | Market   | `/api/market/prices/latest`, `/api/market/prices/history`, `/api/market/candles` |
| **Yield Explainer**        | Treasury | `/api/protocol-rates/latest`, `/api/protocol-rates/history`, `/api/protocol-rates/candles`, `/api/rates/coverage` |
| **Mining Economics Brief** | Mining   | `/api/machines/latest`                                                    |
| *(transverse — contexte)*  | —        | `/api/strategy-platform/status`, `/api/system/architecture-summary`       |

**Liste des 10 endpoints** (tous relatifs à `STRATEGY_PLATFORM_URL`, `GET`,
lecture seule — aucun ne déclenche d'ordre ni d'écriture métier) :

| #  | Endpoint                              | Profil    | Params usuels                          |
|----|---------------------------------------|-----------|----------------------------------------|
| 1  | `/api/market/prices/latest`           | Market    | `symbol?`                              |
| 2  | `/api/market/prices/history`          | Market    | `symbol`, `from?`, `to?`               |
| 3  | `/api/market/candles`                 | Market    | `symbol`, `interval?`, `from?`, `to?`, `limit?` |
| 4  | `/api/protocol-rates/latest`          | Yield     | `provider?`, `assetSymbol?`            |
| 5  | `/api/protocol-rates/history`         | Yield     | `provider?`, `assetSymbol?`, `from?`, `to?` |
| 6  | `/api/protocol-rates/candles`         | Yield     | `provider?`, `assetSymbol?`, `interval?` |
| 7  | `/api/rates/coverage`                 | Yield     | —                                      |
| 8  | `/api/machines/latest`                | Mining    | —                                      |
| 9  | `/api/strategy-platform/status`       | Transverse| —                                      |
| 10 | `/api/system/architecture-summary`    | Transverse| —                                      |

> Chaque profil advisory reste **advisory only** (`v4Impact: none`) : ces tools
> **lisent** des données pour grounder l'analyse, ils ne déclenchent **aucun**
> ordre. Un humain revoit la sortie (règle produit `ADVISORY_GROUND_RULES`).

### 3.2 Checklist d'ajout d'un tool `api_call`

1. **Endpoint** : l'API `GET /api/…` existe côté strategy-platform et renvoie du JSON.
2. **Row `tools`** : Voie A (owner) ou Voie B (global seed idempotent) — `category = 'api_call'`, `endpoint_url` relatif, `schema_json.params` complet.
3. **Binding** : lier le tool à l'agent voulu via `swarm_tool_bindings` (do-block idempotent pour un template global).
4. **Description** : soignée — c'est le seul texte que le LLM lit pour décider d'appeler l'outil.
5. **Vérif** : `GET /v1/tools` (owner du JWT) doit lister le tool (global inclus, cf. §5).

---

## 4. Authentification (engine → Strategy Platform)

Bearer **optionnel**, porté par `STRATEGY_PLATFORM_TOKEN` (config.py l.94-96) :

```python
# src/config.py
STRATEGY_PLATFORM_URL: str = "https://strategy.hearst.app"   # l.93 — overridable via env
STRATEGY_PLATFORM_TOKEN: str = ""                            # l.96 — vide par défaut (fail-soft)
```

`HttpApiCallTool` n'ajoute le header `Authorization` **que si** le token est
présent (même logique fail-soft que `CORTEX_API_KEY` dans `vault_search.py`
l.90-93) :

```python
headers = {"Content-Type": "application/json"}
if settings.STRATEGY_PLATFORM_TOKEN:
    headers["Authorization"] = f"Bearer {settings.STRATEGY_PLATFORM_TOKEN}"
```

- **Token vide** (défaut) : aucun header `Authorization` envoyé — l'appel reste
  possible (les endpoints de données du Strategy Platform tolèrent l'accès
  interne ; un 401 est renvoyé fail-soft comme string, jamais un crash).
- **Token présent** (prod durcie) : bearer envoyé à chaque appel. Injecté via env
  (`.env.local` en dev, Railway en prod) — **jamais** hardcodé, **jamais** stocké
  dans la row `tools`.

> À distinguer du JWT interne `X-Internal-Auth` / `require_internal_identity`
> (`src/security/internal_auth.py`) qui protège l'entrée **Next.js → engine**
> (`/v1/*`). `STRATEGY_PLATFORM_TOKEN` protège la **sortie** engine → strategy.
> Deux frontières, deux secrets.

---

## 5. Fix `list_tools` global-inclusive

### 5.1 Le bug

`GET /v1/tools` (`src/routes/swarms/tools.py` l.23-28) délègue à
`_scoped(identity).list_tools()`, qui appelle `tools_crud.list_tools(owner_id)`.
La version historique (`tools_crud.py` l.13-31) filtre **strictement** par owner
dès qu'un `owner_id` est fourni :

```python
if owner_id:
    query = query.eq("owner_id", owner_id)   # ← EXCLUT les tools globaux (owner_id IS NULL)
```

Or les 3 tools de profils advisory (et AutoScout, `0023`) sont **globaux**
(`owner_id IS NULL`). Comme l'appel `GET /v1/tools` est **toujours** owner-scopé
(owner du JWT interne), le filtre `.eq("owner_id", X)` **cache** tous les tools
globaux : l'UI ne les voit pas, alors que la policy RLS `tools_global_read`
(`0022`) les rend lisibles. Incohérence entre la couche applicative
(`list_tools`) et la couche RLS.

### 5.2 Le correctif

`list_tools` doit être **global-inclusive** : renvoyer les tools de l'owner **ET**
les tools globaux, en miroir exact de `get_swarm` / `list_swarms` (qui font déjà
`owner_id.eq.X` **OU** template global). On remplace le `.eq` par un `.or_` :

```python
if owner_id:
    # Tools de l'owner OU tools globaux (owner_id IS NULL) — miroir de
    # tools_global_read (0022) et du pattern get_swarm/list_swarms.
    query = query.or_(f"owner_id.eq.{owner_id},owner_id.is.null")
# owner_id is None (service-role) : aucun filtre → tous les tools actifs.
```

Après ce correctif, `GET /v1/tools` (owner authentifié) liste :
- les tools que l'owner a créés (`owner_id = X`), **et**
- les tools globaux partagés (`owner_id IS NULL`) — Market/Yield/Mining, AutoScout, …

ce qui aligne la couche applicative sur la RLS et rend les 3 profils advisory
visibles/bindables par n'importe quel owner. Aucune régression de sécurité : la
lecture des globaux est déjà autorisée par `0022` ; l'écriture reste strictement
owner-scopée (`tools_owner_all`, `owner_id = auth.uid()`).

---

## 6. Récap invariants

- `endpoint_url` **relatif** ; host résolu au runtime via `STRATEGY_PLATFORM_URL`.
- `category ∈ {api_call, search}` + `endpoint_url` non vide → `HttpApiCallTool`.
- `get_swarm` **hydrate** `binding["tool"]` (2 selects + merge, fail-soft par tool).
- `HttpApiCallTool` = `BaseTool` **fail-soft** (jamais de raise), timeout explicite, patron `vault_search.py`.
- Bearer `STRATEGY_PLATFORM_TOKEN` **optionnel** ; jamais hardcodé, jamais en base.
- Tools globaux = `owner_id IS NULL`, seed **idempotent** (`WHERE NOT EXISTS`), lisibles par tous (`0022`).
- `list_tools` **global-inclusive** (`or_(owner_id.eq.X, owner_id.is.null)`) — aligne applicatif ↔ RLS.
- 3 profils advisory (Market / Yield / Mining) sur **10 endpoints** GET lecture seule — **advisory only, `v4Impact: none`**.
