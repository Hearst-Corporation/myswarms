# Swarm Execution Canvas — Spécification

> **Statut** : spécification (aucun code, aucune migration, aucun template créé).
> **Date** : 2026-06-01.
> **Périmètre** : page run MySwarms (`/swarms/[id]/runs/[runId]`) + variante Automobile (`/automobile/[runId]`).
> **Méthode** : audit read-only du schéma Supabase, de la page run, des composants d'affichage, du template `APM — Vehicle Research` et du moteur CrewAI (`services/crewai-engine/`).

---

## 1. Résumé exécutif

L'objectif est de transformer la page run, aujourd'hui un scroll vertical (KPI → métadonnées → rapport → timeline), en un **Swarm Execution Canvas** : voir le swarm comme un système — agents, rôles, ordre, transmissions, entrées/sorties, étape en cours, rapport final.

**Le fait central de cet audit, à mettre en tête de toute décision :**

> **La table `swarm_run_steps` n'est jamais remplie lors d'un run nominal.** Les callbacks CrewAI (`step_callback` / `task_callback`) qui écrivent les steps sont **intégralement commentés** depuis le HOTFIX du 2026-05-18 (`services/crewai-engine/src/crews/dynamic_crew.py` L714-731). Le seul grain réellement persisté en production est le **RUN** (`swarm_runs`), pas le step.

Conséquences directes :

1. La timeline existante (`RunTimeline`) fonctionne, mais reçoit `steps = []` pour tout run récent → elle affiche « No step executed yet ». Elle n'est pas cassée : elle est **affamée de données**.
2. On **peut** dessiner un graphe d'agents dès aujourd'hui, **sans migration ni step**, parce que la topologie vit dans la **donnée de design** : `swarm_agents.position_x/position_y` (coordonnées de nœuds) et `swarm_tasks.depends_on_task_id` (arêtes du DAG). C'est un graphe **statique du plan d'exécution**, pas une preuve du déroulé réel.
3. Tout ce qui est « vivant » (statut par agent, sortie par agent, tokens par agent, handoffs, tool calls) **nécessite d'abord de réactiver les steps côté moteur** — opération sans migration (les colonnes existent déjà), mais qui est un changement Python, pas un changement UI.

**Recommandation de cadrage** : livrer en V1 un **graphe d'agents statique** (le plan : qui, dans quel ordre, avec quelles dépendances) branché sur le rapport final, **sans inventer** de communications ni de métriques par étape. Puis, en V1.5, **réactiver les step callbacks** pour rendre le graphe et la timeline vivants. La V2 (enrichissement DB) ne vient qu'après, et reste optionnelle.

**Première action recommandée (détaillée §15)** : **B — un graphe d'agents simple sur la page run**, car c'est la seule des options proposées qui délivre de la valeur **indépendamment** du problème des steps morts.

---

## 2. Objectif du canvas

Permettre à l'utilisateur de comprendre, sans lire tout le Markdown :

- **Quels agents** composent le swarm et **quel rôle** chacun joue.
- **Dans quel ordre** ils s'exécutent et **quelles dépendances** les relient.
- **Quelle entrée** a été soumise au swarm (input utilisateur global).
- **Où en est** le run (en cours / terminé / échec) et, à terme, **quel agent** travaille.
- **Quelle sortie** chaque agent a produite (à terme) et **quel est le rapport final**.
- Pour l'Automobile : **quelles données véhicule** ont compté, **qui a identifié les risques**, **pourquoi** la reco est APPELER / ATTENDRE / ÉVITER, et **quelles limites/sources** existent.

Principe directeur : **calme, lisible, orienté décision**. Pas d'animation gadget, pas de faux temps réel, pas de message inter-agent inventé.

---

## 3. Données disponibles aujourd'hui

### 3.1 Ce qui est persisté (grain RUN) — `swarm_runs` (14 colonnes)

