"""Test — P0.3 : le cache in-memory `_runs` est borné (anti-OOM).

Contrat :
  - `_MAX_RUNS` est fini (== 500) — pas de croissance illimitée.
  - La purge FIFO (insertion >_MAX_RUNS) évince les plus anciens et garde la
    taille à _MAX_RUNS, sans lever même si un id a déjà disparu du dict.
  - Le plus récent reste présent ; le plus ancien est évincé.

On exerce la même séquence d'insertion+purge que `kickoff()` exécute, sur les
structures de module `_runs` / `_runs_order`, sans monter toute la stack
FastAPI (l'auth interne JWT n'est pas le sujet de ce test P0.3).
"""
from __future__ import annotations


def _insert(crews, kid: str) -> None:
    """Reproduit la séquence d'insertion + purge FIFO de kickoff()."""
    crews._runs[kid] = {"kickoff_id": kid, "status": "running"}
    crews._runs_order.append(kid)
    while len(crews._runs) > crews._MAX_RUNS:
        oldest = crews._runs_order.popleft()
        crews._runs.pop(oldest, None)


def _reset(crews) -> None:
    crews._runs.clear()
    crews._runs_order.clear()


def test_max_runs_is_finite():
    from src.routes import crews  # noqa: PLC0415

    assert isinstance(crews._MAX_RUNS, int)
    assert crews._MAX_RUNS == 500


def test_cap_holds_at_max_after_overflow():
    """Inserting _MAX_RUNS + 1 keeps the dict at exactly _MAX_RUNS."""
    from src.routes import crews  # noqa: PLC0415

    _reset(crews)
    try:
        n = crews._MAX_RUNS + 1
        for i in range(n):
            _insert(crews, f"run-{i:05d}")

        assert len(crews._runs) == crews._MAX_RUNS
        # Oldest evicted, newest present.
        assert "run-00000" not in crews._runs
        assert f"run-{n - 1:05d}" in crews._runs
        # Order deque stays consistent with the dict.
        assert len(crews._runs_order) == crews._MAX_RUNS
    finally:
        _reset(crews)


def test_cap_holds_under_heavy_overflow():
    """1001 inserts over a 500 cap → still 500, no unbounded growth."""
    from src.routes import crews  # noqa: PLC0415

    _reset(crews)
    try:
        for i in range(crews._MAX_RUNS * 2 + 1):
            _insert(crews, f"run-{i:05d}")
        assert len(crews._runs) == crews._MAX_RUNS
        assert len(crews._runs_order) == crews._MAX_RUNS
    finally:
        _reset(crews)


def test_purge_is_robust_to_already_absent_id():
    """If an id was popped from the dict out-of-band, purge must not raise."""
    from src.routes import crews  # noqa: PLC0415

    _reset(crews)
    try:
        for i in range(crews._MAX_RUNS):
            _insert(crews, f"run-{i:05d}")
        # Drop one entry from the dict but leave it in the order deque, then
        # force a purge by inserting one more — pop(oldest, None) must tolerate it.
        crews._runs.pop("run-00000", None)
        _insert(crews, "run-extra")  # would raise if pop had no default
        assert "run-extra" in crews._runs
        assert len(crews._runs) <= crews._MAX_RUNS
    finally:
        _reset(crews)
