"""Tests du routage de tools dans `crew_helpers._resolve_tools_for_agent` (T2).

Objet : vérifier que le résolveur route désormais les tools HTTP « data-source »
(category ∈ {api_call, search} + `endpoint_url` path/URL + name ∉ toolkits Composio)
vers l'exécuteur générique T1 (`build_http_tool_from_row`), TOUT EN conservant
intact le chemin Composio (name ∈ _COMPOSIO_TOOLKITS) et le fallback « ignoré »
pour les catégories non gérées.

Aucun appel réseau ni Composio réel :
- `get_composio_tools_for_toolkits` est patché sur le module `crew_helpers`
  (nom importé au chargement) → renvoie un sentinelle par toolkit demandé.
- `build_http_tool_from_row` est patché à sa SOURCE (`src.tools.http_api_call`)
  car le résolveur l'importe en LAZY (résolution de l'attribut au call-time) →
  renvoie un sentinelle sans instancier de vrai BaseTool.

Contrat vérifié : retour = CONCATÉNATION [Composio] + [HTTP].
"""
from __future__ import annotations

from unittest.mock import patch

from src.crews.crew_helpers import _resolve_tools_for_agent

# ── Helpers / fixtures ────────────────────────────────────────────────────────

_AGENT_ID = "agent-1"


def _binding(agent_id: str, tool: dict | None) -> dict:
    """Un binding minimal {agent_id, tool} tel que fourni par le swarm chargé."""
    return {"agent_id": agent_id, "tool": tool}


def _http_tool_row(**overrides) -> dict:
    """Row `tools` d'un endpoint HTTP data-source (catégorie api_call par défaut)."""
    row = {
        "name": "Market Prices",
        "category": "api_call",
        "description": "Prix spot des marchés suivis",
        "endpoint_url": "/api/market/prices",
        "auth_type": "bearer",
        "schema_json": {"params": {"symbol": {"type": "string", "required": True}}},
    }
    row.update(overrides)
    return row


def _composio_tool_row(**overrides) -> dict:
    """Row `tools` d'un toolkit Composio (name ∈ _COMPOSIO_TOOLKITS)."""
    row = {
        "name": "gmail",
        "category": "api_call",
        "description": "Gmail via Composio",
        "endpoint_url": None,
        "auth_type": None,
        "schema_json": {},
    }
    row.update(overrides)
    return row


# ── 1. api_call + endpoint_url → 1 tool HTTP (via l'exécuteur T1) ─────────────


def test_http_binding_builds_one_http_tool():
    """Un binding api_call avec `endpoint_url` path HTTP (name hors toolkits
    Composio) doit produire EXACTEMENT 1 tool, construit via T1."""
    bindings = [_binding(_AGENT_ID, _http_tool_row())]

    with (
        patch("src.crews.crew_helpers.get_composio_tools_for_toolkits") as m_composio,
        patch(
            "src.tools.http_api_call.build_http_tool_from_row",
            return_value="HTTP_TOOL",
        ) as m_http,
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings)

    assert tools == ["HTTP_TOOL"]
    # Composio n'est PAS sollicité (aucun toolkit).
    m_composio.assert_not_called()
    # La factory T1 reçoit bien la row du tool.
    m_http.assert_called_once()
    passed_row = m_http.call_args.args[0]
    assert passed_row["endpoint_url"] == "/api/market/prices"


def test_search_category_with_endpoint_also_routes_http():
    """La catégorie `search` (pas seulement `api_call`) est routée HTTP."""
    bindings = [
        _binding(_AGENT_ID, _http_tool_row(name="Vault Search", category="search"))
    ]

    with (
        patch("src.crews.crew_helpers.get_composio_tools_for_toolkits"),
        patch(
            "src.tools.http_api_call.build_http_tool_from_row",
            return_value="SEARCH_TOOL",
        ) as m_http,
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings)

    assert tools == ["SEARCH_TOOL"]
    m_http.assert_called_once()


def test_absolute_url_endpoint_routes_http():
    """Un `endpoint_url` absolu http(s) est aussi un endpoint HTTP valide."""
    bindings = [
        _binding(
            _AGENT_ID,
            _http_tool_row(name="Ext API", endpoint_url="https://api.example.com/x"),
        )
    ]

    with (
        patch("src.crews.crew_helpers.get_composio_tools_for_toolkits"),
        patch(
            "src.tools.http_api_call.build_http_tool_from_row",
            return_value="EXT_TOOL",
        ) as m_http,
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings)

    assert tools == ["EXT_TOOL"]
    m_http.assert_called_once()


# ── 2. Un binding Composio reste Composio (chemin INCHANGÉ) ────────────────────


