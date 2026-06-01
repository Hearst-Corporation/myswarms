<!-- OMEGA-RESET — audit adversarial, généré 2026-05-29. Cible: /Dev/Projects/Hedge + DB oblwrgtfjkqixakuunaj. -->

# RuntimeTruth — Squad A

> **Verdict (thèse attaquée) :** La "cognition continue" est un mythe : les 4 services HTTP vivent et le feed marché écrit en temps réel, mais le worker cognitif est vivant-muet (0 nouvel outcome depuis 01:54 UTC, sources gelées, log "8 matured" trompeur), sans aucun heartbeat ni monitoring — mort silencieuse non détectée.


## ✅ PROUVÉ (reproduit)

- **4 services tournent et répondent /health 200 ; 8000 (crewai) et 8004 (market-data) sont morts**
  - _Preuve :_ lsof :800x → LISTEN sur 8001/8002/8003/8005 seulement ; curl /health: 8001/8002/8003/8005=HTTP200 {status:ok}, 8000 & 8004=HTTP000 INJOIGNABLE. exec-engine confirme dry_run=true/run_mode=dry_run/live_tenants=0
- **Le worker cognitif (PID 52838) tourne depuis ~02:13 UTC mais a produit 0 outcome : max(created_at) figé à 01:54:27 UTC**
  - _Preuve :_ ps etime=28:10 sur PID 52838 ; SQL hedge_cognitive_outcomes max=2026-05-29 01:54:27 / feedback max=01:54:27 ; now()=~02:41 UTC → muet >40min (et >4h depuis dernier outcome)
- **Le worker n'est pas planté mais structurellement muet : il re-balaye 2 events signals_ready + 6 risk_decisions (sources gelées) et 'on conflict do nothing' bloque tout nouvel insert**
  - _Preuve :_ SQL: signals_ready=2 (max 01:28 UTC), risk_decisions=6 (max 00:37 UTC). cognitive_loop.py L106-177 backfill itère TOUS les events sans filtre temporel ; _ins_outcome L87 'on conflict (request_id,level) do nothing'
- **Le log worker affiche 'tick: 8 matured outcomes evaluated' à chaque tick — métrique MENSONGÈRE : n_out compte les outcomes RE-ITÉRÉS, pas les NOUVEAUX**
  - _Preuve :_ /private/tmp/hedge-logs/outcome-worker.log: 23 lignes identiques 'tick: 8 matured'. cognitive_loop.py n_out++ L130/L168 dans la boucle de balayage, return L177 ; aucun delta inséré (max created_at inchangé)
- **Le feed (PID 4442) vit en temps réel mais n'alimente QUE 2 des 4 tables marché**
  - _Preuve :_ market_snapshots age 0.5s (max 02:41), portfolio_snapshots age 0.2s (max 02:41) ; MAIS orderbook_snapshots age 2h06 (max 00:34) et market_events age 2h06 (max 00:34). hyper_live_feed.py n'écrit que hedge_market_snapshots+hedge_portfolio_snapshots (L107-128), jamais orderbook/events
- **Aucun heartbeat/monitoring/alerting sur la chaîne cognitive : une mort silencieuse passe inaperçue**
  - _Preuve :_ grep heartbeat|watchdog|liveness|self-heal sur tools/+services/src → seul résultat pertinent = deadman switch d'execution-engine (sans lien cognition). cognitive_outcome_worker.py catch-all L33 print l'erreur et continue, sans alerte
- **Réputation statistiquement nulle : N=2 par agent**
  - _Preuve :_ SQL AGENT_CORRECT/WRONG: orderflow_analyst 1/1, execution_tactician 0/2, macro_strategist 0/2, portfolio_risk_allocator 0/2, volatility_analyst 0/2
- **calibration_error dégénéré au niveau decision : 6/6 confidence=null → conf=0.0 → cal=1.0 ssi correct**
  - _Preuve :_ SQL: level=decision n=6 conf_null=6 cal_eq_1=2. evaluate() L67/L72: conf=float(confidence or 0.0), cal=abs(conf-(1 si correct sinon 0)) → 1.0 pour les 2 'correct', 0.0 sinon
