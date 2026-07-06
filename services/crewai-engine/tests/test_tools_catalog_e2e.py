"""E2E catalogue tools — prouve la chaîne COMPLÈTE T1 + T2 + T3, SANS réseau.

Ce test d'intégration vérifie de bout en bout, avec la couche Supabase et la
couche HTTP montées en factices (aucun accès réseau/DB réel) :

  (a) T3 — list-global : `list_tools(owner_id=OWNER)` renvoie une liste NON vide
      qui inclut à la fois les tools de l'owner ET les tools globaux
      (owner_id NULL, partagés — policy `tools_global_read`, migration 0022),
      et EXCLUT les tools d'un autre owner + les inactifs. Valide le fix T3
      (sans le `owner_id.is.null` du filtre, les tools globaux — AutoScout24…
      seed 0023 — seraient invisibles côté API).

  (b) T1 + T2 — résolution + exécution : un `swarm_config` factice portant un
      binding `category="api_call"` + `endpoint_url` HTTP (nom ∉ toolkits
      Composio) est passé à `crew_helpers._resolve_tools_for_agent`. On prouve :
        - T2 : exactement 1 tool résolu, et c'est un `HttpApiCallTool` (le
          binding HTTP est bien routé vers l'exécuteur générique, pas ignoré ni
          traité comme Composio) ;
        - T1 : ce tool s'exécute réellement — `httpx.get` mocké → il construit
          l'URL (base + endpoint), valide les params depuis `schema_json`, et
          rend la réponse JSON en markdown, fail-soft.

  (c) POST /v1/tools via TestClient (persistence mockée) crée un tool
      owner-scopé : l'owner effectif est FORCÉ au scope du JWT interne, la
      réponse est 201 + la shape client TS complète.

Réseau : ZÉRO. Supabase → `_get_client` factice ; httpx → `httpx.get` mocké ;
persistence POST → `swarm_store.create_tool` mocké. Le JWT interne de test est
minté avec le secret posé par `conftest.py` (CREWAI_ENGINE_JWT_SECRET).

Distinct de `test_tools_endpoint.py` (qui teste chaque contrat en unité) : ici
on assemble la CHAÎNE — catalog (T3) → résolution+exécution du tool (T1/T2) →
création via l'API (POST) — sur un owner unique de scénario.
"""
from __future__ import annotations

import os
import time
from typing import Any
from unittest.mock import patch

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from src.crews import crew_helpers
from src.persistence import swarm_store
from src.persistence.swarm_store_impl import tools_crud
from src.tools.http_api_call import HttpApiCallTool

# Owner unique du scénario E2E (imposé par la tâche T9).
OWNER = "5741a7e9-9c3b-4f2e-8b1d-0a1b2c3d4e5f"
OTHER_OWNER = "99999999-9999-4999-8999-999999999999"

# Base URL factice utilisée par l'exécuteur HTTP (T1) — jamais atteinte pour de
# vrai : `httpx.get` est mocké. Sert seulement à prouver la construction d'URL.
FAKE_BASE_URL = "https://fake-strategy.internal"


# ── Auth helpers (miroir test_tools_endpoint.py) ─────────────────────────────


def _bearer_token() -> str:
    return os.environ.get("CREWAI_ENGINE_AUTH_TOKEN", "00000000000000000000000000000000")


def _internal_jwt(owner_id: str = OWNER) -> str:
    now = int(time.time())
    payload = {
        "iss": "myswarms-bff",
        "aud": "crewai-engine",
        "iat": now,
        "exp": now + 300,
        "sub": owner_id,
        "owner_id": owner_id,
    }
    return pyjwt.encode(payload, os.environ["CREWAI_ENGINE_JWT_SECRET"], algorithm="HS256")


def _headers(*, jwt: str | None = None) -> dict:
    h: dict = {"Authorization": f"Bearer {_bearer_token()}"}
    if jwt is not None:
        h["X-Internal-Auth"] = f"Bearer {jwt}"
    return h


# ── Faux client Supabase (émule PostgREST pour `list_tools`) ─────────────────


