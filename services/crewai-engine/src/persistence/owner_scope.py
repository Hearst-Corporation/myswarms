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
