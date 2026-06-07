"""Tests — helpers HITL de swarm_store (Supabase mocké).

Couvre : pause idempotente, CAS paused→running, résolution idempotente,
merge des _hitl_answers + bump resume_count, expiration TTL.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.persistence import swarm_store

_CHAIN = (
    "table", "select", "eq", "or_", "in_", "is_", "lt", "order", "limit",
    "maybe_single", "insert", "update", "delete",
)


def _make_client(execute_results: list) -> MagicMock:
    """Mock client Supabase : toutes les méthodes chaînent, execute() suit le script."""
    client = MagicMock()
    for method in _CHAIN:
        getattr(client, method).return_value = client
    client.execute.side_effect = execute_results
    return client


def _res(data) -> MagicMock:
    r = MagicMock()
    r.data = data
    return r


class TestPauseRunWithDecision:
    def test_inserts_new_decision_and_marks_paused(self):
        # select existing → None ; insert → ok ; update swarm_runs → ok
        client = _make_client([_res(None), _res([{"x": 1}]), _res([{"id": "run-1"}])])
        with patch.object(swarm_store, "_get_client", return_value=client):
            decision_id = swarm_store.pause_run_with_decision(
                "run-1", 0, {"question": "Q", "options": [{"value": "a", "label": "A"}]}
            )
        assert decision_id.startswith("dec_")
        # 3 appels execute : select, insert, update
        assert client.execute.call_count == 3

    def test_reuses_existing_decision_id_idempotent(self):
        # select existing → row avec decision_id ; pas d'insert ; update
        client = _make_client([_res({"decision_id": "dec_existing"}), _res([{"id": "run-1"}])])
        with patch.object(swarm_store, "_get_client", return_value=client):
            decision_id = swarm_store.pause_run_with_decision("run-1", 0, {"question": "Q"})
        assert decision_id == "dec_existing"
        # 2 appels execute seulement (select + update), pas d'insert
        assert client.execute.call_count == 2

    def test_returns_decision_id_even_when_no_client(self):
        with patch.object(swarm_store, "_get_client", return_value=None):
            decision_id = swarm_store.pause_run_with_decision("run-1", 0, {"question": "Q"})
        assert decision_id.startswith("dec_")


class TestCasPauseToRunning:
    def test_won_when_row_updated(self):
        client = _make_client([_res([{"id": "run-1"}])])
        with patch.object(swarm_store, "_get_client", return_value=client):
            assert swarm_store.cas_pause_to_running("run-1") is True

    def test_lost_when_no_row(self):
        client = _make_client([_res([])])
        with patch.object(swarm_store, "_get_client", return_value=client):
            assert swarm_store.cas_pause_to_running("run-1") is False


class TestResolveDecision:
    def test_resolves_when_unresolved(self):
        client = _make_client([_res([{"decision_id": "dec_1"}])])
        with patch.object(swarm_store, "_get_client", return_value=client):
            assert swarm_store.resolve_decision("run-1", "dec_1", "premium") is True

    def test_noop_when_already_resolved(self):
        client = _make_client([_res([])])  # 0 rows → already resolved
        with patch.object(swarm_store, "_get_client", return_value=client):
            assert swarm_store.resolve_decision("run-1", "dec_1", "premium") is False


class TestApplyResumeInputs:
    def test_merges_hitl_answers_and_bumps_resume_count(self):
        existing = _res({"inputs_json": {"_hitl_answers": {"0": "x"}}, "resume_count": 1})
        client = _make_client([existing, _res([{"id": "run-1"}])])
        with patch.object(swarm_store, "_get_client", return_value=client):
            merged = swarm_store.apply_resume_inputs("run-1", 2, "premium")
        assert merged["_hitl_answers"] == {"0": "x", "2": "premium"}
        # update appelé avec resume_count incrémenté
        update_call = client.update.call_args[0][0]
        assert update_call["resume_count"] == 2

    def test_fallback_when_no_client(self):
        with patch.object(swarm_store, "_get_client", return_value=None):
            merged = swarm_store.apply_resume_inputs("run-1", 1, "v")
        assert merged == {"_hitl_answers": {"1": "v"}}


class TestExpireStalePaused:
    def test_counts_expired_rows(self):
        client = _make_client([_res([{"id": "a"}, {"id": "b"}])])
        with patch.object(swarm_store, "_get_client", return_value=client):
            assert swarm_store.expire_stale_paused_runs(60) == 2
