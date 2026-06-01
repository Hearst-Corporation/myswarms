# Automobile — Remise à niveau produit (Product Reset)

> Mode : CPO + Architecte AI + UX Lead. **Aucun code, aucune migration, aucune table, aucun scraper lancé.**
> Date : 2026-06-01. Fondé sur un audit read-only de l'environnement Automobile réel (routes, API, lib, persistence, secrets, docs).
> Compagnon de : [AUTOMOBILE_PRODUCT_STRATEGY.md](AUTOMOBILE_PRODUCT_STRATEGY.md), [AUTOMOTIVE_SOURCING_SPEC.md](AUTOMOTIVE_SOURCING_SPEC.md), [AUTOMOTIVE_API_AND_SDK_DISCOVERY.md](AUTOMOTIVE_API_AND_SDK_DISCOVERY.md), [SYSTEM_MAP_AUTOMOBILE.md](SYSTEM_MAP_AUTOMOBILE.md).

---

## 1. Résumé exécutif

L'environnement Automobile **fonctionne de bout en bout, sur des données 100 % réelles** : Sourcing AutoScout24 (Apify, 8 pays) → Nouvelle analyse pré-remplie (URL extractor déterministe + provenance/confiance par champ) → run du template global → rapport Markdown + recommandation APPELER/ATTENDRE/ÉVITER → dashboard de tri + cote marché APM. Trois actions recommandées par les docs antérieures sont **déjà livrées** : l'URL extractor (ex-« action A » de la stratégie), le sourcing AutoScout24, et le canvas agents/système (`/system-map`, `/swarms/[id]/schema`).

La conclusion centrale de cet audit n'est donc **pas** « il manque une fonctionnalité ». C'est que le produit a atteint un plateau où **trois écarts structurels** l'empêchent de devenir un vrai cockpit opérateur :

1. **La décision humaine n'est persistée nulle part.** « À traiter » est recalculé à chaque rendu depuis la reco LLM. L'opérateur ne peut pas marquer un véhicule *appelé / écarté / acheté / perdu*, ni retrouver son propre tri entre deux sessions. Le produit s'arrête au rapport ; il ne **boucle** pas sur la décision.
2. **La fondation n'est pas bornée.** `rate-limit.ts` existe mais n'est câblé sur **aucune** route de scraping ; le coût Apify (pay-per-event) n'a **aucun plafond** ; le cache sourcing a une **clé globale** non scopée par owner ; les fonctions sécurité-critiques (canonicalisation dédup, allowlist anti-injection) **ne sont pas testées**.
3. **Le livrable décisionnel est fragile.** La recommandation n'est pas un champ structuré : elle est re-parsée par **regex** sur le Markdown du LLM à chaque affichage. Si le crew change son format, le badge tombe en `UNKNOWN`.

**Bonne nouvelle vérifiée** : `APIFY_TOKEN` n'est **pas** exposé (git history propre, lu via `process.env` dans un module `server-only`, jamais loggé). Le risque #1 listé dans le brief est donc largement infondé en l'état.

**Prochaine action unique recommandée : A — Sécuriser/borner le sourcing (rate-limit + cap coût Apify + QA des fonctions non testées).** C'est la seule option qui ferme un trou *vérifié dans le code*, à effort minimal et risque de régression nul, et qui rend sûr tout ce qui se construit ensuite (décision, candidats, ouverture multi-opérateur). Le **north-star produit immédiatement après** est **B — VehicleDecision** (la couche de décision tracée). Détail §15.

Principe directeur du reset : **fermer la boucle de décision et borner la fondation, sans usine à gaz, sans nouvelle app, sans scraping massif.**

---

## 2. Produit Automobile : définition

> **Automobile est un cockpit opérateur de décision VO, intégré à Swarm Platform.** Il transforme des annonces (sourcées via Apify ou collées par URL) en rapports actionnables produits par une équipe d'agents, puis — c'est le chaînon à compléter — en **décisions opérateur tracées et suivies**.

Ce que c'est :

- **Un environnement spécialisé de Swarm**, pas une app séparée : il réutilise les primitives Swarm (template global, runs owner-scoped, steps, rapport Markdown). Le basculement d'accent (`data-product="automobile"`) et le sous-menu dédié (Dashboard / Nouvelle / Historique / Marché / Sourcing) en font une *surface* cohérente sans duplication d'infra.
- **Un cockpit de décision** dont la question maîtresse est : *« quelle annonce j'appelle maintenant, et pourquoi ? »*

Ce que c'est en partie, et doit devenir pleinement :

