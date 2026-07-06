"""Tests — catalogue tools : POST /v1/tools (create owner-scopé) + list_tools.

Contrats prouvés (tâche T3) :

POST /v1/tools
  - crée un tool en FORÇANT owner_id = owner du JWT (jamais l'owner_id du body) ;
  - refuse (403) un owner_id de body qui ne matche pas le JWT (anti-spoofing,
    cohérent avec create_swarm_endpoint) ;
  - renvoie 201 + la shape client TS (id/owner_id/name/category/.../updated_at).

list_tools(owner_id)
  - inclut les tools de l'owner ET les tools globaux (owner_id NULL, policy
    tools_global_read 0022) ;
  - exclut les tools d'un AUTRE owner.

Le client Supabase est mocké — aucun accès réseau/DB réel.
"""
from __future__ import annotations

import os
import time
from typing import Any
from unittest.mock import patch

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from src.persistence import swarm_store
from src.persistence.swarm_store_impl import tools_crud

OWNER_A = "11111111-1111-1111-1111-111111111111"
OWNER_B = "22222222-2222-2222-2222-222222222222"


# ── Auth helpers (miroir test_listings_owner_scope.py) ───────────────────────


def _bearer_token() -> str:
    return os.environ.get("CREWAI_ENGINE_AUTH_TOKEN", "00000000000000000000000000000000")


def _internal_jwt(owner_id: str = OWNER_A, secret: str | None = None) -> str:
    now = int(time.time())
    payload = {
        "iss": "myswarms-bff",
        "aud": "crewai-engine",
        "iat": now,
        "exp": now + 300,
        "sub": owner_id,
        "owner_id": owner_id,
    }
    sec = secret or os.environ["CREWAI_ENGINE_JWT_SECRET"]
    return pyjwt.encode(payload, sec, algorithm="HS256")


def _headers(*, bearer: bool = True, jwt: str | None = None) -> dict:
    h: dict = {}
    if bearer:
        h["Authorization"] = f"Bearer {_bearer_token()}"
    if jwt is not None:
        h["X-Internal-Auth"] = f"Bearer {jwt}"
    return h


@pytest.fixture(scope="module")
def client():
    from src.main import app  # noqa: PLC0415

    with TestClient(app) as c:
        yield c


# ── POST /v1/tools : owner forcé + anti-spoofing ─────────────────────────────


