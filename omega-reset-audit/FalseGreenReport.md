<!-- OMEGA-RESET — audit adversarial, généré 2026-05-29. Cible: /Dev/Projects/Hedge + DB oblwrgtfjkqixakuunaj. -->

# FalseGreenReport — Squad F

> **Verdict (thèse attaquée) :** La cognition est du VRAI code (le gate décide et redimensionne réellement), mais la boucle "apprenante" est un théâtre statistique : N=2/agent contre un garde n_min=20 rend la pondération par réputation MORTE-NÉE en prod, les tests verts prouvent l'arithmétique sur des seuils auto-référentiels et des N hardcodés (25) jamais atteignables, et les commits "12/16 tests prove influence" sont du marketing.


## ✅ PROUVÉ (reproduit)

- **Batch one-shot, pas de cognition continue : 8 outcomes + 18 feedback dans une fenêtre de 38s**
  - _Preuve :_ SQL oblwrgtfjkqixakuunaj: outcomes min 2026-05-29 01:53:49.229 / max 01:54:27.671 ; feedback min 01:53:49.560 / max 01:54:27.984
- **Réputation par agent statistiquement nulle : tous N=2**
  - _Preuve :_ SQL GROUP BY subject sur hedge_cognitive_feedback: execution_tactician 0/2, macro_strategist 0/2, orderflow_analyst 1/2, portfolio_risk_allocator 0/2, volatility_analyst 0/2
- **La pondération réputation est dead-code en prod : garde n_min=20 vs N réel=2**
  - _Preuve :_ consensus.py:10 REPUTATION_N_MIN=20 ; consensus.py:71 'if int(r.get("n",0)) >= n_min' sinon w=0.5 neutre ; repo.py:114-126 dérive n=c+w (max observé=2). 2<20 => reputation_applied jamais True en prod
- **test_sufficient_N_influences ne passe que via N hardcodé inatteignable**
  - _Preuve :_ test_weighted_consensus.py:42 'n = REPUTATION_N_MIN + 5' (=25) ; données réelles plafonnent à N=2, soit 12x trop bas
- **Métrique calibration_error dégénérée : =1 quand confidence=null (decision-level)**
  - _Preuve :_ SQL hedge_cognitive_outcomes: 4 lignes level='decision' confidence=null evaluation.calibration_error=1 (request_ids 59d8aa75, 8f49b0a7) et =0 pour les autres
- **request_ids 0c0001/0d0001/0b0002/e2e3 sont des fixtures synthétiques**
  - _Preuve :_ SQL: UUIDs zero-padded 00000000-0000-0000-0000-0000000c0001 / 0d0001 / 0b0002 / 00000000-...-00000000e2e3 ; les 4 autres sont des UUID v4 réels
- **Fixtures de test = données SYNTHÉTIQUES malgré docstring 'REAL market shape / No synthetic fallback'**
  - _Preuve :_ test_evaluator.py:88 'rng = np.random.default_rng(seed)' ; ligne 89 'rng.normal(...size=500)' — log_returns générés aléatoirement, pas lus de hedge_market_snapshots
- **Commits marketing : auto-proclamation du nombre de tests comme preuve**
  - _Preuve :_ git log: ec2ff34 '12 tests prove influence' ; 21d84cc '16 deterministic tests prove thought influences the trade'
- **Worker cognitif muet alors que le feed marché est VIVANT (la mort silencieuse est ciblée sur la cognition)**
  - _Preuve :_ SQL hedge_market_snapshots: last taken_at 2026-05-29 02:41:41, staleness 2.6s (LIVE) ; mais hedge_cognitive_outcomes s'arrête à 01:54:27 => >47min sans nouvel outcome malgré marché ingéré
- **Biais de sélection direction : 6/8 outcomes decision-level sont 'long', 0 short**
  - _Preuve :_ SQL GROUP BY level,evaluated_stance: decision/long=6 ; consensus/long=1 ; consensus/flat=1 ; aucun short au niveau decision
- **test_moderate_consensus_downsizes est quasi-circulaire (ré-dérive l'arithmétique du code)**
  - _Preuve :_ evaluator.py:139 cognitive_factor=max(0.25,min(1.0,c_conf/0.6)) ; test:53 moderate conf=0.36=>0.6, strong conf=0.9=>1.0 ; assert 0.6<1.0 par construction (taille = produit linéaire du facteur)

## ❓ INCERTAIN

- **Hash-chain réellement tamper-evident** — SQL prouve la LINKAGE (7/7 prev_hash==row_hash précédent, 0 cassé) mais PAS que row_hash==H(contenu_ligne). Intégrité de chaînage OK, intégrité de contenu non vérifiée (algo de hash non recalculé)
- **Les tests cognitive_gate (9 passed) prouvent une 'influence' au sens fort** — Ils prouvent que le code branche correctement sur des seuils déterministes (cognitive_reject/hold/downsize) — câblage réel, non tautologique au sens strict — mais sur consensus injecté à la main, jamais sur sortie LLM/marché réel
- **Les commits annoncent 12 et 16 tests ; je n'ai compté que 9 (gate) + 3 (consensus)** — Le périmètre exact des '12'/'16' tests n'a pas été énuméré exhaustivement (d'autres fichiers de test possibles non comptés). Le chiffre marketing n'est ni confirmé ni infirmé fichier-par-fichier

## ❌ FAUX / corrigé

- **GROUND TRUTH fourni : 'Snapshots marché s'arrêtent à 02:35' / worker muet >4h** — FAUX en date d'audit : hedge_market_snapshots.last=02:41:41 staleness 2.6s, feed VIVANT. Le mutisme >4h ne concerne QUE la cognition (outcomes figés à 01:54), pas le marché. Le >4h n'est pas reproductible non plus : écart outcomes->now ≈47min au moment de la mesure
- **Docstring test_evaluator.py : 'against REAL market shape. No synthetic fallback'** — Les fixtures utilisent np.random.default_rng (test_evaluator.py:88-89) — données 100% synthétiques. La claim 'no synthetic fallback' est contredite par le code du même fichier
- **Commits : 'live continuous cognition' (ec2ff34) / 'closed cognitive loop' (858f3a2)** — Aucune cognition continue observée : 100% des outcomes/feedback créés dans une seule fenêtre de 38s, puis silence total alors que le marché continue d'arriver. C'est un run batch unique, pas une boucle vivante

## 🔢 Chiffres-clés

- 8 outcomes / 18 feedback créés en 38s (01:53:49→01:54:27)
- N=2 par agent (les 5) ; orderflow 1/2, 4 autres 0/2
- REPUTATION_N_MIN=20 vs N réel max=2 => garde jamais franchi en prod
- test hardcode n=REPUTATION_N_MIN+5=25 pour faire passer test_sufficient_N_influences
- calibration_error=1 sur 4 outcomes decision-level à confidence=null
- 6/8 outcomes decision = long, 0 short (biais directionnel)
- snapshots LIVE : 9640 lignes, last 02:41:41, staleness 2.6s
- hash-chain outcomes : 7/7 liens valides, 0 cassé (linkage seul, contenu non revérifié)
- tests verts : 9 cognitive_gate + 3 weighted_consensus = 12 (vs commits annonçant 12 et 16)
- 4 request_ids fixtures synthétiques (0c0001/0d0001/0b0002/e2e3)
