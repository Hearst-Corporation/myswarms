# AUTOMOTIVE_SOURCING_SPEC.md
**Version** 1.0 — 2026-06-01
**Statut** : Prêt pour implémentation
**Auteur** : Synthèse architecturale multi-agents
**Cible** : Développeur implémentant les features la semaine du 2026-06-08

---

## 1. Résumé exécutif

La plateforme Swarm dispose d'un template APM Vehicle Research fonctionnel end-to-end : l'utilisateur remplit 9 champs manuellement, un crew de 3 agents CrewAI produit un rapport structuré (Data Collector → Risk Analyst → Decision Writer) avec une recommandation finale APPELER / ATTENDRE / ÉVITER. Ce pipeline est validé, mais le workflow amont — trouver et qualifier des véhicules candidats avant de lancer l'analyse — est entièrement manuel et non intégré à la plateforme.

Le problème concret : un acheteur en recherche active consulte 20 à 50 annonces par semaine sur AutoScout24, Mobile.de, et LeBonCoin. Pour chaque annonce intéressante, il doit copier-coller 9 champs dans le formulaire APM. L'historique de ses analyses n'affiche que des UUIDs et timestamps — il ne peut pas identifier quel véhicule correspond à quelle analyse sans cliquer dans chaque rapport. Il n'y a aucune protection contre la double-analyse d'une même annonce (coût : ~$0.039/run). Le signal le plus utile — la recommandation APPELER/ATTENDRE/ÉVITER — n'est pas visible dans la liste des runs.

La solution se décompose en trois chantiers ordonnés. **Chantier 1 (V1, cette semaine)** : améliorer radicalement l'ergonomie du workflow manuel existant — URL comme entrée primaire avec extraction automatique des champs, historique lisible avec label véhicule + badge recommandation, garde-fou anti-doublon. **Chantier 2 (V1.1, semaine suivante)** : introduire la table `vehicle_candidates` et un connecteur VIN API (AutoDNA, self-serve, $1–$3/check) qui transforme l'output du Risk Analyst de générique à factuel. **Chantier 3 (V2, milestone suivant)** : scraper planifié + watchlists + batch Discovery — uniquement après que la base légale et le partenariat B2B sont sécurisés.

Le scope V1 est délibérément limité. Pas de scraper automatique, pas de partnerships B2B, pas de nouvelles tables en base. L'objectif est de rendre le workflow manuel 10× moins pénible en 3–5 jours de développement, puis d'ajouter de la valeur couche par couche. Le hors-scope V1 inclut : scraping automatique de marketplace (risque légal P0), bulk import CSV, notifications email/push, interface team/org, et tout nouveau template CrewAI.

---

## 2. Modes de sourcing

### Tableau comparatif

| Mode | Description | Effort dev | Coût par véhicule | Légalité | Richesse data | V1 ? |
|---|---|---|---|---|---|---|
| **Manuel — formulaire** | Utilisateur saisit 9 champs | 0 (existe) | $0.039 LLM only | ✅ Parfaitement légal | Dépend de l'utilisateur | ✅ Déjà live |
| **Manuel — URL first** | URL → extraction LLM → formulaire pré-rempli | 3 jours | $0.039 + $0.001 extraction | ✅ Légal (fetch one URL) | Haute si AS24/Mobile.de | ✅ **Chantier 1** |
| **Scraper planifié** | Cron → scrape marketplace → candidates | 2–3 semaines | $0.039 + infra proxy | ⚠️ **P0 légal** — ToS violation | Très haute | ❌ V2 seulement |
| **API connector — VIN** | AutoDNA REST self-serve | 2 jours | $0.039 + $1–3 VIN | ✅ API contractuelle | Haute (history factuel) | ✅ **Chantier 2** |
| **API connector — Valuation** | EurotaxGlass / L'Argus B2B | 3 sem. (partenariat) | $0.039 + $0.50–1 cote | ✅ API contractuelle | Très haute (prix marché live) | ❌ V1.1 (démarrer démarches) |
| **API connector — AS24 Partner** | AutoScout24 Dealer API B2B | 4–8 sem. (partenariat) | $0.039 + abonnement | ✅ API contractuelle | Maximale | ❌ V2 |
| **Batch import** | CSV/Excel upload multi-véhicules | 1 semaine | $0.039 × N | ✅ Légal | Dépend de la source | ❌ V2 |

### Décision de mode par phase

```
V1 (semaine 1–2) :  Manuel URL-first + VIN API optionnel
V1.1 (semaine 3) :  vehicle_candidates table + VIN API bindé au Risk Analyst
V1.2 (mois 2) :    EurotaxGlass/L'Argus (si partenariat signé)
V2 (mois 3+) :     Scraper planifié UNIQUEMENT après legal clearance + B2B feed
```

**Règle absolue** : aucun scraping automatique de marketplace (AutoScout24, Mobile.de, LeBonCoin) avant validation juridique écrite. Le risque GDPR (PII vendeurs) et ToS crée une exposition légale P0 qui peut tuer le projet.

---

## 3. VehicleCandidate — contrat de données

### 3.1 Définition de l'objet