| Colonne | Type | Écrit ? | Note |
|---|---|---|---|
| `id` | uuid | ✅ insert | PK |
| `swarm_id` | uuid | ✅ insert | **Permet de relier au design du graphe** (agents/tasks) |
| `trigger` | enum `crew_trigger` | ✅ insert | manual / scheduled / api |
| `status` | enum `crew_run_status` | ✅ insert + update final | pending / running / paused_hitl / completed / failed / cancelled |
| `inputs_json` | jsonb | ✅ insert | **Seul input persisté** (global, pas par step) |
| `result_text` | text | ✅ update succès | **Sortie finale agrégée** (CrewOutput.raw) |
| `started_at` | timestamptz | ✅ insert | |
| `finished_at` | timestamptz | ✅ update terminal | |
| `error_text` | text | ✅ update échec | `str(exc)` |
| `total_tokens_in` | int | ⚠️ best-effort | souvent 0 (getattr sur `crew.usage_metrics`) |
| `total_tokens_out` | int | ⚠️ best-effort | souvent 0 |
| `total_cost_usd` | numeric(10,4) | ❌ jamais | toujours 0 (pricing Kimi non publié — TODO V2) |
| `langfuse_trace_id` | text | ❌ jamais peuplé | colonne existe, NULL en pratique |
| `created_at` | timestamptz | ✅ insert | |

### 3.2 Ce qui devrait être persisté (grain STEP) — `swarm_run_steps` (16 colonnes) — **MORT EN NOMINAL**

La table existe, est correctement schématisée et RLS-protégée, mais **aucune ligne n'y est insérée** lors d'un run réel (callbacks commentés). Colonnes : `id`, `run_id`, `agent_id` (FK→agents, SET NULL, nullable depuis 0008), `task_id` (FK→tasks, SET NULL, nullable depuis 0009), `step_number`, `input_text`, `output_text`, `tokens_in`, `tokens_out`, `cost_usd`, `latency_ms`, `status` (enum depuis 0010), `error_text`, `langfuse_span_id`, `created_at`, `finished_at`.

> ⚠️ Même si les callbacks étaient réactivés tels quels, ils n'enverraient que `output_text`, `latency_ms`, `status`, `step_number`, `agent_id`, `task_id`, `created_at`. **Jamais** `input_text`, `tokens_*`, `cost_usd`, `error_text` (cette dernière n'est même pas dans la whitelist d'`append_run_step`), ni `finished_at` (call-site `update_run_step` orphelin).

### 3.3 Topologie de design (toujours disponible, indépendante des runs)

- **`swarm_agents`** : `name`, `role` (enum : coordinator / analyst / executor / reviewer / tool_runner), `model_provider`, `model_name`, `temperature`, `max_tokens`, `parent_agent_id`, **`position_x`**, **`position_y`**.
- **`swarm_tasks`** : `name`, `description`, `expected_output`, `agent_id` (→ quel agent porte la task), **`depends_on_task_id`** (→ arête du DAG), `position_x`, `position_y`.

### 3.4 Exposition côté front (API engine → Zod)

- `swarmsClient.status(id, runId)` → `SwarmRun` : `status`, `trigger`, `inputs_json`, `result_text`, `started_at`, `finished_at`, `total_tokens_in/out`, `total_cost_usd`, `langfuse_trace_id`, `steps[]`. **Déjà appelé** par la page run.
- `swarmsClient.get(id)` → `SwarmRecord` : inclut **`agents[]`** (avec `position_x/y`, `role`, `model_*`) **et `tasks[]`** (avec `depends_on_task_id`, `agent_id`). **Déjà appelé** par la page run — mais seul `swarm.name` est conservé, le reste est jeté.
- `SwarmRunStep` (Zod) expose : `agent_name`, `task_name`, `step_number`, `status`, `output_text`, `tokens_in/out`, `cost_usd`, `error_text`, `latency_ms`, `created_at`, `finished_at`. **N'expose pas** `input_text`, `agent_id`, `task_id`, `langfuse_span_id`.

### 3.5 Verdict — ce qui suffit / ce qui manque / ce qu'il faut ajouter

