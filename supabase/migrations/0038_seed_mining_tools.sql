-- Migration 0038 : seed du profil MINING — 2 tools globaux (owner_id IS NULL).
--
-- Deux tools data-source lisibles par tout utilisateur authentifié grâce à la
-- policy "tools_global_read" (ajoutée en 0022). Ils ne sont modifiables /
-- supprimables par aucun utilisateur (la policy d'écriture exige
-- owner_id = auth.uid()). category = 'api_call', auth_type = 'bearer'.
--
-- Idempotent : WHERE NOT EXISTS évite le doublon même si owner_id IS NULL
-- (ON CONFLICT (owner_id, name) DO NOTHING ne fonctionne pas avec NULL = NULL
-- en contrainte UNIQUE). schema_json.params décrit les entrées best-effort de
-- chaque endpoint.

-- =====================================================================
-- 1. Machines Latest — dernier instantané du parc ASIC + hashprice
-- =====================================================================
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Machines Latest',
  'api_call',
  'Dernier instantané des machines de minage ASIC : modèle, hashrate, consommation, hashprice courant et économie de minage. Renvoie l''état le plus récent du parc.',
  '/api/machines/latest',
  'bearer',
  '{
    "params": {
      "model":     {"type": "string",  "required": false, "description": "Filtre sur un modèle d''ASIC précis (ex. Antminer S21)"},
      "asic":      {"type": "string",  "required": false, "description": "Alias de model — identifiant de l''ASIC"},
      "hashprice": {"type": "boolean", "required": false, "default": true, "description": "Inclure le hashprice courant ($/TH/jour) dans la réponse"},
      "limit":     {"type": "number",  "required": false, "default": 50, "max": 200, "description": "Nombre maximum de machines renvoyées"}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/machines/latest'
    AND owner_id IS NULL
);

-- =====================================================================
-- 2. Machines Fetch — série de machines ASIC + hashprice sur une fenêtre
-- =====================================================================
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'Machines Fetch',
  'api_call',
  'Récupère des machines de minage ASIC et leur économie (hashrate, consommation, hashprice) sur une plage — sert à comparer la rentabilité de plusieurs modèles ou à charger une série pour analyse.',
  '/api/machines/fetch',
  'bearer',
  '{
    "params": {
      "model":     {"type": "string",  "required": false, "description": "Filtre sur un modèle d''ASIC précis"},
      "asic":      {"type": "string",  "required": false, "description": "Alias de model — identifiant de l''ASIC"},
      "hashprice": {"type": "boolean", "required": false, "default": true, "description": "Inclure le hashprice ($/TH/jour) dans chaque enregistrement"},
      "limit":     {"type": "number",  "required": false, "default": 100, "max": 500, "description": "Nombre maximum d''enregistrements renvoyés"}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/machines/fetch'
    AND owner_id IS NULL
);
