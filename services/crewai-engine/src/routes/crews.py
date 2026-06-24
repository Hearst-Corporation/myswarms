import asyncio
import logging
import time as _time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..config import settings
from ..flows.chief_of_staff_flow import ChiefOfStaffFlow, ChiefOfStaffState
from ..persistence import run_store
from ..persistence.chief_decision_store import record_decision
from ..persistence.owner_scope import OwnerScope, ScopedChiefStore
from ..security.internal_auth import InternalIdentity, require_internal_identity

logger = logging.getLogger(__name__)


def _chief_scoped(identity: InternalIdentity) -> ScopedChiefStore:
    """Couche de lecture owner-scopée (R2) pour le Daily Chief of Staff.

    Toute lecture chief owner-scopée d'une route DOIT passer par ce store —
    jamais par `run_store.get_run/list_runs` directement (cf test garde).
    """
    return ScopedChiefStore(OwnerScope.from_identity(identity))

router = APIRouter(prefix="/v1/crews/chief-of-staff")

# WARN: in-memory single-process store.
# Persistence Supabase pas encore branchée (V1 squelette).
# Si Railway scale > 1 worker, runs créés sur worker A invisibles sur worker B.
# Mitigation actuelle : Railway start avec --workers 1 (default uvicorn).
_runs: dict[str, dict[str, Any]] = {}

# Strong references to background asyncio tasks — prevents silent GC-driven cancellation.
# Tasks are added at spawn and removed via done_callback when they finish.
_running_tasks: set[asyncio.Task] = set()

# Allowlist of state-override keys accepted from request.inputs.
# Denylist approach is insufficient — callers could inject crew_result, summary,
# started_at, etc. and pollute persisted state.
_ALLOWED_STATE_OVERRIDES: frozenset[str] = frozenset({
    "mock_mode",
    "user_timezone",
    "user_language",
})

# Rate limit : max N kickoffs per minute, sliding window.
# Per-process (single-worker uvicorn assumption — same as _runs).
# Mitigates compromised bearer token burning Claude API quota.
_RATE_LIMIT_PER_MINUTE = 10
_kickoff_timestamps: deque[float] = deque(maxlen=_RATE_LIMIT_PER_MINUTE * 2)


