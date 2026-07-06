"""Tests for HttpApiCallTool + build_http_tool_from_row.

Two concerns:
- fail-soft TOTAL : every error path (timeout, 5xx, 401/403, invalid JSON,
  missing base URL) returns an explanatory `[slug] unavailable: …` string and
  NEVER raises (CrewAI would otherwise retry 3× then « Moving on then »).
- schema filtering : kwargs are validated/filtered against `schema_json['params']`
  (required / enum / default) without crashing, and only declared params reach
  the query string.

No real HTTP call is made: `httpx.get` is always mocked on the module. The
bearer token is asserted present in the Authorization header but the tool code
never logs it.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from src.tools.http_api_call import (
    HttpApiCallTool,
    _slugify,
    build_http_tool_from_row,
)

# ── Fixtures / helpers ────────────────────────────────────────────────────────

# schema_json['params'] shape copied from migration 0023 (AutoScout seed).
_PARAMS = {
    "make": {"type": "string", "required": True},
    "model": {"type": "string", "required": False},
    "market": {
        "type": "string",
        "required": False,
        "default": "fr",
        "enum": ["fr", "de", "it", "es"],
    },
    "maxResults": {"type": "number", "required": False, "default": 25},
}

_ROW = {
    "name": "AutoScout24 Sourcing",
    "description": "Recherche annonces véhicules",
    "endpoint_url": "/api/market/prices",
    "auth_type": "bearer",
    "schema_json": {"params": _PARAMS},
}


@pytest.fixture(autouse=True)
def _set_platform_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Deterministic settings seen by the module.

    `from ..config import settings` captures a reference at import time, so
    rebinding `config.settings` is not enough — we patch the real target on the
    `http_api_call` module (same technique as test_vault_search).
    """
    from src import config
    from src.tools import http_api_call

    test_settings = config.Settings.model_construct(
        CREWAI_ENGINE_AUTH_TOKEN="0" * 32,
        STRATEGY_PLATFORM_URL="https://strategy.test",
        STRATEGY_PLATFORM_TOKEN="secret-bearer-token",
    )
    monkeypatch.setattr(http_api_call, "settings", test_settings)


def _ok_response(payload: object, status: int = 200) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status
    resp.json.return_value = payload
    return resp


def _tool(**overrides) -> HttpApiCallTool:
    return build_http_tool_from_row({**_ROW, **overrides})


# ── slugify ───────────────────────────────────────────────────────────────────


def test_slugify_normalizes_name():
    assert _slugify("AutoScout24 Sourcing") == "autoscout24_sourcing"
    assert _slugify("  Weird!!Name -- x  ") == "weird_name_x"
    assert _slugify("") == "http_api_call"  # fallback, never empty


# ── factory : name/description derivation ─────────────────────────────────────


def test_factory_derives_name_and_description_with_params():
    tool = _tool()
    assert tool.name == "autoscout24_sourcing"
    # base description preserved …
    assert "Recherche annonces véhicules" in tool.description
    # … and params block appended (readable for the LLM).
    assert "make" in tool.description
    assert "market" in tool.description
    assert "fr" in tool.description  # enum surfaced
    assert tool.endpoint_url == "/api/market/prices"
    assert tool.auth_type == "bearer"


def test_factory_tolerates_partial_row_without_raising():
    tool = build_http_tool_from_row({})  # empty row
    assert tool.name == "http_api_call"
    assert tool.endpoint_url == ""
    # No endpoint → fail-soft at run, no exception.
    out = tool._run()
    assert out.startswith("[http_api_call] unavailable")


# ── success path : formatted markdown ─────────────────────────────────────────


def test_success_returns_formatted_markdown():
    tool = _tool()
    payload = {"symbol": "BTC", "price": 61234.5}
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response(payload)
    ) as mock_get:
        out = tool._run(make="bmw")
    assert "unavailable" not in out
    assert "BTC" in out
    assert "61234.5" in out
    assert "```json" in out
    mock_get.assert_called_once()


# ── schema filtering ──────────────────────────────────────────────────────────


def test_default_injected_and_only_declared_params_forwarded():
    tool = _tool()
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response({})
    ) as mock_get:
        # unknown kwarg 'garbage' must be dropped; market default must be applied.
        tool._run(make="bmw", garbage="DROP_ME")
    sent = mock_get.call_args.kwargs["params"]
    assert sent["make"] == "bmw"
    assert sent["market"] == "fr"  # default applied
    assert sent["maxResults"] == 25  # default applied
    assert "garbage" not in sent  # undeclared kwarg filtered out
    assert "model" not in sent  # optional + not provided → absent (no None)


def test_enum_violation_rejected_no_request():
    tool = _tool()
    with patch("src.tools.http_api_call.httpx.get") as mock_get:
        out = tool._run(make="bmw", market="zz")  # 'zz' not in enum
    mock_get.assert_not_called()  # request never emitted
    assert out.startswith("[autoscout24_sourcing] unavailable")
    assert "market" in out and "zz" in out


