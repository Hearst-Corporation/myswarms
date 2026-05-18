"""Test 4 — Timeout / cancel flow.

Tests that _execute_dynamic_flow_background() correctly handles:
  - asyncio.TimeoutError → run status becomes "failed" with timeout error_text
  - asyncio.CancelledError → run status becomes "cancelled"
  - Generic exception → run status becomes "failed" with exc message
  - Success → update_swarm_run is NOT called

All Supabase calls (swarm_store.update_swarm_run) and the DynamicSwarmFlow
are mocked — we test the CONTROL FLOW logic, not real LLM execution.

Note: the target function lives in src.routes.swarms and uses asyncio.wait_for
with settings.FLOW_TIMEOUT_SECONDS. We bypass that timeout value by directly
raising the exception we want to test.

RuntimeWarning fix:
    ``asyncio.wait_for(asyncio.to_thread(...), ...)`` evaluates
    ``asyncio.to_thread(flow.kickoff, ...)`` *before* calling ``wait_for``.
    If only ``wait_for`` is mocked, the coroutine returned by ``to_thread``
    is created but never awaited → ``RuntimeWarning: coroutine never awaited``.
    Solution: mock *both* ``asyncio.to_thread`` (in the swarms module) AND
    ``asyncio.wait_for`` so that no real coroutine is ever produced.
    ``to_thread`` is replaced by a dummy coroutine factory; ``wait_for`` is
    replaced by the desired side-effect.  This way the argument passed to the
    mocked ``wait_for`` is a sentinel value, not a live coroutine object.
"""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _run_background(swarm_id: str, run_id: str, trigger: str, inputs: dict):
    """Import and invoke the background function under test."""
    from src.routes.swarms import _execute_dynamic_flow_background  # noqa: PLC0415
    await _execute_dynamic_flow_background(
        swarm_id=swarm_id,
        run_id=run_id,
        trigger=trigger,
        inputs=inputs,
    )


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestExecuteDynamicFlowBackground:
    """_execute_dynamic_flow_background handles timeout/cancel/exception correctly."""

    async def test_timeout_sets_run_status_to_failed(self):
        """When asyncio.wait_for raises TimeoutError, the run is marked failed.

        Both asyncio.to_thread and asyncio.wait_for are mocked so that no
        real coroutine is created unawaitedly (avoids RuntimeWarning).
        """
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_module  # noqa: PLC0415

        update_mock = MagicMock(return_value=True)

        with (
            patch.object(swarms_module.asyncio, "to_thread", new=lambda *a, **kw: object()),
            patch.object(swarms_module.asyncio, "wait_for", side_effect=asyncio.TimeoutError),
            patch.object(swarm_store, "update_swarm_run", update_mock),
        ):
            await _run_background("swarm-1", "run-1", "on_demand", {})

        # update_swarm_run must have been called with status="failed"
        assert update_mock.called, "update_swarm_run should be called on timeout"
        call_kwargs = update_mock.call_args
        assert call_kwargs.args[0] == "run-1"  # run_id positional arg
        assert call_kwargs.kwargs.get("status") == "failed"
        assert "timeout" in (call_kwargs.kwargs.get("error_text") or "").lower()

    async def test_cancelled_error_sets_run_status_to_cancelled(self):
        """When asyncio.CancelledError is raised (SIGTERM), run → 'cancelled'."""
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_module  # noqa: PLC0415

        update_mock = MagicMock(return_value=True)

        # CancelledError is re-raised after updating the store — catch it.
        with (
            patch.object(swarms_module.asyncio, "to_thread", new=lambda *a, **kw: object()),
            patch.object(swarms_module.asyncio, "wait_for", side_effect=asyncio.CancelledError),
            patch.object(swarm_store, "update_swarm_run", update_mock),
            pytest.raises(asyncio.CancelledError),
        ):
            await _run_background("swarm-1", "run-2", "morning", {})

        assert update_mock.called
        call_kwargs = update_mock.call_args
        assert call_kwargs.args[0] == "run-2"
        assert call_kwargs.kwargs.get("status") == "cancelled"

    async def test_generic_exception_sets_run_status_to_failed(self):
        """When an unexpected exception occurs, run → 'failed' with error_text."""
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_module  # noqa: PLC0415

        update_mock = MagicMock(return_value=True)
        boom = RuntimeError("Something exploded")

        with (
            patch.object(swarms_module.asyncio, "to_thread", new=lambda *a, **kw: object()),
            patch.object(swarms_module.asyncio, "wait_for", side_effect=boom),
            patch.object(swarm_store, "update_swarm_run", update_mock),
        ):
            await _run_background("swarm-1", "run-3", "evening", {})

        assert update_mock.called
        call_kwargs = update_mock.call_args
        assert call_kwargs.args[0] == "run-3"
        assert call_kwargs.kwargs.get("status") == "failed"
        assert "exploded" in (call_kwargs.kwargs.get("error_text") or "")

    async def test_success_does_not_call_update_swarm_run(self):
        """On success, the flow's finalize() handles persistence — no explicit update_swarm_run call."""
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_module  # noqa: PLC0415

        update_mock = MagicMock(return_value=True)

        async def _noop(*args, **kwargs):
            """Simulates a successful wait_for — returns immediately."""
            return None

        with (
            patch.object(swarms_module.asyncio, "to_thread", new=lambda *a, **kw: object()),
            patch.object(swarms_module.asyncio, "wait_for", new=_noop),
            patch.object(swarm_store, "update_swarm_run", update_mock),
        ):
            await _run_background("swarm-1", "run-4", "on_demand", {})

        # Success path: update_swarm_run is NOT called by _execute_dynamic_flow_background.
        # (finalize() in the flow handles it — but we mocked the entire wait_for.)
        assert not update_mock.called, (
            "update_swarm_run should NOT be called on success "
            "(finalize() in the flow handles it)"
        )
