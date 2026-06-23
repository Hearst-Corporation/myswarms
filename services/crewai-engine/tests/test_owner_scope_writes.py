"""Tests — couche owner-scope WRITE-side (R2 Phase 6).

Prouve qu'AUCUNE écriture P0 ne touche un objet cross-owner / owner-NULL, même
sous service_role :
- create force owner_id=scope (le caller ne peut pas l'overrider) ; templates refusés.
- update/delete/replace valident un owner STRICT avant write (templates immuables).
- run writes (update/cas/resolve_decision) valident le run owner-scopé avant write.
- save_run (kickoff) force owner=scope et n'écrit que si le swarm est accessible.
- chief save_run force owner=scope.
Quand l'owner ne matche pas, la fonction de store sous-jacente n'est JAMAIS appelée.
"""
from __future__ import annotations

import pytest

from src.persistence import run_store, swarm_store
from src.persistence.owner_scope import (
    OwnerScope,
    OwnerScopeError,
    ScopedChiefStore,
    ScopedSwarmStore,
)

OWNER_A = "11111111-1111-1111-1111-111111111111"
OWNER_B = "22222222-2222-2222-2222-222222222222"


def _S(owner=OWNER_A) -> ScopedSwarmStore:
    return ScopedSwarmStore(OwnerScope.for_test(owner))


# ── create : owner forcé, templates refusés ──────────────────────────────────

class TestCreate:
    def test_create_forces_scope_owner(self, monkeypatch):
        seen = {}
        monkeypatch.setattr(swarm_store, "create_swarm", lambda payload: seen.update(payload=payload) or "new")
        # le caller tente un autre owner → ignoré, forcé au scope.
        _S(OWNER_A).create_swarm({"name": "x", "owner_id": OWNER_B})
        assert seen["payload"]["owner_id"] == OWNER_A

    def test_create_rejects_global_template(self):
        with pytest.raises(OwnerScopeError):
            _S(OWNER_A).create_swarm({"name": "x", "is_template": True})


# ── update / delete / replace : owner STRICT (templates immuables) ───────────

class TestUpdateDeleteReplace:
    def _own(self, monkeypatch, owner_ok: str | None):
        # is_swarm_owned(allow_template=False) ne matche QUE owner_ok.
        monkeypatch.setattr(
            swarm_store, "is_swarm_owned",
            lambda sid, oid, allow_template=False: (owner_ok is not None and oid == owner_ok),
        )

    def test_update_own_succeeds(self, monkeypatch):
        self._own(monkeypatch, OWNER_A)
        seen = {}
        monkeypatch.setattr(swarm_store, "update_swarm",
                            lambda sid, fields, owner_id=None: seen.update(owner_id=owner_id) or True)
        assert _S(OWNER_A).update_swarm("s1", {"name": "x"}) is True
        assert seen["owner_id"] == OWNER_A

    def test_update_cross_owner_blocked_no_write(self, monkeypatch):
        self._own(monkeypatch, OWNER_A)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "update_swarm", lambda *a, **k: called.update(x=True) or True)
        assert _S(OWNER_B).update_swarm("s1", {"name": "x"}) is None
        assert called["x"] is False

    def test_delete_cross_owner_blocked_no_write(self, monkeypatch):
        self._own(monkeypatch, OWNER_A)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "delete_swarm", lambda *a, **k: called.update(x=True) or True)
        assert _S(OWNER_B).delete_swarm("s1") is None
        assert called["x"] is False

    def test_template_swarm_immutable(self, monkeypatch):
        # owner strict → False pour un template global (owner NULL) quel que soit l'owner.
        self._own(monkeypatch, None)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "update_swarm", lambda *a, **k: called.update(x=True) or True)
        monkeypatch.setattr(swarm_store, "delete_swarm", lambda *a, **k: called.update(x=True) or True)
        assert _S(OWNER_A).update_swarm("tmpl", {"name": "x"}) is None
        assert _S(OWNER_A).delete_swarm("tmpl") is None
        assert called["x"] is False

    def test_replace_children_cross_owner_blocked(self, monkeypatch):
        self._own(monkeypatch, OWNER_A)
        called = {"x": False}
        for fn in ("replace_agents", "replace_tasks", "replace_tool_bindings"):
            monkeypatch.setattr(swarm_store, fn, lambda *a, **k: called.update(x=True) or {})
        s = _S(OWNER_B)
        assert s.replace_agents("s1", []) is None
        assert s.replace_tasks("s1", [], agent_id_map={}) is None
        assert s.replace_tool_bindings("s1", [], agent_id_map={}) is None
        assert called["x"] is False


