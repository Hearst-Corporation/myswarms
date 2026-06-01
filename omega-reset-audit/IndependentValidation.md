<!-- OMEGA-RESET — audit adversarial, généré 2026-05-29. Cible: /Dev/Projects/Hedge + DB oblwrgtfjkqixakuunaj. -->

# IndependentValidation — Squad G

> **Verdict (thèse attaquée) :** La machinerie cognitive (consensus pondéré, hash-chain, outcomes sur prix réels, kill-switch, dry_run) EXISTE et est correcte en code, mais avec les données réelles elle est INERTE et MUETTE : la réputation n'influence JAMAIS le consensus (n=2 par agent vs seuil n_min=20), aucune cognition continue (8 outcomes en batch one-shot de 38s, rien depuis 01:54), et la métrique de calibration est inversée. C'est un harnais de démo, pas une boucle cognitive vivante.


## ✅ PROUVÉ (reproduit)

- **La réputation n'influence JAMAIS le consensus avec les données réelles (n=2 < n_min=20)**
  - _Preuve :_ consensus.py:10 REPUTATION_N_MIN=20 ; consensus.py:71 `int(r.get('n',0))>=n_min`. Test indépendant independent_tests/test_consensus_reputation_influence.py [A]: rep réelle (tous n=2) -> reputation_applied=False, majority_stance=raw_majority_stance='long'. [B] avec n=50 la stance flip long->short. Donc le code marche mais reste inerte en prod.
- **Réputation par agent = N=2 pour les 5 agents, statistiquement nulle**
  - _Preuve :_ SQL oblwrgtfjkqixakuunaj sql_recompute_reputation.sql: execution_tactician 0/2, macro_strategist 0/2, orderflow_analyst 1/2, portfolio_risk_allocator 0/2, volatility_analyst 0/2. meets_n_min_20=false pour TOUS. Matche exactement repo.py:109-127 fetch_agent_reputation.
- **8 outcomes + 18 feedback créés en batch one-shot de 38s, aucune cognition depuis**
  - _Preuve :_ SQL: outcomes count=8 [01:53:49->01:54:27], feedback count=18 [01:53:49->01:54:27]. Latest: outcomes/feedback=01:54:27, run_jobs=01:26, swarm_signals/run_events=01:28. Aucun nouvel outcome après 01:54 = backfill one-shot du backlog existant.
- **Hash-chain prev_hash/row_hash réellement intègre (recompute SQL OK pour les 8 lignes)**
  - _Preuve :_ SQL recompute via hedge_chain_hash(prev_hash, evaluation): row_hash_ok=true ET prev_chain_ok=true pour les 8 outcomes (2e55->a563->b781->cd3b->c9a8->9dbc->b9c5->7d44). hedge_chain_hash = sha256(prev||hedge_canonical_json(payload)).
- **Les prix des outcomes proviennent de VRAIS hedge_market_snapshots Binance**
  - _Preuve :_ sql_outcome_price_match.sql: pour request 0c0001, t0=01:10:20 (event signals_ready), recompute p0=73840.335 p1=73779.715 horizon=297s == valeurs stockées. (Piège: t0 = heure de l'event, pas du created_at de l'outcome.)
- **calibration_error est une métrique DÉGÉNÉRÉE et INVERSÉE quand confidence=null**
  - _Preuve :_ cognitive_loop.py:72 `abs(conf-(1 if correct else 0))` avec conf=0.0. SQL: decision correct=true -> calib_err=1.0 (n=2, PIRE score) ; decision correct=false -> calib_err=0.0 (n=4, MEILLEUR score). La métrique récompense l'erreur.
- **dry_run / no-trade-by-default RÉEL**
  - _Preuve :_ config.py:24 dry_run:bool=True ; .env.hedge DRY_RUN=true HEDGE_MODE=dry_run ; curl :8002/health -> dry_run:true, run_mode:dry_run, live_tenants_count:0, live_venues:[].
