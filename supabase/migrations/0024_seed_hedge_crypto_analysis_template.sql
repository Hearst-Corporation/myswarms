-- Migration 0024 : Seed du template global HEDGE — Crypto Trade Analysis
--
-- Template `hedge_crypto_analysis` — analyse d'un trade crypto/DeFi sous
-- discipline HEDGE (CVaR / Kelly / no-trade-by-default). ADVISORY UNIQUEMENT :
-- le swarm ne déclenche AUCUN ordre, il produit un rapport de décision.
-- Visible par tous les users authentifiés via la policy `swarms_templates_readable`
-- (is_template=true, owner_id IS NULL), comme le template APM Vehicle Research.
--
-- Crew : 3 agents séquentiels (provider Hypercli / kimi-k2.6 — règle projet)
--   1. Market Context Collector — structure les inputs + contexte marché
--   2. Risk Analyst             — CVaR, sizing Kelly, invalidation, kill switches
--   3. Decision Writer          — synthèse actionnable : ENTRER / ATTENDRE / PASSER
--
-- Idempotent : on conflict (id) do nothing sur le swarm + fallback select by id ;
--              on conflict on constraint swarm_*_swarm_name_unique do nothing sur agents/tasks.
-- UUID prefix dédié : dddddddd-0001-* (aaaaaaaa/bbbbbbbb=0012, cccccccc=APM).

do $$
declare
  v_swarm_id    uuid;
  v_agent_ctx   uuid;
  v_agent_risk  uuid;
  v_agent_dec   uuid;
  v_task_ctx    uuid;
  v_task_risk   uuid;
