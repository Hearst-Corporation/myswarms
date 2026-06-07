"""Tests — DynamicSwarmFlow run_crew/finalize face au HITL.

Vérifie : pause (HumanDecisionRequired) → run_crew n'échoue pas, finalize ne
marque PAS completed ; complétion normale → finalize marque completed avec
tokens ; reprise → run_swarm_tasks reçoit le bon start_index (checkpoint_index).
run_swarm_tasks est mocké (aucun crew/LLM réel).
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.flows.dynamic_swarm_flow import DynamicSwarmFlow
from src.tools.ask_human import HumanDecisionRequired

SWARM_ID = "aaaaaaaa-0001-0001-0001-000000000001"
RUN_ID = "bbbbbbbb-0001-0001-0001-000000000001"


def _kickoff(flow: DynamicSwarmFlow, **state) -> None:
    flow.kickoff(inputs={"swarm_id": SWARM_ID, "run_id": RUN_ID, **state})


class TestFlowPause:
    def test_pause_does_not_mark_completed(self):
        flow = DynamicSwarmFlow()
        upd = MagicMock(return_value=True)
        with (
            patch(
                "src.flows.dynamic_swarm_flow.run_swarm_tasks",
                side_effect=HumanDecisionRequired(1, "dec_x"),
            ),
            patch("src.flows.dynamic_swarm_flow.flush_run_steps", return_value=None),
            patch("src.flows.dynamic_swarm_flow.swarm_store.update_swarm_run", upd),
        ):
            _kickoff(flow)
        assert flow.state.paused is True
        # finalize ne doit JAMAIS écrire status=completed sur une pause
        for call in upd.call_args_list:
            assert call.kwargs.get("status") != "completed"


class TestFlowComplete:
    def test_complete_marks_completed_with_tokens(self):
        flow = DynamicSwarmFlow()
        upd = MagicMock(return_value=True)
        with (
            patch(
                "src.flows.dynamic_swarm_flow.run_swarm_tasks",
                return_value={"result": "RAPPORT FINAL", "tokens_in": 12, "tokens_out": 7},
            ),
            patch("src.flows.dynamic_swarm_flow.flush_run_steps", return_value=None),
            patch("src.flows.dynamic_swarm_flow.swarm_store.update_swarm_run", upd),
        ):
            _kickoff(flow)
        assert flow.state.paused is False
        upd.assert_called_once()
        kwargs = upd.call_args.kwargs
        assert kwargs["status"] == "completed"
        assert kwargs["result_text"] == "RAPPORT FINAL"
        assert kwargs["total_tokens_in"] == 12
        assert kwargs["total_tokens_out"] == 7


class TestFlowResume:
    def test_resume_passes_checkpoint_index_as_start(self):
        flow = DynamicSwarmFlow()
        runner = MagicMock(return_value={"result": "done", "tokens_in": None, "tokens_out": None})
        with (
            patch("src.flows.dynamic_swarm_flow.run_swarm_tasks", runner),
            patch("src.flows.dynamic_swarm_flow.flush_run_steps", return_value=None),
            patch("src.flows.dynamic_swarm_flow.swarm_store.update_swarm_run", return_value=True),
        ):
            _kickoff(flow, checkpoint_index=2, inputs={"_hitl_answers": {"1": "premium"}})
        assert runner.call_args.kwargs["start_index"] == 2
