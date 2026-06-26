"""Sous-routeur runs — kickoff / status / resume / list runs / cross-swarm get.

Paths absolus inchangés (`/v1/swarms/{id}/kickoff`, `/v1/swarms/{id}/status/{run_id}`,
`/v1/swarms/{id}/runs/{run_id}/resume`, `/v1/swarms/{id}/runs`, `/v1/runs/{run_id}`).
Monté sans prefix → URLs strictement identiques.

⚠️ Patchabilité : les endpoints appellent `_execute_dynamic_flow_background` VIA
le module PACKAGE (`import src.routes.swarms as _pkg` → `_pkg._execute_dynamic_flow_background`).
Plusieurs tests font `patch("src.routes.swarms._execute_dynamic_flow_background")`,
qui remplace l'attribut du package : l'appel `_pkg.<attr>` voit donc le patch.
L'import du package au top-level crée un cycle bénin (runs ← package ← runs),
résolu au runtime car l'attribut n'est résolu qu'au moment de l'appel (request-time),
bien après la fin de l'import de `__init__.py`.
"""
from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

import src.routes.swarms as _pkg  # noqa: PLC0415 — façade pour patchabilité (voir docstring)

from ...config import settings
from ...security.internal_auth import require_internal_identity, InternalIdentity
from ...persistence import swarm_store
from ._shared import (
    KickoffRequest,
    ResumeRequest,
    _running_tasks,
    _scoped,
    _shape_run_response,
)

router_runs = APIRouter()