- **Hash-chain RÉELLEMENT intègre sur les 8 outcomes**
  - _Preuve :_ SQL recompute: total=8, prev_links_ok=8 (prev_hash=lag(row_hash)), row_hash_recompute_ok=8 (row_hash=hedge_chain_hash(prev_hash,evaluation))
- **Fixtures synthétiques confirmées au niveau decision**
  - _Preuve :_ SQL decision: request_id 00000000-...-e2e3 et 00000000-...-0b0002 présents parmi les 6

## ❓ INCERTAIN

- **Cause exacte du gel d'orderbook_snapshots/market_events à 00:34 UTC** — Corrèle avec l'absence du market-data-service :8004 (mort), producteur probable, mais non prouvé directement — aucun process/log identifié comme leur source actuelle
- **L'absence de 8000/8004 'casse' la chaîne de bout en bout** — Les nouveaux runs (signals_ready/risk_decisions) ont cessé à 00:37-01:28 UTC, cohérent avec une orchestration crewai (8000) à l'arrêt, mais le lien causal direct 8000→génération de runs n'a pas été tracé dans le code lu (Squad A=runtime, pas flow complet)
- **L'incohérence pnl>0 & correct=false au niveau decision est un bug** — Observé (ex: pnl=0.000408 avec correct=false) : dû à FLAT_BAND=5bps qui classe le move réalisé en 'flat' alors que pnl_if_followed reste signé positif. Plausiblement un défaut de design mais hors périmètre runtime strict

## ❌ FAUX / corrigé

- **Worker cognitif 'bloqué'/figé (hypothèse de la ground-truth)** — Faux au sens propre : le process tourne, boucle toutes les 60s, écrit son log (23 ticks), n'a pas crashé. Il est MUET par construction (rien de nouveau à mûrir + on-conflict-do-nothing), pas bloqué. La nuance casse la thèse 'mort silencieuse par blocage'
- **'8 matured outcomes evaluated' = 8 outcomes réellement produits par tick** — Faux : n_out compte les outcomes re-balayés, pas les inserts. 0 nouvel outcome créé depuis 01:54 malgré 23 ticks affichant '8'. Le log surévalue l'activité réelle (= 0)
- **'Cognition continue, no more manual backfill' (docstring cognitive_loop.py L1-8 / outcome_worker L1-7)** — Faux en pratique : la 'continuité' dépend d'un flux de nouveaux runs qui s'est tari (sources gelées 00:37-01:28). Sans nouveaux signals_ready/decisions, le 'closed loop' ne produit plus rien — c'est un batch one-shot habillé en boucle

## 🔢 Chiffres-clés

- Ports LISTEN: 8001,8002,8003,8005 (4/6). Morts: 8000,8004
- outcomes=8, feedback=18, fenêtre création=38s (01:53:49→01:54:27 UTC), inchangée
- Heure mesure≈02:41 UTC ; worker PID52838 etime 28:10 ; 0 nouvel outcome
- Sources figées: signals_ready=2 (max 01:28), risk_decisions=6 (max 00:37), strategy_requests=23 (max 01:26)
- Feed: market_snapshots=9622 age 0.5s, portfolio=2131 age 0.2s (VIVANTS) ; orderbook=7169 & events=4803 age 2h06 (GELÉS 00:34)
- Réputation N=2/agent: orderflow 1/2, 4 autres 0/2
- Hash-chain: 8/8 prev_links_ok, 8/8 row_hash_recompute_ok
- calibration_error: decision n=6, conf_null=6, cal=1.0 sur 2 (dégénéré)
- Worker log: 23 ticks identiques 'tick: 8 matured outcomes evaluated', interval=60s
- dry_run=true, live_tenants_count=0, live_notional_cap=0 (execution-engine :8002)
