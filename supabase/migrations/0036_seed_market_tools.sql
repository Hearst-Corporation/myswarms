-- Migration 0036 : seed du PROFIL MARKET — 4 tools globaux (owner_id IS NULL).
--
-- Ces tools `api_call` sont lisibles par tout utilisateur authentifié grâce à la
-- policy "tools_global_read" (0022). Ils ne sont modifiables/supprimables par
-- aucun user (la policy d'écriture exige owner_id = auth.uid()). Ils exposent en
-- LECTURE SEULE les endpoints marché du Strategy Platform (résolus au runtime
-- contre STRATEGY_PLATFORM_URL) au profil advisory « Market ». Aucun n'émet
-- d'ordre : advisory only, l'agent LIT ces données pour grounder son analyse.
--
-- Idempotent : WHERE NOT EXISTS sur (endpoint_url + owner_id IS NULL) évite le
-- doublon même si owner_id IS NULL — ON CONFLICT (owner_id, name) DO NOTHING ne
-- dédoublonne pas quand owner_id IS NULL (NULL = NULL est faux en UNIQUE).
--
-- Calqué EXACTEMENT sur 0023_seed_autoscout_tool.sql. Aucun binding ici
-- (swarm_tool_bindings relève d'une migration dédiée, cf. patron do-block 0024).

-- ── 1. Market Prices ─────────────────────────────────────────────────────────
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Market Prices',
  'api_call',
  'Prix marché d''un ou plusieurs symboles (BTCUSDT, ETHUSDT…) — snapshot brut des cotations. Advisory only, aucune écriture.',
  '/api/market/prices',
  'bearer',
  '{
    "params": {
      "symbol": {"type": "string", "required": false}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/market/prices'
    AND owner_id IS NULL
);

-- ── 2. Market Prices Latest ──────────────────────────────────────────────────
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Market Prices Latest',
  'api_call',
  'Dernier prix connu d''un symbole marché (BTCUSDT, ETHUSDT…) — cote la plus récente pour ancrer l''analyse. Advisory only, aucune écriture.',
  '/api/market/prices/latest',
  'bearer',
  '{
    "params": {
      "symbol": {"type": "string", "required": false}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/market/prices/latest'
    AND owner_id IS NULL
);

-- ── 3. Market Prices History ─────────────────────────────────────────────────
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Market Prices History',
  'api_call',
  'Historique de prix d''un symbole marché (BTCUSDT, ETHUSDT…) sur une fenêtre from→to — tendance et amplitude. Advisory only, aucune écriture.',
  '/api/market/prices/history',
  'bearer',
  '{
    "params": {
      "symbol": {"type": "string", "required": true},
      "from":   {"type": "string", "required": false},
      "to":     {"type": "string", "required": false}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/market/prices/history'
    AND owner_id IS NULL
);

-- ── 4. Market Candles ────────────────────────────────────────────────────────
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Market Candles',
  'api_call',
  'Bougies OHLCV d''un symbole marché (BTCUSDT, ETHUSDT…) — contexte régime/volatilité. Advisory only, aucune écriture.',
  '/api/market/candles',
  'bearer',
  '{
    "params": {
      "symbol":   {"type": "string", "required": true},
      "interval": {"type": "string", "required": false, "default": "1h",
                   "enum": ["1m","5m","15m","1h","4h","1d"]},
      "from":     {"type": "string", "required": false},
      "to":       {"type": "string", "required": false},
      "limit":    {"type": "number", "required": false, "default": 500, "max": 1000}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/market/candles'
    AND owner_id IS NULL
);
