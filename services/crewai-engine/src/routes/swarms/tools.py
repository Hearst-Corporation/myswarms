"""Sous-routeur tools catalog + Composio OAuth.

Paths absolus inchangés (`/v1/tools`, `/v1/composio/connect`). Monté sans prefix
→ URLs strictement identiques.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...config import settings
from ...security.internal_auth import require_internal_identity, InternalIdentity
from ._shared import _scoped

logger = logging.getLogger("src.routes.swarms")

router_tools = APIRouter()


@router_tools.get("/v1/tools")
def list_tools_endpoint(
    identity: InternalIdentity = Depends(require_internal_identity),
) -> list[dict[str, Any]]:
    """Liste le catalogue de tools actifs (couche owner-scopée, owner du JWT)."""
    return _scoped(identity).list_tools()


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