@router_runs.post("/v1/swarms/{swarm_id}/kickoff", status_code=202)
async def kickoff_swarm_endpoint(
    swarm_id: str,
    request: KickoffRequest,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Lance un run async. Retourne immédiatement `{run_id, swarm_id, status}`.

    La réponse respecte `SwarmKickoffResponseSchema` côté front (`{run_id}`).
    Le polling se fait via `/v1/swarms/{id}/status/{runId}` qui retourne la
    shape complète `SwarmRun` (avec `id`, pas `run_id`).

    Owner dérivé du JWT interne vérifié : on valide que le swarm appartient à
    ce propriétaire avant de kicker quoi que ce soit (404 sinon).
    """
    oid = identity.owner_id

    # Validation owner-scopée : le swarm doit exister et appartenir à l'owner.
    loaded = _scoped(identity).get_swarm(swarm_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found")

    # F3 fix : refuser le kickoff sur un swarm archivé (is_active=false).
    # Un swarm archivé ne doit plus être déclenchable même via API directe.
    if not loaded.get("swarm", {}).get("is_active", True):
        raise HTTPException(status_code=409, detail="Swarm is archived")

    # G6 fix : refuser le kickoff sur un swarm sans agent ou sans task.
    # Sans validation explicite, `create_dynamic_crew` raise ValueError au
    # milieu du flow (500 opaque côté caller). Mieux : 400 immédiat avec
    # un message lisible côté UI.
    if not loaded.get("agents") or not loaded.get("tasks"):
        raise HTTPException(
            status_code=400,
            detail="Swarm must have at least 1 agent and 1 task to kickoff",
        )

    run_id = str(uuid4())
    # Couche write-side : valide l'accès au swarm (owner ou template) et force
    # owner_id=scope sur le run créé (R1/R2).
    _scoped(identity).save_run(
        run_id=run_id,
        swarm_id=swarm_id,
        trigger=request.trigger,
        status="running",
        inputs_json=request.inputs or {},
    )

    # n_tasks is known here (swarm already loaded) — pass for adaptive timeout.
    n_tasks = len(loaded.get("tasks") or [])

    task = asyncio.create_task(
        _pkg._execute_dynamic_flow_background(
            swarm_id=swarm_id,
            run_id=run_id,
            trigger=request.trigger,
            inputs=request.inputs or {},
            n_tasks=n_tasks,
            owner_id=oid,
        )
    )
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    return {
        "run_id": run_id,
        "swarm_id": swarm_id,
        "status": "running",
    }


@router_runs.get("/v1/swarms/{swarm_id}/status/{run_id}")
def status_swarm_run_endpoint(
    swarm_id: str,
    run_id: UUID,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Statut d'un run scope-checké (run.swarm_id == swarm_id).

    Owner dérivé du JWT interne vérifié : scope la lecture sur ce propriétaire
    (swarm_runs.owner_id côté swarm_store).
    """
    run = _scoped(identity).get_run(str(run_id))
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    if str(run.get("swarm_id")) != swarm_id:
        # Scoping strict : on n'expose pas les runs d'un autre swarm.
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found for swarm {swarm_id}")
    return _shape_run_response(run)


@router_runs.post("/v1/swarms/{swarm_id}/runs/{run_id}/resume", status_code=202)
async def resume_swarm_run_endpoint(
    swarm_id: str,
    run_id: UUID,
    request: ResumeRequest,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Reprend un run en pause HITL après la réponse de l'humain.

    Contrat : body {decision_id, value} → 202. Idempotent (un double POST ne
    relance pas deux fois). Garde-fous :
    - Ownership : `get_swarm_run(run_id, owner_id)` → 404 si le run n'appartient
      pas à l'owner (refus d'IDOR multi-tenant).
    - Scope : `run.swarm_id == swarm_id`.
    - Borne convergence : au-delà de `HITL_RESUME_MAX` reprises, le run est marqué
      failed (anti-boucle running↔paused_hitl).
    - Idempotence : CAS atomique `paused_hitl → running` ; si perdu (déjà repris /
      double POST concurrent), no-op 202.

    Owner dérivé du JWT interne vérifié (anti-IDOR multi-tenant).
    """
    oid = identity.owner_id
    rid = str(run_id)
    scoped = _scoped(identity)

    run = scoped.get_run(rid)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    if str(run.get("swarm_id")) != swarm_id:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found for swarm {swarm_id}")

    decision = swarm_store.get_decision_by_id(rid, request.decision_id)
    if decision is None:
        raise HTTPException(
            status_code=404,
            detail=f"Decision {request.decision_id!r} not found for run {run_id}",
        )

    # Idempotence : run déjà repris / plus en pause → no-op 202 (le run continue).
    if run.get("status") != "paused_hitl":
        return {"run_id": rid, "swarm_id": swarm_id, "status": str(run.get("status"))}

    # Borne de convergence — au-delà de la limite, on échoue proprement.
    if int(run.get("resume_count") or 0) >= settings.HITL_RESUME_MAX:
        scoped.update_run(
            rid,
            status="failed",
            error_text="HITL non-convergence — too many resumes",
        )
        raise HTTPException(status_code=409, detail="HITL resume limit reached — run failed")

    # R02 — CAS atomique paused_hitl → running + incrément resume_count.
    # Le perdant (double POST concurrent ou resume_count déjà avancé) fait un no-op.
    expected_rc = int(run.get("resume_count") or 0)
    if not scoped.cas_pause_to_running(rid, expected_resume_count=expected_rc):
        return {"run_id": rid, "swarm_id": swarm_id, "status": "running"}

    # Gagnant du CAS : enregistre la réponse + injecte _hitl_answers + relance.
    ordinal = int(decision.get("ordinal") or 0)
    scoped.resolve_decision(rid, request.decision_id, request.value)
    merged_inputs = swarm_store.apply_resume_inputs(rid, ordinal, request.value)

    # Timeout adaptatif sur le total de tasks (le re-run rejoue la task de
    # décision + les suivantes — pas les antérieures).
    loaded = scoped.get_swarm(swarm_id)
    n_tasks = len(loaded.get("tasks") or []) if loaded else 0

    task = asyncio.create_task(
        _pkg._execute_dynamic_flow_background(
            swarm_id=swarm_id,
            run_id=rid,
            trigger=str(run.get("trigger", "on_demand")),
            inputs=merged_inputs,
            n_tasks=n_tasks,
            owner_id=oid,
            checkpoint_index=int(run.get("checkpoint_index") or 0),
        )
    )
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    return {"run_id": rid, "swarm_id": swarm_id, "status": "running"}


@router_runs.get("/v1/swarms/{swarm_id}/runs")
def list_swarm_runs_endpoint(
    swarm_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    identity: InternalIdentity = Depends(require_internal_identity),
) -> list[dict[str, Any]]:
    """Runs récents d'un swarm donné, plus récents en premier.

    Owner dérivé du JWT interne vérifié : la couche owner-scopée ne retourne que
    les runs appartenant à cet owner (filtre direct `swarm_runs.owner_id`, R1
    anti-IDOR). Sur un template partagé, chaque tenant ne voit que ses propres runs.
    """
    return _scoped(identity).list_runs(swarm_id, limit=limit)


@router_runs.get("/v1/runs/{run_id}")
def get_run_cross_swarm_endpoint(
    run_id: UUID,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Lookup direct par run_id (utile pour debug ou liens directs depuis Langfuse).

    Owner dérivé du JWT interne vérifié : le run est filtré sur swarm_runs.owner_id.
    """
    run = _scoped(identity).get_run(str(run_id))
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return _shape_run_response(run)
