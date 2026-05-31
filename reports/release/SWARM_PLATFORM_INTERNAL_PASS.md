# Swarm Platform — Internal Test Pass

**Date** : 2026-06-01  
**Branche** : `feat/kimi-admin-agent`  
**Commit** : `76b57c0` (+ finalization `chore(release)`)  
**Verdict** : ✅ PASS — internal test

---

## URLs validées

| Service | URL | Statut |
|---|---|---|
| **Frontend preview (commits finaux)** | https://myswarms-23npe98md-hearst-corporation.vercel.app | ✅ READY |
| **Backend Railway** | https://crewai-engine-production.up.railway.app | ✅ `{"status":"ok","version":"0.1.0"}` |
| **Supabase** | https://app.supabase.com/project/fxeibmjebvxtoazuyyvz | ✅ |

---

## Run de référence validé

| Champ | Valeur |
|---|---|
| **run_id** | `baa251eb-df36-43c2-b35c-04d1e9581947` |
| **Swarm** | APM — Vehicle Research |
| **Inputs** | BMW 330d xDrive · 2019 · 87 000 km · diesel · 24 900 € · DE |
| **Durée** | 2m 8s |
| **Steps** | 6 (Data Collector ×2 · Risk Analyst ×2 · Decision Writer ×2) |
| **Tokens** | 3 559 in · 14 639 out |
| **Recommandation** | ÉVITER |
| **Coût** | — (non trompeur) |

---

## Commits récents sur la branche

| Hash | Description |
|---|---|
| `76b57c0` | style(shell): deepen bottom-bar scrim — 4-stop gradient, 150px, full opacity base |
| `1f55415` | fix(stability): P0 step race + CI build gate + Chief owner scoping + Markdown table |
| `ddb89ba` | fix(automotive): make dashboard tables scrollable on mobile |
| `2a3ecfb` | style(shell): add bottom nav scroll fade scrim |
| `cfb6133` | feat(automotive): APM dashboard V1 at /automotive |

---

## Ce qui marche (validé e2e)

- ✅ Login Supabase réel (email/password)
- ✅ `/workspace` : 6 swarms, 5 templates globaux, 10 runs récents
- ✅ Template `APM — Vehicle Research` : badge TEMPLATE, labels humanisés, formulaire structuré
- ✅ Lancement run avec dialog de confirmation
- ✅ Run completed en ~2 min (Railway cold start inclus)
- ✅ **6 steps persistés et visibles** dans la timeline groupée par agent
- ✅ Rapport Markdown contextualisé : summary, risques, checkpoints, questions vendeur, estimation coûts, recommandation
- ✅ Recommandation ÉVITER bien parsée et affichée
- ✅ Coût `—` (non trompeur — pricing Kimi non disponible)
- ✅ Dashboard `/automotive` : 7 véhicules, KPIs réels, run visible, lien Voir fonctionnel
- ✅ Boutons Copy / ↓ .md présents
- ✅ Auth owner_id scopée correctement (pas de fuite cross-user)
- ✅ Templates globaux read/run-only (Edit masqué en UI + 403 engine)
- ✅ `tsc --noEmit` : clean
- ✅ `next build` : 22 routes compilées sans erreur
- ✅ `ruff check` : clean
- ✅ `pytest` : 110 passed

---

## Limites restantes

| # | Item | Nature |
|---|---|---|
| L1 | Per-step tokens/cost = `0` | Dette intentionnelle — Kimi pricing non disponible, `total_cost_usd` reste 0 |
| L2 | Two divergent recommendation parsers (dashboard vs detail) | Dette P1 — à unifier avant sourcing |
| L3 | N+1 sur `/automotive` (~151 queries/page view) | Acceptable à 7 runs, à corriger avant >50 runs |
| L4 | Migration numbering drift (double-0014, collision 0020) | Risque onboarding — non bloquant prod |
| L5 | `langfuse_trace_id` jamais peuplé | Observabilité partielle — tests OTel auto à valider |
| L6 | Single-worker sans assert au boot | Acceptable, risque scaling futur |
| L7 | 1 erreur console mineure non identifiée | Non bloquante |

---

## No-go actuels

Ces actions sont **bloquées** jusqu'aux pré-requis indiqués :

| Action | Pré-requis avant de débloquer |
|---|---|
| Test externe (multi-utilisateur) | Fix isolation Chief steps/decisions (fait `1f55415`) + test avec 2 comptes réels |
| Sourcing / scrapers | Clearance légale écrite + run APM fiable en volume (>10 runs) |
| `vehicle_candidates` table | Résoudre collision migration 0010 + retirer dépendance `org_members` inexistante |
| Organizations/workspaces | Décision produit explicite + chantier dédié |
| Scaling Railway (>1 worker) | Refactor callbacks thread-safe (fait `1f55415`) + assert boot single-worker |

---

## Prochaine étape recommandée

**Automotive sourcing discovery** — maintenant que le run APM est prouvé fonctionnel en prod.

Ordre suggéré avant de commencer le sourcing :

1. **Unifier les parseurs de recommandation** (dashboard et detail) en un seul helper partagé — petit, sans risque, kill la divergence observée.
2. **Kill le N+1 `/automotive`** — étendre `SwarmRunSummarySchema` avec `inputs_json` + `result_text_preview` pour charger tout en 1 appel.
3. **Valider la fiabilité Kimi** sur 10+ runs APM réels — mesurer le taux de format APPELER/ATTENDRE/ÉVITER et les empty-responses.
4. Ensuite seulement : commencer les specs sourcing (commencer par le free tier Vincario VIN, pas les scrapers).

---

## Rapport e2e complet

`reports/e2e-supabase/E2E_SUPABASE_DEPLOYED_REPORT.md`  
`reports/e2e-supabase/summary.json`

---

*Rapport généré le 2026-06-01 · Swarm Platform internal test pass*
