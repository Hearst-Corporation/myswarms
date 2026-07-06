-- Migration 0039 : BINDING advisory — lie les tools globaux aux agents "framer"
-- des 3 swarms client EXISTANTS (owner 5741a7e9-…), profil par profil.
--
-- Dépend des seeds 0036 (Market), 0037 (Yield), 0038 (Mining) : ces tools sont
-- GLOBAUX (owner_id IS NULL) et résolus ICI par name. Les swarms + agents sont
-- déjà en base (Market Advisory / Yield Explainer / Mining Economics Brief, avec
-- leurs agents framer/executor). On câble UNIQUEMENT l'agent qui collecte le
-- contexte (le "framer", role=executor, position_x=0) de chaque swarm — c'est lui
-- qui LIT les data-sources pour grounder l'analyse ; les agents analyst/writer en
-- aval consomment sa sortie et n'ont pas besoin des tools HTTP.
--
--   (a) Market Advisory        (6923a5a6-…) : 4 tools Market → 'Market Context Framer'
--   (b) Yield Explainer        (efa22856-…) : 4 tools Yield  → 'Rates Context Framer'
--   (c) Mining Economics Brief (865be6e5-…) : 2 tools Mining → 'Mining Data Framer'
--
-- Chaque binding : priority=0, config_json '{}'. Résolution robuste :
--   - swarm_id : UUID constant du swarm client (vérifié en base) ;
--   - agent_id : SELECT id FROM swarm_agents WHERE swarm_id=… AND name=… ;
--   - tool_id  : SELECT id FROM tools WHERE name=… AND owner_id IS NULL.
-- Idempotent : ON CONFLICT ON CONSTRAINT swarm_tool_bindings_unique DO NOTHING
-- (clé unique (swarm_id, agent_id, tool_id), cf. 0006). Rejouable N fois.
-- Fail-soft : si un swarm / agent / tool est introuvable (seed non appliqué,
-- swarm supprimé), le profil concerné est SAUTÉ sans erreur — la migration
-- n'échoue jamais et ne pose aucun binding partiel/incohérent.
--
-- Patron do-block : 0024_seed_hedge_crypto_analysis_template.sql.

do $$
declare
  -- IDs des swarms client (owner 5741a7e9-9c3b-4f2e-8b1d-0a1b2c3d4e5f).
  v_swarm_market uuid := '6923a5a6-a6b0-4587-ba5a-c831773a4053'::uuid;
  v_swarm_yield  uuid := 'efa22856-958d-4969-b9a0-6cc0a35ca5d6'::uuid;
  v_swarm_mining uuid := '865be6e5-65c1-482a-be14-a3a3e4efe6fc'::uuid;

  -- Agent "framer" (executor) cible dans chaque swarm.
  v_agent uuid;

  -- Compteur de tools résolus par profil (diagnostic via RAISE NOTICE).
  v_bound int;
begin

  -- ════════════════════════════════════════════════════════════════════════
  -- (a) MARKET ADVISORY — 4 tools Market → 'Market Context Framer'
  -- ════════════════════════════════════════════════════════════════════════
  select id into v_agent
  from public.swarm_agents
  where swarm_id = v_swarm_market and name = 'Market Context Framer';

  if v_agent is null then
    raise notice '0039: swarm/agent Market introuvable (Market Context Framer) — profil Market sauté';
  else
    insert into public.swarm_tool_bindings (swarm_id, agent_id, tool_id, priority, config_json)
    select v_swarm_market, v_agent, t.id, 0, '{}'::jsonb
    from public.tools t
    where t.owner_id is null
      and t.name in (
        'Market Prices',
        'Market Prices Latest',
        'Market Prices History',
        'Market Candles'
      )
    on conflict on constraint swarm_tool_bindings_unique do nothing;

    select count(*) into v_bound
    from public.tools t
    where t.owner_id is null
      and t.name in (
        'Market Prices',
        'Market Prices Latest',
        'Market Prices History',
        'Market Candles'
      );
    raise notice '0039: Market — % tool(s) résolu(s) pour binding (attendu 4)', v_bound;
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- (b) YIELD EXPLAINER — 4 tools Yield → 'Rates Context Framer'
  -- ════════════════════════════════════════════════════════════════════════
  select id into v_agent
  from public.swarm_agents
  where swarm_id = v_swarm_yield and name = 'Rates Context Framer';

  if v_agent is null then
    raise notice '0039: swarm/agent Yield introuvable (Rates Context Framer) — profil Yield sauté';
  else
    insert into public.swarm_tool_bindings (swarm_id, agent_id, tool_id, priority, config_json)
    select v_swarm_yield, v_agent, t.id, 0, '{}'::jsonb
    from public.tools t
    where t.owner_id is null
      and t.name in (
        'Protocol Rates Latest',
        'Protocol Rates History',
        'Rates Coverage',
        'Yield Connector Status'
      )
    on conflict on constraint swarm_tool_bindings_unique do nothing;

    select count(*) into v_bound
    from public.tools t
    where t.owner_id is null
      and t.name in (
        'Protocol Rates Latest',
        'Protocol Rates History',
        'Rates Coverage',
        'Yield Connector Status'
      );
    raise notice '0039: Yield — % tool(s) résolu(s) pour binding (attendu 4)', v_bound;
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- (c) MINING ECONOMICS BRIEF — 2 tools Mining → 'Mining Data Framer'
  -- ════════════════════════════════════════════════════════════════════════
  select id into v_agent
  from public.swarm_agents
  where swarm_id = v_swarm_mining and name = 'Mining Data Framer';

  if v_agent is null then
    raise notice '0039: swarm/agent Mining introuvable (Mining Data Framer) — profil Mining sauté';
  else
    insert into public.swarm_tool_bindings (swarm_id, agent_id, tool_id, priority, config_json)
    select v_swarm_mining, v_agent, t.id, 0, '{}'::jsonb
    from public.tools t
    where t.owner_id is null
      and t.name in (
        'Machines Latest',
        'Machines Fetch'
      )
    on conflict on constraint swarm_tool_bindings_unique do nothing;

    select count(*) into v_bound
    from public.tools t
    where t.owner_id is null
      and t.name in (
        'Machines Latest',
        'Machines Fetch'
      );
    raise notice '0039: Mining — % tool(s) résolu(s) pour binding (attendu 2)', v_bound;
  end if;

end$$;
