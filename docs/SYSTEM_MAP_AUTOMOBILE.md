# System Map — Cartographie 2D dynamique

> Route : [`/system-map`](../src/app/system-map/page.tsx) · read-only · `force-dynamic`.
> Librairie : **React Flow** (`@xyflow/react` v12.11) — pan / zoom / sélection / minimap / contrôles.
> Date : 2026-06-01.

Page de cartographie 2D interactive avec **deux vues** commutables :

- **Architecture plateforme** — graphe structurel de tout le système (browser → Next.js BFF → Supabase auth/owner_id → FastAPI engine → CrewAI run → persistence → tables → rapport → dashboard).
- **Agents Automobile** — pipeline du template Automobile (Input → Data Collector → Risk Analyst → Decision Writer → Rapport final), **alimenté par le dernier run réel**.

Interactions : pan, zoom, sélection d'un nœud → **panneau de détail** au clic, edges labellisés + animés, minimap, légende de statuts, liens internes vers le run / le template / le dashboard.

---

## Ce qui a été branché (données réelles)

Source des données : `swarmsClient.get()` (agents + tasks + config du template) + `swarmsClient.listRuns()` + `swarmsClient.status()` (steps + result_text), avec retry sur le 404 moteur intermittent du template global. Aucune donnée inventée.

**Vue Agents** (entièrement câblée sur le dernier run réel `baa251eb…`) :

| Élément | Donnée réelle |
|---|---|
| Agents (nom, rôle, modèle) | `swarm_agents` : Data Collector (executor), Risk Analyst (analyst), Decision Writer (coordinator), tous `openai/kimi-k2.6` |
| Ordre d'exécution | `position_x/position_y` du design (0 / 240 / 480) |
| Task / objectif / outputs attendus | `swarm_tasks.name` · `description` · `expected_output` |
| Statut par agent | dérivé des `swarm_run_steps` groupés par agent (completed) |
| Dernier output par agent | `swarm_run_steps.output_text` (extrait nettoyé) — JSON vehicle_profile, table de risques, Vehicle Research Report |
| Input utilisateur | `swarm_runs.inputs_json` réel : BMW 330d xDrive, 2019, diesel, 87 000 km, 24 900 €, DE, source_url, notes |
| Run (id, dates, statut, tokens, steps) | `swarm_runs` : completed · 2026-05-31 · 3 559 in / 14 639 out · 6 steps |
| Recommandation | `extractRecommendation(result_text)` → **ÉVITER** |
| Extrait rapport final | `swarm_runs.result_text` (extrait Markdown nettoyé) |
| Liens | `/swarms/{id}/runs/{runId}` · `/swarms/{id}` · `/automobile` (réels) |

**Vue Architecture** (annotée avec du réel) :

- Les nœuds `swarm_runs` et `swarm_run_steps` affichent le **statut réel du dernier run** et le **nombre réel de steps**.
- Le nœud template affiche les flags réels (`is_template=true`, `owner_id=null`).

---

## Ce qui est statique

- **La topologie de la vue Architecture** (quels blocs existent, quelles flèches les relient) est **authorée**, pas fetchée. C'est un diagramme documentaire fidèle de l'architecture réelle du système (connue du code : BFF Next.js → engine FastAPI bearer → Supabase RLS → tables `swarms`/`swarm_runs`/`swarm_run_steps`), pas une trace live de chaque requête.
- Les **descriptions** dans les panneaux de détail des nœuds d'architecture (rôle de l'engine, RLS de la DB, etc.) sont des constantes documentaires.
- Le **layout** (positions x/y des nœuds) est fixe ; React Flow gère pan/zoom/fitView par-dessus.
- Le **libellé de handoff** entre agents (« Transmission via contexte de task / output précédent ») est fixe : le handoff n'est **jamais sérialisé en DB**, on ne l'invente pas.

---

## Limites restantes