| Besoin du canvas | Donnée disponible ? |
|---|---|
| Nœuds agents (nom, rôle, modèle, position) | ✅ **Suffit** (design — `swarm_agents`) |
| Arêtes / ordre / dépendances | ✅ **Suffit** (design — `swarm_tasks.depends_on_task_id` + positions) |
| Input global du run | ✅ **Suffit** (`swarm_runs.inputs_json`) |
| Rapport final | ✅ **Suffit** (`swarm_runs.result_text`) |
| Statut **par agent** | ❌ **Manque** (besoin des steps réactivés) |
| Sortie courte **par agent** | ❌ **Manque** (besoin des steps réactivés) |
| Tokens / durée **par agent** | ❌ **Manque** (steps + enrichissement callback) |
| Input **reçu par un step** | ❌ **Manque** (colonne existe, callback ne l'écrit pas) |
| Handoff agent → agent | ❌ **Manque** (aucune colonne, jamais sérialisé) |
| Tool calls (AutoScout / Composio) | ❌ **Manque** (jamais tracé en DB) |

---

## 4. Agent graph — V1

### 4.1 Source des nœuds et des arêtes

Le graphe V1 se construit **uniquement** depuis le design du swarm (`swarmsClient.get(id)`, déjà fetché) :

- **1 nœud par `swarm_agent`** ; position = `(position_x, position_y)` (le template Automobile encode déjà un layout horizontal : 0 / 240 / 480).
- **1 arête par dépendance** : pour chaque `swarm_task` avec `depends_on_task_id`, relier `task.agent_id` (cible) ← `dépendance.agent_id` (source). Pour Automobile : Task2 dépend de Task1, Task3 de Task2 → arêtes **Data Collector → Risk Analyst → Decision Writer**.

### 4.2 Contenu d'un nœud

| Élément demandé | Source V1 | Disponible ? |
|---|---|---|
| Nom agent | `swarm_agents.name` | ✅ |
| Rôle | `swarm_agents.role` | ✅ |
| Modèle (« Kimi K2.6 ») | `swarm_agents.model_name` | ✅ (`kimi-k2.6` après migration 0019) |
| Statut waiting/running/completed/failed | **dérivé du run, pas de l'agent** | ⚠️ voir 4.3 |
| Nb de steps | `swarm_run_steps` | ❌ (steps morts) |
| Tokens | `swarm_run_steps` | ❌ (steps morts) |
| Durée | `swarm_run_steps.latency_ms` | ❌ (steps morts) |
| Dernier output court | `swarm_run_steps.output_text` | ❌ (steps morts) |

### 4.3 Statut des nœuds en V1 (sans steps) — règle honnête

Sans steps, **on ne peut pas connaître le statut individuel d'un agent**. Règle V1 :

- `run.status = pending` → tous les nœuds **waiting**.
- `run.status = running` → tous les nœuds **« en cours (détail indisponible) »** (état neutre, pas de faux « running » sur un agent précis).
- `run.status = completed` → tous les nœuds **completed**.
- `run.status = failed` → tous les nœuds **« run échoué »** (on ne sait pas lequel a échoué sans steps → ne pas marquer un agent arbitraire en `failed`).

> **Interdit** : afficher un statut par agent qui laisse croire à une granularité qu'on n'a pas. Quand le détail manque, l'écrire (« détail par agent indisponible — réactiver les steps »), pas le simuler.

### 4.4 Rendu visuel V1

- Layout horizontal gauche→droite (suit `position_x`), nœuds = cartes `.ct-card` compactes : nom (semibold), rôle (eyebrow), modèle (mono `xs`), pastille de statut (`StatusBadge`).
- Arêtes = traits/chevrons simples entre cartes (CSS/SVG statique, **sans animation**).
- Au-dessus du graphe : bandeau récap run (`StatusBadge` + trigger + `LiveIndicator` seulement si `running`).
- Quand les steps seront réactivés (V1.5), les champs « nb steps / tokens / durée / dernier output » se remplissent **sans changer la structure** des nœuds.

---

## 5. Timeline / fil d'exécution — V1

### 5.1 Existant

`RunTimeline` groupe les steps **par `agent_name`** (tri global par `step_number`, ordre des groupes = première apparition), chaque groupe étant un accordéon (compteur de steps, tokens, coût, `StatusBadge`) contenant des `StepCard`. C'est déjà la bonne abstraction — mais alimentée à vide en nominal.

### 5.2 Fil chronologique cible

Événements à afficher, chacun avec **timestamp, agent, type, résumé, bouton « voir détail »** :

| Événement | Source V1 |
|---|---|
| `run created` | `swarm_runs.started_at` / `created_at` |
| `<Agent> started` | `swarm_run_steps` (status running) — **manque (steps morts)** |
| `<Agent> output` | `swarm_run_steps.output_text` — **manque** |
| `final report completed` | `swarm_runs.finished_at` + `result_text` |

**Conclusion V1 honnête** : sans steps, le fil ne contient que **2 événements réels** (`run created`, `final report completed`). Tant que les steps ne sont pas réactivés, le « fil d'exécution » détaillé est **un objectif V1.5**, pas un livrable V1. En V1, la timeline reste le composant existant, qui se remplit automatiquement dès que les steps reviennent. **Ne pas fabriquer** d'événements intermédiaires à partir du design (ce serait inventer un déroulé non prouvé).

---

## 6. Communication entre agents

### 6.1 Réalité des données

Le passage de contexte entre agents existe **uniquement en mémoire CrewAI** (`Task(context=[dep_task])` construit depuis `depends_on_task_id`) — il **n'est jamais sérialisé**. Aucune colonne handoff, aucune table de transition.

### 6.2 Représentation autorisée (sans rien inventer)

Représenter le flux d'information par les arêtes du DAG, en n'utilisant que des données réelles :

- **Input utilisateur** → premier(s) agent(s) racine : afficher `inputs_json` (réel).
- **Agent → agent** (le long d'une arête `depends_on`) :
  - Si un `output_text` de step source existe → l'afficher comme « ce qui a été transmis » (réel).
  - **Sinon** (cas nominal actuel) → libellé fixe : **« transmission implicite via task context »**. C'est l'étiquette honnête imposée par le cadrage : on sait qu'il y a eu passage (le DAG le garantit), on ne connaît pas son contenu.
- **Dernier agent** → **rapport final** : `result_text` (réel).

> Aucune bulle de « message » fabriquée. Une arête sans output réel = « transmission implicite », point.

---

## 7. Rapport final et artifacts

- Le **rapport Markdown** reste la pièce maîtresse : `MarkdownReport` (rendu MD maison + bandeau de recommandation APPELER/ATTENDRE/ÉVITER + boutons Copy / `.md`). Inchangé.
- **Artifacts disponibles en V1** : `result_text` (rapport) + `inputs_json` (données soumises). C'est tout ce qui est réel.
- **Artifacts absents** : sorties intermédiaires par agent (`output_text` step — mort), sources/`source_refs`, `tool_calls` (jamais tracés). Pour l'Automobile, les « sources » apparaissent **dans le texte** du rapport (section `## Sources & References` rédigée par Decision Writer), pas comme données structurées → afficher la section du rapport, ne pas prétendre à une liste de sources structurée.

---

## 8. Layout UI recommandé

**Recommandation : onglets, rapport en vue par défaut. Pas de layout 3 colonnes.**

Raisons :

1. **Calme & mobile-safe** : un graphe + un fil + un rapport côte à côte sur la même page devient dense et casse en petit écran. Les onglets gardent chaque vue respirable.
2. **Le rapport reste la source principale** (contrainte explicite) : il est l'onglet par défaut ; le Canvas est un complément, pas un remplacement.
3. **Pattern déjà présent, coût quasi nul** : la page `settings` utilise déjà des onglets URL-driven (`?tab=`) avec `.ct-seg-track` / `.ct-seg-btn` (`src/app/cockpit.css`). La page run est un **server component `force-dynamic`** → on lit `searchParams.tab` et on `switch` les sections, **sans JS client**.

Structure d'onglets proposée :

```
[ Rapport ]  [ Canvas ]  [ Steps ]  [ Données ]
   défaut       graphe      timeline    inputs_json (+ métadonnées)
```

- **Rapport** (défaut) : exactement la vue actuelle (KPI + métadonnées + `MarkdownReport`). Zéro régression.
- **Canvas** : le graphe d'agents (§4) + bandeau récap run.
- **Steps** : la `RunTimeline` existante (se remplit quand les steps reviennent ; sinon message « No step executed yet »).
- **Données** : `inputs_json` (joli rendu) + `langfuse_trace_id` si présent + erreurs.

> Alternative écartée : « gauche graphe / centre fil / droite rapport ». Plus impressionnante mais plus lourde, plus fragile responsive, et elle reléguerait le rapport — contraire au cadrage. À reconsidérer seulement si le besoin d'une vue « salle de contrôle » simultanée émerge.

---

## 9. Composants nécessaires

### 9.1 Réutilisables tels quels (aucune création)

`KPIDashboard`, `StatusBadge`, `RunTimeline` + `StepCard`, `MarkdownReport`, `RecommendationBadge`, `LiveIndicator`, `AutoRefresh`, `PageTitle`, `Chevron`, `ErrorLayout`, `SectionLabel`. Classes CSS prêtes : `.ct-seg-track` / `.ct-seg-btn(.active)`, `.ct-card` / `.ct-card-title`, `.ct-eyebrow`, `.ct-placeholder`.

### 9.2 À créer (minimal, V1)

| Composant | Rôle | Données |
|---|---|---|
| `AgentGraph` | conteneur du graphe (layout depuis `position_x/y`, rend nœuds + arêtes) | `agents[]`, `tasks[]`, `run.status`, `run.steps` (optionnel) |
| `AgentNode` | une carte-nœud (nom, rôle, modèle, statut) | un `agent` (+ ses steps si présents) |
| `GraphEdge` | un trait/chevron entre deux nœuds, libellé « transmission implicite » sinon | source, cible, `output_text?` |
| `RunTabs` | barre d'onglets URL-driven `?tab=` (calquée sur `settings`) | `tab` courant |

### 9.3 Helpers (logique pure, à isoler)

- `buildAgentGraph(agents, tasks)` → `{ nodes, edges }` (mappe `depends_on_task_id` → arêtes agent↔agent via `agent_id`).
- `deriveNodeStatus(agent, runStatus, steps)` → statut de nœud selon la règle §4.3 (dégrade proprement si pas de steps).
- Factoriser `Field` / `prettyJsonOrRaw` (dupliqués entre la page run et `automobile/[runId]`).

---

## 10. Modèle data V1 — sans migration

**Aucune migration, aucun nouveau fetch.** Tout est déjà en base et déjà appelé :

- **Topologie** : `swarmsClient.get(id)` → `agents[]` (positions, rôle, modèle) + `tasks[]` (`depends_on_task_id`). *(La page run l'appelle déjà ; il suffit de conserver l'objet au lieu de ne garder que `swarm.name`.)*
- **État du run** : `swarmsClient.status(id, runId)` → `status`, `inputs_json`, `result_text`, timestamps, `steps[]` (vide en nominal).
- **Steps** : consommés **s'ils existent**, ignorés sinon — le graphe et la timeline dégradent proprement.

Limites assumées de la V1 : statut **global** (pas par agent), pas d'output/tokens/durée par agent, handoffs en « transmission implicite », pas de tool calls. C'est un **plan d'exécution annoté du rapport final**, honnête sur ce qu'il montre.

---

## 11. Modèle data V2 — optionnel (enrichissement)

Hiérarchie par effort croissant. **Le premier item n'est pas une migration** et débloque l'essentiel.

### V1.5 — Réactiver les steps (moteur, **0 migration**)
Décommenter / remettre en fonctions module-level les `step_callback` / `task_callback` (`dynamic_crew.py` L714-731). Débloque immédiatement, via des colonnes **déjà existantes** : `step_number`, `agent_id`, `task_id`, `output_text`, `latency_ms`, `status`, `created_at`. → statut par agent, sortie courte par agent, fil d'exécution réel, accordéon par agent rempli. **C'est le vrai déverrouillage.**

### V2.a — Enrichir le callback (moteur, **0 migration**, colonnes déjà là)
Faire écrire au callback : `input_text` (input vu par le step), `tokens_in/out`, `cost_usd`, `error_text`, `finished_at`. → métriques et I/O par étape.

### V2.b — Nouveaux champs (migration légère)
Seulement si le besoin produit se confirme :

| Champ | Table | Usage canvas |
|---|---|---|
| `handoff_summary` | `swarm_run_steps` (ou table `swarm_run_handoffs`) | contenu réel transmis sur une arête |
| `agent_order` / `task_order` | `swarm_agents` / `swarm_tasks` | ordre figé explicite (au lieu de déduire le tri Kahn) |
| `tool_calls` (jsonb) ou table `swarm_run_tool_calls` | run/step | tracer AutoScout / Composio (aujourd'hui tracé nulle part) |
| `source_refs` / `artifact_refs` | step | sources structurées pour l'Automobile |
| `confidence` | step | qualifier une sortie d'agent |

> Ne **pas** lancer V2.b maintenant. V1 (UI) + V1.5 (réactivation) couvrent 80 % de la valeur sans toucher au schéma.

---

## 12. Application au template Automobile

**Template** : `APM — Vehicle Research` (`id cccccccc-0001-0001-0001-000000000001`, slug `apm_vehicle_research`, modèle `kimi-k2.6`).

**Graphe (3 nœuds, DAG linéaire)** — directement depuis le design :

```
[Data Collector]  ──►  [Risk Analyst]  ──►  [Decision Writer]
 role: executor        role: analyst        role: coordinator
 x=0                    x=240                x=480
 Task: Collect &        Task: Analyse        Task: Write Purchase
 Structure Vehicle      Risks & Generate     Decision Report
 Data (racine)          Checkpoints          (depends_on Task2)
                        (depends_on Task1)
```

**Lecture par l'utilisateur (objectif décision)** :

- **Quelles données véhicule ont compté** → onglet **Données** : `inputs_json` (9 clés : `make`, `model`, `year`, `mileage_km`, `fuel`, `price_eur`, `country`, `source_url`, `notes` ; seuls `make`+`model` requis). Nœud **Data Collector** = porte d'entrée de ces données.
- **Qui a identifié les risques** → nœud **Risk Analyst** (les risques sont sa task ; en V1.5 son `output_text` les montrera, en V1 ils sont dans la section `## Risks` du rapport).
- **Pourquoi APPELER / ATTENDRE / ÉVITER** → nœud **Decision Writer** + bandeau de recommandation de `MarkdownReport` (`RecommendationBadge` : vert / accent / rouge).
- **Sources & limites** → section `## Sources & References` du rapport (texte, non structuré — ne pas promettre une liste de sources cliquables en V1).
- **Où est le rapport final** → onglet **Rapport** (défaut).

**Pièges Automobile à connaître** :

- Le tool **AutoScout24** (`0023`) est une entité **séparée** du template (table `tools`, global, `owner_id NULL`) ; il n'est **pas** rattaché par FK aux agents/tasks, et `_resolve_tools_for_agent` ne câble que les toolkits Composio (`gmail/slack/telegram/googlecalendar/notion`) → un scraping AutoScout **n'émet aucun step et n'est tracé nulle part**. Ne pas afficher de « tool call AutoScout » dans le canvas : il n'existe pas dans les données de run.
- La page Automobile a sa **propre vue run** (`src/app/automobile/[runId]/page.tsx`), quasi-clone enrichi (`RecommendationBadge`, `Field` prix/URL). Le Canvas peut y être ajouté à l'identique, ou la page générique sert de référence.

---

## 13. Risques UX

| Risque | Mitigation |
|---|---|
| **Faux temps réel** — graphe qui « s'anime » sur des données absentes | Pas d'animation ; statut **global** tant que les steps sont morts ; libellé explicite « détail par agent indisponible ». |
| **Communications inventées** — bulles de message fabriquées | Uniquement `inputs_json`, `output_text` réel, `result_text`. Sinon « transmission implicite via task context ». |
| **Graphe pris pour une preuve d'exécution** | Le DAG est le **plan** (design), pas le **déroulé**. Le préciser visuellement (titre « Plan d'exécution » tant que steps morts). |
| **Usine à gaz** (lib de graphe, zoom/pan, mini-map) | 3 nœuds, layout statique CSS/SVG depuis `position_x/y`. Pas de dépendance graphe (React Flow & co. = surdimensionné pour un DAG linéaire). |
| **Régression de la page run** | Le rapport reste l'onglet par défaut, vue inchangée. Le Canvas est additif. |
| **Désalignement design ↔ run** | `replace_agents` peut recréer les agents → le design lu peut différer du run passé. Tant que `swarm_run_steps` est vide, l'avertir (« graphe basé sur la définition actuelle du swarm »). |

---

## 14. Plan d'implémentation step by step

> Rappel : **ce document ne code rien.** Ci-dessous l'ordre recommandé pour plus tard.

1. **(UI, V1)** Conserver l'objet `swarm` complet sur la page run (ne plus jeter `agents`/`tasks` après `swarmsClient.get`). Aucun fetch ajouté.
2. **(UI, V1)** Helpers purs `buildAgentGraph(agents, tasks)` + `deriveNodeStatus(...)`.
3. **(UI, V1)** Composants `AgentNode` + `GraphEdge` + `AgentGraph` (layout depuis `position_x/y`, arêtes depuis `depends_on_task_id`).
4. **(UI, V1)** `RunTabs` URL-driven (`?tab=`, calqué sur `settings`) : Rapport (défaut) · Canvas · Steps · Données. Brancher le Canvas dessus.
5. **(UI, V1)** Onglet **Données** : `inputs_json` + métadonnées + `langfuse_trace_id`.
6. **(Moteur, V1.5 — déverrouillage)** Réactiver `step_callback` / `task_callback` (`dynamic_crew.py`). → nœuds et timeline deviennent vivants **sans toucher l'UI**.
7. **(Moteur, V2.a)** Enrichir le callback : `input_text`, `tokens_*`, `cost_usd`, `error_text`, `finished_at` (colonnes déjà là).
8. **(UI, V2.a)** Exposer `input_text` dans le Zod `SwarmRunStep` + afficher l'I/O par step dans `StepCard` / arêtes.
9. **(V2.b, optionnel)** Migration : `handoff_summary`, `tool_calls`, `source_refs`, `confidence` — uniquement si le produit le demande.

---

## 15. Première action recommandée

**B — Ajouter un graphe d'agents simple sur la page run.**

Pourquoi B plutôt que A / C / D / E :

- **A (améliorer la timeline)** et **D (handoff summaries)** et **E (tool_calls / sources)** dépendent toutes de données **qui n'existent pas** aujourd'hui (steps morts, handoffs jamais sérialisés, tool calls jamais tracés). Les faire en premier = travailler sur du vide.
- **C (onglet Canvas)** est le bon contenant, mais c'est de la plomberie : sans le graphe dedans, il ne montre rien.
- **B** est la **seule action qui délivre de la valeur immédiatement et sans dépendance** : le graphe se construit à 100 % depuis le design (`swarm_agents.position_x/y` + `swarm_tasks.depends_on_task_id`), **déjà fetché** par la page run, **sans migration ni nouvel appel**. L'utilisateur voit enfin la structure du swarm (3 agents, rôles, ordre, dépendances, modèle Kimi K2.6) et la relie au rapport final.

Périmètre minimal de B (anti-usine-à-gaz) : un bloc graphe statique sous le rapport (ou dans un onglet Canvas si C est fait en même temps, coût marginal nul vu le pattern `settings`), 3 cartes-nœuds + arêtes simples, statut **global** dérivé du run, **aucune** animation, **aucune** communication inventée.

> **Note de vérité indissociable de B** : le graphe restera un **plan statique** (mêmes nœuds, statut global) tant que les `step_callback` du moteur ne sont pas réactivés (HOTFIX 2026-05-18). La **vraie** montée en valeur — statut par agent, sortie par agent, fil d'exécution réel — passe par l'étape 6 (réactivation des steps, **sans migration**), pas par une nouvelle UI. B est le bon premier pas ; il faut juste savoir que son plafond est fixé par les steps morts.

---

*Fin de spécification. Aucune modification de code, de template ou de schéma n'a été effectuée.*
