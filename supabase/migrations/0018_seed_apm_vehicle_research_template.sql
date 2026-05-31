-- Migration 0018 : Seed du template global APM Vehicle Research
--
-- Template `apm_vehicle_research` — analyse approfondie d'un véhicule d'occasion
-- pour décision d'achat. Visible par tous les users authentifiés via la policy
-- `swarms_templates_readable` (is_template=true, owner_id IS NULL).
--
-- Crew : 3 agents séquentiels
--   1. Data Collector   — parse + structure les inputs véhicule
--   2. Risk Analyst     — risques mécaniques, historique, marché
--   3. Decision Writer  — synthèse actionale : appeler / attendre / éviter
--
-- Idempotent : ON CONFLICT DO NOTHING sur les unique constraints existantes.

do $$
declare
  v_swarm_id   uuid;
  v_agent_col  uuid;
  v_agent_risk uuid;
  v_agent_dec  uuid;
  v_task_col   uuid;
  v_task_risk  uuid;
begin

  -- ── 1. Swarm template ─────────────────────────────────────────────────────
  insert into public.swarms (
    id, owner_id, name, description,
    is_template, is_active, version, config_json
  )
  values (
    'cccccccc-0001-0001-0001-000000000001'::uuid,
    null,
    'APM — Vehicle Research',
    'Analyse approfondie d''un véhicule d''occasion pour décision d''achat. '
    || 'Fournit : résumé, intérêt achat, risques, points à vérifier, questions '
    || 'vendeur, estimation coûts, recommandation finale (appeler/attendre/éviter). '
    || 'Inputs : make, model, year, mileage_km, fuel, price_eur, country, source_url, notes.',
    true,
    true,
    1,
    jsonb_build_object(
      'category',      'Automotive',
      'subcategory',   'APM',
      'version',       '1.0.0',
      'origin',        'seed_0018',
      'task_type',     'vehicle_research',
      'tunnel',        'apm_vehicle_research',
      'inputs_schema', jsonb_build_object(
        'make',         'string — marque (ex: BMW)',
        'model',        'string — modèle (ex: 330d)',
        'year',         'integer — année de première immatriculation',
        'mileage_km',   'integer — kilométrage affiché',
        'fuel',         'string — carburant (diesel, essence, hybride, électrique)',
        'price_eur',    'number — prix annonce en euros',
        'country',      'string — pays vendeur (code ISO 2 lettres, ex: FR)',
        'source_url',   'string — URL de l''annonce',
        'notes',        'string — remarques libres (défauts connus, historique, etc.)'
      ),
      'output_schema', jsonb_build_object(
        'summary',           'Résumé exécutif du véhicule (3-5 phrases)',
        'purchase_interest',  'Évaluation de l''intérêt achat : élevé / modéré / faible + justification',
        'risks',             'Liste ordonnée des risques identifiés (mécaniques, administratifs, marché)',
        'checkpoints',       'Points à vérifier physiquement ou via documents',
        'vendor_questions',  'Questions précises à poser au vendeur',
        'cost_estimates',    'Estimation coûts d''entretien prévisibles à court terme',
        'sources',           'Sources utilisées pour l''analyse (marques, modèles, fiabilité)',
        'recommendation',    'Recommandation finale : APPELER / ATTENDRE / ÉVITER'
      )
    )
  )
  on conflict on constraint swarms_owner_name_unique do nothing
  returning id into v_swarm_id;

  -- Récupérer l'id si le swarm existait déjà (rerun idempotent)
  if v_swarm_id is null then
    select id into v_swarm_id
    from public.swarms
    where id = 'cccccccc-0001-0001-0001-000000000001'::uuid;
  end if;

  if v_swarm_id is null then return; end if;

  -- ── 2. Agent 1 : Data Collector ──────────────────────────────────────────
  insert into public.swarm_agents (
    id, swarm_id, name, role, system_prompt,
    model_provider, model_name, temperature, max_tokens,
    position_x, position_y
  )
  values (
    'cccccccc-0001-0001-0001-000000000011'::uuid,
    v_swarm_id,
    'Data Collector',
    'executor',
    'You are a vehicle data specialist for used car analysis. '
    || 'Your job is to receive raw vehicle information (make, model, year, mileage, fuel, price, country, source_url, notes) '
    || 'and produce a structured, factual summary of what is known about this vehicle. '
    || 'Identify the specific trim/version from the model name if possible. '
    || 'Assess the price vs typical market range for this make/model/year. '
    || 'Note any red flags visible in the data (e.g., very high mileage, suspicious pricing, unusual country). '
    || 'Output: structured JSON-compatible summary with keys: vehicle_profile, price_assessment, data_flags.',
    'anthropic',
    'claude-haiku-4-5-20251001',
    0.20,
    2048,
    0,
    0
  )
  on conflict on constraint swarm_agents_swarm_name_unique do nothing
  returning id into v_agent_col;

  if v_agent_col is null then
    select id into v_agent_col
    from public.swarm_agents
    where swarm_id = v_swarm_id and name = 'Data Collector';
  end if;

  -- ── 3. Agent 2 : Risk Analyst ─────────────────────────────────────────────
  insert into public.swarm_agents (
    id, swarm_id, name, role, system_prompt,
    model_provider, model_name, temperature, max_tokens,
    position_x, position_y
  )
  values (
    'cccccccc-0001-0001-0001-000000000012'::uuid,
    v_swarm_id,
    'Risk Analyst',
    'analyst',
    'You are an expert automotive risk analyst specializing in used vehicle purchases. '
    || 'Given the structured vehicle data from the Data Collector, you must: '
    || '1. Identify known reliability issues for this specific make/model/year (common failures, recalls, weak points). '
    || '2. Evaluate mechanical risk from mileage relative to engine type (diesel/petrol/hybrid/electric). '
    || '3. Flag administrative risks (country of origin, potential import paperwork, CT/contrôle technique status). '
    || '4. Assess market risk (overpriced, underpriced — possibly salvage/accident history). '
    || '5. List 5-8 specific checkpoints to verify physically or via documents. '
    || '6. List 5-7 precise questions to ask the vendor. '
    || '7. Estimate foreseeable maintenance costs for the next 12 months based on mileage bracket and model history. '
    || 'Be concrete, cite specific parts/costs where possible. Prioritize risks by severity (HIGH/MEDIUM/LOW).',
    'anthropic',
    'claude-sonnet-4-6',
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

  -- ── 4. Agent 3 : Decision Writer ─────────────────────────────────────────
  insert into public.swarm_agents (
    id, swarm_id, name, role, system_prompt,
    model_provider, model_name, temperature, max_tokens,
    position_x, position_y
  )
  values (
    'cccccccc-0001-0001-0001-000000000013'::uuid,
    v_swarm_id,
    'Decision Writer',
    'coordinator',
    'You are a senior used car purchase advisor. Given the vehicle profile and risk analysis, '
    || 'produce a final purchase decision report in Markdown. '
    || 'Structure it exactly as follows:'
    || E'\n\n# Vehicle Research Report\n\n'
    || '## Summary\n(3-5 sentences, factual overview)\n\n'
    || '## Purchase Interest\n(Élevé / Modéré / Faible + 2-3 sentences justifying the rating)\n\n'
    || '## Risks\n(Ordered list HIGH → MEDIUM → LOW with brief explanation per risk)\n\n'
    || '## Checkpoints\n(Numbered list of things to verify physically or via documents)\n\n'
    || '## Questions for the Vendor\n(Numbered list of precise, targeted questions)\n\n'
    || '## Cost Estimates\n(Estimated maintenance/repair costs for next 12 months)\n\n'
    || '## Sources & References\n(Knowledge bases, model-specific forums, recall databases used)\n\n'
    || '## Recommendation\n**APPELER** / **ATTENDRE** / **ÉVITER** — one word in bold, followed by a single decisive sentence explaining why.\n\n'
    || 'Be direct. Do not hedge. The buyer needs a clear action.',
    'anthropic',
    'claude-sonnet-4-6',
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

  -- ── 5. Task 1 : Collect & Structure ──────────────────────────────────────
  insert into public.swarm_tasks (
    id, swarm_id, agent_id, name, description, expected_output,
    position_x, position_y
  )
  values (
    'cccccccc-0001-0001-0001-000000000021'::uuid,
    v_swarm_id,
    v_agent_col,
    'Collect & Structure Vehicle Data',
    'Parse the vehicle inputs provided (make, model, year, mileage_km, fuel, price_eur, country, source_url, notes). '
    || 'Look up typical market pricing for this make/model/year/mileage. '
    || 'Identify known trim variants. '
    || 'Flag any anomalies in the raw data (e.g., mileage too low for year, price far below market, country mismatch).',
    'A structured vehicle profile with: vehicle_profile (make/model/year/fuel/mileage/price/country), '
    || 'price_assessment (below/at/above market, estimated market range), '
    || 'data_flags (list of red flags or "none identified").',
    0,
    0
  )
  on conflict on constraint swarm_tasks_swarm_name_unique do nothing
  returning id into v_task_col;

  -- ── 6. Task 2 : Risk Analysis ─────────────────────────────────────────────
  insert into public.swarm_tasks (
    id, swarm_id, agent_id, name, description, expected_output,
    depends_on_task_id, position_x, position_y
  )
  values (
    'cccccccc-0001-0001-0001-000000000022'::uuid,
    v_swarm_id,
    v_agent_risk,
    'Analyse Risks & Generate Checkpoints',
    'Using the structured vehicle profile from the previous task, perform a full risk analysis. '
    || 'Research known reliability issues for this make/model/year. '
    || 'Evaluate mechanical risk (engine type, mileage bracket, common failure points). '
    || 'Identify administrative and market risks. '
    || 'Generate a prioritized checklist for physical inspection and document verification. '
    || 'Generate targeted questions for the vendor.',
    'A risk report with: risks (list with severity HIGH/MEDIUM/LOW), '
    || 'checkpoints (5-8 items), vendor_questions (5-7 items), cost_estimates (12-month horizon).',
    'cccccccc-0001-0001-0001-000000000021'::uuid,
    240,
    0
  )
  on conflict on constraint swarm_tasks_swarm_name_unique do nothing
  returning id into v_task_risk;

  -- ── 7. Task 3 : Write Decision Report ────────────────────────────────────
  insert into public.swarm_tasks (
    id, swarm_id, agent_id, name, description, expected_output,
    depends_on_task_id, position_x, position_y
  )
  values (
    'cccccccc-0001-0001-0001-000000000023'::uuid,
    v_swarm_id,
    v_agent_dec,
    'Write Purchase Decision Report',
    'Using the vehicle profile and risk analysis from previous tasks, produce the final purchase decision report. '
    || 'Follow the exact Markdown structure defined in the agent system prompt. '
    || 'Be decisive: end with APPELER, ATTENDRE, or ÉVITER.',
    'A complete Markdown report with sections: Summary, Purchase Interest, Risks, Checkpoints, '
    || 'Questions for the Vendor, Cost Estimates, Sources & References, Recommendation.',
    'cccccccc-0001-0001-0001-000000000022'::uuid,
    480,
    0
  )
  on conflict on constraint swarm_tasks_swarm_name_unique do nothing;

end$$;
