"""R6 — Architect Cortex pre-fetch is owner-scoped.

The Architect (`generate_swarm_spec`) runs a Cortex pre-fetch with the user's
prompt. Before R6 this hit Adrien's global Vault for ANY authenticated owner.
These tests prove the pre-fetch is now gated by the verified owner_id:
- mapped owner → Vault queried (scoped to its namespace),
- unknown/None owner → fail-closed, NO Cortex request, empty context,
- owner_id is propagated from generate_swarm_spec → _fetch_cortex_context.

All Cortex I/O is mocked. No private content appears in this file.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

_OWNER_MAPPED = "33333333-3333-3333-3333-333333333333"
_OWNER_UNKNOWN = "44444444-4444-4444-4444-444444444444"
_NS = "architect-ns"


@pytest.fixture(autouse=True)
def _vault_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VAULT_NAMESPACE_BY_OWNER_JSON", f'{{"{_OWNER_MAPPED}":"{_NS}"}}')
    monkeypatch.delenv("ALLOW_LEGACY_VAULT_NAMESPACE_FALLBACK_FOR_TESTS", raising=False)
    monkeypatch.delenv("VAULT_DEFAULT_NAMESPACE", raising=False)
    # Settings Cortex déterministe patché sur vault_search (cf test_vault_search).
    from src import config
    from src.tools import vault_search
    test_settings = config.Settings.model_construct(
        CREWAI_ENGINE_AUTH_TOKEN="00000000000000000000000000000000",
        CORTEX_URL="http://test-cortex:3030",
        CORTEX_API_KEY="test-key",
    )
    monkeypatch.setattr(vault_search, "settings", test_settings)


def _ok_resp():
    resp = MagicMock()
    resp.ok = True
    resp.status_code = 200
    resp.json.return_value = {
        "results": [
            {"path": "x.md", "title": "T", "score": 0.9, "content_preview": "preview"},
        ]
    }
    return resp


def test_mapped_owner_fetches_scoped_context():
    from src.agents.architect import _fetch_cortex_context

    with patch("src.tools.vault_search.requests.post", return_value=_ok_resp()) as mock_post:
        ctx = _fetch_cortex_context("design a swarm", owner_id=_OWNER_MAPPED)
    assert mock_post.called
    # Le namespace transmis à Cortex est celui de l'owner (forcé serveur).
    assert mock_post.call_args.kwargs["json"]["namespace"] == _NS
    assert "Contexte historique Cortex" in ctx


def test_unknown_owner_failclosed_empty_context_no_call():
    from src.agents.architect import _fetch_cortex_context

    with patch("src.tools.vault_search.requests.post") as mock_post:
        ctx = _fetch_cortex_context("design a swarm", owner_id=_OWNER_UNKNOWN)
    mock_post.assert_not_called()  # Vault d'Adrien jamais atteint
    assert ctx == ""


def test_none_owner_failclosed_empty_context_no_call():
    from src.agents.architect import _fetch_cortex_context

    with patch("src.tools.vault_search.requests.post") as mock_post:
        ctx = _fetch_cortex_context("design a swarm", owner_id=None)
    mock_post.assert_not_called()
    assert ctx == ""


def test_no_module_singleton_leak_between_owners():
    """Deux owners successifs → chacun sa propre instance/namespace (pas de cache).

    Preuve d'isolation : un nouvel objet VaultSearchTool est construit par appel
    (plus de singleton module-level), donc le namespace résolu suit l'owner du
    second appel, jamais celui du premier.
    """
    from src.agents import architect

    import json as _json

    mapping = {_OWNER_MAPPED: _NS, "55555555-5555-5555-5555-555555555555": "other-ns"}
    with patch.dict("os.environ", {"VAULT_NAMESPACE_BY_OWNER_JSON": _json.dumps(mapping)}):
        with patch("src.tools.vault_search.requests.post", return_value=_ok_resp()) as mock_post:
            architect._fetch_cortex_context("p1", owner_id=_OWNER_MAPPED)
            ns_first = mock_post.call_args.kwargs["json"]["namespace"]
            architect._fetch_cortex_context("p2", owner_id="55555555-5555-5555-5555-555555555555")
            ns_second = mock_post.call_args.kwargs["json"]["namespace"]
    assert ns_first == _NS
    assert ns_second == "other-ns"


def test_generate_swarm_spec_propagates_owner_to_prefetch():
    """generate_swarm_spec passe owner_id au pré-fetch Cortex (anti-régression)."""
    from src.agents import architect

    captured = {}

    def _fake_prefetch(prompt, owner_id=None):  # noqa: ARG001
        captured["owner_id"] = owner_id
        return ""

    valid_spec = (
        '{"name":"Sw","description":"d","rationale":"r",'
        '"agents":[{"name":"A1","role":"executor","system_prompt":"do",'
        '"model_provider":"hypercli","model_name":"kimi-k2.6"}],'
        '"tasks":[{"name":"T1","description":"d","expected_output":"o","agent_index":0,'
        '"depends_on_task_index":null}],"tool_bindings":[]}'
    )
    with patch.object(architect, "_fetch_cortex_context", side_effect=_fake_prefetch):
        with patch.object(architect, "_call_llm", return_value=valid_spec):
            architect.generate_swarm_spec("design", [], owner_id=_OWNER_MAPPED)
    assert captured["owner_id"] == _OWNER_MAPPED
