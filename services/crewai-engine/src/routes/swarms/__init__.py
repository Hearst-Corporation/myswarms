"""Package routes.swarms — agrège les sous-routeurs swarms en un seul `router`.

Split de l'ancien `src/routes/swarms.py` (monolithe ~1073 lignes) en sous-package :
- `_shared.py`   : helpers, modèles Pydantic, état partagé (sans APIRouter).
- `crud.py`      : CRUD swarms (`router_crud`).
- `runs.py`      : kickoff/status/resume/list runs (`router_runs`).
- `architect.py` : génération de spec (`router_architect`).
- `tools.py`     : catalogue tools + Composio OAuth (`router_tools`).

Chaque sous-routeur est monté SANS prefix et conserve ses paths absolus
(`@router_*.get("/v1/...")`) → les URLs HTTP sont strictement identiques à
l'ancien monolithe (aucun prefix ajouté nulle part).

⚠️ Patchabilité (NE PAS DÉPLACER ces définitions ailleurs) :
`_execute_dynamic_flow_background` et `_adaptive_flow_timeout` sont DÉFINIS ICI,
dans le namespace du PACKAGE, car :
- `tests/test_flow_timeout.py` / `tests/test_flush_on_router_timeout.py` patchent
  `src.routes.swarms.asyncio` et `src.routes.swarms.flush_run_steps` (attributs du
  package) — le corps de `_execute_dynamic_flow_background` doit donc résoudre
  `asyncio` / `flush_run_steps` dans CE namespace.
- `tests/test_hitl_resume_endpoint.py` / `tests/test_global_template_protection.py`
  patchent `src.routes.swarms._execute_dynamic_flow_background` — `runs.py` appelle
  cette fonction via le module package (`_pkg._execute_dynamic_flow_background`),
  donc le patch est vu.
- `tests/test_scheduler_owner_fail_closed.py` + `src/scheduler.py:190` patchent /
  importent `src.routes.swarms._adaptive_flow_timeout`.

Les noms `asyncio`, `datetime`, `flush_run_steps`, `DynamicSwarmFlow`, `settings`,
`swarm_store`, `logger` sont importés au niveau module pour rester patchables.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from ...config import settings
from ...crews.dynamic_crew import flush_run_steps
from ...flows.dynamic_swarm_flow import DynamicSwarmFlow
from ...persistence import swarm_store

from ._shared import (
    AgentCreate,
    ArchitectGenerateRequest,
    KickoffRequest,
    ResumeRequest,
    SwarmCreate,
    SwarmUpdate,
    TaskCreate,
    ToolBindingCreate,
    _VALID_RUN_STATUSES,
    _deny_if_global_template,
    _hydrate_swarm_children,
    _running_tasks,
    _scoped,
    _shape_run_response,
    _shape_swarm_response,
)

logger = logging.getLogger("src.routes.swarms")


# ── Helpers patchables (définis dans le namespace package — voir docstring) ──


def _adaptive_flow_timeout(n_tasks: int) -> int:
    """Return the effective timeout (seconds) for a dynamic swarm flow.

    Uses the larger of the global floor (FLOW_TIMEOUT_SECONDS) and a per-task
    budget (n_tasks × PER_TASK_TIMEOUT_SECONDS), capped by MAX_FLOW_TIMEOUT_SECONDS.
    When n_tasks=0 (unknown), falls back to FLOW_TIMEOUT_SECONDS.

    WHY cap: without it, n_tasks ≥ 16 yields a timeout > STALE_RUN_MAX_AGE_MINUTES * 60,
    so the periodic cleanup job would mark a still-running (within-budget) run as failed.
    The cap enforces the invariant: adaptive_timeout ≤ MAX_FLOW_TIMEOUT_SECONDS < stale cutoff.
    """
    return min(
        settings.MAX_FLOW_TIMEOUT_SECONDS,
        max(settings.FLOW_TIMEOUT_SECONDS, n_tasks * settings.PER_TASK_TIMEOUT_SECONDS),
    )


async def _execute_dynamic_flow_background(
    swarm_id: str,
    run_id: str,
    trigger: str,
    inputs: dict[str, Any],
    n_tasks: int = 0,
    owner_id: str | None = None,
    checkpoint_index: int = 0,
) -> None:
    """Fire-and-forget : exécute DynamicSwarmFlow dans un thread, met à jour la DB.

    Identique à `_execute_flow_background` (routes/crews.py) :
    - Success → status="completed" (posé par finalize())
    - Pause HITL → status reste "paused_hitl" (posé par l'outil ask_human ;
      run_crew catch HumanDecisionRequired et finalize() est un no-op) → on ne
      marque NI completed NI failed.
    - Timeout → status="failed", error_text
    - CancelledError (SIGTERM) → status="cancelled"
    - Exception → status="failed", error_text

    `n_tasks` : nombre de tasks du swarm, utilisé pour un timeout adaptatif
    via `_adaptive_flow_timeout`. n_tasks=0 → retombe sur FLOW_TIMEOUT_SECONDS.
    `owner_id` : propagé dans le state du flow pour l'isolation multi-tenant.
    `checkpoint_index` : index de la 1ʳᵉ task à exécuter (resume HITL) — 0 au kickoff.
    """
    effective_timeout = _adaptive_flow_timeout(n_tasks)
    try:
        flow = DynamicSwarmFlow()
        state_dict = {
            "swarm_id": swarm_id,
            "run_id": run_id,
            "trigger": trigger,
            "inputs": inputs,
            "owner_id": owner_id,
            "checkpoint_index": checkpoint_index,
        }
        await asyncio.wait_for(
            asyncio.to_thread(flow.kickoff, inputs=state_dict),
            timeout=effective_timeout,
        )
        # finalize() a déjà posé status=completed côté DB.
    except asyncio.TimeoutError:
        msg = f"Swarm flow exceeded {effective_timeout}s timeout"
        logger.error("Run %s timed out", run_id)
        # WHY flush via to_thread: if crew.kickoff() hung until wait_for expired, the
        # _StepWriter worker + queue are still alive — flush before marking failed to
        # drain any queued steps and release the registry entry (_run_writers leak
        # prevention). Calling flush_run_steps() directly (sync) would block the event
        # loop for up to 30s (thread.join timeout) — precisely the DB-slow scenario that
        # triggered the timeout in the first place.
        flush_run_steps(run_id)
        swarm_store.update_swarm_run(
            run_id,
            status="failed",
            error_text=msg,
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
    except asyncio.CancelledError:
        logger.warning("Run %s cancelled (server shutdown)", run_id)
        # WHY shield: CancelledError re-cancels any plain await immediately.
        # asyncio.shield() lets to_thread complete even if the outer task is cancelled,
        # giving flush_run_steps a chance to drain the writer and release the registry
        # entry before the process terminates. Errors here are swallowed best-effort —
        # the P1 boot cleanup job catches any unfinalised runs on next restart.
        try:
            flush_run_steps(run_id)
        except (asyncio.CancelledError, Exception):
            pass  # flush best-effort — P1 boot cleanup rattrape les runs non finalisés
        swarm_store.update_swarm_run(
            run_id,
            status="cancelled",
            error_text="Server shutdown or task cancelled",
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("Run %s failed: %s", run_id, exc, exc_info=True)
        # WHY flush via to_thread: idempotent fail-soft — if run_crew already flushed
        # this is a no-op; if the exception was raised before flush, this prevents the
        # _StepWriter thread leak without blocking the event loop.
        flush_run_steps(run_id)
        swarm_store.update_swarm_run(
            run_id,
            status="failed",
            error_text=str(exc),
            finished_at=datetime.now(timezone.utc).isoformat(),
        )


# ── Montage du router agrégé ─────────────────────────────────────────────────
# Import des sous-routeurs APRÈS la définition de _execute_dynamic_flow_background
# et _adaptive_flow_timeout : `runs.py` fait `import src.routes.swarms as _pkg`
# au top-level (cycle bénin), et résout `_pkg._execute_dynamic_flow_background`
# uniquement au request-time — donc les attributs ci-dessus existent déjà.

from .crud import router_crud  # noqa: E402 — import après défs (ordre voulu, voir ci-dessus)
from .runs import router_runs  # noqa: E402
from .architect import router_architect  # noqa: E402
from .tools import (  # noqa: E402
    router_tools,
    ComposioConnectRequest,
    _build_toolkit_auth_configs,
    _get_toolkit_auth_configs,
)

router = APIRouter()
router.include_router(router_crud)
router.include_router(router_runs)
router.include_router(router_architect)
router.include_router(router_tools)


__all__ = [
    "router",
    # helpers patchables / importés direct
    "_adaptive_flow_timeout",
    "_execute_dynamic_flow_background",
    "_deny_if_global_template",
    "_build_toolkit_auth_configs",
    "_get_toolkit_auth_configs",
    "_scoped",
    "_running_tasks",
    "_shape_swarm_response",
    "_shape_run_response",
    "_hydrate_swarm_children",
    "_VALID_RUN_STATUSES",
    # noms patchables au niveau module (asyncio / flush_run_steps / swarm_store ...)
    "asyncio",
    "flush_run_steps",
    "swarm_store",
    "settings",
    "DynamicSwarmFlow",
    "datetime",
    "logger",
    # modèles Pydantic
    "AgentCreate",
    "TaskCreate",
    "ToolBindingCreate",
    "SwarmCreate",
    "SwarmUpdate",
    "KickoffRequest",
    "ResumeRequest",
    "ArchitectGenerateRequest",
    "ComposioConnectRequest",
]
