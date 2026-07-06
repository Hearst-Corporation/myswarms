"""Sous-routeur tools catalog + Composio OAuth.

Paths absolus inchangés (`/v1/tools`, `/v1/composio/connect`). Monté sans prefix
→ URLs strictement identiques.
"""
from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ...config import settings
from ...security.internal_auth import require_internal_identity, InternalIdentity
from ._shared import _scoped

logger = logging.getLogger("src.routes.swarms")

router_tools = APIRouter()


class ToolCreate(BaseModel):
    """Body d'un POST /v1/tools (création d'un tool owner-scopé).

    `category` est bornée à l'enum DB `tool_category` (migration 0006).
    `owner_id` optionnel : s'il est présent il DOIT matcher le JWT (anti-spoofing,
    cohérent avec `create_swarm_endpoint`) — l'owner effectif est TOUJOURS forcé
    au scope du JWT côté couche owner-scopée.

    NB : `schema_json` (nom imposé par la colonne DB + la shape client TS) émet un
    UserWarning Pydantic v2 (shadow du classmethod déprécié `BaseModel.schema_json`).
    Bénin — le champ fonctionne normalement ; on garde le nom du contrat.
    """

    name: str = Field(..., min_length=1, max_length=200)
    category: Literal[
        "api_call", "file_io", "code_execution", "search", "database", "custom"
    ]
    description: str | None = None
    endpoint_url: str | None = None
    auth_type: str | None = None
    schema_json: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    owner_id: str | None = None


def _shape_tool_response(row: dict[str, Any]) -> dict[str, Any]:
    """Mappe une row DB `tools` vers la shape client TS.

    Champs : id/owner_id/name/category/description/endpoint_url/auth_type/
    schema_json/is_active/created_at/updated_at.
    """
    return {
        "id": str(row.get("id", "")),
        "owner_id": row.get("owner_id"),
        "name": row.get("name", ""),
        "category": row.get("category"),
        "description": row.get("description"),
        "endpoint_url": row.get("endpoint_url"),
        "auth_type": row.get("auth_type"),
        "schema_json": row.get("schema_json") or {},
        "is_active": bool(row.get("is_active", True)),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


@router_tools.get("/v1/tools")
def list_tools_endpoint(
    identity: InternalIdentity = Depends(require_internal_identity),
) -> list[dict[str, Any]]:
    """Liste le catalogue de tools actifs (couche owner-scopée, owner du JWT).

    Inclut les tools de l'owner ET les tools globaux (owner_id NULL, partagés).
    """
    return _scoped(identity).list_tools()


@router_tools.post("/v1/tools", status_code=201)
def create_tool_endpoint(
    payload: ToolCreate,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Crée un tool owner-scopé et renvoie la ligne créée (201).

    L'owner_id est dérivé du JWT interne vérifié et FORCÉ (cohérent avec
    `create_swarm_endpoint`). Si le body porte un `owner_id`, il DOIT correspondre
    à l'identité JWT (sinon 403) — un caller ne peut jamais créer un tool pour un
    autre owner ni un tool global (owner NULL).
    """
    body_owner_id = payload.owner_id
    if body_owner_id and body_owner_id != identity.owner_id:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Cannot create tool for owner {body_owner_id} "
                f"with token for {identity.owner_id}"
            ),
        )

    tool_payload = payload.model_dump(exclude={"owner_id"})
    created = _scoped(identity).create_tool(tool_payload)
    if not created:
        raise HTTPException(
            status_code=500,
            detail="Failed to create tool (Supabase unavailable or insert failed)",
        )
    return _shape_tool_response(created)


# ── Composio OAuth ───────────────────────────────────────────────────────────


class ComposioConnectRequest(BaseModel):
    toolkit: str  # "gmail" | "trello" | "slack" | "notion" | "googlecalendar"
    auth_config_id: str | None = None  # optionnel — si fourni, utilisé directement


def _build_toolkit_auth_configs() -> dict[str, str]:
    """Build toolkit→auth_config_id mapping from environment variables.

    Set COMPOSIO_GMAIL_AUTH_CONFIG_ID and COMPOSIO_TRELLO_AUTH_CONFIG_ID in .env
    or Railway environment. Absent variables are omitted from the map so the
    caller raises a 400 with a clear message rather than using a hardcoded value.
    """
    import os

    cfg: dict[str, str] = {}
    gmail_id = os.environ.get("COMPOSIO_GMAIL_AUTH_CONFIG_ID", "")
    if not gmail_id:
        raise ValueError(
            "COMPOSIO_GMAIL_AUTH_CONFIG_ID env var is required. "
            "Set it in .env or your deployment environment."
        )
    trello_id = os.environ.get("COMPOSIO_TRELLO_AUTH_CONFIG_ID", "")
    if not trello_id:
        raise ValueError(
            "COMPOSIO_TRELLO_AUTH_CONFIG_ID env var is required. "
            "Set it in .env or your deployment environment."
        )
    cfg["gmail"] = gmail_id
    cfg["trello"] = trello_id
    return cfg


def _get_toolkit_auth_configs() -> dict[str, str]:
    """Lazily resolve toolkit auth configs from env (not at import time)."""
    return _build_toolkit_auth_configs()


_TOOLKIT_AUTH_CONFIGS: dict[str, str] | None = None  # resolved lazily via _get_toolkit_auth_configs()


@router_tools.post("/v1/composio/connect")
def composio_connect_endpoint(
    request: ComposioConnectRequest,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict:
    """Initie une connexion OAuth Composio pour un toolkit donné.

    Retourne {"redirect_url": "..."} que le front peut ouvrir dans un nouvel onglet.
    Owner dérivé du JWT interne vérifié → user_id Composio (isolation multi-tenant).
    """
    oid = identity.owner_id

    if not settings.COMPOSIO_API_KEY:
        raise HTTPException(status_code=503, detail="Composio not configured")

    try:
        _toolkit_configs = _get_toolkit_auth_configs()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    auth_config_id = request.auth_config_id or _toolkit_configs.get(request.toolkit)
    if not auth_config_id:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown toolkit '{request.toolkit}' — provide auth_config_id explicitly",
        )

    try:
        from composio import Composio  # type: ignore[import-untyped]

        c = Composio(api_key=settings.COMPOSIO_API_KEY)
        initiate_kwargs: dict = {
            "user_id": oid,
            "auth_config_id": auth_config_id,
        }
        if settings.COMPOSIO_CALLBACK_URL:
            initiate_kwargs["callback_url"] = settings.COMPOSIO_CALLBACK_URL
        result = c.connected_accounts.initiate(**initiate_kwargs)
        redirect_url = getattr(result, "redirect_url", None) or getattr(result, "redirectUrl", None)
        if not redirect_url:
            raise HTTPException(status_code=502, detail="Composio did not return a redirect_url")
        return {"redirect_url": redirect_url, "toolkit": request.toolkit}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Composio error: {exc}") from exc
