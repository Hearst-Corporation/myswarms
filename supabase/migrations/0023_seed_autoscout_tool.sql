-- Migration 0023 : seed du tool AutoScout24 Sourcing (global, owner_id IS NULL).
--
-- Ce tool est lisible par tout utilisateur authentifié grâce à la policy
-- "tools_global_read" ajoutée en 0022. Il n'est modifiable/supprimable par
-- aucun utilisateur (la policy d'écriture exige owner_id = auth.uid()).

-- Idempotent : WHERE NOT EXISTS évite le doublon même si owner_id IS NULL
-- (ON CONFLICT (owner_id, name) DO NOTHING ne fonctionne pas avec NULL = NULL en UNIQUE)
INSERT INTO tools (name, category, description, endpoint_url, auth_type, schema_json, is_active, owner_id)
SELECT
  'AutoScout24 Sourcing',
  'search',
  'Recherche d''annonces véhicules AutoScout24 (8 marchés EU) via Apify',
  '/api/scrape/autoscout',
  'bearer',
  '{
    "params": {
      "make":       {"type": "string",  "required": true},
      "model":      {"type": "string",  "required": false},
      "market":     {"type": "string",  "required": false, "default": "fr",
                     "enum": ["fr","de","it","es","be","nl","at","ch"]},
      "priceMin":   {"type": "number",  "required": false},
      "priceMax":   {"type": "number",  "required": false},
      "maxResults": {"type": "number",  "required": false, "default": 25, "max": 100}
    }
  }'::jsonb,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM tools
  WHERE endpoint_url = '/api/scrape/autoscout'
    AND owner_id IS NULL
);
