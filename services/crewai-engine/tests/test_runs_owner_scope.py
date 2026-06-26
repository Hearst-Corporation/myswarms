"""Test — R1 : scope strict des runs par owner_id (anti-IDOR cross-tenant).

Contrat de sécurité après le fix R1 :
  - get_swarm_run(run_id, owner_id) ne renvoie le run QUE si run.owner_id == owner_id.
  - Un run avec owner_id NULL (template global / run système / legacy non
    rattachable) n'est JAMAIS lisible via owner_id (plus de fallback is_template).
  - list_swarm_runs(swarm_id, owner_id) ne renvoie QUE les runs de cet owner.
  - Les steps ne sont jamais lus pour un run inaccessible (la route 404 avant).
  - Un kickoff persiste toujours owner_id sur le run.

Tous les appels Supabase sont mockés — on teste la logique de scope, pas la DB.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

VALID_OWNER = "11111111-1111-1111-1111-111111111111"
OTHER_OWNER = "22222222-2222-2222-2222-222222222222"
RUN_ID = "dddddddd-0001-0001-0001-000000000001"
SWARM_ID = "aaaaaaaa-0001-0001-0001-000000000001"
TEMPLATE_ID = "cccccccc-0001-0001-0001-000000000001"


# ── App fixture (API tests) ──────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from src.main import app  # noqa: PLC0415
    import os  # noqa: PLC0415
    token = os.environ.get("CREWAI_ENGINE_AUTH_TOKEN", "00000000000000000000000000000000")
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c


# ── Fluent Supabase mock ─────────────────────────────────────────────────────

def _client_returning(data):
    """Mock supabase client whose entire fluent chain resolves to `data`."""
    mock = MagicMock()
    for method in ("table", "select", "eq", "or_", "in_", "order", "limit", "maybe_single"):
        getattr(mock, method).return_value = mock
    res = MagicMock()
    res.data = data
    mock.execute.return_value = res
    return mock


def _eq_calls(mock) -> list[tuple]:
    return [c.args for c in mock.eq.call_args_list]


# ── Unit: get_swarm_run — scope strict par owner_id du run ───────────────────

class TestGetSwarmRunOwnerScope:
    def test_own_run_returned(self):
        from src.persistence import swarm_store  # noqa: PLC0415
        run = {"id": RUN_ID, "swarm_id": SWARM_ID, "owner_id": VALID_OWNER}
        with patch.object(swarm_store, "_get_client", return_value=_client_returning(run)):
            out = swarm_store.get_swarm_run(RUN_ID, owner_id=VALID_OWNER)
        assert out == run

    def test_cross_owner_returns_none(self):
        """Run owned by A, demandé par B → None (404 côté route)."""
        from src.persistence import swarm_store  # noqa: PLC0415
        run = {"id": RUN_ID, "swarm_id": SWARM_ID, "owner_id": VALID_OWNER}
        with patch.object(swarm_store, "_get_client", return_value=_client_returning(run)):
            out = swarm_store.get_swarm_run(RUN_ID, owner_id=OTHER_OWNER)
        assert out is None

    def test_null_owner_run_not_readable_via_template(self):
        """Run owner_id NULL sur un template global → inaccessible (plus de fallback)."""
        from src.persistence import swarm_store  # noqa: PLC0415
        run = {"id": RUN_ID, "swarm_id": TEMPLATE_ID, "owner_id": None}
        client_mock = _client_returning(run)
        with patch.object(swarm_store, "_get_client", return_value=client_mock):
            out = swarm_store.get_swarm_run(RUN_ID, owner_id=OTHER_OWNER)
        assert out is None
        # Le fix ne refait AUCUNE requête vers la table swarms (plus de JOIN template).
        table_names = [c.args[0] for c in client_mock.table.call_args_list if c.args]
        assert "swarms" not in table_names

    def test_null_owner_run_not_readable_even_by_any_owner(self):
        from src.persistence import swarm_store  # noqa: PLC0415
        run = {"id": RUN_ID, "swarm_id": SWARM_ID, "owner_id": None}
        with patch.object(swarm_store, "_get_client", return_value=_client_returning(run)):
            assert swarm_store.get_swarm_run(RUN_ID, owner_id=VALID_OWNER) is None

    def test_no_owner_filter_returns_run(self):
        """owner_id=None (appel interne de confiance) → pas de scoping."""
        from src.persistence import swarm_store  # noqa: PLC0415
        run = {"id": RUN_ID, "swarm_id": SWARM_ID, "owner_id": None}
        with patch.object(swarm_store, "_get_client", return_value=_client_returning(run)):
            out = swarm_store.get_swarm_run(RUN_ID, owner_id=None)
        assert out == run

    def test_missing_run_returns_none(self):
        from src.persistence import swarm_store  # noqa: PLC0415
        with patch.object(swarm_store, "_get_client", return_value=_client_returning(None)):
            assert swarm_store.get_swarm_run(RUN_ID, owner_id=VALID_OWNER) is None


# ── Unit: list_swarm_runs — filtre par owner_id du run ───────────────────────

class TestListSwarmRunsOwnerScope:
    def test_owner_filter_applied(self):
        from src.persistence import swarm_store  # noqa: PLC0415
        rows = [{"id": RUN_ID, "swarm_id": SWARM_ID, "owner_id": VALID_OWNER}]
        mock = _client_returning(rows)
        with patch.object(swarm_store, "_get_client", return_value=mock):
            out = swarm_store.list_swarm_runs(SWARM_ID, owner_id=VALID_OWNER)
        assert out == rows
        # Le scope owner_id est appliqué au niveau requête (pas un gate template).
        assert ("owner_id", VALID_OWNER) in _eq_calls(mock)
        assert ("swarm_id", SWARM_ID) in _eq_calls(mock)

    def test_no_owner_lists_all_no_owner_eq(self):
        """owner_id=None → liste tous les runs du swarm (appel interne), sans filtre owner."""
        from src.persistence import swarm_store  # noqa: PLC0415
        rows = [{"id": RUN_ID, "swarm_id": SWARM_ID}]
        mock = _client_returning(rows)
        with patch.object(swarm_store, "_get_client", return_value=mock):
            swarm_store.list_swarm_runs(SWARM_ID, owner_id=None)
        owner_eq = [args for args in _eq_calls(mock) if args and args[0] == "owner_id"]
        assert owner_eq == []


# ── API: routes de lecture de run scopées + steps protégés ───────────────────

class TestRunReadEndpointsOwnerScope:
    def test_cross_owner_run_returns_404_and_no_steps_read(self, client):
        """GET /v1/runs/{id} pour un run d'un autre owner → 404, steps jamais lus."""
        from src.persistence import swarm_store  # noqa: PLC0415
        with (
            patch.object(swarm_store, "get_swarm_run", return_value=None) as gsr,
            patch.object(swarm_store, "list_run_steps") as lrs,
        ):
            resp = client.get(f"/v1/runs/{RUN_ID}", params={"owner_id": OTHER_OWNER})
        assert resp.status_code == 404
        gsr.assert_called_once()
        # Steps d'un run inaccessible ne doivent jamais être lus/exposés.
        lrs.assert_not_called()
        body = resp.text
        for sensitive in ("result_text", "inputs_json", "output_text"):
            assert sensitive not in body

    def test_own_run_returns_200(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415
        run = {
            "id": RUN_ID, "swarm_id": SWARM_ID, "owner_id": VALID_OWNER,
            "trigger": "on_demand", "status": "completed", "inputs_json": {},
            "result_text": "ok", "started_at": "2026-01-01T00:00:00+00:00",
            "finished_at": "2026-01-01T00:01:00+00:00", "error_text": None,
            "total_tokens_in": 0, "total_tokens_out": 0,
            "langfuse_trace_id": None, "created_at": "2026-01-01T00:00:00+00:00",
        }
        with (
            patch.object(swarm_store, "get_swarm_run", return_value=run),
            patch.object(swarm_store, "list_run_steps", return_value=[]),
        ):
            resp = client.get(f"/v1/runs/{RUN_ID}", params={"owner_id": VALID_OWNER})
        assert resp.status_code == 200
        assert resp.json()["id"] == RUN_ID

    def test_status_endpoint_cross_owner_returns_404(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415
        with (
            patch.object(swarm_store, "get_swarm_run", return_value=None),
            patch.object(swarm_store, "list_run_steps") as lrs,
        ):
            resp = client.get(
                f"/v1/swarms/{SWARM_ID}/status/{RUN_ID}",
                params={"owner_id": OTHER_OWNER},
            )
        assert resp.status_code == 404
        lrs.assert_not_called()


# ── API: tout kickoff persiste owner_id sur le run ───────────────────────────

class TestKickoffPersistsOwnerId:
    def test_kickoff_writes_owner_id(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_routes  # noqa: PLC0415

        loaded = {
            "swarm": {
                "id": SWARM_ID, "owner_id": VALID_OWNER, "is_template": False,
                "is_active": True, "name": "S", "description": "", "version": 1,
                "config_json": {}, "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            },
            "agents": [{"id": "a", "name": "A", "role": "executor", "system_prompt": "p",
                        "model_provider": "openai", "model_name": "kimi-k2.6",
                        "temperature": 0.3, "max_tokens": 4096, "parent_agent_id": None,
                        "position_x": 0, "position_y": 0}],
            "tasks": [{"id": "t", "agent_id": "a", "name": "T", "description": "d",
                       "expected_output": "o", "depends_on_task_id": None,
                       "position_x": 0, "position_y": 0}],
            "tool_bindings": [],
        }
        mock_save = MagicMock(return_value=True)
        with (
            patch.object(swarm_store, "get_swarm", return_value=loaded),
            patch.object(swarm_store, "save_swarm_run", mock_save),
            patch.object(swarms_routes, "_execute_dynamic_flow_background", return_value=None),
        ):
            resp = client.post(
                f"/v1/swarms/{SWARM_ID}/kickoff",
                params={"owner_id": VALID_OWNER},
                json={"trigger": "on_demand", "inputs": {}},
            )
        assert resp.status_code == 202
        mock_save.assert_called_once()
        assert mock_save.call_args.kwargs.get("owner_id") == VALID_OWNER
