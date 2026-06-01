<!-- OMEGA-RESET — audit adversarial, généré 2026-05-29. Cible: /Dev/Projects/Hedge + DB oblwrgtfjkqixakuunaj. -->

# CognitionTruth — Squad B

> **Verdict (thèse attaquée) :** "Le système pense" est VRAI au niveau micro (vrais appels LLM sur vrai market_state, désaccord réel, consensus déterministe calculé) mais FAUX comme cognition continue: il n'a tourné que 2 fois, sur des request_ids fixtures, contre un portefeuille synthétique figé, et est muet depuis 1h14.


## ✅ PROUVÉ (reproduit)

- **Les agents font de VRAIS appels LLM (pas hardcodé/aléatoire): openai.AsyncOpenAI vers Hypercli, model dynamique, temperature=0.3, JSON forcé.**
  - _Preuve :_ agents/base.py:39-64 client.chat.completions.create(model=cfg.hypercli_default_model, response_format=json_object, temperature=0.3); pas un seul stance/conf en dur.
- **Les agents reçoivent le market_state RÉEL (snapshot signé + portefeuille + failures), pas du texte générique.**
  - _Preuve :_ swarm_worker.py:78-90 fetch_latest_market_row/portfolio/count_recent_failures puis build_market_state injecté dans ctx['market_state']; repo.py:71-107 lit hedge_market_snapshots/portfolio_snapshots/run_events.
- **Les outputs des 5 agents citent les VRAIS chiffres du market_state stocké (corrélés, non templated).**
  - _Preuve :_ run 0d0001: market_state stocké bid=635392/ask=26090/imb=0.9211/fails=21; rationales agents citent exactement depth_ask=26090, imbalance 0.9211, 21 failures. Identique run 0c0001 (bid=225397/ask=583411/imb=-0.4426/fails=23).
- **Le désaccord est RÉEL et observable.**
  - _Preuve :_ run 0c0001: macro=long, volatility=long, orderflow=short, portfolio=flat, exec=flat → contradiction stockée 'LONG [macro_strategist, volatility_analyst] vs SHORT [orderflow_analyst]', agreement=0.4 disagreement=0.6.
- **Le consensus est CALCULÉ déterministiquement (agrégation lisible), pas simulé.**
  - _Preuve :_ consensus.py:36-56 counts→majority→agreement=counts[maj]/n, disagreement=1-agreement, confidence=agreement*mean_conv. Valeurs stockées en DB reproduisent la formule (0.4/0.6, 0.8/0.2).
- **Les 2 runs cognitifs ont tourné sur des request_ids FIXTURES synthétiques, pas les vraies requêtes utilisateur.**
  - _Preuve :_ signals_ready events: request_id 00000000-...-0c0001 et 0d0001 (vs vraies req c822385c/a1aa3272 jamais traitées par les 5 agents).
- **Le portefeuille analysé par portfolio_risk_allocator est un FIXTURE figé.**
  - _Preuve :_ hedge_portfolio_snapshots: equity=10000.0/margin=8000.0/dd=0.05 IDENTIQUE sur 2142 snapshots.
- **Seulement 10 signaux des 5 nouveaux agents (2 par agent); les 72 autres viennent d'agents OBSOLÈTES templatés sans stance/conviction.**
  - _Preuve :_ GROUP BY agent: macro/onchain/sentiment/technical = 18 chacun, distinct_rationale=0 distinct_stance=0 (payload ancien format tone/thesis/drivers); les 5 specialists = 2 chacun.
- **La réputation est statistiquement nulle (N=2/agent) et JAMAIS appliquée (n_min=20).**
  - _Preuve :_ hedge_cognitive_feedback: chaque agent total=2; consensus.py:10 REPUTATION_N_MIN=20, :71 if n>=20 → jamais vrai → reputation_applied=false (confirmé null/false en DB).
- **Mort silencieuse: aucun signal swarm depuis 01:28, soit 1h14 de silence, 0 job en file, alors que le feed marché est vivant (1.7s).**
  - _Preuve :_ signal_silence=01:14:19, now_db=02:42:49, queued_swarm_jobs=0; last_snapshot il y a 1.7s (feed live).
- **8 outcomes créés en batch one-shot de 38s.**
  - _Preuve :_ hedge_cognitive_outcomes: 8 lignes, min 01:53:49 max 01:54:27 (38s), 8 reqs distincts.

## ❓ INCERTAIN

- **Les valeurs de depth citées (225397, 635392...) proviennent d'un snapshot réel précis.** — Recherche exacte dans hedge_market_snapshots = vide, MAIS market_state.py:71 arrondit (round(bid)) et les valeurs tombent dans la plage réelle observée (857→3.6M sur 487 snapshots/30min). Plausible mais non rattaché à la ligne snapshot exacte (probable arrondi d'un float comme 635392.x).
- **Le swarm_worker tourne réellement dans le process uvicorn:8005.** — 8005 répond 200 mais aucun process swarm_worker séparé visible; la boucle run_forever est probablement lancée dans le lifespan FastAPI — non confirmé par log. Silence de 1h14 cohérent avec worker vivant mais sans job queued.
- **recent_failures_1h=23 est un signal marché sain.** — Reproduit (23 failed/spec_invalid events sur la fenêtre) DONC réel, mais compte majoritairement les échecs des runs fixtures eux-mêmes → input réel mais auto-référentiel/dégénéré.

## ❌ FAUX / corrigé

- **'Live reputation weighting (Tau)' pondère activement le consensus.** — Code présent (consensus.py:64-83) mais inerte: n_min=20 et N réel=2 → reputation_applied toujours false, eff_majority=raw_majority, eff_confidence=raw_confidence. Dead path en pratique.
- **Cognition continue / le système 'pense' en boucle.** — 2 runs cognitifs au total (0c0001, 0d0001), 18min d'écart, puis silence total 1h14 malgré feed marché live. Pas de cognition continue, juste 2 one-shots sur fixtures.
- **Les 82 hedge_swarm_signals reflètent le raisonnement multi-agent actuel.** — 72/82 sont des agents obsolètes (macro/onchain/sentiment/technical) au format templaté sans stance ni conviction; seuls 10 (2x5) viennent de la vraie cognition.

## 🔢 Chiffres-clés

- 82 signaux total: 72 agents obsolètes templatés + 10 nouveaux specialists (2/agent)
- 2 runs cognitifs seulement (request_ids fixtures 0c0001 + 0d0001)
- Silence swarm = 1h14m19s (dernier 01:28:29, now 02:42:49), 0 job queued
- Réputation N=2/agent, n_min=20 → reputation_applied=false (jamais)
- Portefeuille fixture figé: equity=10000.0 sur 2142 snapshots
- 8 outcomes + 18 feedback en batch one-shot de 38s (01:53:49→01:54:27)
- Désaccord run 0c0001: agreement=0.4 disagree=0.6, LONG x2 vs SHORT x1
- Feed marché LIVE: dernier snapshot il y a 1.7s, 9628 snapshots, mid 73368→76004
- Services vivants: 8001/8002/8003/8005 = 200; 8000/8004 = DOWN
- distinct_rationale agents obsolètes = 0; agents specialists = 2/2 (tous distincts)