```typescript
// src/types/vehicle-candidate.ts

export type VehicleFuel =
  | 'essence' | 'diesel' | 'hybride' | 'électrique' | 'gpl' | 'autre';

export type VehicleSourceType =
  | 'manual' | 'scraper' | 'api' | 'import';

export type VehicleStatus =
  | 'new' | 'shortlisted' | 'researched' | 'ignored' | 'error';

export interface PriceTick {
  price_eur: number;
  observed_at: string;   // ISO 8601
  source: string;        // 'autoscout24' | 'manual' | …
}

export interface VehicleCandidate {
  // Identité
  id: string;                              // UUID v4
  owner_id: string;                        // UUID — ancre RLS
  org_id: string | null;                   // UUID — nullable, for future team use

  // Provenance
  source_type: VehicleSourceType;
  source_name: string;                     // 'autoscout24' | 'mobile.de' | 'leboncoin' | 'manual'
  source_url: string | null;               // URL canonique — clé de dédup par owner
  raw_payload: Record<string, unknown> | null;  // JSONB < 2KB, PII strippé

  // Champs véhicule
  make: string;                            // 'BMW', 'Toyota' …
  model: string;                           // '330d', 'Yaris' …
  year: number;                            // 2019
  mileage_km: number | null;
  fuel: VehicleFuel;
  price_eur: number | null;
  country: string;                         // ISO 3166-1 alpha-2 : 'FR', 'DE', 'BE'
  image_url: string | null;               // URL image principale (pas de binaire en DB)
  vin: string | null;                      // Optionnel — débloque VIN API

  // Historique prix
  price_history: PriceTick[];             // JSONB append-only

  // Lifecycle
  status: VehicleStatus;
  linked_run_id: string | null;           // → swarm_runs.id (run le plus récent)
  discovered_at: string;                   // ISO 8601
  last_seen_at: string;                   // Dernière vérification (freshness)
  created_at: string;
  updated_at: string;

  // Utilisateur
  notes: string | null;
  tags: string[] | null;
}
```

### 3.2 Machine à états

```
                 ┌──────────────────────────────────────────────┐
                 │                                              │
         new ────┼──→ shortlisted ────→ researched             │
         new ────┼──→ ignored                                   │
                 │                                              │
         * ──────┼─────────────────────────────────→ error      │
                 │                                              │
    error ───────┼──→ new (retry manuel)                       │
                 └──────────────────────────────────────────────┘
```

| Transition | Déclencheur | Mécanisme |
|---|---|---|
| `new → shortlisted` | Utilisateur clique "Shortlist" | `PATCH /api/candidates/:id { status: 'shortlisted' }` |
| `new → ignored` | Utilisateur clique "Ignorer" | `PATCH /api/candidates/:id { status: 'ignored' }` |
| `shortlisted → researched` | Run APM complété avec succès | Callback CrewAI engine → met à jour `status` + `linked_run_id` |
| `shortlisted → ignored` | Utilisateur change d'avis | `PATCH` via UI |
| `* → error` | Scraper 4xx / APM run fail / validation ko | Handler d'erreur moteur ou route Next.js |
| `error → new` | Retry manuel ou données corrigées | `PATCH { status: 'new' }` |

**Invariant** : `researched` est terminal. Re-lancer une analyse sur un candidat déjà `researched` crée un nouveau `swarm_run` et met à jour `linked_run_id`, sans rétrograder le statut. L'historique des runs antérieurs reste accessible via `swarm_runs` WHERE `inputs_json ->> 'candidate_id' = :id`.

### 3.3 SQL — Migration `0010_vehicle_candidates`

```sql
-- migration: 0010_vehicle_candidates
-- À appliquer via mcp__supabase__apply_migration

CREATE TYPE vehicle_fuel AS ENUM (
  'essence', 'diesel', 'hybride', 'électrique', 'gpl', 'autre'
);

CREATE TYPE vehicle_source_type AS ENUM (
  'manual', 'scraper', 'api', 'import'
);

CREATE TYPE vehicle_status AS ENUM (
  'new', 'shortlisted', 'researched', 'ignored', 'error'
);

CREATE TABLE vehicle_candidates (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID          NULL,    -- nullable, pour future multi-tenant

  -- Provenance
  source_type     vehicle_source_type NOT NULL DEFAULT 'manual',
  source_name     TEXT          NOT NULL DEFAULT 'manual',
  source_url      TEXT,
  raw_payload     JSONB,        -- < 2KB, PII strippé avant insert

  -- Véhicule
  make            TEXT          NOT NULL,
  model           TEXT          NOT NULL,
  year            SMALLINT      NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  mileage_km      INTEGER       CHECK (mileage_km >= 0),
  fuel            vehicle_fuel  NOT NULL DEFAULT 'essence',
  price_eur       NUMERIC(10,2) CHECK (price_eur >= 0),
  country         CHAR(2)       NOT NULL DEFAULT 'FR',
  image_url       TEXT,
  vin             TEXT,

  -- Historique prix
  price_history   JSONB         NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle
  status          vehicle_status NOT NULL DEFAULT 'new',
  linked_run_id   UUID          REFERENCES swarm_runs(id) ON DELETE SET NULL,
  discovered_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Utilisateur
  notes           TEXT,
  tags            TEXT[]
);

-- Dédup principal : un owner ne peut avoir le même source_url deux fois
CREATE UNIQUE INDEX idx_vc_source_url_owner
  ON vehicle_candidates (owner_id, source_url)
  WHERE source_url IS NOT NULL;

-- Dédup contenu : pour les saisies manuelles sans URL
CREATE UNIQUE INDEX idx_vc_content_dedup
  ON vehicle_candidates (owner_id, source_name, make, model, year, mileage_km, price_eur)
  WHERE source_url IS NULL;

-- Query principale : lister les candidats d'un owner par statut
CREATE INDEX idx_vc_owner_status
  ON vehicle_candidates (owner_id, status, created_at DESC);

-- updated_at auto
CREATE TRIGGER trg_vc_updated_at
  BEFORE UPDATE ON vehicle_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE vehicle_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vc_select_own"
  ON vehicle_candidates FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (org_id IS NOT NULL AND org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "vc_write_own"
  ON vehicle_candidates FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

**Note sur l'upsert prix** : quand le scraper détecte un changement de prix sur un candidat existant, utiliser ce pattern :

```sql
INSERT INTO vehicle_candidates (owner_id, source_url, price_eur, price_history, …)
VALUES (…)
ON CONFLICT (owner_id, source_url)
WHERE source_url IS NOT NULL
DO UPDATE SET
  price_eur     = EXCLUDED.price_eur,
  price_history = vehicle_candidates.price_history ||
                  jsonb_build_object(
                    'price_eur',   vehicle_candidates.price_eur,
                    'observed_at', now(),
                    'source',      EXCLUDED.source_name
                  )::jsonb,
  last_seen_at  = now(),
  updated_at    = now()