- **Kill-switch fonctionnel sans auth**
  - _Preuve :_ curl POST :8001/pause -> {status:paused}; GET /kill/status -> blocked:true; POST /resume -> {status:resumed}; status -> armed:[],blocked:false. routes_admin.py:53-83. (J'ai armé puis nettoyé l'état distant.)
- **4 services vivants (8001,8002,8003,8005), 8000/8004 morts**
  - _Preuve :_ curl /health : 8001 risk-engine ok, 8002 execution-engine ok, 8003 strategy-builder ok, 8005 swarm-orchestrator ok. Processus tools/hyper_live_feed.py (pid4442) et tools/cognitive_outcome_worker.py (pid52838) vivants (ps).
- **La 'preuve' Q4 du proof-harness est truquée (signaux+réputations hardcodés)**
  - _Preuve :_ cognitive_loop.py:256-261: demo_sigs et rep_a/rep_b hardcodés (0.8/0.3), et weighted_consensus (ligne 196-203) n'a AUCUN garde n_min, contrairement au consensus.py de prod. Ne teste pas le système réel.

## ❓ INCERTAIN

- **Le worker cognitif est 'mort silencieuse >4h'** — Horloge système réelle = 02:44 UTC (date -u), pas 06:13. Les heures ps lstart (04:33/06:13) sont en fuseau local affiché. Le feed écrit ENCORE (dernier snapshot 02:44:20 = maintenant). Le worker est vivant et tick toutes les 60s mais backfill()=0 car aucun signals_ready après 01:28. Cause = pas de nouveaux runs swarm, PAS un feed mort.
- **Intégrité forte du hash-chain** — Le hash ne couvre que le payload evaluation (pas request_id/tenant/prix/created_at). Il prouve la non-altération du JSON evaluation post-insert, mais ne lie pas cryptographiquement l'outcome à sa requête ni à son prix. Tamper-evidence partielle.

## ❌ FAUX / corrigé

- **Les prix des outcomes ne correspondent PAS à de vrais snapshots (hypothèse de départ)** — Faux. Mon premier recompute utilisait le created_at de l'outcome (01:53:49) comme t0 et donnait des prix divergents. Avec le bon t0 = heure de l'event signals_ready (01:10:20), recompute == valeurs stockées au centime près. Les prix SONT réels ; seuls les UUID de requête sont synthétiques.
- **Le worker cognitif est mort/crashé** — Faux : processus vivant (pid 52838, elapsed 30min), feed écrit toujours des snapshots (dernier = heure courante). Il est muet par manque d'entrées nouvelles (aucun run swarm depuis 01:28), pas par crash.
- **calibration_error=1 quand confidence=null est juste une 'métrique dégénérée'** — Sous-estimé : ce n'est pas seulement dégénéré, c'est INVERSÉ — les décisions correctes obtiennent 1.0 (pire) et les fausses 0.0 (meilleur). La métrique punit la justesse.

## 🔢 Chiffres-clés

- REPUTATION_N_MIN=20 (consensus.py:10) vs n=2 max par agent => reputation_applied=False toujours
- 8 outcomes / 18 feedback en 38s (01:53:49->01:54:27), 0 depuis
- Réputation: orderflow 1/2 (0.5), 4 autres 0/2 (0.0), 5 agents tous n=2
- Hash-chain: 8/8 row_hash recomputés OK, 8/8 prev_hash chaînés OK
- Prix 0c0001: recompute p0=73840.335 p1=73779.715 h=297s == stocké (t0=01:10:20)
- calibration_error inversé: correct=true->1.0 (n=2), correct=false->0.0 (n=4)
- Services vivants: 8001/8002/8003/8005 ; morts: 8000/8004
- execution :8002 dry_run=true, live_tenants_count=0, live_venues=[]
- Snapshots: binance 3543 lignes, hyperliquid 6095, dernier = 02:44 (feed vivant)
- Dernier run swarm: run_jobs 01:26, signals 01:28 => cognition affamée d'entrées
