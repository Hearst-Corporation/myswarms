"""Sous-routeur CRUD swarms — list / get / create / update / delete.

Paths absolus inchangés (`/v1/swarms`, `/v1/swarms/{swarm_id}`) ; ce routeur
est monté sans prefix par le package `__init__.py` → URLs strictement identiques
à l'ancien `swarms.py`.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ...security.internal_auth import require_internal_identity, InternalIdentity
from ._shared import (
    SwarmCreate,
    SwarmUpdate,
    _deny_if_global_template,
    _hydrate_swarm_children,
    _scoped,
    _shape_swarm_response,
)

logger = logging.getLogger("src.routes.swarms")

router_crud = APIRouter()


@router_crud.get("/v1/swarms")
def list_swarms_endpoint(identity: InternalIdentity = Depends(require_internal_identity)) -> list[dict[str, Any]]:
    """Liste les swarms de l'owner (+ templates globaux), via la couche owner-scopée."""
    return _scoped(identity).list_swarms()


@router_crud.get("/v1/swarms/{swarm_id}")
def get_swarm_endpoint(
    swarm_id: str,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Renvoie un swarm complet (agents + tasks + tool_bindings).

    Lecture owner-scopée (couche R2) — 404 si le swarm n'appartient pas à l'owner
    (les templates globaux restent visibles comme définitions).
    """
    loaded = _scoped(identity).get_swarm(swarm_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found")
    return _shape_swarm_response(loaded)


@router_crud.post("/v1/swarms", status_code=201)
def create_swarm_endpoint(
    payload: SwarmCreate,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Crée un nouveau swarm + agents/tasks/bindings en un seul POST.

    En cas d'erreur partielle, rollback applicatif (hard delete du swarm).

    F4 fix : `owner_id` est dérivé du JWT interne vérifié.
    Priorité body > JWT (si le body contient un owner_id, on vérifie qu'il correspond au JWT).
    """
    swarm_payload = payload.model_dump(
        exclude={"agents", "tasks", "tool_bindings"},
        exclude_none=True,
    )
    # Si le body contient un owner_id, il DOIT correspondre à l'identité JWT.
    body_owner_id = swarm_payload.get("owner_id")
    if body_owner_id and body_owner_id != identity.owner_id:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot create swarm for owner {body_owner_id} with token for {identity.owner_id}"
        )

    # On force l'owner_id de l'identité vérifiée.
    swarm_payload["owner_id"] = identity.owner_id

    # Security: creating global templates via the user API is forbidden.
    # Global templates (is_template=True, owner_id=NULL) must go through DB migrations.
    if swarm_payload.get("is_template"):
        raise HTTPException(
            status_code=403,
            detail=(
                "Creating a global template via the user API is forbidden. "
                "Use a DB migration to add global templates."
            ),
        )

    # F7 fix : valider l'unicité des client_ids agents/tasks avant insertion.
    # Un duplicate ferait crasher l'hydration (FK contraintes) sans message clair.
    agent_client_ids = [a.id for a in (payload.agents or []) if a.id]
    if len(agent_client_ids) != len(set(agent_client_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate agent client_id in payload (each agent.id must be unique)",
        )
    task_client_ids = [t.id for t in (payload.tasks or []) if t.id]
    if len(task_client_ids) != len(set(task_client_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate task client_id in payload (each task.id must be unique)",
        )

    new_id = _scoped(identity).create_swarm(swarm_payload)
    if not new_id:
        raise HTTPException(
            status_code=500,
            detail="Failed to create swarm (Supabase unavailable or insert failed)",
        )

    try:
        _hydrate_swarm_children(new_id, payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Partial create failed for swarm %s, rolling back: %s",
            new_id, exc,
        )
        _scoped(identity).delete_swarm(new_id, hard=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to hydrate swarm children: {exc}",
        ) from exc

    loaded = _scoped(identity).get_swarm(new_id)
    if loaded is None:
        # Insertion réussie mais relecture KO — squelette minimal aligné Zod.
        # created_at/updated_at sont requis (string) côté SwarmRecordSchema —
        # on fournit l'heure courante ISO plutôt que None pour rester valide.
        fallback_ts = datetime.now(timezone.utc).isoformat()
        return {
            "id": new_id,
            "owner_id": payload.owner_id,
            "name": payload.name,
            "description": payload.description,
            "version": payload.version or 1,
            "config_json": payload.config_json,
            "is_active": payload.is_active if payload.is_active is not None else True,
            "is_template": payload.is_template if payload.is_template is not None else False,
            "created_at": fallback_ts,
            "updated_at": fallback_ts,
            "agents": [],
            "tasks": [],
            "tool_bindings": [],
        }
    return _shape_swarm_response(loaded)


@router_crud.patch("/v1/swarms/{swarm_id}")
def update_swarm_endpoint(
    swarm_id: str,
    payload: SwarmUpdate,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Patch les champs fournis (les non-envoyés sont ignorés).

    Sémantique stricte (F2 fix) : on distingue "clé absente du payload" vs
    "clé envoyée explicitement à None/[]". On utilise `model_dump(exclude_unset=True)`
    qui ne renvoie QUE les champs effectivement présents dans le body JSON.
    → un PATCH `{"description": "X"}` ne touche PAS aux agents/tasks/bindings.

    Si `agents`, `tasks` ou `tool_bindings` sont **explicitement présents**
    (même si `[]`), on remplace intégralement ces collections (delete-all
    puis insert) via `swarm_store.replace_*`. Le mapping `client_id → db_uuid`
    est propagé pour résoudre les références cross-collections dans le même
    payload.

    `owner_id` requis : la lecture est scopée sur ce propriétaire.
    """
    # Pre-check owner-scopé : valide propriétaire (404 sinon).
    scoped = _scoped(identity)
    guard = scoped.get_swarm(swarm_id)
    if guard is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found")

    # Guard: global templates (owner_id=NULL, is_template=True) are read/run-only.
    _deny_if_global_template(guard, swarm_id)

    # `exclude_unset=True` : seules les clés POSÉES dans le body JSON apparaissent.
    # C'est la clé du fix : on ne re-set jamais une valeur "par défaut Pydantic"
    # sur un champ que le client n'a pas envoyé.
    payload_set = payload.model_dump(exclude_unset=True)

    # Sépare les champs scalaires (UPDATE swarms) et les collections (replace_*).
    # On utilise la présence de la CLÉ dans payload_set, pas la truthy-ness.
    agents_payload = payload_set.pop("agents") if "agents" in payload_set else None
    tasks_payload = payload_set.pop("tasks") if "tasks" in payload_set else None
    bindings_payload = (
        payload_set.pop("tool_bindings") if "tool_bindings" in payload_set else None
    )
    has_agents_key = agents_payload is not None
    has_tasks_key = tasks_payload is not None
    has_bindings_key = bindings_payload is not None

    if not payload_set and not has_agents_key and not has_tasks_key and not has_bindings_key:
        raise HTTPException(status_code=400, detail="No fields to update")

    if payload_set:
        ok = scoped.update_swarm(swarm_id, payload_set)
        if not ok:
            raise HTTPException(
                status_code=500,
                detail="Failed to update swarm (Supabase unavailable or update failed)",
            )

    # Replace cascades : agents d'abord (mapping), puis tasks/bindings qui
    # peuvent référencer ces agents par id client. Le pre-check owner_id
    # plus haut garantit le scoping ici (replace_* opèrent par swarm_id).
    # On déclenche replace_* uniquement si la CLÉ était présente — un []
    # explicite vide la collection, l'absence ne touche à rien.
    #
    # H2 fix : on check explicitement les retours pour distinguer succès
    # (mapping dict / True) de rollback (None / False) — le router doit
    # remonter un 500 si une opération a foiré, plutôt que retourner 200 OK
    # trompeur après un rollback silencieux.
    agent_id_map: dict[str, str] = {}
    errors: list[str] = []
    if has_agents_key:
        result = scoped.replace_agents(swarm_id, agents_payload or [])
        if result is None:
            errors.append("replace_agents failed (snapshot/delete/insert KO, rollback applied)")
        else:
            agent_id_map = result
    if has_tasks_key:
        result = scoped.replace_tasks(
            swarm_id, tasks_payload or [], agent_id_map=agent_id_map
        )
        if result is None:
            errors.append("replace_tasks failed (snapshot/delete/insert KO, rollback applied)")
    if has_bindings_key:
        ok = scoped.replace_tool_bindings(
            swarm_id, bindings_payload or [], agent_id_map=agent_id_map
        )
        if not ok:
            errors.append("replace_tool_bindings failed (snapshot/delete/insert KO, rollback applied)")

    if errors:
        raise HTTPException(
            status_code=500,
            detail={"message": "Partial update failed", "errors": errors},
        )

    loaded = scoped.get_swarm(swarm_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found after update")
    return _shape_swarm_response(loaded)


@router_crud.delete("/v1/swarms/{swarm_id}", status_code=204)
def delete_swarm_endpoint(
    swarm_id: str,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> None:
    """Soft delete : marque `is_active=false`.

    Owner dérivé du JWT interne vérifié : scope la suppression sur ce propriétaire.
    """
    # I6 fix : DELETE non-idempotent — aligné sur GET/PATCH pour cohérence
    # interne du projet. On vérifie l'existence du swarm (scopé owner) avant le
    # soft delete (404 si inexistant). Reste valide REST : DELETE peut renvoyer
    # 404 ou 204 selon la convention choisie.
    guard = _scoped(identity).get_swarm(swarm_id)
    if guard is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found")

    # Guard: global templates (owner_id=NULL, is_template=True) are read/run-only.
    _deny_if_global_template(guard, swarm_id)
    ok = _scoped(identity).delete_swarm(swarm_id)
    if not ok:
        raise HTTPException(
            status_code=500,
            detail="Failed to delete swarm (Supabase unavailable or update failed)",
        )