WHERE vehicle_candidates.price_eur IS DISTINCT FROM EXCLUDED.price_eur;
```

---

## 4. Workflow — sourcing manuel

### 4.1 Séquence URL-first (mode principal V1)

```
Utilisateur                     Next.js (Vercel)              Railway (CrewAI)
────────────                    ─────────────────             ───────────────
Paste URL AS24/Mobile.de
       │
       ▼
POST /api/swarms/apm/extract
  { url: string }
       │
       ├─ Validation domaine (allowlist)
       ├─ Rate-limit check (10 req/min/owner)
       ├─ Fetch HTML (undici, timeout 5s, redirect: manual)
       ├─ Parse JSON-LD (@type: Car) ou __NEXT_DATA__
       │    └─ Si succès → skip LLM
       ├─ Sinon → Kimi K2.6 extraction
       │    prompt: "Extract vehicle fields as JSON from HTML"
       │    schema: { make, model, year, mileage_km, fuel, price_eur, country, notes }
       │    ~800 tokens, latency 1.5–3s
       │
       ▼
{ fields: {...}, confidence: 'high'|'medium'|'low', missing: string[] }
       │
       ▼
Formulaire SwarmInputForm
pré-rempli avec defaultValues
  - Champs manquants : bordure amber
  - Champs extraits : readonly avec badge "auto"
  - Notes : pré-rempli depuis description listing
  - VIN : champ optionnel ajouté
       │
Utilisateur corrige/complète
Utilisateur clique "Analyser ce véhicule"
       │
       ▼
AlertDialog (garde-fou existant)
  "Cette analyse consomme ~€0.10 en tokens. Action irréversible."
  + vérification doublon : "Ce véhicule a été analysé le [date]. Voir le rapport ou relancer ?"
       │
Si doublon trouvé → afficher 2 CTA : [Voir rapport] [Analyser quand même]
Si nouveau →
       │
       ▼
Server Action triggerKickoffWithInputs
  - Compute SHA-256(source_url.trim().toLowerCase()) → input_hash
  - Vérifier swarm_runs WHERE input_hash = ? AND started_at > now()-7d
  - Si run pending/running → bloquer (lien vers run live)
  - Si run completed → soft-block avec "Run anyway" explicite
  - Sinon → swarmsClient.kickoff(id, { inputs, input_hash }, ownerId)
       │
       ▼                                RunTimeline ←────────────────────
                              CrewAI Engine lance le crew APM
                              Data Collector → Risk Analyst → Decision Writer
                              (avec VIN check si vin présent et AUTODNA_API_KEY configuré)
```

### 4.2 Dégradation de l'extraction

| Cas | Comportement |
|---|---|
| Succès JSON-LD complet | Formulaire pré-rempli, badge "auto" sur chaque champ, 0 LLM appelé |
| Succès partiel (5+/9 champs) | Formulaire pré-rempli, champs manquants en amber, LLM utilisé |
| Echec total (CAPTCHA, domaine non supporté, 4xx) | Formulaire vide avec `source_url` pré-rempli, banner informatif "Extraction impossible — saisie manuelle" |
| Timeout > 8s | Fallback immédiat vers formulaire vide + URL, pas de spinner indéfini |

**Le formulaire n'est jamais remplacé par l'extraction** — il est toujours l'étape de confirmation finale avant de consommer des tokens.

### 4.3 Domains allowlist (SSRF mitigation)

```typescript
// src/lib/automotive/extract/allowlist.ts
export const ALLOWED_DOMAINS = [
  /^https?:\/\/(?:www\.)?autoscout24\.(fr|de|it|es|nl|be|at|pl)(\/.*)?$/,
  /^https?:\/\/(?:www\.)?mobile\.de(\/.*)?$/,
  /^https?:\/\/(?:www\.)?leboncoin\.fr(\/.*)?$/,
  /^https?:\/\/(?:www\.)?la-centrale\.fr(\/.*)?$/,
  /^https?:\/\/(?:www\.)?autotrader\.co\.uk(\/.*)?$/,
  /^https?:\/\/(?:www\.)?occasion\.be(\/.*)?$/,
] as const;

