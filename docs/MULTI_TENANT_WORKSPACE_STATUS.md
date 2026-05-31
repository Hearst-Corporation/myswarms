# Multi-Tenant Workspace — Status Report

> Audit réalisé le 2026-05-31. Commit de référence : `4c7edb5` (hardening owner_id).

---

## 1. Modèle de tenant actuel

### Entité effective : `owner_id = auth.uid()`

Il n'existe **pas** de table `tenants`, `workspaces`, `projects` ou `organizations`.  
Le multi-tenant repose entièrement sur `owner_id uuid` (colonne dans chaque table).

```
auth.users (Supabase Auth)
    └── owner_id = auth.uid()
            ├── swarms          (owner_id nullable — NULL = template global)
            ├── tools           (owner_id nullable — NULL = tool partagé)
            ├── crew_runs       (via crews.owner_id)
            ├── chief_run_log   (owner_id nullable — legacy = NULL)
            └── cockpit_chats   (user_id = auth.uid())
```

### Règles du modèle

| Règle | Réalité |
|---|---|
| 1 user = 1 tenant | ✅ Oui — `owner_id = auth.uid()` est le seul discriminant |
| Multi-tenant (user accède N tenants) | ❌ Non — pas de table de mapping user↔tenant |
| Templates globaux | ✅ `is_template=true AND owner_id IS NULL` → lisibles par tous |
| Swarms user-scoped | ✅ `is_template=false AND owner_id = auth.uid()` |
| Workspace/projet nommé | ❌ Absent — pas d'entité nommée au-dessus de l'owner |

### Chiffres DB (état actuel)

| Métrique | Valeur |
|---|---|
| Total swarms | 10 |
| Templates globaux (`is_template=true`) | 4 |
| Swarms user-owned | 6 |
| Swarms orphelins (non-template, owner_id NULL) | 0 |
| Owners distincts | 1 (mono-tenant actuel) |
| Runs total | 16 |
| Tools | 0 |
| Users table | 0 (auth géré par Supabase Auth, pas cette table) |

---

## 2. Ce qui fonctionne déjà

### Auth & session
- ✅ Middleware `proxy.ts` : refresh session Supabase à chaque requête, redirect `/login` si absent
- ✅ `requireOwnerId()` / `getOwnerId()` : dérive `owner_id` depuis `supabase.auth.getUser()` (vérification cryptographique, pas cookie brut)
- ✅ Dev bypass `DEV_BYPASS_AUTH=true` → stub UUID, fermé en `NODE_ENV=production`

### Données scopées
- ✅ `/swarms` : liste uniquement les swarms du owner courant (via `swarmsClient.list(ownerId)`)
- ✅ `/swarms/[id]` : 404 si owner mismatch (backend enforce)
- ✅ `/swarms/[id]/runs/[runId]` : scoped via `get_swarm_run(owner_id)` côté backend
- ✅ `/tools` : listés par owner (0 en DB actuellement)
- ✅ `/crews/chief-of-staff` : `listRuns` scoped par `ownerId`

### Templates
- ✅ RLS policy `swarms_templates_readable` : `is_template=true AND owner_id IS NULL` accessible en SELECT pour tous
- ✅ `SwarmList` affiche un badge `TEMPLATE` si `is_template=true`
- ⚠️ `/swarms` mélange templates et swarms user dans la même liste — pas de séparation visuelle claire au niveau section

### Backend hardening (commit `4c7edb5`)
- ✅ `owner_id` obligatoire sur tous les endpoints sensibles → 400 si absent ou non-UUID
- ✅ Mode legacy `owner_id=None returns all rows` supprimé dans `run_store`
- ✅ 94/94 tests passent

---

## 3. Ce qui manque

### UI
| Manque | Priorité |
|---|---|
| Aucun affichage de l'owner/workspace actif (email ou UUID) | P1 |
| Templates et swarms user mélangés dans `/swarms` | P1 |
| Pas de page dédiée "Workspace Overview" | P1 |
| Pas de vue globale des runs récents (cross-swarms) | P2 |
| Pas de switch de workspace/tenant (pas de modèle pour ça) | P3 hors scope |
| Pas d'historique des outputs/résultats consultable | P2 |

### Modèle de données
| Manque | Impact |
|---|---|
| Pas de table `tenants`/`workspaces` → 1 user = 1 tenant hardcodé | Bloquant si multi-tenant réel voulu |
| Table `users` vide (auth dans Supabase Auth, pas mirrored) | Impossible d'afficher email côté DB |
| Pas de table `assets`/`reports`/`artifacts` | Les outputs sont dans `swarm_run_steps.output_text` uniquement |
| `tools` : 0 entrées en DB | La page `/tools` est vide |

---

## 4. Inventaire UI existant

| Route | Contenu | Owner-scoped ? |
|---|---|---|
| `/` | Dashboard Chief of Staff (KPIs, bento) | ✅ |
| `/swarms` | Liste tous les swarms (own + templates mélangés) | ✅ scoped, templates inclus |
| `/swarms/new` | Builder swarm | ✅ |
| `/swarms/[id]` | Détail swarm + runs récents | ✅ |
| `/swarms/[id]/edit` | Éditeur swarm | ✅ |
| `/swarms/[id]/runs/[runId]` | Détail run + steps | ✅ |
| `/crews` | Liste crews | ✅ |
| `/crews/chief-of-staff` | Chief of Staff | ✅ |
| `/crews/chief-of-staff/history` | Historique runs chief | ✅ |
| `/crews/chief-of-staff/runs/[runId]` | Détail run chief | ✅ |
| `/tools` | Catalogue tools (vide) | ✅ |
| **`/workspace`** | **Inexistant** | — |