def test_composio_binding_stays_composio():
    """Un binding dont le name ∈ _COMPOSIO_TOOLKITS passe TOUJOURS par le bridge
    Composio — jamais par l'exécuteur HTTP, même si une row porte un endpoint."""
    bindings = [_binding(_AGENT_ID, _composio_tool_row())]

    with (
        patch(
            "src.crews.crew_helpers.get_composio_tools_for_toolkits",
            return_value=["COMPOSIO_GMAIL"],
        ) as m_composio,
        patch("src.tools.http_api_call.build_http_tool_from_row") as m_http,
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings, owner_id="owner-42")

    assert tools == ["COMPOSIO_GMAIL"]
    # Le toolkit gmail est demandé au bridge, avec l'owner propagé.
    m_composio.assert_called_once_with(["gmail"], owner_id="owner-42")
    # L'exécuteur HTTP n'est JAMAIS appelé pour un toolkit Composio.
    m_http.assert_not_called()


def test_composio_alias_normalized_and_not_http():
    """`google_calendar` (alias) est normalisé en `googlecalendar` et reste
    Composio — l'endpoint éventuel de la row ne le route pas en HTTP."""
    bindings = [
        _binding(
            _AGENT_ID,
            _composio_tool_row(name="google_calendar", endpoint_url="/should/ignore"),
        )
    ]

    with (
        patch(
            "src.crews.crew_helpers.get_composio_tools_for_toolkits",
            return_value=["COMPOSIO_GCAL"],
        ) as m_composio,
        patch("src.tools.http_api_call.build_http_tool_from_row") as m_http,
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings)

    assert tools == ["COMPOSIO_GCAL"]
    m_composio.assert_called_once_with(["googlecalendar"], owner_id=None)
    m_http.assert_not_called()


# ── 3. Un binding custom / non géré est ignoré ────────────────────────────────


def test_custom_binding_ignored():
    """Un binding `custom` (ni Composio ni HTTP data-source) est ignoré :
    aucun tool produit, aucune factory sollicitée."""
    bindings = [
        _binding(
            _AGENT_ID,
            {
                "name": "My Python Fn",
                "category": "custom",
                "endpoint_url": None,
                "schema_json": {},
            },
        )
    ]

    with (
        patch("src.crews.crew_helpers.get_composio_tools_for_toolkits") as m_composio,
        patch("src.tools.http_api_call.build_http_tool_from_row") as m_http,
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings)

    assert tools == []
    m_composio.assert_not_called()
    m_http.assert_not_called()


def test_api_call_without_endpoint_is_ignored():
    """Une row api_call SANS endpoint (ni path ni URL) et hors toolkits Composio
    n'est pas routable → ignorée, pas de tool HTTP construit."""
    bindings = [
        _binding(
            _AGENT_ID,
            _http_tool_row(name="Broken", endpoint_url=None),
        )
    ]

    with (
        patch("src.crews.crew_helpers.get_composio_tools_for_toolkits") as m_composio,
        patch("src.tools.http_api_call.build_http_tool_from_row") as m_http,
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings)

    assert tools == []
    m_composio.assert_not_called()
    m_http.assert_not_called()


# ── 4. Concaténation + filtrage par agent ─────────────────────────────────────


def test_returns_concatenation_composio_then_http():
    """Retour = [Composio…] + [HTTP…], dans cet ordre, quand les deux familles
    coexistent pour le même agent."""
    bindings = [
        _binding(_AGENT_ID, _composio_tool_row(name="slack")),
        _binding(_AGENT_ID, _http_tool_row(name="Market Prices")),
    ]

    with (
        patch(
            "src.crews.crew_helpers.get_composio_tools_for_toolkits",
            return_value=["COMPOSIO_SLACK"],
        ),
        patch(
            "src.tools.http_api_call.build_http_tool_from_row",
            return_value="HTTP_TOOL",
        ),
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings)

    # Composio d'abord, HTTP ensuite.
    assert tools == ["COMPOSIO_SLACK", "HTTP_TOOL"]


def test_binding_for_other_agent_is_skipped():
    """Un binding rattaché à un AUTRE agent ne produit aucun tool."""
    bindings = [_binding("someone-else", _http_tool_row())]

    with (
        patch("src.crews.crew_helpers.get_composio_tools_for_toolkits") as m_composio,
        patch("src.tools.http_api_call.build_http_tool_from_row") as m_http,
    ):
        tools = _resolve_tools_for_agent(_AGENT_ID, bindings)

    assert tools == []
    m_composio.assert_not_called()
    m_http.assert_not_called()
