"""Couche d'accès owner-scopée centralisée (durcissement R2).

L'engine accède à Supabase via SUPABASE_SERVICE_ROLE_KEY, qui BYPASSE la RLS.
L'isolation cross-tenant repose donc entièrement sur des filtres applicatifs
`.eq("owner_id", ...)` dispersés dans `swarm_store` / `run_store`. Un oubli de
filtre (nouvelle route, refactor) suffit à exposer des données cross-owner.

Cette couche rend le filtre owner DIFFICILE à oublier :
- `OwnerScope` ne se construit qu'à partir d'une `InternalIdentity` vérifiée
  (JWT interne R3) — jamais d'un `owner_id` libre venu du client.
- `ScopedSwarmStore` / `ScopedChiefStore` exposent les LECTURES P0 et passent
  TOUJOURS `scope.owner_id` aux fonctions de store sous-jacentes.
- Les lectures de steps / decisions valident D'ABORD le run parent owner-scopé
  (sinon `None` → 404 côté route) — jamais d'accès direct par run_id seul.
- Un owner NULL ne matche jamais ; un run de template global n'est jamais
  visible via ces lectures (le store sous-jacent applique déjà cette règle R1).

Les routes owner-scopées font :
    identity = Depends(require_internal_identity)
    scope = OwnerScope.from_identity(identity)
    run = ScopedSwarmStore(scope).get_run(run_id)   # 404 si None
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from ..security.internal_auth import InternalIdentity
from . import run_store, swarm_store
from .chief_decision_store import list_decisions as _list_chief_decisions
from .chief_step_store import list_chief_steps as _list_chief_steps


class OwnerScopeError(ValueError):
    """Construction d'un OwnerScope invalide (owner non-UUID / absent)."""


def _assert_uuid(owner_id: str | None) -> str:
    try:
        UUID(str(owner_id))
    except (ValueError, TypeError, AttributeError) as exc:
        raise OwnerScopeError("owner_id must be a valid UUID") from exc
    return str(owner_id)


@dataclass(frozen=True)
class OwnerScope:
    """Identité owner/tenant VÉRIFIÉE, autorisant les lectures owner-scopées.

    À ne construire que via `from_identity` (routes) ou `for_test` (tests).
    `__post_init__` valide le format UUID — impossible de porter un owner vide
    ou malformé.
    """

    owner_id: str
    tenant_id: str | None = None

    def __post_init__(self) -> None:
        _assert_uuid(self.owner_id)

    @classmethod
    def from_identity(cls, identity: InternalIdentity) -> "OwnerScope":
        """Seul point d'entrée côté route : dérive le scope du JWT vérifié."""
        return cls(owner_id=identity.owner_id, tenant_id=identity.tenant_id)

    @classmethod
    def for_test(cls, owner_id: str, tenant_id: str | None = None) -> "OwnerScope":
        """Construction explicite réservée aux tests (jamais depuis une route)."""
        return cls(owner_id=owner_id, tenant_id=tenant_id)