class _FakeToolsQuery:
    """Émule `.select().eq().or_().order().execute()` en appliquant EN MÉMOIRE
    les filtres réels posés par `list_tools` :
      - `.eq("is_active", True)`
      - `.or_("owner_id.eq.<owner>,owner_id.is.null")` (owner OU global)
    """

    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows
        self._active_only = False
        self._owner_or: str | None = None

    def select(self, *_a: Any, **_k: Any) -> "_FakeToolsQuery":
        return self

    def eq(self, col: str, val: Any) -> "_FakeToolsQuery":
        if col == "is_active" and val is True:
            self._active_only = True
        return self

    def or_(self, expr: str) -> "_FakeToolsQuery":
        self._owner_or = expr
        return self

    def order(self, *_a: Any, **_k: Any) -> "_FakeToolsQuery":
        return self

    def _owner_ids_allowed(self) -> tuple[set[str], bool]:
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
                r
                for r in rows
                if r.get("owner_id") in ids or (allow_null and r.get("owner_id") is None)
            ]
        return type("Res", (), {"data": list(rows)})()


class _FakeClient:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def table(self, name: str) -> _FakeToolsQuery:
        assert name == "tools", f"unexpected table {name!r}"
        return _FakeToolsQuery(self._rows)


# Catalogue factice : 1 tool owner-scopé, 1 tool global (owner NULL — le tool
# HTTP « Market Prices » que l'agent bindera en (b)), 1 tool d'un AUTRE owner,
# 1 tool inactif de l'owner.
_CATALOG_ROWS: list[dict[str, Any]] = [
    {
        "id": "own-http",
        "owner_id": OWNER,
        "name": "My Owner Tool",
        "category": "custom",
        "is_active": True,
    },
    {
        "id": "global-market",
        "owner_id": None,  # tool GLOBAL partagé (seed migration)
        "name": "Market Prices",
        "category": "api_call",
        "description": "Prix spot des marchés suivis",
        "endpoint_url": "/api/market/prices",
        "auth_type": None,
        "schema_json": {
            "params": {
                "symbol": {"type": "string", "required": True},
                "window": {"type": "string", "default": "1d", "enum": ["1h", "1d", "7d"]},
            }
        },
        "is_active": True,
    },
    {
        "id": "other-owner",
        "owner_id": OTHER_OWNER,
        "name": "Someone Else Tool",
        "category": "custom",
        "is_active": True,
    },
    {
        "id": "own-inactive",
        "owner_id": OWNER,
        "name": "Retired Tool",
        "category": "custom",
        "is_active": False,
    },
]


# ── (a) T3 — list-global : owner + globaux, autre-owner exclu ─────────────────


class TestCatalogListIncludesGlobal:
    def test_list_tools_returns_owner_plus_global_non_empty(self) -> None:
        """`list_tools(OWNER)` : liste NON vide, inclut owner + global, exclut le
        reste. Valide directement le fix T3 (le tool global doit être visible)."""
        with patch.object(tools_crud._facade, "_get_client", lambda: _FakeClient(_CATALOG_ROWS)):
            result = tools_crud.list_tools(owner_id=OWNER)

        assert isinstance(result, list)
        assert result, "list_tools ne doit PAS être vide pour un owner avec tools + globaux"
        ids = {r["id"] for r in result}
        assert "own-http" in ids, "tool de l'owner manquant"
        assert "global-market" in ids, "tool GLOBAL (owner NULL) manquant — fix T3 non appliqué"
        assert "other-owner" not in ids, "fuite cross-owner"
        assert "own-inactive" not in ids, "tool inactif ne doit pas remonter"

    def test_global_tool_visible_via_scoped_store_for_owner(self) -> None:
        """Le même filtre owner+global s'applique via la couche owner-scopée
        (ScopedSwarmStore.list_tools) que consomme la route GET /v1/tools."""
        from src.persistence.owner_scope import OwnerScope, ScopedSwarmStore

        scoped = ScopedSwarmStore(OwnerScope.for_test(OWNER))
        with patch.object(tools_crud._facade, "_get_client", lambda: _FakeClient(_CATALOG_ROWS)):
            result = scoped.list_tools()
        ids = {r["id"] for r in result}
        assert {"own-http", "global-market"} <= ids
        assert "other-owner" not in ids