class TestCreateToolEndpoint:
    def test_post_creates_owner_scoped(self, client):
        """POST force owner_id = JWT et renvoie 201 + la ligne créée."""
        seen: dict[str, Any] = {}

        def _fake_create_tool(payload: dict[str, Any]) -> dict[str, Any]:
            seen["payload"] = payload
            return {
                "id": "tool-1",
                "owner_id": payload["owner_id"],
                "name": payload["name"],
                "category": payload["category"],
                "description": payload.get("description"),
                "endpoint_url": payload.get("endpoint_url"),
                "auth_type": payload.get("auth_type"),
                "schema_json": payload.get("schema_json") or {},
                "is_active": payload.get("is_active", True),
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            }

        with patch.object(swarm_store, "create_tool", _fake_create_tool):
            r = client.post(
                "/v1/tools",
                json={
                    "name": "My HTTP tool",
                    "category": "api_call",
                    "endpoint_url": "https://api.example.com/run",
                    "auth_type": "bearer",
                    "schema_json": {"params": {"q": {"type": "string"}}},
                },
                headers=_headers(jwt=_internal_jwt(OWNER_A)),
            )

        assert r.status_code == 201
        # L'owner est FORCÉ au scope du JWT (jamais celui du body).
        assert seen["payload"]["owner_id"] == OWNER_A
        body = r.json()
        assert body["id"] == "tool-1"
        assert body["owner_id"] == OWNER_A
        assert body["name"] == "My HTTP tool"
        assert body["category"] == "api_call"
        assert body["schema_json"] == {"params": {"q": {"type": "string"}}}
        # Shape client TS complète.
        for key in (
            "id", "owner_id", "name", "category", "description",
            "endpoint_url", "auth_type", "schema_json", "is_active",
            "created_at", "updated_at",
        ):
            assert key in body

    def test_post_forces_owner_over_body_spoof_value(self, client):
        """Un owner_id de body == JWT est accepté MAIS l'owner effectif reste le scope.

        (Le cas mismatch → 403 est couvert par test_post_rejects_spoofed_owner.)
        """
        seen: dict[str, Any] = {}

        def _fake_create_tool(payload: dict[str, Any]) -> dict[str, Any]:
            seen["payload"] = payload
            return {"id": "t", "owner_id": payload["owner_id"], "name": payload["name"],
                    "category": payload["category"], "schema_json": {}, "is_active": True,
                    "created_at": None, "updated_at": None, "description": None,
                    "endpoint_url": None, "auth_type": None}

        with patch.object(swarm_store, "create_tool", _fake_create_tool):
            r = client.post(
                "/v1/tools",
                json={"name": "t", "category": "custom", "owner_id": OWNER_A},
                headers=_headers(jwt=_internal_jwt(OWNER_A)),
            )
        assert r.status_code == 201
        assert seen["payload"]["owner_id"] == OWNER_A

    def test_post_rejects_spoofed_owner(self, client):
        """owner_id de body != JWT → 403, et create_tool n'est JAMAIS appelé."""
        called = {"x": False}

        def _fake_create_tool(payload: dict[str, Any]):
            called["x"] = True
            return {"id": "nope"}

        with patch.object(swarm_store, "create_tool", _fake_create_tool):
            r = client.post(
                "/v1/tools",
                json={"name": "spoof", "category": "custom", "owner_id": OWNER_B},
                headers=_headers(jwt=_internal_jwt(OWNER_A)),
            )
        assert r.status_code == 403
        assert called["x"] is False

    def test_post_requires_jwt(self, client):
        """Sans JWT interne → 401 (bearer machine seul ne suffit pas)."""
        r = client.post(
            "/v1/tools",
            json={"name": "x", "category": "custom"},
            headers=_headers(),
        )
        assert r.status_code == 401

    def test_post_rejects_unknown_category(self, client):
        """Une category hors enum → 422 (validation Pydantic Literal)."""
        r = client.post(
            "/v1/tools",
            json={"name": "x", "category": "not_a_real_category"},
            headers=_headers(jwt=_internal_jwt(OWNER_A)),
        )
        assert r.status_code == 422


# ── list_tools : owner-rows + global-rows, autre-owner exclu ──────────────────


class _FakeToolsQuery:
    """Émule la chaîne PostgREST `.select().eq().or_().order().execute()`.

    Applique en mémoire les filtres réellement posés par list_tools :
    - `.eq("is_active", True)`
    - `.or_("owner_id.eq.X,owner_id.is.null")` (owner OU global)
    de sorte qu'un test prouve la sémantique du filtre owner sans DB réelle.
    """

    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows
        self._active_only = False
        self._owner_or: str | None = None

    def select(self, *_a, **_k) -> "_FakeToolsQuery":
        return self

    def eq(self, col: str, val: Any) -> "_FakeToolsQuery":
        if col == "is_active" and val is True:
            self._active_only = True
        return self

    def or_(self, expr: str) -> "_FakeToolsQuery":
        self._owner_or = expr
        return self

    def order(self, *_a, **_k) -> "_FakeToolsQuery":
        return self

    def _owner_ids_allowed(self) -> tuple[set[str], bool]:
        """Parse `owner_id.eq.X,owner_id.is.null` → ({X}, allow_null)."""
        ids: set[str] = set()
        allow_null = False
        if self._owner_or:
            for part in self._owner_or.split(","):
                part = part.strip()
                if part.startswith("owner_id.eq."):
                    ids.add(part[len("owner_id.eq."):])
                elif part == "owner_id.is.null":
                    allow_null = True
        return ids, allow_null

    def execute(self) -> Any:
        rows = self._rows
        if self._active_only:
            rows = [r for r in rows if r.get("is_active", True)]
        if self._owner_or is not None:
            ids, allow_null = self._owner_ids_allowed()
            rows = [
                r for r in rows
                if r.get("owner_id") in ids or (allow_null and r.get("owner_id") is None)
            ]
        return type("Res", (), {"data": list(rows)})()


