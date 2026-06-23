"""Tests — R1 IDOR : scoping STRICT owner_id sur swarm_runs.

Vérifie que get_swarm_run retourne None quand le owner_id de la row ne
correspond pas au owner_id demandé, et qu'un run legacy à owner_id NULL est
désormais INACCESSIBLE (plus de fallback via le swarm parent / is_template).
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

    def test_legacy_run_null_owner_is_inaccessible(self):
        """R1 : un run owner_id=NULL (legacy/template/système) n'est JAMAIS lisible
        via owner scope — plus de fallback swarm parent / is_template."""
        run_row = {
            "id": RUN_ID,
            "swarm_id": SWARM_ID,
            "owner_id": None,
            "status": "paused_hitl",
        }
        client = _make_client([_res(run_row)])
        with patch.object(swarm_store, "_get_client", return_value=client):
            result = swarm_store.get_swarm_run(RUN_ID, owner_id=_OWNER_A)
        assert result is None
        # Plus aucune requête secondaire vers la table swarms (fallback supprimé).
        table_names = [c.args[0] for c in client.table.call_args_list if c.args]
        assert "swarms" not in table_names

    def test_legacy_run_null_owner_blocked_for_other_owner(self):
        """R1 : un run owner_id=NULL reste inaccessible quel que soit l'owner demandé."""
        run_row = {
            "id": RUN_ID,
            "swarm_id": SWARM_ID,
            "owner_id": None,
            "status": "paused_hitl",
        }
        client = _make_client([_res(run_row)])
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