# ── (b) T1 + T2 — résolution binding HTTP → HttpApiCallTool + exécution ───────


def _http_binding_swarm_config() -> tuple[str, list[dict[str, Any]]]:
    """swarm_config factice : 1 agent + 1 binding vers le tool global HTTP.

    Retourne (agent_id, tool_bindings) au format attendu par
    `_resolve_tools_for_agent` (chaque binding porte `agent_id` + `tool` déballé).
    """
    agent_id = "agent-e2e-1"
    market_tool_row = next(r for r in _CATALOG_ROWS if r["id"] == "global-market")
    tool_bindings: list[dict[str, Any]] = [
        {
            "id": "bind-1",
            "agent_id": agent_id,
            "tool_id": market_tool_row["id"],
            "priority": 0,
            "config_json": {},
            # `tool` = la row catalog déballée (comme le fait swarm_store au load).
            "tool": market_tool_row,
        }
    ]
    return agent_id, tool_bindings


class TestResolveHttpToolForAgent:
    def test_binding_resolves_to_single_http_api_call_tool(self) -> None:
        """T2 : un binding api_call + endpoint_url (∉ Composio) donne EXACTEMENT
        1 tool, de type HttpApiCallTool (route HTTP générique, pas ignoré)."""
        agent_id, tool_bindings = _http_binding_swarm_config()

        tools = crew_helpers._resolve_tools_for_agent(
            agent_id, tool_bindings, owner_id=OWNER
        )

        assert len(tools) == 1, f"attendu 1 tool HTTP, obtenu {len(tools)}"
        tool = tools[0]
        assert isinstance(tool, HttpApiCallTool), f"type inattendu: {type(tool).__name__}"
        # T1 : la factory a bien câblé endpoint + slug depuis la row.
        assert tool.endpoint_url == "/api/market/prices"
        assert tool.name == "market_prices"  # slug(name)

    def test_binding_for_other_agent_is_not_resolved(self) -> None:
        """Un binding rattaché à un autre agent_id n'est jamais résolu ici."""
        _agent_id, tool_bindings = _http_binding_swarm_config()
        tools = crew_helpers._resolve_tools_for_agent(
            "some-other-agent", tool_bindings, owner_id=OWNER
        )
        assert tools == []

    def test_resolved_http_tool_executes_endtoend_with_mocked_httpx(self) -> None:
        """T1 : le tool résolu s'exécute réellement — httpx mocké — et rend la
        réponse JSON en markdown, en respectant base URL + params validés."""
        agent_id, tool_bindings = _http_binding_swarm_config()

        captured: dict[str, Any] = {}

        class _FakeResponse:
            status_code = 200

            def json(self) -> dict[str, Any]:
                return {"symbol": "BTC", "price": 42000, "window": "1d"}

        def _fake_get(url: str, params: dict | None = None, headers: dict | None = None, timeout: float | None = None) -> _FakeResponse:  # noqa: ANN001
            captured["url"] = url
            captured["params"] = params or {}
            return _FakeResponse()

        # Base URL factice + httpx mocké → aucun réseau.
        with patch.object(crew_helpers.settings, "STRATEGY_PLATFORM_URL", FAKE_BASE_URL):
            tools = crew_helpers._resolve_tools_for_agent(
                agent_id, tool_bindings, owner_id=OWNER
            )
            assert len(tools) == 1
            tool = tools[0]

            # Import du module exécuteur pour patcher SON httpx (le tool y appelle
            # httpx.get au runtime).
            import src.tools.http_api_call as http_mod

            with (
                patch.object(http_mod.settings, "STRATEGY_PLATFORM_URL", FAKE_BASE_URL),
                patch.object(http_mod, "httpx") as mock_httpx,
            ):
                mock_httpx.get.side_effect = _fake_get
                # Exceptions httpx référencées par le fail-soft — on les rebranche
                # sur les vraies classes pour ne pas casser les `except`.
                import httpx as real_httpx

                mock_httpx.TimeoutException = real_httpx.TimeoutException
                mock_httpx.HTTPError = real_httpx.HTTPError

                out = tool.run(symbol="BTC", window="1d")

        # L'URL = base + endpoint relatif ; le param requis a été forwardé.
        assert captured["url"] == f"{FAKE_BASE_URL}/api/market/prices"
        assert captured["params"].get("symbol") == "BTC"
        assert captured["params"].get("window") == "1d"
        # La réponse JSON est rendue en markdown lisible (fail-soft absent).
        assert "unavailable" not in out
        assert "BTC" in out
        assert "42000" in out

    def test_http_tool_missing_required_param_failsoft(self) -> None:
        """T1 fail-soft : param requis manquant → message `[slug] unavailable`,
        AUCUN appel réseau émis (httpx.get jamais touché)."""
        agent_id, tool_bindings = _http_binding_swarm_config()

        import src.tools.http_api_call as http_mod

        with (
            patch.object(crew_helpers.settings, "STRATEGY_PLATFORM_URL", FAKE_BASE_URL),
            patch.object(http_mod.settings, "STRATEGY_PLATFORM_URL", FAKE_BASE_URL),
            patch.object(http_mod, "httpx") as mock_httpx,
        ):
            import httpx as real_httpx

            mock_httpx.TimeoutException = real_httpx.TimeoutException
            mock_httpx.HTTPError = real_httpx.HTTPError

            tools = crew_helpers._resolve_tools_for_agent(
                agent_id, tool_bindings, owner_id=OWNER
            )
            out = tools[0].run(window="1d")  # 'symbol' requis absent

        assert "unavailable" in out
        assert "symbol" in out  # nomme le param manquant
        mock_httpx.get.assert_not_called()