begin

  -- ── 1. Swarm template ─────────────────────────────────────────────────────
  insert into public.swarms (
    id, owner_id, name, description,
    is_template, is_active, version, config_json
  )
  values (
    'dddddddd-0001-0001-0001-000000000001'::uuid,
    null,
    'HEDGE — Crypto Trade Analysis',
    'Analyse advisory d''un trade crypto/DeFi sous discipline HEDGE '
    || '(CVaR, dimensionnement Kelly, no-trade-by-default, kill switches). '
    || 'Produit : contexte marché, risques, dimensionnement de position, niveau '
    || 'd''invalidation, conditions de kill-switch, recommandation finale '
    || '(ENTRER / ATTENDRE / PASSER). NE DÉCLENCHE AUCUN ORDRE. '
    || 'Inputs : asset, direction, timeframe, capital_eur, entry_price, '
    || 'risk_tolerance, thesis, notes.',
    true,
    true,
    1,
    jsonb_build_object(
      'category',      'Finance',
      'subcategory',   'HEDGE',
      'version',       '1.0.0',
      'origin',        'seed_0024',
      'task_type',     'crypto_trade_analysis',
      'tunnel',        'hedge_crypto_analysis',
      'inputs_schema', jsonb_build_object(
        'asset',          'string — actif crypto (ex: BTC, ETH, SOL)',
        'direction',      'string — sens du trade (long, short)',
        'timeframe',      'string — horizon (scalp, swing, position)',
        'capital_eur',    'number — capital allouable au trade, en euros',
        'entry_price',    'number — prix d''entrée envisagé',
        'risk_tolerance', 'string — tolérance au risque (faible, modéré, élevé)',
        'thesis',         'string — thèse / catalyseur justifiant le trade (texte libre, détaillé)',
        'notes',          'string — remarques libres (corrélations, contexte, contraintes)'
      ),
      'output_schema', jsonb_build_object(
        'market_context',  'Contexte marché de l''actif : régime de volatilité, liquidité, niveaux clés',
        'risks',           'Risques ordonnés par sévérité (volatilité, liquidation, corrélation, exécution)',
        'position_sizing', 'Dimensionnement proposé : fraction de Kelly, taille en euros, CVaR estimée',
        'invalidation',    'Niveau d''invalidation de la thèse',
        'kill_switches',   'Conditions explicites de coupure (drawdown, niveau de prix, perte de liquidité)',
        'recommendation',  'Recommandation finale : ENTRER / ATTENDRE / PASSER'
      ),
      'required_inputs', jsonb_build_array('asset', 'direction'),
      'field_order', jsonb_build_array(
        'asset', 'direction', 'timeframe', 'capital_eur', 'entry_price',
        'risk_tolerance', 'thesis', 'notes'
      ),
      'field_options', jsonb_build_object(
        'direction',      jsonb_build_array('long', 'short'),
        'timeframe',      jsonb_build_array('scalp', 'swing', 'position'),
        'risk_tolerance', jsonb_build_array('faible', 'modéré', 'élevé')
      )
    )
  )
  on conflict (id) do nothing
  returning id into v_swarm_id;

  -- Récupérer l'id si le swarm existait déjà (rerun idempotent)
  if v_swarm_id is null then
    select id into v_swarm_id
    from public.swarms
    where id = 'dddddddd-0001-0001-0001-000000000001'::uuid;
  end if;

  if v_swarm_id is null then return; end if;

  -- ── 2. Agent 1 : Market Context Collector ─────────────────────────────────
  insert into public.swarm_agents (
    id, swarm_id, name, role, system_prompt,
    model_provider, model_name, temperature, max_tokens,
    position_x, position_y
  )
  values (
    'dddddddd-0001-0001-0001-000000000011'::uuid,
    v_swarm_id,
    'Market Context Collector',
    'executor',
    'You are a crypto market context specialist supporting a disciplined trading desk (HEDGE). '
    || 'You receive a proposed trade (asset, direction, timeframe, capital, entry_price, risk_tolerance, thesis, notes). '
    || 'Produce a factual, structured snapshot of the trade context — DO NOT give buy/sell advice yet. '
    || 'Cover: 1) the asset and its typical volatility regime, 2) liquidity considerations for the given capital size, '
    || '3) key technical/structural levels relevant to the entry_price, 4) how the stated thesis maps to a defined, '
    || 'falsifiable expectation. Flag any data gaps or internal inconsistencies in the inputs. '
    || 'Output: structured summary with keys: trade_profile, volatility_regime, liquidity_notes, key_levels, thesis_mapping, data_flags.',
    'openai',
    'kimi-k2.6',
    0.20,
    2048,
    0,
    0
  )
  on conflict on constraint swarm_agents_swarm_name_unique do nothing
  returning id into v_agent_ctx;

  if v_agent_ctx is null then
    select id into v_agent_ctx
    from public.swarm_agents
    where swarm_id = v_swarm_id and name = 'Market Context Collector';
  end if;

  -- ── 3. Agent 2 : Risk Analyst ──────────────────────────────────────────────
  insert into public.swarm_agents (
    id, swarm_id, name, role, system_prompt,
    model_provider, model_name, temperature, max_tokens,
    position_x, position_y
  )
  values (
    'dddddddd-0001-0001-0001-000000000012'::uuid,
    v_swarm_id,
    'Risk Analyst',
    'analyst',
    'You are a quantitative risk analyst on the HEDGE desk. Discipline first, conviction second. '
    || 'Given the market context, assess this trade under a strict risk framework: '
    || '1. Estimate downside risk (expected drawdown and a qualitative CVaR / tail-loss view at the given timeframe). '
    || '2. Propose position sizing as a fraction of the allocable capital using a Kelly-style criterion, then HALVE it '
    || '(fractional Kelly) — never recommend full Kelly. Express sizing both as a fraction and in euros. '
    || '3. Identify the precise invalidation level where the thesis is proven wrong. '
    || '4. Identify volatility, liquidation, correlation and execution risks, ranked HIGH / MEDIUM / LOW. '
    || '5. Define explicit, mechanical kill-switch conditions (max drawdown %, price level, liquidity loss). '
    || 'Apply NO-TRADE-BY-DEFAULT: if risk is unclear, sizing is fragile, or the thesis is not falsifiable, lean towards PASSER/ATTENDRE. '
    || 'You are advisory only — you never place orders. Be concrete and numeric where the inputs allow.',
    'openai',
    'kimi-k2.6',
    0.30,
    4096,
    240,
    0
  )
  on conflict on constraint swarm_agents_swarm_name_unique do nothing
  returning id into v_agent_risk;

  if v_agent_risk is null then
    select id into v_agent_risk
    from public.swarm_agents
    where swarm_id = v_swarm_id and name = 'Risk Analyst';
  end if;

  -- ── 4. Agent 3 : Decision Writer ──────────────────────────────────────────
  insert into public.swarm_agents (
    id, swarm_id, name, role, system_prompt,
    model_provider, model_name, temperature, max_tokens,
    position_x, position_y
  )
  values (
    'dddddddd-0001-0001-0001-000000000013'::uuid,
    v_swarm_id,
    'Decision Writer',
    'coordinator',
    'You are a senior trading advisor on the HEDGE desk. Given the market context and the risk analysis, '
    || 'produce a final trade decision report in Markdown. ADVISORY ONLY — make clear no order is placed automatically. '
    || 'Structure it exactly as follows:'
    || E'\n\n# HEDGE Trade Decision Report\n\n'
    || '## Thèse\n(2-4 sentences: the trade and its falsifiable rationale)\n\n'
    || '## Contexte marché\n(volatility regime, liquidity, key levels)\n\n'
    || '## Risques\n(Ordered list HIGH → MEDIUM → LOW with brief explanation per risk)\n\n'
    || '## Dimensionnement\n(Fractional-Kelly sizing: fraction + euros, estimated CVaR / tail loss)\n\n'
    || '## Invalidation & Kill Switches\n(Invalidation level + explicit mechanical cut conditions: drawdown %, price, liquidity)\n\n'
    || '## Recommandation\n**ENTRER** / **ATTENDRE** / **PASSER** — one word in bold, then a single decisive sentence. '
    || 'Default to ATTENDRE or PASSER when risk is unclear (no-trade-by-default).\n\n'
    || 'Be direct. Never promise returns. Always remind that execution stays manual and risk-gated.',
    'openai',
    'kimi-k2.6',
    0.40,
    4096,
    480,
    0
  )
  on conflict on constraint swarm_agents_swarm_name_unique do nothing
  returning id into v_agent_dec;

  if v_agent_dec is null then
    select id into v_agent_dec
    from public.swarm_agents
    where swarm_id = v_swarm_id and name = 'Decision Writer';
  end if;

  -- ── 5. Task 1 : Collect & Structure Market Context ────────────────────────
  insert into public.swarm_tasks (
    id, swarm_id, agent_id, name, description, expected_output,
    position_x, position_y
  )
  values (
    'dddddddd-0001-0001-0001-000000000021'::uuid,
    v_swarm_id,
    v_agent_ctx,
    'Collect & Structure Market Context',
    'Parse the trade inputs (asset, direction, timeframe, capital_eur, entry_price, risk_tolerance, thesis, notes). '
    || 'Characterise the asset volatility regime and liquidity for the given capital. '
    || 'Identify key technical/structural levels around the entry_price. '
    || 'Map the thesis to a falsifiable expectation. Flag any data gaps or inconsistencies.',
    'A structured context object: trade_profile, volatility_regime, liquidity_notes, '
    || 'key_levels, thesis_mapping, data_flags (or "none identified").',
    0,
    0
  )
  on conflict on constraint swarm_tasks_swarm_name_unique do nothing
  returning id into v_task_ctx;

  -- ── 6. Task 2 : Risk Analysis & Sizing ────────────────────────────────────
  insert into public.swarm_tasks (
    id, swarm_id, agent_id, name, description, expected_output,
    depends_on_task_id, position_x, position_y
  )
  values (
    'dddddddd-0001-0001-0001-000000000022'::uuid,
    v_swarm_id,
    v_agent_risk,
    'Analyse Risk & Position Sizing',
    'Using the market context, assess downside risk (drawdown, qualitative CVaR/tail loss). '
    || 'Propose fractional-Kelly position sizing (fraction + euros), never full Kelly. '
    || 'Define the invalidation level and explicit mechanical kill-switch conditions. '
    || 'Rank volatility/liquidation/correlation/execution risks. Apply no-trade-by-default when uncertain.',
    'A risk report: risks (HIGH/MEDIUM/LOW), position_sizing (fraction + euros + CVaR view), '
    || 'invalidation level, kill_switches (mechanical conditions).',
    'dddddddd-0001-0001-0001-000000000021'::uuid,
    240,
    0
  )
  on conflict on constraint swarm_tasks_swarm_name_unique do nothing
  returning id into v_task_risk;

  -- ── 7. Task 3 : Write Trade Decision Report ───────────────────────────────
  insert into public.swarm_tasks (
    id, swarm_id, agent_id, name, description, expected_output,
    depends_on_task_id, position_x, position_y
  )
  values (
    'dddddddd-0001-0001-0001-000000000023'::uuid,
    v_swarm_id,
    v_agent_dec,
    'Write Trade Decision Report',
    'Using the market context and risk analysis, produce the final advisory trade decision report. '
    || 'Follow the exact Markdown structure defined in the agent system prompt. '
    || 'Be decisive: end with ENTRER, ATTENDRE, or PASSER, defaulting to ATTENDRE/PASSER under uncertainty. '
    || 'Make explicit that no order is placed and execution stays manual and risk-gated.',
    'A complete Markdown report with sections: Thèse, Contexte marché, Risques, '
    || 'Dimensionnement, Invalidation & Kill Switches, Recommandation.',
    'dddddddd-0001-0001-0001-000000000022'::uuid,
    480,
    0
  )
  on conflict on constraint swarm_tasks_swarm_name_unique do nothing;

end$$;