class _FakeClient:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def table(self, name: str) -> _FakeToolsQuery:
        assert name == "tools"
        return _FakeToolsQuery(self._rows)


_ROWS = [
    {"id": "own-a", "owner_id": OWNER_A, "name": "A tool", "category": "custom", "is_active": True},
    {"id": "glob", "owner_id": None, "name": "Global tool", "category": "search", "is_active": True},
    {"id": "own-b", "owner_id": OWNER_B, "name": "B tool", "category": "custom", "is_active": True},
    {"id": "inactive-a", "owner_id": OWNER_A, "name": "Inactive", "category": "custom", "is_active": False},
]


class TestListToolsOwnerScope:
    def test_includes_owner_and_global_excludes_other_owner(self):
        with patch.object(tools_crud._facade, "_get_client", lambda: _FakeClient(_ROWS)):
            result = tools_crud.list_tools(owner_id=OWNER_A)
        ids = {r["id"] for r in result}
        assert "own-a" in ids          # tool de l'owner : inclus
        assert "glob" in ids           # tool global (owner NULL) : inclus
        assert "own-b" not in ids      # tool d'un autre owner : exclu
        assert "inactive-a" not in ids  # is_active=false : exclu

    def test_other_owner_sees_only_global_not_a(self):
        with patch.object(tools_crud._facade, "_get_client", lambda: _FakeClient(_ROWS)):
            result = tools_crud.list_tools(owner_id=OWNER_B)
        ids = {r["id"] for r in result}
        assert "own-b" in ids
        assert "glob" in ids
        assert "own-a" not in ids

    def test_no_owner_returns_all_active(self):
        """Service-role (owner_id None) : pas de scoping owner, tous les actifs."""
        with patch.object(tools_crud._facade, "_get_client", lambda: _FakeClient(_ROWS)):
            result = tools_crud.list_tools(owner_id=None)
        ids = {r["id"] for r in result}
        assert {"own-a", "glob", "own-b"} <= ids
        assert "inactive-a" not in ids

    def test_failsoft_when_client_none(self):
        with patch.object(tools_crud._facade, "_get_client", lambda: None):
            assert tools_crud.list_tools(owner_id=OWNER_A) == []


# ── create_tool (couche persistence) : fail-soft + owner passthrough ─────────


class TestCreateToolPersistence:
    def test_create_tool_failsoft_when_client_none(self):
        with patch.object(tools_crud._facade, "_get_client", lambda: None):
            assert tools_crud.create_tool({"name": "x", "category": "custom", "owner_id": OWNER_A}) is None

    def test_create_tool_inserts_owner_scoped_row(self):
        captured: dict[str, Any] = {}

        class _InsertQuery:
            def insert(self, row: dict[str, Any]) -> "_InsertQuery":
                captured["row"] = row
                return self

            def execute(self) -> Any:
                return type("Res", (), {"data": [{**captured["row"], "id": "new-tool"}]})()

        class _Client:
            def table(self, name: str) -> _InsertQuery:
                assert name == "tools"
                return _InsertQuery()

        with patch.object(tools_crud._facade, "_get_client", lambda: _Client()):
            out = tools_crud.create_tool(
                {"name": "T", "category": "database", "owner_id": OWNER_A, "schema_json": {"k": 1}}
            )
        assert out is not None
        assert out["id"] == "new-tool"
        assert captured["row"]["owner_id"] == OWNER_A
        assert captured["row"]["category"] == "database"
        assert captured["row"]["schema_json"] == {"k": 1}
        # created_at/updated_at posés par défaut.
        assert captured["row"]["created_at"]
        assert captured["row"]["updated_at"]
