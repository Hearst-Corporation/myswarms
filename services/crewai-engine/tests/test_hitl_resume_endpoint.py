"""Tests — endpoint POST /v1/swarms/{id}/runs/{id}/resume (HITL).

Couvre : ownership 404, scope swarm 404, décision absente 404, idempotence
(run plus en pause / CAS perdu), borne de convergence, happy path (relance +
résolution). Tout swarm_store mocké — on teste la logique de routing.
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

VALID_OWNER = "11111111-1111-1111-1111-111111111111"
SWARM_ID = "aaaaaaaa-0001-0001-0001-000000000001"
RUN_ID = "bbbbbbbb-0001-0001-0001-000000000001"
DECISION_ID = "dec_test123"


@pytest.fixture(scope="module")
def client():
    from src.main import app  # noqa: PLC0415

    token = os.environ.get("CREWAI_ENGINE_AUTH_TOKEN", "00000000000000000000000000000000")
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c


def _run(status: str = "paused_hitl", resume_count: int = 0) -> dict:
    return {
        "id": RUN_ID,
        "swarm_id": SWARM_ID,
        "status": status,
        "trigger": "on_demand",
        "resume_count": resume_count,
        "checkpoint_index": 1,
        "inputs_json": {},
    }


def _decision() -> dict:
    return {"run_id": RUN_ID, "ordinal": 1, "decision_id": DECISION_ID, "payload": {}}


def _post(client, **params):
    return client.post(
        f"/v1/swarms/{SWARM_ID}/runs/{RUN_ID}/resume",
        params={"owner_id": VALID_OWNER, **params},
        json={"decision_id": DECISION_ID, "value": "premium"},
    )


class TestResumeOwnership:
    def test_404_when_run_not_owned(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415

        with patch.object(swarm_store, "get_swarm_run", return_value=None):
            resp = _post(client)
        assert resp.status_code == 404

    def test_404_when_swarm_scope_mismatch(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415

        run = _run()
        run["swarm_id"] = "cccccccc-0001-0001-0001-000000000099"
        with patch.object(swarm_store, "get_swarm_run", return_value=run):
            resp = _post(client)
        assert resp.status_code == 404

    def test_404_when_decision_unknown(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415

        with (
            patch.object(swarm_store, "get_swarm_run", return_value=_run()),
            patch.object(swarm_store, "get_decision_by_id", return_value=None),
        ):
            resp = _post(client)
        assert resp.status_code == 404


class TestResumeIdempotence:
    def test_noop_when_run_not_paused(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415

        with (
            patch.object(swarm_store, "get_swarm_run", return_value=_run(status="running")),
            patch.object(swarm_store, "get_decision_by_id", return_value=_decision()),
            patch("src.routes.swarms._execute_dynamic_flow_background") as exec_mock,
        ):
            resp = _post(client)
        assert resp.status_code == 202
        exec_mock.assert_not_called()  # pas de relance

    def test_noop_when_cas_lost(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415

        with (
            patch.object(swarm_store, "get_swarm_run", return_value=_run()),
            patch.object(swarm_store, "get_decision_by_id", return_value=_decision()),
            patch.object(swarm_store, "cas_pause_to_running", return_value=False),
            patch("src.routes.swarms._execute_dynamic_flow_background") as exec_mock,
        ):
            resp = _post(client)
        assert resp.status_code == 202
        exec_mock.assert_not_called()


class TestResumeConvergence:
    def test_409_when_resume_limit_reached(self, client):
        from src.config import settings  # noqa: PLC0415
        from src.persistence import swarm_store  # noqa: PLC0415

        run = _run(resume_count=settings.HITL_RESUME_MAX)
        with (
            patch.object(swarm_store, "get_swarm_run", return_value=run),
            patch.object(swarm_store, "get_decision_by_id", return_value=_decision()),
            patch.object(swarm_store, "update_swarm_run", return_value=True) as upd,
        ):
            resp = _post(client)
        assert resp.status_code == 409
        # run marqué failed
        assert upd.call_args.kwargs.get("status") == "failed"


class TestResumeHappyPath:
    def test_202_relaunches_and_resolves(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415

        loaded = {"tasks": [{"id": "t1"}, {"id": "t2"}]}
        with (
            patch.object(swarm_store, "get_swarm_run", return_value=_run()),
            patch.object(swarm_store, "get_decision_by_id", return_value=_decision()),
            patch.object(swarm_store, "cas_pause_to_running", return_value=True),
            patch.object(swarm_store, "resolve_decision", return_value=True) as resolve,
            patch.object(
                swarm_store, "apply_resume_inputs",
                return_value={"_hitl_answers": {"1": "premium"}},
            ) as apply_inputs,
            patch.object(swarm_store, "get_swarm", return_value=loaded),
            patch("src.routes.swarms._execute_dynamic_flow_background") as exec_mock,
        ):
            resp = _post(client)
        assert resp.status_code == 202
        assert resp.json()["status"] == "running"
        resolve.assert_called_once_with(RUN_ID, DECISION_ID, "premium")
        apply_inputs.assert_called_once_with(RUN_ID, 1, "premium")
        exec_mock.assert_called_once()
        # checkpoint_index propagé pour reprendre à la bonne task
        assert exec_mock.call_args.kwargs.get("checkpoint_index") == 1
