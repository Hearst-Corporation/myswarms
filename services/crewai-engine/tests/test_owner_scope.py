"""Tests — couche d'accès owner-scopée centralisée (R2).

Prouve que :
- OwnerScope ne se construit qu'à partir d'une identité vérifiée / UUID valide.
- ScopedSwarmStore / ScopedChiefStore passent TOUJOURS owner_id au store.
- owner A ne voit jamais owner B ; owner NULL inaccessible.
- les steps / decisions ne sont lus QUE si le run parent appartient à l'owner.
"""
from __future__ import annotations

import pytest

from src.persistence import run_store, swarm_store
from src.persistence import owner_scope as os_mod
from src.persistence.owner_scope import (
    OwnerScope,
    OwnerScopeError,
    ScopedChiefStore,
    ScopedSwarmStore,
)
from src.security.internal_auth import InternalIdentity

OWNER_A = "11111111-1111-1111-1111-111111111111"
OWNER_B = "22222222-2222-2222-2222-222222222222"


# ── OwnerScope ───────────────────────────────────────────────────────────────

class TestOwnerScope:
    def test_from_identity(self):
        scope = OwnerScope.from_identity(InternalIdentity(owner_id=OWNER_A, tenant_id="hive"))
        assert scope.owner_id == OWNER_A
        assert scope.tenant_id == "hive"

    def test_for_test_constructor(self):
        assert OwnerScope.for_test(OWNER_A).owner_id == OWNER_A

    def test_rejects_non_uuid(self):
        with pytest.raises(OwnerScopeError):
            OwnerScope.for_test("not-a-uuid")

    def test_rejects_empty(self):
        with pytest.raises(OwnerScopeError):
            OwnerScope.for_test("")

    def test_rejects_none_via_identity(self):
        with pytest.raises(OwnerScopeError):
            OwnerScope.from_identity(InternalIdentity(owner_id=None))  # type: ignore[arg-type]

    def test_store_requires_owner_scope(self):
        with pytest.raises(OwnerScopeError):
            ScopedSwarmStore("11111111-1111-1111-1111-111111111111")  # type: ignore[arg-type]


# ── ScopedSwarmStore : le filtre owner est toujours passé ────────────────────

class TestScopedSwarmStore:
    def test_get_run_passes_owner(self, monkeypatch):
        seen = {}
        def fake(run_id, owner_id=None):
            seen["owner_id"] = owner_id
            return {"id": run_id, "owner_id": owner_id}
        monkeypatch.setattr(swarm_store, "get_swarm_run", fake)
        out = ScopedSwarmStore(OwnerScope.for_test(OWNER_A)).get_run("r1")
        assert seen["owner_id"] == OWNER_A
        assert out["owner_id"] == OWNER_A

    def test_list_runs_passes_owner(self, monkeypatch):
        seen = {}
        monkeypatch.setattr(swarm_store, "list_swarm_runs",
                            lambda swarm_id, limit=20, owner_id=None: seen.update(owner_id=owner_id) or [])
        ScopedSwarmStore(OwnerScope.for_test(OWNER_A)).list_runs("s1", limit=5)
        assert seen["owner_id"] == OWNER_A

    def test_get_swarm_passes_owner(self, monkeypatch):
        seen = {}
        monkeypatch.setattr(swarm_store, "get_swarm",
                            lambda swarm_id, owner_id=None: seen.update(owner_id=owner_id) or {"swarm": {}})
        ScopedSwarmStore(OwnerScope.for_test(OWNER_A)).get_swarm("s1")
        assert seen["owner_id"] == OWNER_A

    def test_list_swarms_passes_owner(self, monkeypatch):
        seen = {}
        monkeypatch.setattr(swarm_store, "list_swarms",
                            lambda owner_id=None: seen.update(owner_id=owner_id) or [])
        ScopedSwarmStore(OwnerScope.for_test(OWNER_A)).list_swarms()
        assert seen["owner_id"] == OWNER_A

    def test_cross_owner_run_returns_none(self, monkeypatch):
        # Le store sous-jacent renvoie None quand l'owner ne matche pas (R1/R3).
        monkeypatch.setattr(swarm_store, "get_swarm_run", lambda rid, owner_id=None: None)
        assert ScopedSwarmStore(OwnerScope.for_test(OWNER_B)).get_run("run-of-A") is None

    def test_steps_blocked_when_run_not_owned(self, monkeypatch):
        # get_run → None (pas possédé) ⇒ steps JAMAIS lus.
        monkeypatch.setattr(swarm_store, "get_swarm_run", lambda rid, owner_id=None: None)
        called = {"steps": False}
        def fake_steps(run_id):
            called["steps"] = True
            return [{"step": 1}]
        monkeypatch.setattr(swarm_store, "list_run_steps", fake_steps)
        assert ScopedSwarmStore(OwnerScope.for_test(OWNER_A)).list_run_steps("r1") is None
        assert called["steps"] is False, "steps must NOT be read when run is not owned"

    def test_steps_returned_when_run_owned(self, monkeypatch):
        monkeypatch.setattr(swarm_store, "get_swarm_run",
                            lambda rid, owner_id=None: {"id": rid, "owner_id": owner_id})
        monkeypatch.setattr(swarm_store, "list_run_steps", lambda rid: [{"step": 1}])
        assert ScopedSwarmStore(OwnerScope.for_test(OWNER_A)).list_run_steps("r1") == [{"step": 1}]


# ── ScopedChiefStore ─────────────────────────────────────────────────────────

class TestScopedChiefStore:
    def test_get_run_passes_owner(self, monkeypatch):
        seen = {}
        monkeypatch.setattr(run_store, "get_run",
                            lambda kid, owner_id=None: seen.update(owner_id=owner_id) or {"kickoff_id": kid})
        ScopedChiefStore(OwnerScope.for_test(OWNER_A)).get_run("k1")
        assert seen["owner_id"] == OWNER_A

    def test_list_runs_passes_owner(self, monkeypatch):
        seen = {}
        monkeypatch.setattr(run_store, "list_runs",
                            lambda limit=20, owner_id=None: seen.update(owner_id=owner_id) or [])
        ScopedChiefStore(OwnerScope.for_test(OWNER_A)).list_runs(limit=10)
        assert seen["owner_id"] == OWNER_A

    def test_steps_blocked_when_run_not_owned(self, monkeypatch):
        monkeypatch.setattr(run_store, "get_run", lambda kid, owner_id=None: None)
        called = {"steps": False}
        monkeypatch.setattr(os_mod, "_list_chief_steps",
                            lambda chief_run_id: called.update(steps=True) or [{"s": 1}])
        assert ScopedChiefStore(OwnerScope.for_test(OWNER_B)).list_steps("k1") is None
        assert called["steps"] is False

    def test_decisions_blocked_when_run_not_owned(self, monkeypatch):
        monkeypatch.setattr(run_store, "get_run", lambda kid, owner_id=None: None)
        called = {"dec": False}
        monkeypatch.setattr(os_mod, "_list_chief_decisions",
                            lambda kid: called.update(dec=True) or [{"d": 1}])
        assert ScopedChiefStore(OwnerScope.for_test(OWNER_B)).list_decisions("k1") is None
        assert called["dec"] is False

    def test_decisions_returned_when_owned(self, monkeypatch):
        monkeypatch.setattr(run_store, "get_run", lambda kid, owner_id=None: {"kickoff_id": kid})
        monkeypatch.setattr(os_mod, "_list_chief_decisions", lambda kid: [{"d": 1}])
        assert ScopedChiefStore(OwnerScope.for_test(OWNER_A)).list_decisions("k1") == [{"d": 1}]
