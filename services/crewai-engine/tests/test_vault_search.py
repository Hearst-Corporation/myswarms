"""Tests for VaultSearchTool — fail-soft mechanics + owner-scoped access (R6).

Two concerns:
- fail-soft : every Cortex error path returns an explanatory string, never raises.
- owner-scoped (R6) : the Vault is queried ONLY for an owner that maps to an
  authorized namespace. Unknown/None owners are fail-closed — NO Cortex request
  is ever emitted (the private Vault is never touched cross-tenant).

No real Cortex call is made: `requests.post` is always mocked. No private
content appears in this file.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import requests

# Owner mappé à un namespace de test (jamais une vraie valeur sensible).
_TEST_OWNER = "11111111-1111-1111-1111-111111111111"
_TEST_NAMESPACE = "test-namespace"


@pytest.fixture(autouse=True)
def _set_cortex_and_vault_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cortex configuré + un owner de test mappé à un namespace autorisé.

    Permet aux tests de mécanique (fail-soft) de franchir la gate R6 avec un
    owner légitime, en utilisant le VRAI resolver (pas de patch). Les tests de
    fail-closed utilisent un owner non mappé / None.
    """
    monkeypatch.setenv(
        "VAULT_NAMESPACE_BY_OWNER_JSON",
        f'{{"{_TEST_OWNER}":"{_TEST_NAMESPACE}"}}',
    )
    # Legacy fallback OFF par défaut (fail-closed strict) — les tests qui le
    # veulent l'activent explicitement.
    monkeypatch.delenv("ALLOW_LEGACY_VAULT_NAMESPACE_FALLBACK_FOR_TESTS", raising=False)
    monkeypatch.delenv("VAULT_DEFAULT_NAMESPACE", raising=False)
    # Settings déterministe (Cortex configuré) patché directement sur le module
    # vault_search — `from ..config import settings` capture une référence à
    # l'import, donc rebinder `config.settings` ne suffit pas ; on patche la
    # cible réelle. Évite toute dépendance à l'ordre de lecture d'env pydantic.
    from src import config
    from src.tools import vault_search
    test_settings = config.Settings.model_construct(
        CREWAI_ENGINE_AUTH_TOKEN="00000000000000000000000000000000",
        CORTEX_URL="http://test-cortex:3030",
        CORTEX_API_KEY="test-key",
    )
    monkeypatch.setattr(vault_search, "settings", test_settings)


def _make_tool(owner_id: str | None = _TEST_OWNER):
    from src.tools.vault_search import VaultSearchTool
    return VaultSearchTool(owner_id=owner_id)


# ── Fail-soft mechanics (owner mappé → la gate R6 passe) ──────────────────────


def test_success_returns_formatted_markdown():
    tool = _make_tool()
    fake_resp = MagicMock()
    fake_resp.ok = True
    fake_resp.status_code = 200
    fake_resp.json.return_value = {
        "query": "test",
        "count": 1,
        "results": [
            {"path": "02_Projets/X.md", "title": "Projet X", "score": 0.92, "content_preview": "Décision clé sur X"},
        ],
    }
    with patch("src.tools.vault_search.requests.post", return_value=fake_resp):
        out = tool._run("decision sur X")
    assert "Projet X" in out
    assert "02_Projets/X.md" in out
    assert "Décision clé" in out
    assert "Vault unavailable" not in out


def test_timeout_fail_soft():
    tool = _make_tool()
    with patch("src.tools.vault_search.requests.post", side_effect=requests.Timeout()):
        out = tool._run("test")
    assert out.startswith("Vault unavailable")
    assert "timeout" in out.lower()


def test_5xx_fail_soft():
    tool = _make_tool()
    fake_resp = MagicMock()
    fake_resp.ok = False
    fake_resp.status_code = 503
    with patch("src.tools.vault_search.requests.post", return_value=fake_resp):
        out = tool._run("test")
    assert out.startswith("Vault unavailable")
    assert "503" in out


def test_cortex_url_missing_fail_soft():
    # Replace the settings object seen by vault_search with one having empty CORTEX_URL.
    from src import config
    from src.tools import vault_search

    empty_settings = config.Settings.model_construct(
        CREWAI_ENGINE_AUTH_TOKEN="00000000000000000000000000000000",
        CORTEX_URL="",
        CORTEX_API_KEY="",
    )
    with patch.object(vault_search, "settings", empty_settings):
        tool = _make_tool()
        out = tool._run("test")
    assert out.startswith("Vault unavailable")
    assert "not configured" in out.lower()


