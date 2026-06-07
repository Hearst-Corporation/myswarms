"""Tests — R07 IDOR : scoping owner_id sur swarm_runs.

Vérifie que get_swarm_run retourne None quand le owner_id de la row
ne correspond pas au owner_id demandé, et that a matching owner_id
(ou un run legacy NULL) se comporte comme attendu.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.persistence import swarm_store

_OWNER_A = "aaaaaaaa-0000-0000-0000-000000000001"
_OWNER_B = "bbbbbbbb-0000-0000-0000-000000000002"
RUN_ID = "cccccccc-0000-0000-0000-000000000003"
SWARM_ID = "dddddddd-0000-0000-0000-000000000004"

_CHAIN = (
    "table", "select", "eq", "or_", "in_", "is_", "lt", "order", "limit",
    "maybe_single", "insert", "update", "delete",
)


def _make_client(execute_results: list) -> MagicMock:
    client = MagicMock()
    for method in _CHAIN:
        getattr(client, method).return_value = client
    client.execute.side_effect = execute_results
    return client


def _res(data) -> MagicMock:
    r = MagicMock()
    r.data = data
    return r


class TestGetSwarmRunOwnership:
    def test_returns_none_when_owner_mismatch(self):
        """R07 : un run owner_id=A n'est pas retourné à owner_id=B."""
        run_row = {
            "id": RUN_ID,
            "swarm_id": SWARM_ID,
            "owner_id": _OWNER_A,
            "status": "paused_hitl",
        }
        client = _make_client([_res(run_row)])
        with patch.object(swarm_store, "_get_client", return_value=client):
            result = swarm_store.get_swarm_run(RUN_ID, owner_id=_OWNER_B)
        assert result is None

    def test_returns_run_when_owner_matches(self):
        """R07 : un run owner_id=A est bien retourné à owner_id=A."""
        run_row = {
            "id": RUN_ID,
            "swarm_id": SWARM_ID,
            "owner_id": _OWNER_A,
            "status": "paused_hitl",
        }
        client = _make_client([_res(run_row)])
        with patch.object(swarm_store, "_get_client", return_value=client):
            result = swarm_store.get_swarm_run(RUN_ID, owner_id=_OWNER_A)
        assert result is not None
        assert result["id"] == RUN_ID

    def test_legacy_run_null_owner_falls_back_to_swarm_check(self):
        """R07 fallback : un run owner_id=NULL (legacy) passe par la vérification
        swarm parent — ici swarm check retourne data → run accessible."""
        run_row = {
            "id": RUN_ID,
            "swarm_id": SWARM_ID,
            "owner_id": None,
            "status": "paused_hitl",
        }
        swarm_check_res = _res({"id": SWARM_ID})
        client = _make_client([_res(run_row), swarm_check_res])
        with patch.object(swarm_store, "_get_client", return_value=client):
            result = swarm_store.get_swarm_run(RUN_ID, owner_id=_OWNER_A)
        assert result is not None
        assert result["id"] == RUN_ID

    def test_legacy_run_null_owner_blocked_when_swarm_mismatch(self):
        """R07 fallback : un run owner_id=NULL dont le swarm n'appartient pas
        à l'owner demandé renvoie None."""
        run_row = {
            "id": RUN_ID,
            "swarm_id": SWARM_ID,
            "owner_id": None,
            "status": "paused_hitl",
        }
        swarm_check_res = _res(None)  # swarm non trouvé pour cet owner
        client = _make_client([_res(run_row), swarm_check_res])
        with patch.object(swarm_store, "_get_client", return_value=client):
            result = swarm_store.get_swarm_run(RUN_ID, owner_id=_OWNER_B)
        assert result is None

    def test_no_owner_id_returns_run_unfiltered(self):
        """Sans owner_id, get_swarm_run retourne la row telle quelle (service-role)."""
        run_row = {
            "id": RUN_ID,
            "swarm_id": SWARM_ID,
            "owner_id": _OWNER_A,
            "status": "running",
        }
        client = _make_client([_res(run_row)])
        with patch.object(swarm_store, "_get_client", return_value=client):
            result = swarm_store.get_swarm_run(RUN_ID, owner_id=None)
        assert result is not None
        assert result["id"] == RUN_ID