1. **Nom du template corrompu en base** : `swarms.name` vaut `"No owner"` (corruption pré-existante). La page n'écrit pas en DB (read-only) : elle affiche le nom canonique « Automobile — Recherche véhicule » et **divulgue** la valeur stockée dans le détail. À corriger hors périmètre (`UPDATE swarms SET name=…`).
2. **404 moteur intermittent** sur le template global (résolution owner-scoped côté engine) : mitigé par un **retry** (`NEXT_PUBLIC_SYSTEM_MAP_RETRIES`, défaut 5). Si tous les essais échouent, la vue Agents est dégradée (bandeau d'erreur) ; la vue Architecture reste affichée. Bug moteur, hors périmètre.
3. **Tokens par agent = 0** : le moteur ne capture pas les tokens au niveau step (seul le total run est réel). Affiché « — » quand absent.
4. **Steps du run** : ce run (`baa251eb`) possède 6 steps car il est **antérieur au hotfix du 2026-05-18** qui a désactivé les step-callbacks. Pour les **nouveaux** runs, `swarm_run_steps` n'est plus rempli → la vue Agents montrera le statut au niveau run mais **sans output par agent** (cf. [SWARM_EXECUTION_CANVAS_SPEC.md](SWARM_EXECUTION_CANVAS_SPEC.md) §1). Déverrouillage = réactiver les callbacks (hors périmètre, sans migration).
5. **Architecture = diagramme structurel**, pas un graphe d'observabilité par requête. Pour du vrai temps réel par requête il faudrait brancher Langfuse/traces — hors périmètre.
6. **Mobile** : desktop-first. Le graphe reste petit sur mobile ; pan/zoom pour explorer. Pas de scroll horizontal de page.

---

## Composants

| Fichier | Rôle |
|---|---|
| [src/app/system-map/page.tsx](../src/app/system-map/page.tsx) | Server component : fetch réel + construction du payload `SystemMapData` |
| [src/components/system-map/SystemMap.tsx](../src/components/system-map/SystemMap.tsx) | Orchestrateur client : onglets de vue, légende, caption, panneau |
| [src/components/system-map/SystemMapCanvas.tsx](../src/components/system-map/SystemMapCanvas.tsx) | Surface React Flow (chargée en `dynamic({ ssr:false })`) |
| [src/components/system-map/buildArchitecture.ts](../src/components/system-map/buildArchitecture.ts) | Vue A : nœuds/edges de l'architecture |
| [src/components/system-map/buildAgentGraph.ts](../src/components/system-map/buildAgentGraph.ts) | Vue B : nœuds/edges du pipeline agents (données réelles) |
| [src/components/system-map/MapNode.tsx](../src/components/system-map/MapNode.tsx) | Nœud custom + couleurs de statut/catégorie |
| [src/components/system-map/DetailPanel.tsx](../src/components/system-map/DetailPanel.tsx) | Panneau de détail au clic |
| [src/components/system-map/graph.ts](../src/components/system-map/graph.ts) | Helpers `mkNode` / `mkEdge` |
| [src/components/system-map/types.ts](../src/components/system-map/types.ts) | Types partagés + payload server→client |
| [src/components/system-map/system-map.css](../src/components/system-map/system-map.css) | Thème dark React Flow + panneau responsive (scopé `.sm-*`) |

---

## Screenshots

- `systemmap-architecture.png` — vue Architecture (graphe complet de la plateforme).
- `systemmap-agents.png` — vue Agents (pipeline + bandeau dernier run).
- `systemmap-agents-panel.png` — clic sur un agent → panneau de détail (statut + dernier output réel).
- `systemmap-mobile.png` — rendu mobile (390 px, rail replié, pas de scroll horizontal).

---

## Validation

`tsc --noEmit` ✅ · `eslint` ✅ · `next build` ✅ (route `ƒ /system-map`) · `vitest` ✅ 38/38 · console runtime 0 erreur (warning shorthand/longhand `border` corrigé).
