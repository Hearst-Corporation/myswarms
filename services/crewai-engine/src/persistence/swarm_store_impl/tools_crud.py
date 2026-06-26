"""Tools catalog (lecture seule) — table `tools`.

PATCHABILITÉ : `_get_client` résolu via façade.
"""
from __future__ import annotations

from typing import Any

from .. import swarm_store as _facade  # noqa: PLC0415 — façade pour patchabilité (lazy au runtime)
from ._shared import logger


def list_tools(owner_id: str | None = None) -> list[dict[str, Any]]:
    """Liste les tools actifs, filtrés optionnellement par propriétaire."""
    client = _facade._get_client()
    if client is None:
        return []
    try:
        query = (
            client.table("tools")
            .select("*")
            .eq("is_active", True)
            .order("name", desc=False)
        )
        if owner_id:
            query = query.eq("owner_id", owner_id)
        result = query.execute()
        return result.data if result else []
    except Exception as exc:  # noqa: BLE001
        logger.error("list_tools failed: %s", exc)
        return []
