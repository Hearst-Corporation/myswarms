"""Tools catalog — table `tools` (lecture + création owner-scopée).

PATCHABILITÉ : `_get_client` résolu via façade.
"""
from __future__ import annotations

from typing import Any

from .. import swarm_store as _facade  # noqa: PLC0415 — façade pour patchabilité (lazy au runtime)
from ._shared import _now_iso, logger

# Catégories autorisées (enum DB public.tool_category, cf migration 0006).
_TOOL_CATEGORIES: frozenset[str] = frozenset(
    {"api_call", "file_io", "code_execution", "search", "database", "custom"}
)


def list_tools(owner_id: str | None = None) -> list[dict[str, Any]]:
    """Liste les tools actifs, filtrés optionnellement par propriétaire.

    Si `owner_id` est fourni : retourne les tools de l'owner ET les tools globaux
    (owner_id IS NULL) — ces derniers sont partagés et visibles par tous les
    users authentifiés (miroir de la policy `tools_global_read`, migration 0022).
    Si `owner_id is None` (service-role interne) : tous les tools actifs.
    """
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
            # Tools de l'owner OU tools globaux (owner_id NULL) — miroir de la
            # policy RLS `tools_global_read` (0022). Sans le `owner_id.is.null`,
            # les tools partagés (AutoScout24…) seraient invisibles côté API.
            query = query.or_(f"owner_id.eq.{owner_id},owner_id.is.null")
        result = query.execute()
        return result.data if result else []
    except Exception as exc:  # noqa: BLE001
        logger.error("list_tools failed: %s", exc)
        return []


def create_tool(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Insère un tool owner-scopé. Renvoie la ligne créée (dict) ou None si échec.

    Le payload accepte les colonnes natives de la table `tools` :
    `owner_id`, `name`, `category`, `description`, `endpoint_url`, `auth_type`,
    `schema_json`, `is_active`. `created_at` / `updated_at` sont posés ici si
    absents. Fail-soft : Supabase indisponible ou INSERT en échec → None (jamais
    d'exception remontée), cohérent avec `create_swarm`.

    NB : l'owner_id est celui du payload — la couche `ScopedSwarmStore.create_tool`
    le FORCE au scope du JWT avant d'appeler cette fonction (un caller ne peut pas
    créer un tool pour un autre owner). Un INSERT avec owner_id NULL (tool global)
    n'est PAS exposé par l'API user : les tools globaux passent par migration DB.
    """
    client = _facade._get_client()
    if client is None:
        return None
    try:
        now = _now_iso()
        row: dict[str, Any] = {
            "name": payload.get("name") or "Untitled tool",
            "category": payload.get("category") or "custom",
            "description": payload.get("description"),
            "endpoint_url": payload.get("endpoint_url"),
            "auth_type": payload.get("auth_type"),
            "schema_json": payload.get("schema_json") or {},
            "is_active": payload.get("is_active", True),
            "created_at": payload.get("created_at", now),
            "updated_at": payload.get("updated_at", now),
        }
        if payload.get("owner_id"):
            row["owner_id"] = payload["owner_id"]
        if payload.get("id"):
            row["id"] = payload["id"]

        result = client.table("tools").insert(row).execute()
        if not result or not result.data:
            return None
        return result.data[0]
    except Exception as exc:  # noqa: BLE001
        logger.error("create_tool failed: %s", exc)
        return None
