"""Shared primitives du store swarm — client Supabase, retry, helpers.

Contient les fondations partagées par tous les sous-modules CRUD :
- logger module-level
- client Supabase singleton (`_get_client`) — fail-soft
- retry exponentiel des ops DB (`_retry_db_op`, H9)
- helpers (`_now_iso`, `_filter_payload`, `_assert_valid_uuid`)
- whitelists de colonnes (`_AGENT_COLUMNS`, `_TASK_COLUMNS`, `_BINDING_COLUMNS`)

PATCHABILITÉ — règle absolue : ces symboles sont ré-exportés tels quels par la
façade `swarm_store`, donc `patch.object(swarm_store, "_get_client")` /
`patch.object(swarm_store, "_RESTORE_RETRY_BACKOFF_S")` doivent rester effectifs.
Pour ça, `_retry_db_op` lit la constante de backoff via la façade
(`_facade._RESTORE_RETRY_BACKOFF_S`) au runtime — jamais via une liaison locale —
sinon le patch ne traverserait pas.
"""
from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, TypeVar
from uuid import UUID as _UUID

from ...config import settings

logger = logging.getLogger("src.persistence.swarm_store")

# H9 — restore-rollback hardening.
# Marker greppable + Sentry-capturable (CRITICAL) émis quand une restauration de
# snapshot échoue après tous les retries : signal durable d'incohérence DB
# potentielle, là où il n'y avait qu'un warning noyé dans les logs Railway.
_RESTORE_FAILURE_MARKER = "SWARM_RESTORE_FAILURE"
# Backoff exponentiel des opérations de restore (delete/insert). 3 tentatives.
_RESTORE_RETRY_BACKOFF_S = (0.5, 1.5, 4.5)

_T = TypeVar("_T")


def _retry_db_op(op: Callable[[], _T], *, what: str, swarm_id: str) -> _T:
    """Exécute `op` avec retry exponentiel (H9).

    Réessaie sur exception jusqu'à épuisement de `_RESTORE_RETRY_BACKOFF_S`.
    Relève la dernière exception si toutes les tentatives échouent — l'appelant
    décide alors d'émettre le signal d'échec durable. Un échec transitoire
    (réseau Supabase, 5xx PostgREST) ne corrompt donc plus la DB au 1er coup.

    PATCHABILITÉ : le backoff est lu via la façade (`_facade._RESTORE_RETRY_BACKOFF_S`)
    pour que `patch.object(swarm_store, "_RESTORE_RETRY_BACKOFF_S")` reste effectif
    (cf. tests/test_restore_retry.py).
    """
    from .. import swarm_store as _facade  # noqa: PLC0415 — façade pour patchabilité

    backoff = _facade._RESTORE_RETRY_BACKOFF_S
    last_exc: Exception | None = None
    for attempt, delay in enumerate((0.0, *backoff)):
        if delay:
            time.sleep(delay)
        try:
            return op()
        except Exception as exc:  # noqa: BLE001 — on retente toute erreur DB
            last_exc = exc
            logger.warning(
                "_retry_db_op: %s failed (attempt %d/%d) for swarm %s: %s",
                what, attempt + 1, len(backoff) + 1, swarm_id, exc,
            )
    assert last_exc is not None
    raise last_exc


_supabase_client = None


def _get_client():
    """Singleton Supabase client (service-role) — None si non configuré.

    Réutilise la même logique que `persistence/run_store.py` (ne partage pas
    le module-level cache pour éviter un couplage import-side).
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured — swarm operations no-op")
        return None
    try:
        from supabase import create_client  # type: ignore[import-untyped] -- supabase-py sans stubs mypy
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        return _supabase_client
    except Exception as exc:  # noqa: BLE001
        logger.warning("Supabase client init failed: %s", exc)
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Colonnes autorisées par table (whitelists pour éviter les écritures sauvages).
_AGENT_COLUMNS: set[str] = {
    "name",
    "role",
    "system_prompt",
    "model_provider",
    "model_name",
    "temperature",
    "max_tokens",
    "parent_agent_id",
    "position_x",
    "position_y",
}

_TASK_COLUMNS: set[str] = {
    "agent_id",
    "name",
    "description",
    "expected_output",
    "depends_on_task_id",
    "position_x",
    "position_y",
}

_BINDING_COLUMNS: set[str] = {
    "agent_id",
    "tool_id",
    "priority",
    "config_json",
}


def _filter_payload(payload: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
    """Filtre un payload selon une whitelist de colonnes (drop None et clés inconnues)."""
    return {k: v for k, v in payload.items() if k in allowed and v is not None}


def _assert_valid_uuid(value: str | None, field: str = "owner_id") -> None:
    """Raise ValueError if value is not None and not a valid UUID."""
    if value is None:
        return
    try:
        _UUID(value)
    except ValueError:
        raise ValueError(f"Invalid UUID for {field}: {value!r}")