def _check_rate_limit() -> None:
    """Raise HTTPException 429 if more than _RATE_LIMIT_PER_MINUTE kickoffs in the last 60s."""
    now = _time.monotonic()
    # Purge entries older than 60s
    while _kickoff_timestamps and _kickoff_timestamps[0] < now - 60:
        _kickoff_timestamps.popleft()
    if len(_kickoff_timestamps) >= _RATE_LIMIT_PER_MINUTE:
        retry_after = int(60 - (now - _kickoff_timestamps[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit: max {_RATE_LIMIT_PER_MINUTE} kickoffs/min. Retry in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    _kickoff_timestamps.append(now)


class KickoffRequest(BaseModel):
    trigger: Literal["morning", "evening", "intraday", "on_demand", "webhook"] = "on_demand"
    inputs: dict[str, Any] = {}
    # Snooze duration in hours — 1h min, 8760h max (1 year). None = no snooze.
    snooze_hours: int | None = Field(default=None, ge=1, le=8760)


class KickoffResponse(BaseModel):
    kickoff_id: str


class StatusResponse(BaseModel):
    kickoff_id: str
    status: str
    result: str | None = None
    started_at: str
    finished_at: str | None = None
    state: dict[str, Any] | None = None


async def _execute_flow_background(
    kickoff_id: str,
    trigger: str,
    state_dict: dict[str, Any],
    started_at: str,  # noqa: ARG001 — kept for future structured logging
) -> None:
    """Background task — runs the Chief of Staff flow and updates state stores.

    Lifecycle :
    - Success → status="completed", result + state_json persisted to Supabase
    - Timeout → status="failed", error_text persisted
    - CancelledError (SIGTERM / shutdown) → status="cancelled", re-raised
    - Exception → status="failed", error_text persisted

    SIGTERM caveat : the flow runs inside `asyncio.to_thread()` which delegates to
    a Python thread. Threads are NOT interruptible by CancelledError — the
    coroutine wrapper is cancelled and the DB state is updated to "cancelled",
    but the underlying thread continues CPU work until the next checkpoint or
    completion (typically a few seconds extra). Acceptable for Railway 15s grace
    period; the DB status is consistent regardless of when the thread finally exits.
    """
    try:
        flow = ChiefOfStaffFlow()
        result = await asyncio.wait_for(
            asyncio.to_thread(flow.kickoff, inputs=state_dict),
            timeout=settings.FLOW_TIMEOUT_SECONDS,
        )
        final_state = flow.state
        state_payload = (
            final_state.model_dump() if hasattr(final_state, "model_dump") else {}
        )
        finished_at = datetime.now(timezone.utc).isoformat()
        _runs[kickoff_id].update({
            "status": "completed",
            "result": str(result),
            "finished_at": finished_at,
            "state": state_payload,
        })
        run_store.update_run(
            kickoff_id,
            status="completed",
            result=str(result),
            finished_at=finished_at,
            state_json=state_payload,
        )
    except asyncio.TimeoutError:
        msg = f"Flow execution exceeded {settings.FLOW_TIMEOUT_SECONDS}s timeout"
        finished_at = datetime.now(timezone.utc).isoformat()
        _runs[kickoff_id].update({
            "status": "failed",
            "result": msg,
            "finished_at": finished_at,
        })
        run_store.update_run(kickoff_id, status="failed", result=msg, finished_at=finished_at, error_text=msg)
    except asyncio.CancelledError:
        cancelled_msg = "Server shutdown or background task cancelled"
        finished_at = datetime.now(timezone.utc).isoformat()
        _runs[kickoff_id].update({
            "status": "cancelled",
            "result": cancelled_msg,
            "finished_at": finished_at,
        })
        run_store.update_run(kickoff_id, status="cancelled", result=cancelled_msg, finished_at=finished_at, error_text="cancelled")
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("Background kickoff %s failed: %s", kickoff_id, exc, exc_info=True)
        finished_at = datetime.now(timezone.utc).isoformat()
        _runs[kickoff_id].update({
            "status": "failed",
            "result": str(exc),
            "finished_at": finished_at,
        })
        run_store.update_run(kickoff_id, status="failed", result=str(exc), finished_at=finished_at, error_text=str(exc))


@router.post("/kickoff", response_model=KickoffResponse)
async def kickoff(
    request: KickoffRequest,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> KickoffResponse:
    """Start a Chief of Staff flow run. Returns kickoff_id IMMEDIATELY.

    The flow executes in a background asyncio task — poll /status/{kickoff_id} for progress.
    Decoupling the response from flow completion avoids HTTP timeouts (Vercel 10s, browser 30s).

    Owner dérivé du JWT interne vérifié, écrit dans `chief_run_log.owner_id`
    (migration 0015). Scoping explicite car l'engine bypasse la RLS via
    SUPABASE_SERVICE_ROLE_KEY.
    """
    oid = identity.owner_id
    logger.debug("chief-of-staff kickoff owner_id=%s", oid)
    _check_rate_limit()

    kickoff_id = str(uuid4())
    started_at = datetime.now(timezone.utc).isoformat()

    _runs[kickoff_id] = {
        "kickoff_id": kickoff_id,
        "status": "running",
        "started_at": started_at,
        "result": None,
        "finished_at": None,
        "state": None,
    }

    # Persist to Supabase — owner_id forcé = scope (couche write-side R2),
    # écrit dans chief_run_log.owner_id. Fail-soft: _runs reste le store primaire.
    _chief_scoped(identity).save_run(kickoff_id, request.trigger, "running", started_at)

    # Build initial state with allowlist override merge.
    # chief_run_id injected here so the flow can pass it to create_daily_chief_crew()
    # which registers the task_callback for step persistence in chief_run_steps.
    # R5 — owner_id (JWT vérifié) propagé pour owner-scoper les tools externes
    # (Composio entity / Telegram chat) des agents du Chief.
    initial_state = ChiefOfStaffState(
        trigger=request.trigger, chief_run_id=kickoff_id, owner_id=oid
    )
    state_dict = initial_state.model_dump()
    extra_inputs = {
        k: v for k, v in (request.inputs or {}).items()
        if k in _ALLOWED_STATE_OVERRIDES
    }
    # trigger is always sourced from request.trigger — never from inputs.
    overlapping_keys = set(extra_inputs.keys()) & set(state_dict.keys())
    if overlapping_keys:
        logger.warning(
            "Kickoff %s : caller overrides state fields %s",
            kickoff_id, sorted(overlapping_keys),
        )
    state_dict.update(extra_inputs)

    # Fire-and-forget background task with strong reference to prevent GC.
    task = asyncio.create_task(
        _execute_flow_background(kickoff_id, request.trigger, state_dict, started_at)
    )
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    return KickoffResponse(kickoff_id=kickoff_id)


@router.get("/status/{kickoff_id}", response_model=StatusResponse)
def status(
    kickoff_id: UUID,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> StatusResponse:
    """Return status and result for a given kickoff_id. FastAPI validates UUID format → 422 if malformed.

    Owner dérivé du JWT interne vérifié : scope la lecture Supabase de secours
    pour ne renvoyer que les runs de cet owner (anti cross-tenant).
    """
    oid = identity.owner_id
    logger.debug("chief-of-staff status owner_id=%s", oid)
    kid = str(kickoff_id)
    run = _runs.get(kid)
    if run is None:
        # Fallback owner-scopé vers Supabase — gère les redémarrages de pod.
        db_run = _chief_scoped(identity).get_run(kid)
        if db_run is None:
            raise HTTPException(status_code=404, detail=f"kickoff_id {kid!r} not found")
        # Map DB column names to StatusResponse fields.
        # DB schema uses state_json / error_text; Pydantic model uses state / result.
        # Pydantic v2 rejects unknown fields by default → explicit mapping required.
        result_val = db_run.get("result")
        run = {
            "kickoff_id": db_run.get("kickoff_id", kid),
            "status":     db_run.get("status", "unknown"),
            "result":     result_val if result_val is not None else db_run.get("error_text"),
            "started_at": db_run.get("started_at", ""),
            "finished_at": db_run.get("finished_at"),
            "state":      db_run.get("state_json"),  # DB col = state_json, model field = state
        }

    return StatusResponse(**run)


@router.get("/runs")
def list_runs_endpoint(
    limit: int = Query(default=20, ge=1, le=100),
    identity: InternalIdentity = Depends(require_internal_identity),
) -> list[dict]:
    """List recent Chief of Staff runs from Supabase, scoped to owner_id.

    Owner dérivé du JWT interne vérifié (anti cross-tenant).
    Returns empty list if Supabase is not configured.
    """
    return _chief_scoped(identity).list_runs(limit=limit)


def _require_run_owner(scoped: ScopedChiefStore, kickoff_id: str) -> None:
    """Raise 404 if the run does not belong to the scoped owner.

    Lecture owner-scopée via la couche R2. 404 (et non 403) pour ne pas révéler
    l'existence d'un run appartenant à un autre owner (anti-énumération).
    """
    if scoped.get_run(kickoff_id) is None:
        raise HTTPException(status_code=404, detail="Run not found or access denied")


@router.get("/runs/{kickoff_id}/steps")
def get_run_steps(
    kickoff_id: str,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> list[dict]:
    """Return all completed task steps for a given run, ordered by step_index.

    Lecture owner-scopée (couche R2) : les steps ne sont lus que si le run parent
    appartient à l'owner. 401 si JWT absent/invalide, 404 si run non possédé.
    """
    steps = _chief_scoped(identity).list_steps(kickoff_id)
    if steps is None:
        raise HTTPException(status_code=404, detail="Run not found or access denied")
    return steps


@router.get("/runs/{kickoff_id}/decisions")
def list_run_decisions_endpoint(
    kickoff_id: str,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> list[dict]:
    """Return all recorded user decisions for a given run, ordered by created_at desc.

    Lecture owner-scopée (couche R2) : les décisions ne sont lues que si le run
    parent appartient à l'owner. 401 si JWT absent/invalide, 404 si non possédé.
    """
    decisions = _chief_scoped(identity).list_decisions(kickoff_id)
    if decisions is None:
        raise HTTPException(status_code=404, detail="Run not found or access denied")
    return decisions


class DecisionRequest(BaseModel):
    kickoff_id: str
    # owner_id legacy : conservé pour rétrocompat de payload mais IGNORÉ comme
    # source de vérité — l'owner réel provient du JWT interne vérifié.
    owner_id: str | None = None
    action: Literal["sent", "snoozed", "rejected"]
    snooze_hours: int | None = None


class DecisionResponse(BaseModel):
    ok: bool
    record: dict | None = None


@router.post("/decisions", response_model=DecisionResponse)
def post_decision(
    request: DecisionRequest,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> DecisionResponse:
    """Record a user decision on a Chief run P0 item.

    Body:
        kickoff_id: the run's kickoff_id (text).
        action: 'sent' | 'snoozed' | 'rejected'.
        snooze_hours: optional int — only meaningful when action='snoozed'.

    Owner dérivé du JWT interne vérifié — ownership du run validé avant écriture.
    Returns 200 with {ok: true, record: {...}} on success.
    Returns 401 if JWT missing/invalid, 404 if run not owned.
    Returns 422 if action is invalid (Pydantic Literal validation).
    """
    _require_run_owner(_chief_scoped(identity), request.kickoff_id)
    try:
        created = record_decision(
            chief_run_id=request.kickoff_id,
            action=request.action,
            snooze_hours=request.snooze_hours,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return DecisionResponse(ok=True, record=created)