**Navigation (bottom bar)** : Overview · Swarms · Crews · Tools. Pas de section Workspace.  
**Header** : "Cockpit · MySwarms" statique — aucun affichage de l'owner actif.

---

## 5. Modèle asset/output

Il n'existe **pas** de table `assets`, `reports` ou `artifacts`. Les outputs sont stockés ainsi :

```
swarm_runs
  └── result_text    (text nullable) — résultat final du run
  └── error_text     (text nullable)
  └── langfuse_trace_id

swarm_run_steps
  └── output_text    (text nullable) — output par agent/task step
  └── input_text     (text nullable)
  └── status

chief_run_log
  └── result         (text nullable)
  └── state_json     (jsonb)

chief_run_steps
  └── output_text, task_output, task_name, agent_name
```

**Consultable dans l'UI** : `/swarms/[id]/runs/[runId]` affiche le `RunTimeline` avec les `StepCard` (output_text par step) et le résultat final. Mais il faut connaître l'ID du run pour y accéder — pas de vue "tous les résultats".

**Pas de format structuré** : `result_text` est du texte brut (markdown probable). Pas de JSON schema enforced côté output.

---

## 6. Statut sécurité

| Point | Statut |
|---|---|
| RLS activée sur toutes les tables | ✅ |
| `owner_id = auth.uid()` sur toutes les policies sensibles | ✅ |
| Service_role backend : isolation via `.eq("owner_id")` explicite | ✅ (post-4c7edb5) |
| Templates `owner_id NULL AND is_template=true` lisibles par tous | ✅ intentionnel |
| Aucun endpoint ne retourne cross-owner data | ✅ vérifié |
| 94/94 tests sécurité passent | ✅ |
| Bearer `CREWAI_ENGINE_AUTH_TOKEN` partagé (trusted proxy) | ⚠️ risque documenté, acceptable en V1 |
| `users` table vide — email non exposé côté DB | ℹ️ info via `supabase.auth.getUser()` uniquement |

---

## 7. Vue Workspace proposée

Page `/workspace` — RSC, lecture seule, aucun risque.

```
┌─ Workspace ──────────────────────────────────────────────────────────────┐
│  Owner                                                                    │
│  user@example.com  ·  ID: abc123…  ·  [Logout]                          │
├──────────────────────────────────────────────────────────────────────────┤
│  KPIs: Swarms propres │ Templates globaux │ Runs total │ Tools           │
├──────────────────────────────────────────────────────────────────────────┤
│  Swarms (N — owner-scoped)          │  Templates globaux (N — partagés) │
│  ┌──────────────────────────────┐   │  ┌─────────────────────────────┐  │
│  │ Mon Swarm A    [last run: …] │   │  │ Chief of Staff (template)   │  │
│  │ Mon Swarm B    [running]     │   │  │ Market Intel Scout          │  │
│  └──────────────────────────────┘   │  └─────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│  Runs récents (cross-swarms, scoped owner)                               │
│  Run ID       Swarm         Status      Started      Output preview      │
│  abc…8f       Mon Swarm A   completed   il y a 2h    "Analyse de …"      │
├──────────────────────────────────────────────────────────────────────────┤
│  Outils disponibles (N)   [vide si aucun]                                │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Plan d'implémentation

### Phase 1 — Workspace view (ce commit)
- [x] `src/app/workspace/page.tsx` — RSC, force-dynamic
- [x] Affiche : owner email + ID (via `supabase.auth.getUser()`)
- [x] Swarms scoped vs templates séparés visuellement
- [x] Runs récents cross-swarms (via `swarmsClient.listRuns` par swarm)
- [x] KPIs: nombre de swarms propres, templates, runs, tools
- [x] Ajout lien "Workspace" dans la nav (bottom bar)
- [x] Empty states propres

### Phase 2 — Séparation swarms/templates dans `/swarms`
- [ ] Ajouter section "Templates globaux" sous la liste user dans `/swarms/page.tsx`
- [ ] Bouton "Use template" → pré-rempli dans `/swarms/new`

### Phase 3 — Asset viewer
- [ ] Page `/workspace/runs` : cross-swarms runs avec preview `result_text`
- [ ] Filtres : status, swarm, date

### Phase 4 — Multi-tenant réel (si besoin)
- [ ] Table `workspaces(id, name, owner_id, created_at)`
- [ ] Mapping `workspace_members(workspace_id, user_id, role)`
- [ ] Switch workspace dans la nav

---

## 9. Questions ouvertes

| Question | Réponse actuelle |
|---|---|
| Un user peut-il accéder à plusieurs workspaces ? | Non — pas de modèle pour ça |
| Les templates sont-ils vraiment globaux (tous users) ? | Oui — `owner_id NULL, is_template=true`, RLS SELECT `true` |
| Où stocker les outputs structurés (JSON) ? | Actuellement dans `result_text` (texte brut) — pas de table dédiée |
| Le `scheduler.py` backend crée des runs avec `CHIEF_SCHEDULER_OWNER_ID` hardcodé — est-ce prévu ? | Oui (cron système), mais c'est un owner UUID fixe, pas dynamique |
| Faut-il un modèle `workspaces` avant APM ? | Recommandé si APM doit avoir son propre contexte isolé |
| La table `users` vide est-elle normale ? | Oui — l'auth est dans `auth.users` (Supabase internal), la table `public.users` semble être un stub non peuplé |