# ── save_run (kickoff) : accès swarm (owner OU template) + owner forcé ────────

class TestSaveRun:
    def test_blocked_when_swarm_inaccessible(self, monkeypatch):
        monkeypatch.setattr(swarm_store, "get_swarm", lambda sid, owner_id=None: None)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "save_swarm_run", lambda **k: called.update(x=True) or True)
        assert _S(OWNER_B).save_run("r1", "s1", "on_demand") is None
        assert called["x"] is False

    def test_forces_owner(self, monkeypatch):
        monkeypatch.setattr(swarm_store, "get_swarm", lambda sid, owner_id=None: {"swarm": {}})
        seen = {}
        monkeypatch.setattr(swarm_store, "save_swarm_run", lambda **k: seen.update(k) or True)
        _S(OWNER_A).save_run("r1", "s1", "on_demand")
        assert seen["owner_id"] == OWNER_A


# ── run writes : run owner-scopé requis ──────────────────────────────────────

class TestRunWrites:
    def _not_owned(self, monkeypatch):
        monkeypatch.setattr(swarm_store, "get_swarm_run", lambda rid, owner_id=None: None)

    def _owned(self, monkeypatch):
        monkeypatch.setattr(swarm_store, "get_swarm_run",
                            lambda rid, owner_id=None: {"id": rid, "owner_id": owner_id})

    def test_update_run_cross_owner_blocked(self, monkeypatch):
        self._not_owned(monkeypatch)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "update_swarm_run", lambda rid, **k: called.update(x=True) or True)
        assert _S(OWNER_B).update_run("r1", status="failed") is None
        assert called["x"] is False

    def test_cas_cross_owner_blocked(self, monkeypatch):
        self._not_owned(monkeypatch)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "cas_pause_to_running",
                            lambda rid, expected_resume_count=0: called.update(x=True) or True)
        assert _S(OWNER_B).cas_pause_to_running("r1") is False
        assert called["x"] is False

    def test_resolve_decision_cross_owner_blocked(self, monkeypatch):
        self._not_owned(monkeypatch)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "resolve_decision", lambda rid, d, v: called.update(x=True) or True)
        assert _S(OWNER_B).resolve_decision("r1", "d1", "v") is None
        assert called["x"] is False

    def test_update_run_owned_succeeds(self, monkeypatch):
        self._owned(monkeypatch)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "update_swarm_run", lambda rid, **k: called.update(x=True) or True)
        assert _S(OWNER_A).update_run("r1", status="failed") is True
        assert called["x"] is True

    def test_owner_null_run_not_writable(self, monkeypatch):
        # get_swarm_run renvoie None pour un run owner NULL (R1/R3) → write bloqué.
        self._not_owned(monkeypatch)
        called = {"x": False}
        monkeypatch.setattr(swarm_store, "resolve_decision", lambda rid, d, v: called.update(x=True) or True)
        assert _S(OWNER_A).resolve_decision("null-run", "d", "v") is None
        assert called["x"] is False


# ── chief save_run : owner forcé ─────────────────────────────────────────────

class TestChiefWrites:
    def test_save_run_forces_owner(self, monkeypatch):
        seen = {}
        monkeypatch.setattr(run_store, "save_run",
                            lambda kid, trig, status, started, owner_id=None: seen.update(owner_id=owner_id) or True)
        ScopedChiefStore(OwnerScope.for_test(OWNER_A)).save_run("k1", "on_demand", "running", "2026-01-01")
        assert seen["owner_id"] == OWNER_A