class ScopedSwarmStore:
    """Lectures owner-scopées des tables swarms/runs/steps (P0).

    Toutes les méthodes passent `scope.owner_id` au store sous-jacent — il est
    impossible d'appeler une lecture sans le filtre owner.
    """

    def __init__(self, scope: OwnerScope) -> None:
        if not isinstance(scope, OwnerScope):
            raise OwnerScopeError("ScopedSwarmStore requires an OwnerScope")
        self._scope = scope

    @property
    def owner_id(self) -> str:
        return self._scope.owner_id

    # ── swarms ────────────────────────────────────────────────────────────
    def get_swarm(self, swarm_id: str) -> dict[str, Any] | None:
        return swarm_store.get_swarm(swarm_id, owner_id=self._scope.owner_id)

    def list_swarms(self) -> list[dict[str, Any]]:
        return swarm_store.list_swarms(owner_id=self._scope.owner_id)

    def list_tools(self) -> list[dict[str, Any]]:
        return swarm_store.list_tools(owner_id=self._scope.owner_id)

    # ── runs ──────────────────────────────────────────────────────────────
    def get_run(self, run_id: str) -> dict[str, Any] | None:
        return swarm_store.get_swarm_run(run_id, owner_id=self._scope.owner_id)

    def list_runs(self, swarm_id: str, limit: int = 20) -> list[dict[str, Any]]:
        return swarm_store.list_swarm_runs(
            swarm_id, limit=limit, owner_id=self._scope.owner_id
        )

    # ── steps : JAMAIS sans validation du run parent owner-scopé ───────────
    def list_run_steps(self, run_id: str) -> list[dict[str, Any]] | None:
        """Renvoie les steps UNIQUEMENT si le run parent appartient à l'owner.

        Renvoie `None` (→ 404 côté route) si le run n'est pas accessible — on ne
        lit jamais `swarm_run_steps` par run_id seul.
        """
        if self.get_run(run_id) is None:
            return None
        return swarm_store.list_run_steps(run_id)

    # ── ÉCRITURES (R2 write-side) ─────────────────────────────────────────
    # create force owner_id=scope ; update/delete/replace valident un owner
    # STRICT (templates globaux immuables) ; les writes de run valident le run
    # owner-scopé (get_run strict, R1/R3). Cross-owner / owner-NULL → None/False.

    def _owns_swarm_strict(self, swarm_id: str) -> bool:
        return swarm_store.is_swarm_owned(swarm_id, self._scope.owner_id, allow_template=False)

    def create_swarm(self, payload: dict[str, Any]) -> str | None:
        """Crée un swarm en FORÇANT owner_id=scope. Refuse les templates globaux."""
        if payload.get("is_template"):
            raise OwnerScopeError("global templates are created via DB migration, not the API")
        forced = {**payload, "owner_id": self._scope.owner_id}
        return swarm_store.create_swarm(forced)

    def update_swarm(self, swarm_id: str, fields: dict[str, Any]) -> bool | None:
        if not self._owns_swarm_strict(swarm_id):
            return None
        return swarm_store.update_swarm(swarm_id, fields, owner_id=self._scope.owner_id)

    def delete_swarm(self, swarm_id: str, *, hard: bool = False) -> bool | None:
        if not self._owns_swarm_strict(swarm_id):
            return None
        return swarm_store.delete_swarm(swarm_id, owner_id=self._scope.owner_id, hard=hard)

    def replace_agents(self, swarm_id: str, agents: list[dict[str, Any]]) -> dict[str, str] | None:
        if not self._owns_swarm_strict(swarm_id):
            return None
        return swarm_store.replace_agents(swarm_id, agents)

    def replace_tasks(
        self, swarm_id: str, tasks: list[dict[str, Any]], agent_id_map: dict[str, str]
    ) -> dict[str, str] | None:
        if not self._owns_swarm_strict(swarm_id):
            return None
        return swarm_store.replace_tasks(swarm_id, tasks, agent_id_map=agent_id_map)

    def replace_tool_bindings(
        self, swarm_id: str, bindings: list[dict[str, Any]], agent_id_map: dict[str, str]
    ) -> bool | None:
        if not self._owns_swarm_strict(swarm_id):
            return None
        return swarm_store.replace_tool_bindings(swarm_id, bindings, agent_id_map=agent_id_map)

    def save_run(
        self,
        run_id: str,
        swarm_id: str,
        trigger: str,
        status: str = "running",
        inputs_json: dict[str, Any] | None = None,
    ) -> bool | None:
        """Crée un run. Autorisé sur un swarm possédé OU un template global
        (kickoff). Le run porte owner_id=scope (R1)."""
        if self.get_swarm(swarm_id) is None:  # règle lecture : owner OU template
            return None
        return swarm_store.save_swarm_run(
            run_id=run_id,
            swarm_id=swarm_id,
            trigger=trigger,
            status=status,
            inputs_json=inputs_json,
            owner_id=self._scope.owner_id,
        )

    def update_run(self, run_id: str, **fields: Any) -> bool | None:
        if self.get_run(run_id) is None:
            return None
        return swarm_store.update_swarm_run(run_id, **fields)

    def cas_pause_to_running(self, run_id: str, expected_resume_count: int = 0) -> bool:
        if self.get_run(run_id) is None:
            return False
        return swarm_store.cas_pause_to_running(run_id, expected_resume_count=expected_resume_count)

    def resolve_decision(self, run_id: str, decision_id: str, value: str) -> bool | None:
        if self.get_run(run_id) is None:
            return None
        return swarm_store.resolve_decision(run_id, decision_id, value)


class ScopedChiefStore:
    """Lectures owner-scopées du Daily Chief of Staff (chief_run_log/steps/decisions)."""

    def __init__(self, scope: OwnerScope) -> None:
        if not isinstance(scope, OwnerScope):
            raise OwnerScopeError("ScopedChiefStore requires an OwnerScope")
        self._scope = scope

    @property
    def owner_id(self) -> str:
        return self._scope.owner_id

    def get_run(self, kickoff_id: str) -> dict[str, Any] | None:
        return run_store.get_run(kickoff_id, owner_id=self._scope.owner_id)

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        return run_store.list_runs(limit=limit, owner_id=self._scope.owner_id)

    def _owns_run(self, kickoff_id: str) -> bool:
        return self.get_run(kickoff_id) is not None

    def list_steps(self, kickoff_id: str) -> list[dict[str, Any]] | None:
        """Steps UNIQUEMENT si le run parent appartient à l'owner (sinon None → 404)."""
        if not self._owns_run(kickoff_id):
            return None
        return _list_chief_steps(chief_run_id=kickoff_id)

    def list_decisions(self, kickoff_id: str) -> list[dict[str, Any]] | None:
        """Décisions UNIQUEMENT si le run parent appartient à l'owner (sinon None → 404)."""
        if not self._owns_run(kickoff_id):
            return None
        return _list_chief_decisions(kickoff_id)

    # ── ÉCRITURE (R2 write-side) ──────────────────────────────────────────
    def save_run(self, kickoff_id: str, trigger: str, status: str, started_at: str) -> bool:
        """Crée un run chief en FORÇANT owner_id=scope (kickoff Chief of Staff)."""
        return run_store.save_run(kickoff_id, trigger, status, started_at, owner_id=self._scope.owner_id)