# ── (c) POST /v1/tools — création owner-scopée via TestClient (mock DB) ───────


@pytest.fixture(scope="module")
def client():
    from src.main import app  # noqa: PLC0415

    with TestClient(app) as c:
        yield c


class TestCreateToolViaApi:
    def test_post_creates_owner_scoped_tool(self, client) -> None:
        """POST /v1/tools : persistence mockée, owner FORCÉ au JWT, 201 + shape."""
        seen: dict[str, Any] = {}

        def _fake_create_tool(payload: dict[str, Any]) -> dict[str, Any]:
            seen["payload"] = payload
            return {
                "id": "tool-e2e",
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
                    "name": "E2E HTTP Source",
                    "category": "api_call",
                    "description": "Créé par le test E2E",
                    "endpoint_url": "/api/market/prices",
                    "auth_type": "bearer",
                    "schema_json": {"params": {"symbol": {"type": "string", "required": True}}},
                },
                headers=_headers(jwt=_internal_jwt(OWNER)),
            )

        assert r.status_code == 201, r.text
        # L'owner effectif est FORCÉ au scope du JWT (jamais un owner_id de body).
        assert seen["payload"]["owner_id"] == OWNER
        body = r.json()
        assert body["id"] == "tool-e2e"
        assert body["owner_id"] == OWNER
        assert body["name"] == "E2E HTTP Source"
        assert body["category"] == "api_call"
        assert body["endpoint_url"] == "/api/market/prices"
        # Shape client TS complète.
        for key in (
            "id", "owner_id", "name", "category", "description",
            "endpoint_url", "auth_type", "schema_json", "is_active",
            "created_at", "updated_at",
        ):
            assert key in body, f"clé manquante dans la réponse: {key}"

    def test_post_requires_internal_jwt(self, client) -> None:
        """Sans JWT interne → 401 (le bearer machine seul ne suffit pas)."""
        r = client.post(
            "/v1/tools",
            json={"name": "no-jwt", "category": "custom"},
            headers=_headers(),
        )
        assert r.status_code == 401