def test_missing_required_rejected_no_request():
    tool = _tool()
    with patch("src.tools.http_api_call.httpx.get") as mock_get:
        out = tool._run(model="x3")  # 'make' (required) absent
    mock_get.assert_not_called()
    assert out.startswith("[autoscout24_sourcing] unavailable")
    assert "make" in out


def test_no_params_spec_forwards_non_none_kwargs():
    # Row without a params contract → forward provided kwargs (minus None).
    tool = build_http_tool_from_row(
        {"name": "Free", "endpoint_url": "/api/free", "schema_json": {}}
    )
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response({})
    ) as mock_get:
        tool._run(a=1, b=None, c="z")
    sent = mock_get.call_args.kwargs["params"]
    assert sent == {"a": 1, "c": "z"}  # None dropped


# ── bearer injection (never logged) ───────────────────────────────────────────


def test_bearer_header_injected_when_auth_bearer():
    tool = _tool()  # auth_type == 'bearer'
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response({})
    ) as mock_get:
        tool._run(make="bmw")
    headers = mock_get.call_args.kwargs["headers"]
    assert headers["Authorization"] == "Bearer secret-bearer-token"


def test_no_authorization_header_when_auth_absent():
    tool = _tool(auth_type=None)
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response({})
    ) as mock_get:
        tool._run(make="bmw")
    headers = mock_get.call_args.kwargs["headers"]
    assert "Authorization" not in headers


def test_no_authorization_header_when_token_empty(monkeypatch: pytest.MonkeyPatch):
    from src import config
    from src.tools import http_api_call

    monkeypatch.setattr(
        http_api_call,
        "settings",
        config.Settings.model_construct(
            CREWAI_ENGINE_AUTH_TOKEN="0" * 32,
            STRATEGY_PLATFORM_URL="https://strategy.test",
            STRATEGY_PLATFORM_TOKEN="",  # bearer requested but no token → no header
        ),
    )
    tool = _tool()  # auth_type == 'bearer'
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response({})
    ) as mock_get:
        tool._run(make="bmw")
    headers = mock_get.call_args.kwargs["headers"]
    assert "Authorization" not in headers


# ── fail-soft : network / status / body ───────────────────────────────────────


def test_timeout_fail_soft():
    tool = _tool()
    with patch(
        "src.tools.http_api_call.httpx.get",
        side_effect=httpx.TimeoutException("boom"),
    ):
        out = tool._run(make="bmw")
    assert out.startswith("[autoscout24_sourcing] unavailable")
    assert "timeout" in out.lower()


def test_connection_error_fail_soft():
    tool = _tool()
    with patch(
        "src.tools.http_api_call.httpx.get",
        side_effect=httpx.ConnectError("refused"),
    ):
        out = tool._run(make="bmw")
    assert out.startswith("[autoscout24_sourcing] unavailable")
    assert "connection error" in out.lower()


def test_5xx_fail_soft():
    tool = _tool()
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response({}, status=503)
    ):
        out = tool._run(make="bmw")
    assert out.startswith("[autoscout24_sourcing] unavailable")
    assert "503" in out


def test_401_fail_soft():
    tool = _tool()
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response({}, status=401)
    ):
        out = tool._run(make="bmw")
    assert out.startswith("[autoscout24_sourcing] unavailable")
    assert "unauthorized" in out.lower()


def test_invalid_json_fail_soft():
    tool = _tool()
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = 200
    resp.json.side_effect = ValueError("not json")
    with patch("src.tools.http_api_call.httpx.get", return_value=resp):
        out = tool._run(make="bmw")
    assert out.startswith("[autoscout24_sourcing] unavailable")
    assert "invalid json" in out.lower()


def test_missing_base_url_fail_soft(monkeypatch: pytest.MonkeyPatch):
    from src import config
    from src.tools import http_api_call

    monkeypatch.setattr(
        http_api_call,
        "settings",
        config.Settings.model_construct(
            CREWAI_ENGINE_AUTH_TOKEN="0" * 32,
            STRATEGY_PLATFORM_URL="",  # not configured
            STRATEGY_PLATFORM_TOKEN="",
        ),
    )
    tool = _tool()
    with patch("src.tools.http_api_call.httpx.get") as mock_get:
        out = tool._run(make="bmw")
    mock_get.assert_not_called()
    assert out.startswith("[autoscout24_sourcing] unavailable")
    assert "not configured" in out.lower()


def test_url_built_from_base_plus_endpoint():
    tool = _tool()
    with patch(
        "src.tools.http_api_call.httpx.get", return_value=_ok_response({})
    ) as mock_get:
        tool._run(make="bmw")
    called_url = mock_get.call_args.args[0] if mock_get.call_args.args else mock_get.call_args.kwargs["url"]
    assert called_url == "https://strategy.test/api/market/prices"
