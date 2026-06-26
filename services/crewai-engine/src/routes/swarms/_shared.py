"""Helpers, Pydantic models et état partagés des sous-routeurs swarms.

Ce module regroupe tout ce qui est consommé par PLUSIEURS sous-routeurs
(`crud`, `runs`, `architect`, `tools`) sans dépendre d'eux — il ne contient
aucun `APIRouter`, uniquement de la logique pure + des schémas.

⚠️ Patchabilité : `_execute_dynamic_flow_background` et `_adaptive_flow_timeout`
NE sont PAS définis ici mais directement dans `__init__.py` (le package), car
plusieurs tests patchent `src.routes.swarms.asyncio` /
`src.routes.swarms.flush_run_steps` / `src.routes.swarms._execute_dynamic_flow_background`
et le corps de la fonction doit résoudre ces noms dans le namespace du PACKAGE.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field

from ...persistence import swarm_store
from ...persistence.owner_scope import OwnerScope, ScopedSwarmStore
from ...security.internal_auth import InternalIdentity

logger = logging.getLogger("src.routes.swarms")


def _scoped(identity: InternalIdentity) -> ScopedSwarmStore:
    """Couche de lecture owner-scopée (R2) dérivée du JWT interne vérifié.

    Toute lecture owner-scopée d'une route DOIT passer par ce store — jamais
    par `swarm_store.get_swarm*/list_swarm*` directement (cf test garde
    `tests/test_owner_scope_guard.py`).
    """
    return ScopedSwarmStore(OwnerScope.from_identity(identity))


def _deny_if_global_template(loaded: dict | None, swarm_id: str) -> None:
    """Raise 403 if the loaded swarm is a global template (owner_id=None, is_template=True).

    Global templates are read/run-only — they cannot be mutated or deleted via the
    user API. Modifications must go through DB migrations.
    """
    if loaded is None:
        return
    swarm = loaded.get("swarm") or loaded
    if swarm.get("is_template") and swarm.get("owner_id") is None:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Swarm {swarm_id!r} is a global template and is read/run-only. "
                "To modify a global template use a DB migration."
            ),
        )


# Strong references for background tasks — empêche un GC silencieux.
_running_tasks: set[asyncio.Task] = set()


# ── Pydantic models ──────────────────────────────────────────────────────────


class AgentCreate(BaseModel):
    """Sous-modèle agent envoyé lors d'un POST swarm complet.

    `id` est optionnel : si fourni (UUID émis côté front), il est conservé en DB
    pour permettre aux tasks du même POST de référencer cet agent par son ID
    local sans round-trip intermédiaire.
    """

    id: str | None = None
    name: str = Field(..., min_length=1, max_length=200)
    role: str = Field(..., description="Enum agent_role (coordinator/analyst/...)")
    system_prompt: str = ""
    model_provider: str | None = None
    model_name: str | None = None
    # G4 fix : bornes strictes pour aligner sur swarmSchemas.ts (Zod min/max).
    # Sans ces bornes, un payload temperature=5.0 ou max_tokens=10_000_000
    # passait silencieusement côté API et faisait crasher LiteLLM plus loin.
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=200_000)
    parent_agent_id: str | None = None
    position_x: int = 0
    position_y: int = 0


class TaskCreate(BaseModel):
    """Sous-modèle task envoyé lors d'un POST swarm complet."""

    id: str | None = None
    agent_id: str = Field(..., description="UUID agent (local ou DB) auquel rattacher la task")
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    expected_output: str = ""
    depends_on_task_id: str | None = None
    position_x: int = 0
    position_y: int = 0


class ToolBindingCreate(BaseModel):
    """Sous-modèle tool_binding envoyé lors d'un POST swarm complet."""

    id: str | None = None
    agent_id: str = Field(..., description="UUID agent (local ou DB)")
    tool_id: str
    priority: int = 0
    config_json: dict[str, Any] = Field(default_factory=dict)


class SwarmCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    owner_id: str | None = None
    version: int | None = None
    config_json: dict[str, Any] = Field(default_factory=dict)
    is_active: bool | None = None
    is_template: bool | None = None
    # Création hydratée : agents → tasks → bindings dans le même POST.
    agents: list[AgentCreate] | None = None
    tasks: list[TaskCreate] | None = None
    tool_bindings: list[ToolBindingCreate] | None = None


class SwarmUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    version: int | None = None
    config_json: dict[str, Any] | None = None
    is_active: bool | None = None
    is_template: bool | None = None
    # Save complet depuis le builder : si présents, on remplace intégralement.
    agents: list[AgentCreate] | None = None
    tasks: list[TaskCreate] | None = None
    tool_bindings: list[ToolBindingCreate] | None = None


class KickoffRequest(BaseModel):
    trigger: Literal["morning", "evening", "intraday", "on_demand", "webhook"] = "on_demand"
    inputs: dict[str, Any] = Field(default_factory=dict)


class ResumeRequest(BaseModel):
    """Reprise d'un run HITL : réponse de l'humain à une décision en attente."""

    decision_id: str = Field(..., min_length=1, max_length=200)
    value: str = Field(..., min_length=1, max_length=2000)


class ArchitectGenerateRequest(BaseModel):
    """Demande de génération de spec de swarm (Architect Agent).

    `prompt` est borné (min/max) — un prompt vide n'a aucun sens et un
    prompt géant gaspille le contexte Opus. `owner_id` optionnel : priorité
    body > query (cohérent avec `create_swarm_endpoint`).
    """

    prompt: str = Field(..., min_length=10, max_length=4000)
    owner_id: str | None = None


# ── Helpers de shape ─────────────────────────────────────────────────────────


def _shape_swarm_response(loaded: dict[str, Any]) -> dict[str, Any]:
    """Aplatit le payload swarm_store.get_swarm() → réponse SwarmRecord côté front.

    Aligné avec `SwarmRecordSchema` Zod (src/lib/forms/swarmSchemas.ts).
    """
    swarm = loaded.get("swarm") or {}
    return {
        "id": str(swarm.get("id", "")),
        "owner_id": swarm.get("owner_id"),
        "name": swarm.get("name", ""),
        "description": swarm.get("description", ""),
        "version": swarm.get("version", 1),
        "config_json": swarm.get("config_json") or {},
        "is_active": bool(swarm.get("is_active", True)),
        "is_template": bool(swarm.get("is_template", False)),
        "created_at": swarm.get("created_at"),
        "updated_at": swarm.get("updated_at"),
        "agents": loaded.get("agents", []) or [],
        "tasks": loaded.get("tasks", []) or [],
        "tool_bindings": loaded.get("tool_bindings", []) or [],
    }


# Enum DB crew_run_status (cf migration 0002 + types.ts généré).
# Tout statut inconnu est rabattu sur "pending" — c'est la seule valeur
# de l'enum Zod (RunStatusSchema) qui n'est pas implicitement terminale ni active.
_VALID_RUN_STATUSES: set[str] = {
    "pending",
    "running",
    "paused_hitl",
    "completed",
    "failed",
    "cancelled",
}


def _shape_run_response(run_row: dict[str, Any]) -> dict[str, Any]:
    """Mappe une row DB swarm_runs vers la shape SwarmRun côté front.

    Important : la clé d'identifiant est `id` (pas `run_id`). Le seul endroit
    où on renvoie `run_id` est la réponse `POST /v1/swarms/{id}/kickoff`
    (cf `SwarmKickoffResponseSchema` qui attend `{run_id}`).

    Si le statut DB est manquant ou hors enum, on rabat sur "pending" pour
    rester strictement aligné avec `RunStatusSchema` côté Zod.
    """
    run_id = str(run_row.get("id", ""))
    steps = swarm_store.list_run_steps(run_id) if run_id else []
    raw_status = run_row.get("status")
    status = str(raw_status) if raw_status in _VALID_RUN_STATUSES else "pending"
    shaped: dict[str, Any] = {
        "id": run_id,
        "swarm_id": str(run_row.get("swarm_id", "")),
        "trigger": str(run_row.get("trigger", "on_demand")),
        "status": status,
        "inputs_json": run_row.get("inputs_json") or {},
        "result_text": run_row.get("result_text"),
        "started_at": run_row.get("started_at"),
        "finished_at": run_row.get("finished_at"),
        "error_text": run_row.get("error_text"),
        "total_tokens_in": run_row.get("total_tokens_in") or 0,
        "total_tokens_out": run_row.get("total_tokens_out") or 0,
        "langfuse_trace_id": run_row.get("langfuse_trace_id"),
        "created_at": run_row.get("created_at"),
        "steps": steps,
    }
    # HITL : quand le run est en pause, on expose la décision active sous `decision`
    # (contrat partagé par l'endpoint plat /v1/runs/{id} ET nested /status/{id}).
    if status == "paused_hitl" and run_id:
        active = swarm_store.get_active_decision(run_id)
        if active:
            payload = active.get("payload") or {}
            shaped["decision"] = {
                "id": active.get("decision_id"),
                "question": payload.get("question", ""),
                "hint": payload.get("hint"),
                "options": payload.get("options") or [],
            }
    return shaped


