<!-- OMEGA-RESET — audit adversarial, généré 2026-05-29. Cible: /Dev/Projects/Hedge + DB oblwrgtfjkqixakuunaj. -->

# LearningTruth — Squad C

> **Verdict (thèse attaquée) :** FAUX: "le système apprend" est indéfendable — il recalcule un ratio sur N=2 points par agent issus de 2 runs-fixtures one-shot, et la pondération réputationnelle est structurellement INACTIVE en prod (n_min=20 >> N=2), donc la réputation ne change JAMAIS la sortie du consensus live.


## ✅ PROUVÉ (reproduit)

- **La réputation est CALCULÉE (agrégée) depuis hedge_cognitive_feedback, pas écrite en dur**
  - _Preuve :_ repo.py:109-127 fetch_agent_reputation = COUNT FILTER AGENT_CORRECT/(CORRECT+WRONG) GROUP BY subject. Recompute SQL identique reproduit: orderflow_analyst 1/2=0.500, macro/volatility/portfolio/execution 0/2=0.000.
- **Réputation falsifiable trivialement (1 feedback bidon la fait bouger)**
  - _Preuve :_ SQL recompute avec +1 AGENT_CORRECT bidon sur macro_strategist: acc_now=0.000 -> acc_if_bogus=0.333. Aucune protection (pas de signature sur le calcul, insert seul suffit).
- **Le consensus pondéré N'utilise PAS la réputation en prod: n_min=20 alors que N=2/agent**
  - _Preuve :_ consensus.py:10 REPUTATION_N_MIN=20; ligne 71 `if int(r.get('n',0)) >= n_min` sinon poids neutre 0.5. swarm_worker.py:105-106 appelle compute_consensus(reputation=...) SANS override n_min. Avec n=2<20 -> reputation_applied=False -> eff_majority=raw_majority. La réputation est lue puis JETÉE.
- **Les prix outcomes viennent de hedge_market_snapshots RÉELS (Binance), pas de fixtures**
  - _Preuve :_ cognitive_loop.py:31-60 realized() jointure sur hedge_market_snapshots payload->>'mid_price'. Outcomes: BTCUSDT price_t0=73840/73619, 9628 snapshots tous avec mid_price. Prix authentiques.
- **Les 2 outcomes consensus (source de TOUTE la réputation par agent) sont des FIXTURES synthétiques**
  - _Preuve :_ hedge_cognitive_outcomes level=consensus: request_id 00000000-...-0c0001 et 0d0001 (UUID zero-prefix = fixtures). Les 18 AGENT_CORRECT/WRONG dérivent uniquement de ces 2 runs fixtures.
- **calibration_error dégénérée au decision-level (confidence=null)**
  - _Preuve :_ cognitive_loop.py:63-72 conf=float(confidence or 0.0); cal=|conf-(1 si correct)|. Data: decision ok=true->cal=1.0, ok=false->cal=0.0 (métrique INVERSÉE/vide quand conf=null).
- **Batch one-shot 38s, pas de cognition continue; worker vivant mais muet**
  - _Preuve :_ 8 outcomes + 18 feedback entre 01:53:49 et 01:54:27 (DB). ps: PID 52838 cognitive_outcome_worker.py vivant. last_outcome=01:54:27, last_snapshot=02:41:16, db_now=02:41:39 -> aucun outcome ni snapshot neufs depuis ~02:41 alors que le worker tourne (feed marché tari).
- **Hash-chain intègre mais ne protège rien de l'apprentissage**
  - _Preuve :_ SQL: row_hash = hedge_chain_hash(prev_hash, evaluation) TRUE sur les 8 outcomes. Mais la réputation est recalculée à la volée hors chaîne (pas de table reputation), donc la chaîne n'empêche pas l'insert d'un feedback bidon.

## ❓ INCERTAIN

- **Le standalone cognitive_loop.weighted_consensus() prouverait que réputation change le vote** — cognitive_loop.py:196-203 weighted_consensus n'a AUCUN garde n_min (contrairement à consensus.py prod n_min=20). Le 'proof harness' (l.255-261) utilise des réputations SYNTHÉTIQUES hardcodées (0.8/0.3) sur 2 signaux fictifs pour répondre OUI à Q4 — démonstration en chambre, pas le chemin live.
- **Ampleur exacte du silence du worker (>4h ou ~47min)** — Horloge système (ps: restart 06:13) vs horloge DB (db_now 02:41) divergent de ~3h30. En temps DB le silence est ~47min; l'hypothèse '>4h' mélange les deux horloges. Confirmé muet, magnitude ambiguë.

## ❌ FAUX / corrigé

- **Réputation par agent écrite en dur / non dérivée** — Faux: c'est une agrégation SQL pure du ledger (repo.py:109-127 et cognitive_loop.py:180-193). Aucun score n'est écrit à la main; recompute reproductible à l'identique.
- **Prix outcomes = fixtures synthétiques** — Faux: les PRIX viennent de hedge_market_snapshots réels (Binance mid_price). Ce sont les request_ids des 2 runs consensus qui sont des fixtures, pas les prix.
- **Le système apprend / réputation -> poids -> stance influence la décision live** — Faux en prod: trace reputation->poids cassée par n_min=20. À N=2, reputation_applied=False, eff_majority=raw_majority. Les poids sont calculés puis ignorés. Aucune boucle d'apprentissage active n'altère une décision live.

## 🔢 Chiffres-clés

- 8 outcomes (2 consensus-fixtures 0c0001/0d0001 + 6 decision) / 18 feedback
- Fenêtre génération: 38s (01:53:49 -> 01:54:27 DB)
- Réputation N=2 par agent: orderflow 1/2=0.500, 4 autres 0/2=0.000
- n_min consensus prod = 20 (>> N=2) -> réputation JAMAIS appliquée live
- Falsifiabilité: +1 feedback bidon macro_strategist 0.000 -> 0.333
- 9628 snapshots marché, 100% avec mid_price, dernier 02:41:16 DB
- Hash-chain: 8/8 row_hash valides (chain_ok=true)
- calibration_error decision-level dégénérée: correct->1.0, wrong->0.0 (conf=null)
- pattern_n_min=10 (risk gate failed-pattern) et n_min=20 (consensus) tous deux jamais atteints
