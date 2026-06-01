<!-- OMEGA-RESET — audit adversarial, généré 2026-05-29. Cible: /Dev/Projects/Hedge + DB oblwrgtfjkqixakuunaj. -->

# MemoryTruth — Squad D

> **Verdict (thèse attaquée) :** "Le système se souvient" est FAUX: la failed-pattern memory existe en code, est DB-dérivée à la volée, mais est mathématiquement inatteignable (n<10 partout) et n'a influencé AUCUNE des 6 décisions risk jamais écrites — mémoire purement décorative.


## ✅ PROUVÉ (reproduit)

- **La failed-pattern memory N'est PAS en RAM: c'est une agrégation SQL recalculée à chaque décision sur hedge_cognitive_outcomes. Aucun cache/état self._ dans worker ou repo.**
  - _Preuve :_ repo.py:131-147 fetch_failed_pattern() fait un SELECT count/success_rate live; seul call site risk_worker.py:156 (await à chaque _process). grep RAM cache → 0 attribut de mémoire.
- **Le gate exige n>=pattern_n_min(=10) ET success_rate<0.4. Avec les données réelles il ne peut JAMAIS se déclencher.**
  - _Preuve :_ evaluator.py:142-145 (pattern_n_min=10 défaut ligne 89). SQL gate-sim: long n=7 success=0.71 GATE_FIRES=false; flat n=1 GATE_FIRES=false. short=0 rows → fetch retourne None → gate sauté.
- **La mémoire n'a influencé AUCUNE décision committée. Zéro lookup→influence sur APPROVE/REJECT/sizing.**
  - _Preuve :_ SQL hedge_risk_decisions: total=6, fp_hold_decisions=0, fp_in_eval(rules_eval ? 'failed_pattern')=0. Reason codes observés: log_returns_insufficient×2, ok×2, portfolio_stale×2 — jamais failed_pattern_hold.
- **Impossibilité temporelle: les outcomes (mémoire) n'existaient pas quand les décisions ont été prises.**
  - _Preuve :_ Dernière décision risk computed_at=2026-05-29 00:37:43; 1er outcome created_at=2026-05-29 01:53:49 (>1h APRÈS). La mémoire est née après la dernière décision → 0 possibilité d'influence.
- **Survit-elle au restart 06:13 ? Oui (DB-backed, recalculée du ledger) — mais sans effet: le ledger gelé à 01:54 reste sous le seuil n=10, donc gate toujours mort post-restart.**
  - _Preuve :_ hedge_cognitive_outcomes total=8, last_row=2026-05-29 01:54:27 (figé). fetch_failed_pattern relit la même agrégation → long n=7<10 inchangé.
- **Aucune failed-pattern memory côté swarm-orchestrator. Seule la reputation-weighting existe, elle-même neutralisée (w=0.5) sous n_min.**
  - _Preuve :_ grep failed_pattern/success_rate/fetch_failed sur services/swarm-orchestrator/src/ → 0 résultat. consensus.py:64-75: w=0.5 neutre si historique insuffisant.
- **La 'preuve' interne du système (cognitive_loop Q5 'Pattern perdant détecté? OUI') est une tautologie, pas une preuve de comportement.**
  - _Preuve :_ cognitive_loop.py:262 conditionne OUI sur total_out>0 (8 lignes existent), pas sur le déclenchement du gate evaluator (n>=10 & sr<0.4).

## ❓ INCERTAIN

- **Le gate POURRAIT théoriquement fonctionner si >=10 outcomes 'short' perdants étaient accumulés en continu.** — Code logiquement correct (evaluator.py:142-145), mais worker cognitif muet depuis 01:54 (>4h) et seul stance 'long'/'short' interrogé via spec.direction — jamais validé en conditions réelles. Non reproductible avec données actuelles.
- **Intégrité hash-chain prev_hash/row_hash des outcomes/decisions non re-vérifiée bit-à-bit ici.** — Hors scope mémoire-forensics; colonnes prev_hash/row_hash présentes (hedge_risk_decisions) mais recalcul de la chaîne non exécuté dans cette passe.

## ❌ FAUX / corrigé

- **Le système se souvient des patterns perdants et modifie ses décisions en conséquence.** — Aucune des 6 décisions n'a consulté la mémoire avec effet (fp_in_eval=0, fp_hold=0). Gate inatteignable: max bucket long n=7<10 et success_rate=0.71>0.4. Mémoire née 1h après la dernière décision.
- **La failed-pattern memory vit en RAM du worker et risque d'être perdue au restart 06:13.** — Elle est DB-dérivée (SELECT live sur hedge_cognitive_outcomes à chaque appel, repo.py:136-141). Elle survit au restart par construction — mais reste sans effet car sous le seuil n=10.
- **Un changement de comportement mesurable (décision modifiée par un pattern) est démontrable.** — Impossible à démontrer: 0 décision avec failed_pattern_hold, 0 décision avec failed_pattern dans rules_eval. Le différentiel avec/sans pattern est nul car le pattern n'entre jamais dans la branche active (n<10).

## 🔢 Chiffres-clés

- pattern_n_min=10 (seuil minimal d'échantillons, evaluator.py:89)
- success_rate threshold=0.4 (evaluator.py:143)
- outcomes long: n=7, success_rate=0.71 → GATE_FIRES=false
- outcomes flat: n=1, success_rate=0 → GATE_FIRES=false (et flat jamais interrogé)
- outcomes short: 0 rows → fetch retourne None → gate sauté
- hedge_risk_decisions: total=6, failed_pattern_hold=0, failed_pattern dans rules_eval=0
- Dernière décision: 2026-05-29 00:37:43 / 1er outcome: 2026-05-29 01:53:49 (mémoire née 1h16 APRÈS la dernière décision)
- Outcomes figés: 8 lignes, last_row 01:54:27 (muet depuis)
- Swarm-orchestrator: 0 occurrence de failed_pattern (mémoire absente côté swarm)
