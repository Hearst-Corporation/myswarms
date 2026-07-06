-- Migration 0037 : seed du profil YIELD — 4 tools globaux (owner_id IS NULL).
--
-- Ces tools exposent l'API "rendements de protocoles DeFi" (yield) du BFF au
-- moteur de swarms : taux courants, historique de taux, couverture des données
-- et santé des connecteurs. Ils sont GLOBAUX (owner_id IS NULL) donc lisibles
-- par tout utilisateur authentifié via la policy "tools_global_read" (0022),
-- et modifiables/supprimables par aucun user (la policy d'écriture exige
-- owner_id = auth.uid()). Tous en category='api_call', auth_type='bearer'.
--
-- Idempotent : chaque INSERT est gardé par WHERE NOT EXISTS (endpoint_url +
-- owner_id IS NULL) — ON CONFLICT (owner_id, name) DO NOTHING ne s'applique pas
-- ici car NULL = NULL est FAUX dans une contrainte UNIQUE. Rejouable N fois sans
-- doublon. Aucun binding agent↔tool n'est créé (fichier de seed pur).
--
-- schema_json.params : best-effort par endpoint (type / required / default). Les
-- filtres protocol/asset/chain sont optionnels (renvoient tout par défaut) ;
-- l'historique accepte en plus une fenêtre temporelle from/to (ISO 8601).

-- ── 1. Protocol Rates Latest — GET /api/protocol-rates/latest ────────────────
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Protocol Rates Latest',
  'api_call',
  'Taux de rendement DeFi les plus récents par protocole/actif/chaîne. Filtres optionnels : sans filtre, renvoie le dernier snapshot pour toutes les combinaisons couvertes.',
  '/api/protocol-rates/latest',
  'bearer',
  '{
    "params": {
      "protocol": {"type": "string", "required": false},
      "asset":    {"type": "string", "required": false},
      "chain":    {"type": "string", "required": false}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/protocol-rates/latest'
    AND owner_id IS NULL
);

-- ── 2. Protocol Rates History — GET /api/protocol-rates/history ──────────────
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Protocol Rates History',
  'api_call',
  'Historique des taux de rendement DeFi (série temporelle) par protocole/actif/chaîne sur une fenêtre from/to. Sert à analyser l''évolution des rendements avant une décision.',
  '/api/protocol-rates/history',
  'bearer',
  '{
    "params": {
      "protocol": {"type": "string", "required": false},
      "asset":    {"type": "string", "required": false},
      "chain":    {"type": "string", "required": false},
      "from":     {"type": "string", "required": false},
      "to":       {"type": "string", "required": false}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/protocol-rates/history'
    AND owner_id IS NULL
);

-- ── 3. Rates Coverage — GET /api/rates/coverage ──────────────────────────────
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Rates Coverage',
  'api_call',
  'Périmètre de couverture des taux : protocoles, actifs et chaînes disponibles dans le jeu de données de rendements. À interroger pour savoir quelles combinaisons sont exploitables.',
  '/api/rates/coverage',
  'bearer',
  '{
    "params": {
      "protocol": {"type": "string", "required": false},
      "chain":    {"type": "string", "required": false}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/rates/coverage'
    AND owner_id IS NULL
);

-- ── 4. Yield Connector Status — GET /api/connectors/yield/status ─────────────
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Yield Connector Status',
  'api_call',
  'État de santé des connecteurs de données de rendement (fraîcheur, dernière synchro, erreurs). À vérifier avant de se fier aux taux, pour détecter des données périmées ou un connecteur en panne.',
  '/api/connectors/yield/status',
  'bearer',
  '{
    "params": {
      "connector": {"type": "string", "required": false}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/connectors/yield/status'
    AND owner_id IS NULL
);