def _hydrate_swarm_children(
    swarm_id: str,
    payload: SwarmCreate,
) -> None:
    """Crée agents → tasks → tool_bindings après l'insertion du swarm parent.

    En cas d'erreur partielle, log et raise → l'appelant rollback le swarm
    (hard delete) puis renvoie 500. Pas de vraie transaction PostgreSQL
    (supabase-py n'expose pas de transaction native simple) — best-effort
    avec rollback applicatif.

    Mapping local→DB : si l'appelant a fourni `id` sur un agent ou une task,
    on l'utilise tel quel à l'insertion (UUIDs locaux préservés). Les tasks
    qui référencent un `agent_id` local trouvent ainsi leur agent sans
    round-trip intermédiaire.
    """
    agent_id_map: dict[str, str] = {}

    for agent in payload.agents or []:
        local_id = agent.id
        agent_payload = agent.model_dump(exclude_none=False, exclude={"id"})
        db_id = swarm_store.create_agent(
            swarm_id=swarm_id,
            payload=agent_payload,
            agent_id=local_id,
        )
        if db_id is None:
            raise RuntimeError(f"create_agent failed for swarm {swarm_id} (name={agent.name})")
        if local_id:
            agent_id_map[local_id] = db_id
        # Toujours mapper l'id DB sur lui-même pour fluidité.
        agent_id_map[db_id] = db_id

    # Mapping task local → DB (pour résoudre depends_on_task_id intra-payload)
    task_id_map: dict[str, str] = {}
    for task in payload.tasks or []:
        local_id = task.id
        task_payload = task.model_dump(exclude_none=False, exclude={"id"})
        # Résout l'agent_id : local front → id DB.
        agent_ref = task_payload.get("agent_id")
        if agent_ref and agent_ref in agent_id_map:
            task_payload["agent_id"] = agent_id_map[agent_ref]
        # Résout depends_on_task_id : local front → id DB s'il a déjà été créé.
        dep = task_payload.get("depends_on_task_id")
        if dep and dep in task_id_map:
            task_payload["depends_on_task_id"] = task_id_map[dep]

        db_id = swarm_store.create_task(
            swarm_id=swarm_id,
            payload=task_payload,
            task_id=local_id,
        )
        if db_id is None:
            raise RuntimeError(f"create_task failed for swarm {swarm_id} (name={task.name})")
        if local_id:
            task_id_map[local_id] = db_id
        task_id_map[db_id] = db_id

    for binding in payload.tool_bindings or []:
        agent_ref = binding.agent_id
        if agent_ref in agent_id_map:
            agent_ref = agent_id_map[agent_ref]
        bid = swarm_store.create_tool_binding(
            swarm_id=swarm_id,
            agent_id=agent_ref,
            tool_id=binding.tool_id,
            priority=binding.priority,
            config_json=binding.config_json,
            binding_id=binding.id,
        )
        if bid is None:
            raise RuntimeError(
                f"create_tool_binding failed (swarm={swarm_id}, agent={agent_ref}, tool={binding.tool_id})"
            )
