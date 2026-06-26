"""Async step writer + état global de run (extrait de dynamic_crew, H7 split).

Ce module détient l'ÉTAT GLOBAL partagé du run (`_run_writers`, `_run_writers_lock`,
`_run_ctx`) et la machinerie `_StepWriter` qui persiste `swarm_run_steps` hors du
thread du crew (queue + worker daemon).

⚠️ RÈGLE : ne JAMAIS réassigner `_run_writers` / `_run_ctx` (`= {...}`) — uniquement
les muter en place (`[k] = v`, `.pop(k)`). La façade `dynamic_crew` et `callbacks`
importent ces objets par référence ; une réassignation casserait le partage d'état.

⚠️ RÈGLE : appeler `swarm_store.append_run_step(...)` VIA le module (jamais
`from ..persistence.swarm_store import append_run_step`) pour préserver la
patchabilité des tests (`patch.object(swarm_store, "append_run_step")`).
"""
from __future__ import annotations

import logging
import queue
import threading
from typing import Any

from ..persistence import swarm_store

logger = logging.getLogger(__name__)

# Sentinel object used to signal the worker thread to exit cleanly.
_WRITER_STOP_SENTINEL = object()

# Module-level registry {run_id: _StepWriter}.
# Populated by create_dynamic_crew when run_id is provided.
# Used by flush_run_steps() called from the flow after kickoff.
_run_writers: dict[str, "_StepWriter"] = {}
_run_writers_lock = threading.Lock()

# Module-level registry {run_id: ctx} pour les callbacks module-level.
# Chaque ctx contient : agent_obj_to_id, agents_map, tasks_meta, step_state,
# writer. Protégé par _run_writers_lock (PAS de 2e lock — on réutilise
# l'existant).
_run_ctx: dict[str, dict[str, Any]] = {}


class _StepWriter:
    """Thread-safe, non-blocking writer for swarm_run_steps.

    A single daemon worker thread drains a Queue and calls
    swarm_store.append_run_step(**item). The queue is FIFO, so
    step_number order is preserved (one worker, no interleaving).

    Usage:
        writer = _StepWriter(run_id="...")
        writer.enqueue(run_id=..., agent_id=..., step_number=..., ...)
        writer.close()   # drains + joins worker before returning
    """

    # Maximum time (seconds) to wait for queue drain during close().
    # Named constant — no magic number.
    _CLOSE_TIMEOUT_SECONDS: float = 30.0

    def __init__(self, run_id: str) -> None:
        self._run_id = run_id
        self._q: queue.Queue[Any] = queue.Queue()
        self._thread = threading.Thread(
            target=self._worker,
            name=f"step-writer-{run_id[:8]}",
            daemon=True,
        )
        self._thread.start()

    def enqueue(self, **kwargs: Any) -> None:
        """Non-blocking: puts item in queue. Never raises."""
        try:
            self._q.put_nowait(kwargs)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "_StepWriter.enqueue failed for run=%s: %s",
                self._run_id, exc,
            )

    def close(self) -> None:
        """Drain the queue and wait for the worker to finish.

        Puts a sentinel to signal the worker, then joins with a bounded
        timeout so we never block the flow indefinitely on a stuck DB call.
        """
        try:
            self._q.put(_WRITER_STOP_SENTINEL)
            self._thread.join(timeout=self._CLOSE_TIMEOUT_SECONDS)
            if self._thread.is_alive():
                logger.warning(
                    "_StepWriter worker still alive after %.1fs drain — "
                    "run=%s (some steps may be lost)",
                    self._CLOSE_TIMEOUT_SECONDS, self._run_id,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "_StepWriter.close failed for run=%s: %s",
                self._run_id, exc,
            )

    def _worker(self) -> None:
        """Daemon worker: consumes queue items and persists each step."""
        while True:
            try:
                item = self._q.get()
                if item is _WRITER_STOP_SENTINEL:
                    self._q.task_done()
                    break
                try:
                    swarm_store.append_run_step(**item)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "_StepWriter worker append_run_step failed for run=%s: %s",
                        self._run_id, exc,
                    )
                finally:
                    self._q.task_done()
            except Exception as exc:  # noqa: BLE001
                # Safety net: worker must never crash.
                logger.warning(
                    "_StepWriter worker unexpected error for run=%s: %s",
                    self._run_id, exc,
                )


def flush_run_steps(run_id: str | None) -> None:
    """Drain the _StepWriter for run_id, if one exists.

    Idempotent and fail-soft:
      - run_id=None → no-op.
      - Unknown run_id → no-op (writer may have already been closed).
      - Any exception → logged as warning, never raised.

    Called by dynamic_swarm_flow.run_crew BEFORE update_swarm_run so that
    ALL queued steps are persisted before the run transitions to
    completed/failed.
    """
    if not run_id:
        return
    with _run_writers_lock:
        writer = _run_writers.pop(run_id, None)
        _run_ctx.pop(run_id, None)
    if writer is None:
        return
    try:
        writer.close()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "flush_run_steps close failed for run=%s: %s",
            run_id, exc,
        )