export function isAllowedUrl(url: string): boolean {
  return ALLOWED_DOMAINS.some(pattern => pattern.test(url));
}
```

---

## 5. Workflow — scraper planifié

**⚠️ Ce workflow est hors-scope V1. Ne pas implémenter avant legal clearance.** Cette section documente l'architecture cible pour V2.

### 5.1 Prérequis avant activation

- [ ] Validation juridique écrite (avocat spécialisé RGPD + droit du numérique)
- [ ] Partenariat B2B signé avec au moins une source (AutoScout24 Partner API préféré)
- [ ] Politique RGPD documentée : quelles données PII sont collectées, durée de rétention, base légale
- [ ] Proxy résidentiel configuré (Bright Data ou Oxylabs, ~$15/GB)
- [ ] Browserbase account configuré pour fallback JS

### 5.2 Séquence complète

```
APScheduler (Railway)
  07:00 CET → ScrapingOrchestrator.run(mode="full")
  19:00 CET → ScrapingOrchestrator.run(mode="delta", max_age_hours=12)
       │
       ▼
1. Charger watchlists actives depuis Supabase
   SELECT * FROM user_watchlists WHERE active = true

2. Pour chaque source (AS24, Mobile.de, LBC) :
   a. HTTP direct (headers rotation, Accept-Language par marché)
   b. Si Cloudflare 403 → Browserbase fallback
   c. Parser JSON-LD / __NEXT_DATA__ / API mobile app
   d. Layer 1 filter (règles hard : price 1k–80k€, year≥2010, mileage<300k)
   e. Strip PII (téléphone, email, adresse vendeur)
   f. Upsert vehicle_listings (NEW/KNOWN/UPDATED/DISAPPEARED)

3. Reconciliation état listings :
   NEW        → insérer, status='new'
   KNOWN      → update last_seen_at seulement
   UPDATED    → update price_eur + append price_history
   DISAPPEARED → set disappeared_at = now()

4. Watchlist matching (Layer 2 — SQL pur, $0)
   JOIN user_watchlists sur make/model/price/mileage/country
   → candidates qualifiés

5. Embedding scoring (Layer 3 — ~$0.00012/listing)
   qwen3-embedding-4b sur résumé textuel
   cosine_similarity vs vecteur préférence utilisateur
   threshold: 0.75

6. Price anomaly detection (Layer 4 — $0)
   z-score vs bucket marché (make, model, year±2, country)
   threshold: z < -1.5 → flag is_price_anomaly

7. Discovery Batch run (~$0.015)
   1 agent, 20 candidats max par batch
   Output: tableau markdown rankant les candidats

8. Pour top-N candidats (dans budget daily cap) :
   → Trigger APM Research run standard ($0.039/run)
   → Update vehicle_candidates.status = 'shortlisted' → 'researched'

9. Notify utilisateur (email via Resend + badge dans UI)
```

### 5.3 Filtres appliqués au scrape time

```python
# services/crewai-engine/src/scrapers/filters.py
SCRAPE_FILTERS = {
    "price_eur":         {"min": 1_000,   "max": 80_000},
    "year":              {"min": 2010},
    "mileage_km":        {"max": 300_000},
    "fuel":              ["diesel", "essence", "hybride", "électrique"],
    "listing_age_days":  30,
    "has_price":         True,
    "has_mileage":       True,
}
# Les filtres user (watchlist) raffinent davantage via SQL JOIN
```

### 5.4 Architecture scheduler

```python
# services/crewai-engine/src/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

scheduler = AsyncIOScheduler(
    jobstores={"default": SQLAlchemyJobStore(
        url=os.getenv("DATABASE_URL"),
        tablename="apscheduler_jobs"
    )},
    timezone="Europe/Berlin"
)

scheduler.add_job(run_discovery_crawl, "cron",
    hour=7, minute=0, id="morning_discovery",
    kwargs={"mode": "full"}, replace_existing=True)

scheduler.add_job(run_discovery_crawl, "cron",
    hour=19, minute=0, id="evening_delta",
    kwargs={"mode": "delta", "max_age_hours": 12}, replace_existing=True)
```

**Pourquoi APScheduler et pas Inngest ou Railway native cron ?**
APScheduler est déjà présent dans le moteur, tourne in-process (état persisté en Supabase via SQLAlchemy jobstore), est timezone-aware. Inngest est adapté aux workflows event-driven, pas aux crons stateful. Railway native cron spawne un nouveau process par tick — pas de persistence d'état.

---

## 6. Workflow — API connector

### 6.1 VIN History Check (Priority 1 — V1 chantier 2)

**Provider recommandé** : AutoDNA (autodna.com/api) — self-serve, signup immédiat, €1–3/check, couverture EU.
**Fallback** : carVertical — même self-serve, €0.50–2/check, couverture similaire.

```
Séquence dans le crew APM :

Data Collector agent
  ├─ Collecte make/model/year/mileage/price (existant)
  └─ Passe le VIN au Risk Analyst si présent

Risk Analyst agent
  ├─ [Si vin présent] → call VIN History Tool
  │    POST https://autodna.com/api/v1/vin/{vin}
  │    Headers: Authorization: Bearer {AUTODNA_API_KEY}
  │    Response: { accidents: [], mileage_history: [], stolen: bool,
  │               owners_count: int, inspections: [] }
  ├─ Consomme l'historique comme contexte factuel
  └─ Output risks[] basé sur données réelles (vs probabilistiques)
```

**Tool CrewAI** (`services/crewai-engine/src/tools/vin_history.py`) :

```python
from crewai.tools import BaseTool
import httpx
import os

