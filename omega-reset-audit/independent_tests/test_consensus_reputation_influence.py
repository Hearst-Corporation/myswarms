"""SQUAD G #3 — Does reputation REALLY change the production consensus stance?
Imports the REAL compute_consensus from /Dev/Projects/Hedge (NOT the rigged demo
in cognitive_loop.py, NOT existing tests). Read-only on the repo.
"""
import sys
from dataclasses import dataclass, field
from typing import Any

sys.path.insert(0, "/Users/adrienbeyondcrypto/Dev/Projects/Hedge/services/swarm-orchestrator/src")
import consensus as C  # production module


@dataclass
class FakeResult:
    agent: str
    status: str = "ok"
    payload: dict = field(default_factory=dict)
    confidence: float = 0.5


def mk(agent, stance, conv=0.6, conf=0.5):
    return FakeResult(agent=agent, payload={"stance": stance, "conviction": conv}, confidence=conf)


# Scenario: 2 longs vs 1 short. RAW majority = long.
# If reputation makes the short agent dominant AND n>=n_min, weighted could flip.
results = [
    mk("macro_strategist", "long"),
    mk("orderflow_analyst", "long"),
    mk("volatility_analyst", "short"),
]

print(f"REPUTATION_N_MIN (production) = {C.REPUTATION_N_MIN}")

# (A) REAL reputation as it exists in DB right now: every agent n=2 (< 20)
rep_real = {
    "macro_strategist": {"accuracy": 0.0, "n": 2},
    "orderflow_analyst": {"accuracy": 0.5, "n": 2},
    "volatility_analyst": {"accuracy": 0.0, "n": 2},
}
out_real = C.compute_consensus(results, reputation=rep_real)
print("\n[A] REAL rep (all n=2):")
print("  reputation_applied =", out_real["reputation_applied"])
print("  raw_majority       =", out_real["raw_majority_stance"])
print("  weighted_majority  =", out_real["weighted_majority_stance"])
print("  majority_stance    =", out_real["majority_stance"], "(what the risk gate consumes)")

# (B) Synthetic reputation where the lone short agent is a god (acc 0.95, n=50)
#     and the 2 long agents are garbage (acc 0.02, n=50). n>=n_min so it COUNTS.
rep_strong = {
    "macro_strategist": {"accuracy": 0.02, "n": 50},
    "orderflow_analyst": {"accuracy": 0.02, "n": 50},
    "volatility_analyst": {"accuracy": 0.95, "n": 50},
}
out_strong = C.compute_consensus(results, reputation=rep_strong)
print("\n[B] STRONG synthetic rep (short agent god, n=50):")
print("  reputation_applied =", out_strong["reputation_applied"])
print("  raw_majority       =", out_strong["raw_majority_stance"])
print("  weighted_majority  =", out_strong["weighted_majority_stance"])
print("  majority_stance    =", out_strong["majority_stance"], "(what the risk gate consumes)")

# (C) Same strong rep but n=2 (sub-threshold) -> must be ignored
rep_strong_lown = {k: {"accuracy": v["accuracy"], "n": 2} for k, v in rep_strong.items()}
out_lown = C.compute_consensus(results, reputation=rep_strong_lown)
print("\n[C] STRONG synthetic rep but n=2 (sub-threshold):")
print("  reputation_applied =", out_lown["reputation_applied"])
print("  majority_stance    =", out_lown["majority_stance"])

print("\n=== VERDICTS ===")
print("V1 real-data reputation EVER applied? ->", out_real["reputation_applied"],
      "| stance flipped vs raw? ->", out_real["majority_stance"] != out_real["raw_majority_stance"])
print("V2 reputation CAN flip stance when n>=n_min? ->",
      out_strong["majority_stance"] != out_strong["raw_majority_stance"])
print("V3 sub-threshold rep ignored (n=2)? ->", not out_lown["reputation_applied"])