# ── R6 — Owner-scoped access gate (fail-closed) ───────────────────────────────


def test_unknown_owner_is_failclosed_no_cortex_call():
    """Owner non mappé → aucune requête Cortex, message fail-closed."""
    tool = _make_tool(owner_id="99999999-9999-9999-9999-999999999999")
    with patch("src.tools.vault_search.requests.post") as mock_post:
        out = tool._run("decision sur X")
    mock_post.assert_not_called()  # le Vault d'Adrien n'est JAMAIS atteint
    assert out.startswith("Vault unavailable")
    assert "owner" in out.lower()


def test_none_owner_is_failclosed_no_cortex_call():
    """owner_id absent (None) → fail-closed, aucune requête Cortex."""
    tool = _make_tool(owner_id=None)
    with patch("src.tools.vault_search.requests.post") as mock_post:
        out = tool._run("decision sur X")
    mock_post.assert_not_called()
    assert out.startswith("Vault unavailable")


def test_mapped_owner_query_uses_resolved_namespace_in_payload():
    """Owner mappé → la requête Cortex porte le namespace résolu (forcé serveur)."""
    tool = _make_tool(owner_id=_TEST_OWNER)
    fake_resp = MagicMock()
    fake_resp.ok = True
    fake_resp.status_code = 200
    fake_resp.json.return_value = {"results": []}
    with patch("src.tools.vault_search.requests.post", return_value=fake_resp) as mock_post:
        tool._run("decision sur X")
    mock_post.assert_called_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["namespace"] == _TEST_NAMESPACE


def test_llm_supplied_namespace_cannot_override_resolver():
    """Le namespace vient du resolver (owner) — pas d'argument LLM/client.

    `_run` n'expose qu'un argument `query` (+ limit). Même si un appelant
    tentait de passer un namespace via kwargs, la signature ne l'accepte pas :
    le namespace du payload reste celui résolu pour l'owner.
    """
    tool = _make_tool(owner_id=_TEST_OWNER)
    fake_resp = MagicMock()
    fake_resp.ok = True
    fake_resp.status_code = 200
    fake_resp.json.return_value = {"results": []}
    with patch("src.tools.vault_search.requests.post", return_value=fake_resp) as mock_post:
        # Tenter d'injecter un namespace étranger via kwargs → TypeError attendu
        with pytest.raises(TypeError):
            tool._run("decision sur X", namespace="adrien")  # type: ignore[call-arg]
        # Un appel légitime n'utilise que le namespace résolu de l'owner.
        tool._run("decision sur X")
    payload = mock_post.call_args.kwargs["json"]
    assert payload["namespace"] == _TEST_NAMESPACE


def test_owner_b_cannot_reach_owner_a_namespace():
    """Owner B (mappé à son propre ns) n'atteint jamais le namespace d'Adrien."""
    import json as _json

    monkeypatch_payload = {
        _TEST_OWNER: "adrien-vault",
        "22222222-2222-2222-2222-222222222222": "owner-b-vault",
    }
    fake_resp = MagicMock()
    fake_resp.ok = True
    fake_resp.status_code = 200
    fake_resp.json.return_value = {"results": []}
    with patch.dict(
        "os.environ",
        {"VAULT_NAMESPACE_BY_OWNER_JSON": _json.dumps(monkeypatch_payload)},
    ):
        tool_b = _make_tool(owner_id="22222222-2222-2222-2222-222222222222")
        with patch("src.tools.vault_search.requests.post", return_value=fake_resp) as mock_post:
            tool_b._run("decisions adrien")
    payload = mock_post.call_args.kwargs["json"]
    assert payload["namespace"] == "owner-b-vault"
    assert payload["namespace"] != "adrien-vault"


def test_empty_query_failclosed_before_scope():
    """Requête vide → message d'erreur, aucune requête réseau."""
    tool = _make_tool()
    with patch("src.tools.vault_search.requests.post") as mock_post:
        out = tool._run("   ")
    mock_post.assert_not_called()
    assert out.startswith("Vault unavailable")