class VinHistoryTool(BaseTool):
    name: str = "VIN History Check"
    description: str = (
        "Retrieves the complete history of a vehicle from its VIN number: "
        "accident records, mileage history, stolen flag, owner count, technical inspections."
    )

    def _run(self, vin: str) -> str:
        api_key = os.getenv("AUTODNA_API_KEY")
        if not api_key:
            return "VIN check unavailable — AUTODNA_API_KEY not configured."

        try:
            with httpx.Client(timeout=8.0) as client:
                r = client.get(
                    f"https://autodna.com/api/v1/vin/{vin.strip().upper()}",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
            r.raise_for_status()
            data = r.json()
            # Format for LLM consumption
            return _format_vin_history(data)
        except httpx.TimeoutException:
            return "VIN check timeout — proceeding without history data."
        except httpx.HTTPStatusError as e:
            return f"VIN check error {e.response.status_code} — proceeding without."
```

**Coût par run avec VIN** : $0.039 LLM + $1.65 AutoDNA ≈ **$1.69/run**. Décision UX : afficher le coût estimé dans la confirmation dialog ("~€1.60 incluant vérification VIN").

### 6.2 Valuation API (Priority 2 — V1.1, démarcher maintenant)

**Provider recommandé** : EurotaxGlass (EU-wide), L'Argus PRO si focus France.

**Action immédiate** : démarrer la demande de partenariat cette semaine même si le code attend 3–4 semaines.

```
Data Collector agent
  ├─ [Si EurotaxGlass configuré] → call ValuationTool
  │    Inputs: make, model, year, mileage_km, fuel, country
  │    Output: { market_value_eur, trade_in_eur, retail_eur }
  └─ Cite la valorisation live dans price_assessment
       "Prix demandé €14,500 vs cote Eurotax €16,200 (trade-in €13,100)
        → 10% sous la cote retail, bonne affaire si état correct."
```

### 6.3 AutoScout24 Partner API (Priority 3 — V2)

Dès qu'un partenariat est signé, le formulaire APM devient optionnel pour les URLs AS24 :

```
URL AS24 → resolve via AS24 Partner API (structured JSON)
         → pré-remplissage 100% fiable sans extraction LLM
         → 0 friction pour l'utilisateur
```

C'est le saut UX le plus visible mais le plus long à obtenir (négociation B2B, 4–8 semaines).

---

## 7. UI dans la plateforme Swarm

### 7.1 Recommandation V1

**Option D — Vehicle Discovery template + runs-only Research form, zéro migration DB.**

```
V1 Today:
  /swarms/[apm-vehicle-research]
    └─ SwarmInputForm amélioré :
         - URL field en première position (promoted)
         - Extraction automatique via /api/swarms/apm/extract
         - Formulaire pré-rempli avec defaultValues
         - Champ VIN optionnel ajouté
         - AlertDialog avec check doublon intégré

  Run list (SwarmDetailPage) :
    └─ Colonne UUID remplacée par label véhicule
         "2019 BMW 330d — 14 500€"
         UUID affiché en texte mono secondaire en dessous
    └─ Badge recommandation (APPELER/ATTENDRE/ÉVITER) extrait du result_text par regex
    └─ Source URL → icône lien externe
```

Coût dev : 3–4 jours, zéro migration DB, zéro nouveau composant majeur.

### 7.2 Recommandation V2

**Option B — Route `/automotive/candidates` après migration `0010_vehicle_candidates`.**

```
/automotive
  /candidates                  — liste filtrée par statut + make + source
  /candidates/[id]             — détail : price history chart, timeline runs liés, notes
  /candidates/[id]/research    — lance APM Research bindé au candidat
  /discovery                   — formulaire critères recherche → Discovery Batch run
  /watchlists                  — configure les critères auto (V2 scraper seulement)
```

**Composant liste candidats** (réutilise le pattern SwarmList existant) :

```
┌─────────────────────────────────────────────────────────────────┐
│  CANDIDATS VÉHICULES         [+ Nouveau]  [Filtrer ▾]          │
├─────────────────────────────────────────────────────────────────┤
│  🟢 2019 BMW 330d — 14 500€ — 89 000km — DE                   │
│     AutoScout24 · new · ajouté 01/06 · [Analyser] [Ignorer]    │
├─────────────────────────────────────────────────────────────────┤
│  🟡 2020 Toyota Yaris — 9 200€ — 62 000km — FR                │
│     Manuel · shortlisted · 29/05 · [Voir analyse en cours]     │
├─────────────────────────────────────────────────────────────────┤
│  ✅ 2018 VW Golf — 11 800€ — 105 000km — BE                   │
│     Mobile.de · researched · 28/05 · APPELER — [Voir rapport]  │
└─────────────────────────────────────────────────────────────────┘
```

**Bouton "Analyser" sur candidat** (`/automotive/candidates/[id]/research`) :
1. `GET /api/automotive/candidates/:id` → lire les champs
2. Mapper vers APM Research inputs (1:1)
3. `POST /api/crews/chief-of-staff/kickoff` avec les inputs
4. `PATCH /api/automotive/candidates/:id { status: 'shortlisted', linked_run_id: runId }`
5. Rediriger vers RunTimeline

### 7.3 Améliorations immédiates à SwarmDetailPage (V1, sans migration)

```typescript
// src/components/swarms/SwarmRunsTable.tsx

// Aujourd'hui :
<td>{run.id.substring(0, 8)}…</td>

// Après V1 :
<td>
  <div className="font-medium">
    {getVehicleLabel(run.inputs_json)}   // "2019 BMW 330d"
  </div>
  <div className="text-xs text-muted-foreground font-mono">
    {run.id.substring(0, 8)}…
  </div>
</td>
<td>
  <RecommendationBadge result={run.result_text} />  // APPELER / ATTENDRE / ÉVITER
</td>
<td>
  {run.inputs_json?.price_eur && (
    <span>{formatPrice(run.inputs_json.price_eur)}</span>
  )}
</td>
<td>
  {run.inputs_json?.source_url && (
    <a href={run.inputs_json.source_url} target="_blank">
      <ExternalLinkIcon />
    </a>
  )}
</td>
```

```typescript
// src/lib/automotive/recommendation.ts
const RECOMMENDATION_REGEX = /\*\*(APPELER|ATTENDRE|ÉVITER)\*\*/;

export function extractRecommendation(resultText: string | null):
    'APPELER' | 'ATTENDRE' | 'ÉVITER' | null {
  if (!resultText) return null;
  const match = resultText.match(RECOMMENDATION_REGEX);
  return match ? match[1] as any : null;
}

// Extend SwarmRunSummarySchema
inputs_json: z.record(z.string(), z.unknown()).optional(),
result_text_preview: z.string().optional(),  // premiers 500 chars pour regex
```

---

## 8. Coûts et garde-fous

### 8.1 Tableau des coûts par mode

| Opération | Tokens/coût unitaire | 10/jour | 100/jour | 500/jour |
|---|---|---|---|---|
| APM Research run (Kimi K2.6) | ~3.5K in + ~15K out ≈ $0.039 | $0.39 | $3.90 | $19.50 |
| Extraction URL (LLM path) | ~800 in + ~200 out ≈ $0.001 | $0.01 | $0.10 | $0.50 |
| VIN AutoDNA | €1–3 par check | €10–30 | €100–300 | €500–1500 |
| Embedding scoring | ~200 in ≈ $0.00012 | — | $0.01 | $0.06 |
| EurotaxGlass (si signé) | ~$0.50–1 par cote | $5–10 | $50–100 | $250–500 |
| Discovery Batch run | ~$0.015 | $0.15 | $1.50 | $7.50 |
| **Total sans VIN** | | **$0.55/j** | **$5.50/j** | **$27.50/j** |
| **Total avec VIN (€2 moy.)** | | **€20–30/j** | **€200–300/j** | **indésirable** |

**Conclusion** : sans scraper automatique, les coûts sont maîtrisables à usage individuel. Le VIN check change radicalement l'économie — ne l'activer que pour les candidats `shortlisted` (pas `new`), et uniquement sur confirmation explicite avec le coût affiché.

### 8.2 Garde-fous techniques

**G1 — Cap journalier par owner** (P0, Sprint 1) :

```typescript
// src/app/api/crews/chief-of-staff/kickoff/route.ts
const DAILY_RUN_LIMITS = {
  free: 5,
  premium: 50,
  admin: Infinity,
} as const;

const todayCount = await getRunCountToday(ownerId);
const limit = DAILY_RUN_LIMITS[userRole];
if (todayCount >= limit) {
  return NextResponse.json(
    { error: 'daily_limit_exceeded', limit, reset_at: tomorrowMidnight() },
    { status: 429 }
  );
}
```

**G2 — Déduplication soft-block** (P0, Sprint 1) :

```typescript
// Dans triggerKickoffWithInputs Server Action
const inputHash = inputs.source_url
  ? createHash('sha256').update(inputs.source_url.trim().toLowerCase()).digest('hex')
  : null;

if (inputHash && !forceRerun) {
  const existing = await findRecentRunByHash(swarmId, inputHash, ownerId);
  if (existing?.status === 'running' || existing?.status === 'pending') {
    return { duplicateRunId: existing.id, duplicateStatus: existing.status };
  }
  if (existing?.status === 'completed') {
    return {
      duplicateRunId: existing.id,
      duplicateStartedAt: existing.started_at,
      recommendation: extractRecommendation(existing.result_text)
    };
  }
}
```

Migration requise :

```sql
-- Dans 0021_swarm_runs_input_hash.sql
ALTER TABLE swarm_runs ADD COLUMN input_hash TEXT;
CREATE INDEX idx_swarm_runs_hash
  ON swarm_runs (swarm_id, input_hash)
  WHERE input_hash IS NOT NULL;
```

**G3 — Confirmation gate avec coût affiché** (P1) :

Modifier l'AlertDialog existant pour afficher le coût estimé dynamiquement :

```
"Lancer l'analyse de 2019 BMW 330d ?"
"Coût estimé : ~€0.04 (analyse seule) / ~€1.60 (avec vérification VIN)"
"Cette action est irréversible."
[Annuler]  [Analyser — ~€0.04]
```

**G4 — Rate limit extraction endpoint** (P1) :

```typescript
// src/app/api/swarms/apm/extract/route.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'apm:extract',
});