- **Une équipe AI** (3 agents : Data Collector → Risk Analyst → Decision Writer) — réelle mais dont le contrat de sortie n'est pas figé.
- **Un moteur de sourcing** (AutoScout24/Apify) — réel mais éphémère (rien n'est stocké) et non borné.

Ce que ce **n'est pas** (et ne doit pas devenir maintenant) : une marketplace de templates, un produit multi-org/billing, un scraper planifié massif, un catalogue VIN/pièces payant par défaut.

Formule de positionnement : **« De l'annonce à la décision, tracée. »**

---

## 3. État actuel réel (audité)

### 3.1 Ce qui est réel et fonctionne

| Brique | Réalité vérifiée |
|---|---|
| 6 pages `/automobile/*` | Toutes branchées sur de **vraies** API, **zéro mock** |
| 3 backends | (1) Moteur CrewAI Python (runs/recos/tokens/rapports) ; (2) Apify `blackfalcondata~autoscout24-scraper` (annonces, cache Upstash 5 min) ; (3) table `market_index` APM Supabase (cote, read-only, fail-soft) |
| Flux opérateur | Sourcing → Nouvelle (pré-rempli) → run → `/[runId]` (rapport + reco) → Dashboard/Historique — bout en bout |
| Dashboard `/automobile` | Vraie page de tri : 8 KPIs, bloc « À traiter » (APPELER/ATTENDRE), prix annonces vs cote APM réelle |
| Cote `/automobile/marche` | Vraie base APM : médiane, P15-P85, liquidité, vélocité, confiance, échantillon (n≥3) |
| URL extractor | 100 % **déterministe** (JSON-LD > meta > regex), borné (timeout 8 s, 1 Mo, allowlist 8 domaines ×2), fail-soft + warnings + provenance/confiance par champ |
| Sécurité de base | `requireOwnerId()` fail-closed sur les 2 routes API ; `extract-url` = allowlist + `checkBodySize` + Zod ; **`APIFY_TOKEN` jamais hardcodé/loggé/committé** (git propre, `server-only`) |
| Lib `src/lib/automobile/` | 7 modules déterministes et reproductibles ; prefill anti-injection (allowlist 10 champs) |

### 3.2 Ce qui est partiel / éphémère

- **Aucune table Automobile dédiée** (vérifié MCP Supabase + migrations) : tout passe par `swarms` / `swarm_runs` / `swarm_run_steps`. Pas de `vehicle_candidates`, `vehicle_decisions`, `saved_searches`.
- **Recommandation non structurée** : re-parsée par regex (`extractRecommendation`) sur `result_text` à chaque rendu. Contrat de sortie du crew **non figé**.
- **Sourcing éphémère** : ré-scrapé à chaque navigation ; cache Upstash 5 min à **clé globale** (non scopée owner) ; **aucune trace DB**. Persiste seulement si l'opérateur clique « Analyser » (les champs partent dans `inputs_json` au kickoff).
- **Perf lourde** : dashboard + historique font `listRuns(50)` puis N×`status()` (jusqu'à 50 round-trips engine/page) ; dédup re-scanne 25 runs ; dashboard ajoute 5 appels APM. Fonctionnel mais non paginé.

### 3.3 Ce qui manque pour que l'opérateur décide vite

- **La décision humaine n'est persistée nulle part.** Pas de statut, pas de mémoire de l'action opérateur. « À traiter » = reco LLM recalculée, pas une décision stockée.
- **Pas de delta prix-annonce vs cote APM** affiché : l'opérateur compare à la main entre `/marche` et le dashboard.
- **Pas de plafond de coût** (Apify + LLM) ni de **rate-limit appliqué** : impossible d'ouvrir à plus d'un opérateur sans risque de coûts non bornés.
- **`swarm_run_steps` mort** depuis le hotfix 2026-05-18 (callbacks désactivés) : timeline vide sur les nouveaux runs, tokens par agent = 0, et tout mécanisme « status=researched » supposé par la SOURCING_SPEC est cassé.

---

## 4. Architecture produit cible

```text
Sources ──► Candidats ──► Analyse AI ──► Rapport ──► Décision ──► Suivi
(Apify,     (annonce      (3 agents     (Markdown   (humain :    (dashboard,
 URL,        normalisée    Kimi)         + reco)     appelé/      historique,
 manuel)     + provenance)                           écarté/…)    métriques)
```

| Étape | Aujourd'hui | Cible |
|---|---|---|
| **Sources** | Apify AS24 + URL extractor + saisie manuelle — réel mais éphémère, non borné | Bornées (rate-limit + cap coût), cache scopé owner |
| **Candidats** | ❌ inexistant — l'annonce vit dans l'URL/les params, jamais persistée | `VehicleCandidate` (V2, SQL déjà spécifié dans SOURCING_SPEC) **seulement quand le besoin est prouvé** |
| **Analyse AI** | 3 agents réels, kickoff owner-scoped | Contrat de sortie **figé** (reco devient un champ fiable) |
| **Rapport** | Markdown + reco regex-parsée | Markdown conservé ; **reco promue en champ structuré** |
| **Décision** | ❌ **inexistant** — recalculé depuis la reco | `VehicleDecision` (B) : statut humain tracé, owner-scoped |
| **Suivi** | Dashboard/historique recalculés à chaque rendu | Adossés à la décision réelle + delta prix/cote |

**Note d'architecture critique** : le front **n'a aujourd'hui aucun client d'écriture Supabase** — toute persistance passe par le moteur Python. Introduire `VehicleDecision`/`VehicleCandidate` est donc une **décision d'architecture** : table possédée par l'engine (cohérent avec le pattern actuel, RLS service_role) **ou** premier chemin d'écriture front (client Supabase owner-scoped). À trancher **avant** B. Recommandation : garder l'écriture côté **engine** (un endpoint `POST /v1/decisions`) pour ne pas fragmenter le modèle de sécurité.

---

## 5. Workflows utilisateur

**WF1 — Je colle une URL** *(réel aujourd'hui)*
URL → `extract-url` (JSON-LD/meta/regex + provenance/confiance) → form pré-rempli + warning doublon → run → rapport → **décision** *(manque : la décision n'est pas tracée)*.

**WF2 — Je cherche des annonces** *(réel aujourd'hui)*
Sourcing (marque + marché EU + fourchette) → tableau AutoScout24 → « Analyser » → `/nouvelle?from=sourcing&…` pré-rempli → run → rapport → **décision** *(manque : décision + le candidat n'est pas mémorisé)*.

**WF3 — Je contrôle mon activité** *(réel mais incomplet)*
Dashboard → « À traiter » (APPELER/ATTENDRE) → filtres → ouvrir rapport → **décider** *(manque : « À traiter » devrait refléter ce qui n'a pas encore de décision humaine, pas la reco LLM ; et un delta prix/cote en un coup d'œil)*.

**WF4 — Surveillance** *(futur, gated)*
Recherche sauvegardée → scrape planifié léger → nouveaux candidats → alertes → analyse. **Bloqué** par : (a) rate-limit/cap coût absents (action A), (b) legal clearance scraping non signé, (c) callbacks moteur HS.

---

## 6. Dashboard cible

Une seule surface, mieux priorisée — **pas 12 pages**. Hiérarchie : action → décisions en attente → opportunités → contrôle.

| Section | Affiche | Source | Possible aujourd'hui ? | Nouvelle table ? | Priorité |
|---|---|---|---|---|---|
| **Barre d'action** | « Nouvelle analyse », « Coller une URL », « Sourcing » | routes | ✅ oui | non | V1 |
| **À décider** | Runs *completed* **sans décision humaine** | runs + `VehicleDecision` | ⚠️ partiel (aujourd'hui = reco, pas décision) | **oui (B)** | V1→V2 |
| **Opportunités** | Top annonces avec **delta prix vs cote APM** | inputs + APM | ✅ oui (calcul) | non | V1 |
| **Derniers rapports** | véhicule, prix/km, source, reco, lien | runs | ✅ oui | non | V1 |
| **Recommandations** | compteur APPELER/ATTENDRE/ÉVITER/UNKNOWN | reco | ✅ oui | non | V1 |
| **Sourcing live** | derniers scrapes, marchés, erreurs | Apify | ⚠️ partiel (éphémère) | non (logs) | V2 |
| **Marché** | signal APM (médiane, fourchette, liquidité) | APM | ✅ oui | non | V1 |
| **Coûts** | tokens/run + total période (**pas de $** — pricing Kimi absent) | runs | ✅ oui | non | V1 |
| **Sources** | succès/erreur extraction par domaine | logs/`SourceRun` | ❌ non | oui (V3) | V3 |

**Le chaînon manquant le plus visible** : le **delta prix-annonce vs cote APM** par ligne (« −18 % sous le marché DE »). Données déjà disponibles, calcul pur, **zéro migration** — c'est le plus gros accélérateur de décision à coût quasi nul (regroupé dans l'action H).

---

## 7. Assets / data model

### 7.1 Déjà existants (à exploiter)
`run`, `step` *(mort depuis 2026-05-18)*, rapport Markdown (`result_text`), `inputs_json` (véhicule + prix + pays + URL + notes), `source_url`, `recommendation` *(regex)*.

### 7.2 À créer / structurer — par priorité

| Objet | Pourquoi | Champs minimaux | Quand | Risque | Priorité |
|---|---|---|---|---|---|
| **`recommendation` structurée** | Le livrable décisionnel ne doit pas dépendre d'un regex sur du Markdown | promu en champ du run (`reco`, `reco_confidence`) via contrat de sortie crew | avec A/H | faible (contrat à figer) | **V1** |
| **`VehicleDecision`** | **Fermer la boucle** : mémoire de l'action opérateur | `id`, `owner_id`, `run_id`, `vehicle_key`, `status`(à décider/appelé/écarté/acheté/perdu), `note`, `decided_at` | **prochaine vraie feature (B)** | moyen (1er chemin de persistance) | **V2 (north-star)** |
| **`VehicleCandidate`** | Mémoriser une annonce comme objet (watchlist, dédup forte) | déjà **spécifié intégralement** (SQL migration 0010) dans [SOURCING_SPEC](AUTOMOTIVE_SOURCING_SPEC.md) | quand le flux candidat est prouvé | moyen-élevé (les 3 docs disent « pas de table d'abord » ; la RLS référence `org_members` inexistante → corriger avant apply) | V3 |
| **`SavedSearch`** | Re-lancer un sourcing | `owner_id`, `params_json`, `label` | confort | faible (l'URL fait déjà 80 %) | V3 |
| **`SourceRun`** | Observabilité scraping (succès/erreur/coût) | `owner_id`, `source`, `params`, `count`, `cost`, `status`, `at` | avec scheduling | faible | V3 |
| **`PriceSnapshot`** | Historique prix d'un véhicule | `candidate_id`, `price`, `at` | avec candidats + scheduling | faible | V4 |

> **Ne pas** structurer trop tôt : rapport complet, raisonnement détaillé, PII vendeur, prix multi-source. Cf. SOURCING_SPEC pour le SQL `vehicle_candidates` (ne pas le redéfinir).

---

## 8. Équipe AI Automobile

**Actuelle (réelle, `openai/kimi-k2.6`)** : Data Collector (executor) → Risk Analyst (analyst) → Decision Writer (coordinator). DAG linéaire via `depends_on_task_id`.

**Répartition déterministe / AI / humain** (du flux audité) :

| Tâche | Type | Aujourd'hui |
|---|---|---|
| Extraction URL (JSON-LD/meta/regex) | **Déterministe** | ✅ `urlExtractor.ts` |
| Dédup `source_url` canonicalisée | **Déterministe** | ✅ `dedup.ts` (best-effort, non testé) |
| Normalisation carburant/pays, labels, logos | **Déterministe** | ✅ lib |
| Analyse risques / fiabilité / questions vendeur | **AI** | ✅ Risk Analyst |
| Rapport + recommandation | **AI** | ✅ Decision Writer |
| Valider les champs extraits | **Humain** | ✅ form |
| **Décider (appeler/écarter/acheter)** | **Humain** | ❌ non tracé → B |

**Agents futurs, seulement si utiles** : Source Extractor (si l'extraction LLM fallback devient nécessaire), Duplicate Checker (déterministe d'abord), Market Comparator (avec comparables structurés), Recall Checker (déterministe via open data EU Safety Gate). **À éviter** : 20 agents spécialisés, agent vendeur autonome, agent pricing sans données fiables, scraper autonome non borné.

> ⚠️ Caveat moteur : avec les step-callbacks désactivés (2026-05-18), tout agent supplémentaire reste **invisible step-par-step** tant que la persistance des steps n'est pas réactivée. Privilégier des agents dont la valeur est dans le **rapport final**, pas dans la timeline.

---

## 9. Scraping / Apify

**État** : AutoScout24 manuel, déclenché par formulaire, cache 5 min, **aucune écriture DB**, **aucun rate-limit**, **aucun cap coût** (PPE ~$0.80/1000).

**Progression obligatoire** :

- **V1 (maintenant)** : **manuel uniquement, mais borné** → rate-limit par owner + cap coût Apify + cache scopé owner (action A). Garder l'extraction URL ponctuelle.
- **V2** : recherches sauvegardées (`SavedSearch`) — re-lancer un sourcing, pas de planification.
- **V3** : planification légère (2×/jour), source unique AS24, `SourceRun` pour traçabilité, **gated legal clearance**.
- **V4** : multi-source (mobile.de…), quotas, revue juridique signée.

**Garde-fous non négociables avant tout scheduling** : confirmation humaine avant run coûteux, dédup `source_url`, allowlist domaines, timeout court + fallback, quotas/owner, **pas de PII vendeur stockée**.

**Risque à porter explicitement** : `extract-url` fait un `fetch()` **direct** (User-Agent bot auto-déclaré) sur AS24/mobile.de/leboncoin/… → **IP serveur exposée**, pas de `robots.txt`, pas de backoff. Le scraping AS24 viole probablement les CGU (la doc interne le qualifie « risque Moyen »). À trancher avant industrialisation.

---

## 10. APIs / SDKs

La recherche est **déjà faite** : 32 providers classés dans [AUTOMOTIVE_API_AND_SDK_DISCOVERY.md](AUTOMOTIVE_API_AND_SDK_DISCOVERY.md). **Ne pas re-rechercher.** Ne brancher **rien** maintenant.

**Deux pistes à investiguer plus tard, et une décision produit à prendre d'abord :**

1. **VIN — décision produit non tranchée** : les docs divergent entre **decode specs** (Vincario/vindecoder.eu, 3 lookups gratuits/mois) et **historique** (AutoDNA/carVertical, accidents/km/vol). **Ce sont deux produits différents.** → Trancher *« on veut des specs ou un historique ? »* avant de coder quoi que ce soit. Candidat V2 sur véhicules shortlistés uniquement.
2. **Valuation** : démarrer avec l'**APM existant** (déjà branché, gratuit), puis évaluer autobiz (pan-EU) vs L'Argus/EurotaxGlass (FR) — **dépend du marché cible FR vs EU, non décidé**.

Tout le reste (pièces/TecDoc, rappels, fiabilité) : plus tard.

---

## 11. UX / UI (chaque amélioration aide à décider)

| Amélioration | Aide à décider | Effort | Migration |
|---|---|---|---|
| **Delta prix annonce vs cote APM** par ligne/carte | « sous/au-dessus du marché » en un coup d'œil — le n°1 | faible | non |
| **Boutons de décision** sur le rapport/carte (à décider/appelé/écarté/acheté/perdu) | trace l'action, vide « À traiter » | moyen | **oui (B)** |
| **Badge reco robuste** (`UNKNOWN` propre si parsing échoue) | évite un faux signal | faible | non |
| États vides orientés action (déjà partiels) | guide le parcours | faible | non |
| Provenance/confiance par champ (déjà fait) | confiance avant de consommer des tokens | — | fait |
| Photos véhicules (déjà faites) | reconnaissance rapide | — | fait |
| Table pour l'historique, cartes pour les 3-5 prioritaires (déjà le cas) | densité vs focus | — | fait |
| Mobile : flux vertical, pas de scroll horizontal | usage terrain | faible | non |

**À éviter** : cartes géographiques, heatmaps, courbes de marché sans échantillon, coûts en $ (pricing Kimi non fiable → tokens uniquement).

---

## 12. Dashboard de contrôle / observabilité

Ce qu'un opérateur doit voir — et la faisabilité réelle :

| Métrique | Mesurable aujourd'hui ? |
|---|---|
| Runs en cours / échoués / temps moyen | ✅ via `listRuns` |
| Tokens consommés (total run) | ✅ (par agent ❌ — moteur ne capture pas) |
| Taux APPELER/ATTENDRE/ÉVITER | ✅ (dépend du parsing reco) |
| Doublons détectés | ⚠️ best-effort (dédup non testée) |
| Sources actives / derniers scrapes / erreurs sources | ❌ → `SourceRun` (V3) |
| Coût Apify | ❌ → instrumentation (avec A) |
| Candidates trouvés / analysés | ❌ → `VehicleCandidate` (V3) |
| Taux de décision (appelé/acheté) | ❌ → `VehicleDecision` (B) |

Règle : **tokens, pas dollars** (pricing Kimi/Hypercli non publié). N'afficher que ce qui est réellement mesuré ; ne pas inventer de coût.

---

## 13. Risques

| Risque | Niveau | Réalité |
|---|---|---|
| `APIFY_TOKEN` exposé | 🟢 **infondé** | git history **propre**, `server-only`, jamais loggé. Garder en secrets Vercel/Railway (déjà le cas) + check boot |
| **Rate-limit absent** sur scraping | 🔴 réel | `rate-limit.ts` existe mais **non importé** ; user authentifié peut boucler Apify |
| **Cap coût Apify absent** | 🔴 réel | PPE non plafonné, pas de quota/owner, cache à clé globale |
| Fonctions sécurité non testées | 🟠 réel | `normalizeSourceUrl`, `parsePrefillParams` (anti-injection) sans test |
| **Décision non persistée** | 🔴 produit | aucune mémoire opérateur |
| **Reco regex-fragile** | 🟠 réel | contrat de sortie crew non figé |
| `swarm_run_steps` mort (2026-05-18) | 🟠 réel | timeline vide, callbacks « researched » HS |
| Légalité scraping (CGU/RGPD) | 🟠 réel | fetch direct = IP exposée ; AS24 CGU ; PII dealer non traitée |
| Perf (≤50 round-trips/page) | 🟡 dette | fonctionnel, non paginé |
| `COMPOSIO_USER_ID="adrien"` | 🟡 hors-auto | bloquant multi-tenant **Chief of Staff**, **pas** le flux Automobile (le scraping n'appelle jamais Composio) |
| Front sans client d'écriture | 🟠 archi | toute nouvelle persistance = décision d'archi (engine vs front) |

**Garde-fous** : confirmation humaine avant run, dédup URL, allowlist domaines, timeout + fallback, quotas/owner avant scheduling, pas de PII vendeur en V1, sources/incertitude obligatoires dans le prompt.

---

## 14. Roadmap

### Maintenant (1–3)
1. **A — Borner le sourcing** : câbler `rate-limit.ts` sur `/api/scrape/autoscout` + `/api/automobile/extract-url`, cap coût/quota Apify par owner, cache scopé owner, + tests des fonctions non couvertes (`normalizeSourceUrl`, `parsePrefillParams`, extracteurs prix/km/année).
2. **H (volet décision-visuelle)** — **delta prix annonce vs cote APM** par ligne + badge reco robuste (`UNKNOWN` propre). Front-only, zéro migration.

### Ensuite (3–5)
3. **Figer le contrat de sortie du crew** → promouvoir la reco en champ structuré (fin du regex fragile).
4. **B — VehicleDecision** : statut humain tracé (à décider/appelé/écarté/acheté/perdu), écrit **via l'engine** (endpoint dédié), owner-scoped. Branche « À décider » sur la vraie décision.
5. Réactiver la persistance des **steps** côté moteur (débloque timeline + futurs callbacks), **sans migration**.

### Plus tard
`VehicleCandidate` (C, SQL déjà spécifié), `SavedSearch` (D), VIN (après décision specs-vs-historique), scheduling léger + `SourceRun` (gated legal), valuation (FR vs EU), pièces/OEM, multi-source.

---

## 15. Prochaine action unique

> ### A — Sécuriser/borner le sourcing (rate-limit + cap coût Apify + QA des fonctions non testées)

**Pourquoi A, et une seule :**

1. **C'est la seule option qui ferme un trou *vérifié dans le code*, pas hypothétique.** `rate-limit.ts` existe mais n'est importé par **aucune** des deux routes de scraping ; le coût Apify (PPE) n'a **aucun plafond** ; le cache sourcing a une **clé globale** ; les fonctions sécurité-critiques (canonicalisation dédup, allowlist anti-injection prefill) n'ont **aucun test**.
2. **Effort minimal, régression nulle** : la lib existe déjà, c'est du câblage + un cap + des tests. Durcissement non destructif, aucun parcours existant altéré.
3. **C'est la fondation de tout le reste.** Les vraies actions produit (B VehicleDecision, H delta prix/cote) se construisent **sur ce flux**. Le borner d'abord est l'ordre lucide : on ne scale pas la boucle de décision ni l'ouverture multi-opérateur sur une fondation au coût non plafonné.

**Ce que A inclut précisément** : appliquer `src/lib/utils/rate-limit.ts` aux 2 routes ; ajouter un cap coût/quota Apify par owner ; scoper la clé de cache Upstash par owner ; couvrir par tests `normalizeSourceUrl`, `parsePrefillParams`, et les extracteurs (`extractPrice/Mileage/Year`).

**Note de lucidité** : A ne résout **pas** la question légale du fetch direct, ni le contrat de sortie fragile du crew — ce sont des risques résiduels à porter explicitement. Et A n'est **pas** une fonctionnalité visible : le **north-star produit** reste **B — VehicleDecision**, à enchaîner immédiatement après A pour fermer la boucle « de l'annonce à la décision, tracée ».

**Pour mémoire** : l'option **E (Canvas agents/système) est déjà livrée** (`/system-map`, `/swarms/[id]/schema`) ; **C/F/G** sont prématurées ou bloquées par une décision produit non prise (provider VIN, marché cible) ; **D** est marginale (l'URL porte déjà les paramètres).

---

---

## Infrastructure GPU / Training

> Audit read-only. Aucun job lancé, aucun serveur modifié, aucune consommation GPU.
> Date : 2026-06-01. Données issues de INFRA.md + SERVICES.md + code Hedge/MySwarms.

---

### 1. Serveurs identifiés

| Machine | GPU | LAN | Tailscale | Statut VRAM | Rôle actuel |
|---|---|---|---|---|---|
| **GPU1** (WSL2 Ubuntu) | 4× RTX 4090 | 192.168.1.200 | 100.88.191.49 | GPU0: 91%, GPU1: 57%, GPU2: libre, GPU3: 99% | vLLM Qwen2.5-Coder (ports 8000-8003) + pgvector |
| **GPU2** (Ubuntu natif) | 4× RTX 4090 | 192.168.1.150 | 100.110.74.114 | Tous > 93% (chargé) | vLLM Qwen2.5-Coder + nomic-embed + ComfyUI + InvokeAI |

Accès : SSH Tailscale (`gpu1`, `gpu2-remote`, user `comput3`) + tunnels SSH locaux pour les ports.

**État critique** : GPU2 est saturé (93-97% VRAM × 4 GPU, CPU load 13+). GPU1 GPU3 à 99%. Toute utilisation supplémentaire concurrente risque OOM.

---

### 2. Scripts training / embedding identifiés

**Aucun script de training, fine-tuning, LoRA/QLoRA, ni pipeline de dataset n'a été trouvé** dans Hedge ni dans MySwarms. Les GPU sont utilisés exclusivement pour **inférence** (vLLM serving + génération image).

| Service | Port | Modèle | Déclencheur | Output |
|---|---|---|---|---|
| `vllm-coding` (GPU2) | 8000 | Qwen2.5-Coder-32B-AWQ | Appel HTTP depuis Hedge engine | Completion JSON |
| `vllm-fast` (GPU2) | 8001 | Qwen2.5-Coder-7B-AWQ | Appel HTTP depuis Hedge engine | Completion JSON |
| `vllm-embeddings` (GPU2) | host | nomic-embed | Appel HTTP | Vecteurs float |
| `openclaw-vllm-*` (GPU1) | 8000-8003 | Qwen2.5-Coder × 3 + embeddings | OpenClaw (projet séparé) | Completions |
| ComfyUI (GPU2) | 8188 | SD/FLUX (génération image) | Appel HTTP / UI | Images |
| InvokeAI (GPU2) | 9090 | SD (génération image) | UI / `invoke.hearst.app` | Images |

---

### 3. Modèles / datasets identifiés

| Modèle | Framework | Où | Usage |
|---|---|---|---|
| Qwen2.5-Coder-32B-AWQ | vLLM | GPU2 | Raisonnement Hedge engine |
| Qwen2.5-Coder-7B-AWQ | vLLM | GPU2 | Inférence rapide Hedge engine |
| nomic-embed | vLLM | GPU2 | Embeddings (OpenClaw/Hedge) |
| Qwen2.5-Coder × 3 | vLLM | GPU1 | OpenClaw (projet distinct) |
| Stable Diffusion / FLUX | ComfyUI | GPU2 | Génération image |
| Stable Diffusion | InvokeAI | GPU2 | Génération image |
| qwen3-embedding-4b | Hypercli (cloud) | API distante | Embeddings MySwarms CrewAI |
| kimi-k2.6 | Hypercli (cloud) | API distante | Chat / agents MySwarms |

**Aucun checkpoint custom entraîné, aucun dataset propriétaire, aucun modèle fine-tuné identifié.**

---

### 4. Lien actuel avec Swarm Platform

| Question | Réponse |
|---|---|
| Les swarms utilisent-ils les GPU locaux ? | **Non.** CrewAI Engine appelle Hypercli (cloud). Les GPU locaux ne sont pas dans la boucle Swarm. |
| Hypercli/Kimi est-il séparé des serveurs GPU ? | **Oui, totalement.** Hypercli = API cloud externe. Aucune dépendance aux GPU locaux. |
| Le backend CrewAI appelle-t-il un modèle local ? | **Non.** Il appelle `api.hypercli.com/v1` avec le modèle `kimi-k2.6`. |
| Les GPU servent-ils à des jobs offline ? | **Non.** Ils servent l'inférence Hedge (vLLM) et génération image (ComfyUI/InvokeAI). Pas de batch offline. |
| Des agents peuvent-ils déléguer à ces GPU ? | **Non — aucune route API, aucune file de jobs.** Il n'existe pas d'endpoint MySwarms/Automobile → GPU local. |
| Y a-t-il une file de jobs ? | **Non.** Pas de queue, pas de worker pattern, pas de Celery/BullMQ/RQ. |

**Conclusion** : les GPU locaux sont actuellement un asset **Hedge** (inférence LLM trading) + **image generation** (ComfyUI/InvokeAI). Ils sont **invisibles** depuis MySwarms et Automobile.

---

### 5. Usages possibles pour Automobile

#### Maintenant (raisonnable, peu de risque)

| Usage | Valeur | Effort | Contrainte |
|---|---|---|---|
| **Embeddings annonces en batch** — vectoriser les titres/descriptions AutoScout24 via `vllm-embeddings` (nomic-embed, GPU2 port libre) | Dédup sémantique robuste (cosine), clustering de modèles, détection doublons cross-pays | Faible : appel HTTP direct, pas de training | GPU2 saturé — utiliser uniquement la nuit ou sur GPU1 GPU2 (57% VRAM libre) |
| **Ranking offline des opportunités** — scorer chaque annonce (prix vs cote, km, age) via un modèle local léger | Tri prédictif sans appel cloud | Moyen : besoin d'un scoring script simple | Pas de dataset labellisé → scoring heuristique d'abord |

#### Plus tard (dès que données suffisantes)

| Usage | Valeur | Quand |
|---|---|---|
| **Classification auto** — modèle de tags (carrosserie, usage, état) sur descriptions texte | Filtrage avancé dans le cockpit | Dès ~500 annonces analysées |
| **Modèle de prix** — régression sur prix/km/age/marque | Cote automatique sans APM | Dès dataset ~1000 véhicules |
| **Dédup visuel photos** — embedding CLIP sur photos annonces | Détecter mêmes véhicules cross-sites | Infrastructure image non encore câblée |
| **Fine-tuning petit modèle VO** (ex. Qwen 7B sur corpus annonces FR) | Spécialisation domaine, réponses plus précises | Trop tôt — besoin dataset labelisé qualité |

#### Inutile / trop tôt

- Fine-tuning lourd (32B) — aucun dataset, ROI nul maintenant
- OCR documents (factures, CT) — hors scope produit actuel
- Prédiction risque sinistre — données indisponibles
- Training LoRA — même raison (pas de données labelisées)

**Première utilisation raisonnable : batch embeddings la nuit sur GPU1 GPU2 (seul GPU non saturé) pour dédup sémantique des annonces AutoScout24.**

---

### 6. Risques

| Risque | Niveau | Détail |
|---|---|---|
| **OOM GPU2** | Élevé | Tous les 4 GPU > 93% VRAM. Toute charge supplémentaire = OOM ou ralentissement InvokeAI/vLLM Hedge |
| **Redis 0.0.0.0 non authentifié** | Élevé | `hearst-redis` et `openclaw-redis` écoutent sur toutes interfaces — risque LAN ouvert |
| **InvokeAI sans auth** | Moyen | `invoke.hearst.app` exposé publiquement sans auth native (Cloudflare Access non confirmé actif) |
| **Pas de monitoring ML** | Moyen | Aucun job GPU n'est monitoré (pas de Prometheus GPU metrics, pas d'alerte OOM) |
| **Tunnel orphelin GPU1** | Faible | Container `hearst-tunnel` tourne avec token d'un tunnel Cloudflare supprimé |
| **Coût électrique** | À surveiller | 8× RTX 4090 ≈ 3200W TDP. Pas de coût cloud mais coût kWh réel non mesuré |
| **Données annonces scraping** | Réglementaire | Conformité CGU AutoScout24 pour usage ML des données — à vérifier avant batch massif |
| **Fausse promesse training** | Opérationnel | Le GPU est là, mais sans dataset structuré le fine-tuning n'apporte rien. Risque de temps perdu. |

---

### 7. Recommandation

**Ne rien faire maintenant côté GPU pour Automobile.** Les priorités restent A (sécuriser le sourcing) et B (VehicleDecision). Les GPU sont saturés et non câblés à la Swarm Platform.

**Séquence recommandée :**
1. **Court terme** : terminer A+B sans GPU. Accumuler les annonces analysées (~200+).
2. **Moyen terme** : ajouter un endpoint `/api/automobile/embed` (appel nocturne vers `vllm-embeddings` GPU1 port 8002) pour dédup sémantique. Budget VRAM : ~2 GB, faisable sur GPU1 GPU2 (57% libre).
3. **Long terme** (si dataset > 500 véhicules décidés) : envisager un scoring model léger, pas de fine-tuning lourd.

> Inventaire technique complet : [docs/GPU_TRAINING_INVENTORY.md](GPU_TRAINING_INVENTORY.md)

---

*Fin du reset. Aucun code, table, migration, scraper, job GPU ou API n'a été touché — plan produit uniquement.*
