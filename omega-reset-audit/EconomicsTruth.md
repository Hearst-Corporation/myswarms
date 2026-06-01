<!-- OMEGA-RESET — audit adversarial, généré 2026-05-29. Cible: /Dev/Projects/Hedge + DB oblwrgtfjkqixakuunaj. -->

# EconomicsTruth — Squad E

> **Verdict (thèse attaquée) :** DÉTRUITE : aucune preuve que la cognition/le consensus pondéré améliore le trading — 2/8 prédictions correctes (sign test p=0.45, indiscernable du bruit), PnL net négatif après frais (-0.34%), et le poids-réputation est CODE MORT en prod (gate n_min=20 jamais atteint, max n=2).


## ✅ PROUVÉ (reproduit)

- **Seulement 2/8 outcomes direction_correct=true ; au niveau décision 2/6.**
  - _Preuve :_ SQL oblwrgtfjkqixakuunaj hedge_cognitive_outcomes: ok=true sur rid 7b5e61 et 7209f1 uniquement (les 6 autres false). N=8.
- **PnL hypothétique non distinguable du bruit (test de signe non significatif).**
  - _Preuve :_ 7 outcomes PnL non-nuls: 5 pos / 2 neg → test de signe bilatéral n=7,k=2 → p=0.4531 (calcul Python via math.comb). Non significatif.
- **PnL net NÉGATIF une fois les frais inclus — les gains sont sous le bruit de frais.**
  - _Preuve :_ Cumul brut décision +0.1997% mais move brut moyen 0.0425% < frais aller-retour 0.09% (taker Binance 0.045%/côté). Net après frais sur 6 trades décision = -0.3403%.
- **Le consensus pondéré par réputation est inactif en production : la garde n_min=20 ne peut jamais se déclencher.**
  - _Preuve :_ services/swarm-orchestrator/src/consensus.py:10 REPUTATION_N_MIN=20 ; ligne 71 'if r.get(n) >= n_min'. SQL feedback: tous les 5 agents ont n=2 (max). Donc reputation_applied=False toujours, eff_majority=raw majority (consensus.py:80).
- **Aucun A/B ni backtest ne compare cognition-ON vs OFF, ni n'utilise la réputation.**
  - _Preuve :_ grep backtest.py: 0 occurrence de reputation/weighted_consensus/cognitive. Le service engine (backtest) n'écoute sur aucun port (lsof: seuls 8001/8002/8003/8005). Non câblé à la boucle cognitive.
- **Les 2 events consensus en DB n'enregistrent même pas le verdict de pondération.**
  - _Preuve :_ SQL hedge_run_events kind=signals_ready: reputation_applied=null, weight_delta=null, raw=null, weighted=null sur les 2 lignes. eff='long'/'flat'. La preuve de 'flip' du commit msg 858f3a2 n'existe pas dans les données.
- **Le 'flip long->short matching reality' vanté par le commit est une fixture synthétique du proof harness, pas une mesure réelle.**
  - _Preuve :_ tools/cognitive_loop.py:256-261: demo_sigs/rep_a/rep_b hardcodés (accuracy 0.8/0.3) pour Q4 ; commentaire ligne 255 'demonstrate via a synthetic contrast'.
- **execution-engine en dry_run → zéro PnL réalisé réel.**
  - _Preuve :_ curl 127.0.0.1:8002/health → {dry_run:true, run_mode:dry_run, live_notional_cap_usd:0.0, live_venues:[]}.

## ❓ INCERTAIN

- **calibration_error=1.0 sur les outcomes decision (confidence=null) est une métrique dégénérée qui gonfle artificiellement l'erreur.** — cognitive_loop.py:72 calcule abs(conf - 1/0) avec conf=0.0 quand null ; sur les decisions correctes (7b5e61,7209f1) cal=1.0 alors que la prédiction était juste — métrique cassée, mais sans impact PnL direct.
- **La boucle d'outcome est vivante mais ne mûrit plus d'outcome depuis 01:54 malgré snapshots frais (02:41).** — SQL: dernier snapshot à 02:41 (3.5s stale) MAIS aucun outcome après 01:54 → soit plus aucun nouveau run/consensus à évaluer, soit backfill ne trouve pas de nouveaux events. Cause exacte (absence de runs vs bug) non isolée en read-only.

## ❌ FAUX / corrigé

- **Commit 858f3a2 : 'reputation-weighted consensus (flips c0001 long->short matching reality)' — implique une amélioration réelle mesurée.** — En prod le poids-réputation est désactivé (n_min=20 > n=2). Le 'flip' provient de reps hardcodées (0.8/0.3) dans le proof harness synthétique (cognitive_loop.py:256-261), pas de données réelles. Les events DB n'ont pas weight_delta.
- **Commit ec2ff34 : '12 tests prove influence at sufficient N' — suggère une influence prouvée sur le trading.** — Les tests prouvent au mieux que la fonction de pondération change un vote à N≥20 synthétique ; aucun agent réel n'atteint N≥20 (tous à n=2), donc zéro influence en prod. Aucun test ne mesure PnL/amélioration réelle.
- **Thèse 'la cognition améliore le trading / réduit les pertes / gagne plus'.** — 2/8 correct, sign test p=0.45, PnL net -0.34% après frais, pondération morte, exec en dry_run (0 PnL réel), aucun A/B. Indiscernable du hasard et négatif net.

## 🔢 Chiffres-clés

- direction_correct: 2/8 (decision 2/6)
- sign test PnL non-nuls n=7 k=2 → p=0.4531 (non significatif)
- cumul brut décision +0.1997% ; tous niveaux +0.1176%
- move brut moyen 0.0425% < frais aller-retour 0.09%
- PnL net après frais (6 trades décision) = -0.3403%
- REPUTATION_N_MIN=20 vs n réel max=2 → reputation_applied=False toujours
- réputation agents: orderflow 1/2, 4 autres 0/2 (tous n=2)
- execution dry_run=true, live_notional_cap_usd=0.0
- 8 outcomes + 18 feedback, fenêtre 01:53:49→01:54:27 (38s)
- snapshots: 9648 lignes, dernier 02:41:58 (frais) mais 0 outcome après 01:54