const { success } = await ratelimit.limit(ownerId);
if (!success) return NextResponse.json({ error: 'rate_limit' }, { status: 429 });
```

**G5 — raw_payload < 2KB** (P1) :

```python
# services/crewai-engine/src/scrapers/base.py
MAX_RAW_PAYLOAD_BYTES = 2048

def sanitize_raw_payload(payload: dict) -> dict:
    """Retirer les champs gros (description complète, images array, html brut)
    et tronquer à 2KB max."""
    # Champs à exclure systématiquement
    EXCLUDE_KEYS = {'description', 'images', 'raw_html', 'seller_phone', 'seller_email'}
    filtered = {k: v for k, v in payload.items() if k not in EXCLUDE_KEYS}

    import json
    payload_str = json.dumps(filtered, ensure_ascii=False)
    if len(payload_str.encode()) > MAX_RAW_PAYLOAD_BYTES:
        return {"_truncated": True, "source_name": payload.get("source_name")}
    return filtered
```

**G6 — Quota API tiers** (P2) :

```json
// config_json du template APM Vehicle Research
{
  "max_api_calls_per_run": 3,
  "api_cost_ceiling_usd": 0.10,
  "tools": {
    "vin_history": { "enabled": true, "required": false },
    "valuation":   { "enabled": false, "required": false }
  }
}
```

**G7 — Stale listing warning** (P2) :

Si `vehicle_candidates.last_seen_at > 48h`, afficher dans la confirmation dialog :

```
"⚠️ Annonce non vérifiée depuis 48h — le véhicule peut être vendu ou le prix modifié."
```

---

## 9. Plan d'implémentation

### Phase 0 — Améliorations run list (0.5 jour, zéro migration)

**Dépendances** : aucune. **Risque** : minimal.

- [ ] Étendre `SwarmRunSummarySchema` : ajouter `inputs_json: z.record(z.string(), z.unknown()).optional()` et `result_text_preview: z.string().optional()`
- [ ] Mettre à jour `swarmsClient.listRuns` pour requêter ces colonnes
- [ ] `getVehicleLabel(inputs_json)` → `"${year} ${make} ${model}"`
- [ ] `extractRecommendation(result_text)` → regex sur `**APPELER|ATTENDRE|ÉVITER**`
- [ ] `<RecommendationBadge>` : vert/amber/rouge selon valeur
- [ ] Colonne prix + icône lien externe dans `SwarmRunsTable`

**Livrable** : liste de runs lisible avec identité véhicule + recommandation visible.

---

### Phase 1 — URL-first + extraction + déduplication (2–3 jours)

**Dépendances** : Phase 0 terminée. **Risque** : faible.

**Jour 1** :
- [ ] Migration `0021_swarm_runs_input_hash.sql` (colonne + index)
- [ ] `src/lib/automotive/extract/allowlist.ts` — domains autorisés
- [ ] `POST /api/swarms/apm/extract` route — fetch + JSON-LD parse + Kimi fallback
- [ ] Tests : AS24 réel, timeout simulation, domaine non autorisé

**Jour 2** :
- [ ] `SwarmInputForm` — URL field promu en position 1
- [ ] Logique pré-remplissage depuis extraction response (`defaultValues`)
- [ ] Champ VIN optionnel ajouté (position 9)
- [ ] UI dégradation : champs manquants en amber, badge "auto" sur extraits

**Jour 3** :
- [ ] Déduplication dans `triggerKickoffWithInputs` (hash SHA-256, query, soft-block)
- [ ] UI banner "Doublon détecté" avec 2 CTA : [Voir rapport] [Analyser quand même]
- [ ] `AlertDialog` — afficher coût estimé dynamiquement
- [ ] Rate limit `Ratelimit.slidingWindow(10, '1 m')` sur `/api/swarms/apm/extract`

**Livrable** : URL → auto-remplissage → review → Research run, sans doublon silencieux.

---

### Phase 2 — VIN History Tool (2 jours)

**Dépendances** : Phase 1 terminée + `AUTODNA_API_KEY` configuré. **Risque** : faible.

- [ ] `services/crewai-engine/src/tools/vin_history.py` — wrapper AutoDNA
- [ ] Binding Risk Analyst → VinHistoryTool dans `swarm_tool_bindings` (seed SQL)
- [ ] Mise à jour system prompt Risk Analyst pour consommer VIN history context
- [ ] `AUTODNA_API_KEY` dans Railway env + `.env.local`
- [ ] `config_json` APM template : `max_api_calls_per_run: 3`, `api_cost_ceiling_usd: 0.10`
- [ ] Test end-to-end avec un vrai VIN (BMW E46 immatriculé DE)

**Livrable** : rapport Risk Analyst cite des faits (accident PL 2022) plutôt que des probabilités.

---

### Phase 3 — vehicle_candidates table (1.5 jours)

**Dépendances** : Phases 1 et 2 terminées. **Risque** : moyen (migration + RLS).

- [ ] Migration `0010_vehicle_candidates` (SQL section 3.3)
- [ ] `mcp__supabase__generate_typescript_types` → mettre à jour `src/types/supabase.ts`
- [ ] Route `GET/POST /api/automotive/candidates`
- [ ] Route `PATCH /api/automotive/candidates/:id` (status transitions)
- [ ] Route `POST /api/automotive/candidates/:id/research` (kickoff bindé au candidat)
- [ ] Backfill depuis `swarm_runs.inputs_json` où `apm_type` pertinent

**Livrable** : table candidate opérationnelle, UI liste V2 activable.

---

### Phase 4 — Route /automotive/candidates (2 jours)

**Dépendances** : Phase 3 terminée.

- [ ] Route Next.js `/automotive/candidates` — liste avec filtres (statut, make, source)
- [ ] Composant `CandidateCard` avec boutons [Analyser] [Ignorer]
- [ ] Route `/automotive/candidates/[id]` — détail avec price history chart
- [ ] Bouton "Analyser" → kickoff APM + update status → redirect RunTimeline
- [ ] Callback CrewAI engine → update `status='researched'` + `linked_run_id` à run completion

---

### Phase 5 — Watchlists + scraper planifié (3–4 semaines, V2)

**Dépendances** : Phases 1–4 + legal clearance + B2B partenariat.

- [ ] Table `user_watchlists` (SQL selon section 5)
- [ ] UI Watchlist Manager (`/automotive/watchlists`)
- [ ] Scraper AutoScout24 (HTTP + Browserbase fallback)
- [ ] Scraper Mobile.de (API mobile app path)
- [ ] ScrapingOrchestrator avec 4 layers de filtrage
- [ ] APScheduler 07:00 + 19:00 CET
- [ ] Discovery Batch template CrewAI
- [ ] Notifications email via Resend

---

### Roadmap synthétique

```
Semaine 1 : Phase 0 + Phase 1 (URL-first + dédup + run list améliorée)
Semaine 2 : Phase 2 (VIN API) + démarche partenariat EurotaxGlass
Semaine 3 : Phase 3 (vehicle_candidates migration)
Semaine 4 : Phase 4 (route /automotive/candidates)
Mois 2+   : Phase 5 (scraper + watchlists) après legal clearance
```

---

## 10. Recommandation V1

**Premier chantier à lancer : Phase 0 + Phase 1 en parallèle — améliorations run list et URL-first workflow.**

La justification est simple : aujourd'hui, la plateforme est fonctionnelle mais peu utilisable. L'utilisateur ne peut pas identifier ses analyses dans la liste, il re-saisit manuellement 9 champs pour chaque annonce, et il n'y a aucune protection contre la double-analyse.

Les Phases 0 et 1 traitent exactement ces trois problèmes sans toucher au schéma de base de données (sauf la seule colonne `input_hash`). Elles ne créent aucune nouvelle dépendance. Elles peuvent être livrées en 3–4 jours.

Le VIN API (Phase 2) est le deuxième investissement le plus rentable — $1–3/check pour transformer radicalement la qualité du Risk Analyst — mais il requiert une clé API qui peut s'obtenir en 10 minutes sur autodna.com. Il peut démarrer en parallèle de la Phase 1.

**Ne pas commencer par** : la table `vehicle_candidates` (Phase 3) ni par le scraper (Phase 5). La valeur de la table `vehicle_candidates` n'est visible que quand l'utilisateur a plus de 10 candidats actifs simultanément — ce n'est pas le cas aujourd'hui. Le scraper est bloqué par le risque légal P0 et ne doit pas mobiliser de ressources avant que la clearance soit obtenue.

**Action concrète dans les 24 heures** :
1. Démarrer Phase 0 (30 minutes de code) — le run list avec labels véhicules est visible immédiatement
2. Ouvrir un compte AutoDNA developer sur autodna.com — 10 minutes
3. Démarrer la demande de partenariat EurotaxGlass — 30 minutes (formulaire web)

---

## 11. Questions ouvertes

Ces décisions ne sont pas tranchées dans le présent document et peuvent bloquer l'implémentation de certaines phases.

**Q1 — Legal clearance scraping** : Qui signe la validation juridique pour le scraping AutoScout24/Mobile.de avant Phase 5 ? Quel est le délai attendu ? Sans réponse, Phase 5 reste bloquée indéfiniment.

**Q2 — Partenariat EurotaxGlass vs L'Argus** : Le marché cible est-il principalement France ou pan-EU ? Cette décision détermine lequel des deux providers de valorisation prioriser (L'Argus = FR uniquement, EurotaxGlass = EU-wide mais plus cher).

**Q3 — VIN obligatoire ou optionnel dans le formulaire** : L'VIN est rarement connu par l'acheteur avant une inspection physique. Le rendre optionnel (comme proposé) est correct pour V1. Faut-il indiquer dans l'UI comment trouver le VIN sur une annonce ? Ou l'activer uniquement sur le candidat `shortlisted` après contact vendeur ?

**Q4 — Rollback price sur candidat `ignored`** : Si un véhicule ignoré baisse de prix > 15%, faut-il automatiquement le remettre en `new` ? Cela génère une notification — le comportement doit être opt-in par watchlist. Décision à prendre avant d'implémenter la réconciliation scraper.

**Q5 — Scope multi-utilisateur** : La colonne `org_id` est ajoutée nullable pour forward-compatibility. Mais la feature team réelle (partage de candidats entre collègues) est-elle dans le roadmap à 6 mois ? Si oui, la Phase 3 doit aussi créer la table `organizations` et `org_members`. Si non, `org_id` peut rester une colonne dormante.

**Q6 — Budget mensuel maximal par utilisateur** : Le cap journalier (Q1 : 5 runs/jour free, 50/jour premium) est proposé, mais il n'y a pas de cap mensuel absolu. Un utilisateur premium à 50 runs/jour × 30 jours = 1 500 runs × $0.039 = **$58.50/mois en LLM seul, plus VIN**. Est-ce acceptable ? Un cap mensuel (`max_research_runs_per_month`) doit-il être ajouté au schéma `user_roles` ?

**Q7 — Modèle de coût VIN visible utilisateur** : Le check VIN coûte €1–3 par appel et est visible dans l'estimation de la confirmation dialog. Mais qui paie ce coût concrètement ? Est-ce répercuté sur l'abonnement (forfait inclus), facturé à l'acte, ou absorbé par la plateforme ? Cette décision affecte l'UX de la Phase 2 et la configuration `max_api_calls_per_run`.

**Q8 — Période de rétention des données d'analyse** : `swarm_runs` et `vehicle_candidates` grossissent indéfiniment. Faut-il une politique de rétention (ex : supprimer les runs > 12 mois, archiver les candidats `ignored` > 90 jours) ? À définir avant la mise en production avec des utilisateurs réels pour éviter des coûts Supabase imprévus.

---

*Fin du document. Version suivante : AUTOMOTIVE_SOURCING_SPEC_v1.1.md après legal clearance scraping et signature partenariat EurotaxGlass.*