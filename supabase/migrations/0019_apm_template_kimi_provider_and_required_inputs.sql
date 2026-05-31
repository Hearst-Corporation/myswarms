-- Migration 0019 : APM template correctness fix
--
-- 1. Provider → openai/kimi-k2.6 (Hypercli) pour les 3 agents du template APM.
--    Règle projet : Hypercli (Kimi K2.6) est l'unique provider LLM autorisé.
--    Le provider "openai" active le mode OpenAI-compatible de LiteLLM (crewai),
--    qui pointe vers HYPERCLI_BASE_URL / HYPERCLI_API_KEY au runtime.
--
-- 2. required_inputs dans config_json du template APM.
--    Convention : config_json.required_inputs = ["make", "model"]
--    Lu par parseInputSchema() côté front (lib/swarms/inputSchema.ts).
--    Plus aucun hardcode dans le composant page générique.

-- 1. Provider migration
update public.swarm_agents
set
  model_provider = 'openai',
  model_name     = 'kimi-k2.6',
  updated_at     = now()
where swarm_id = 'cccccccc-0001-0001-0001-000000000001'
  and model_provider = 'anthropic';

-- 2. required_inputs dans config_json
update public.swarms
set
  config_json = config_json || jsonb_build_object(
    'required_inputs', jsonb_build_array('make', 'model')
  ),
  updated_at = now()
where id = 'cccccccc-0001-0001-0001-000000000001';
