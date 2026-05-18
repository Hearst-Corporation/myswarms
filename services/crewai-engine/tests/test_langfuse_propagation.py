"""Test 5 — Propagation langfuse_trace_id.

Tests that when a swarm run is persisted, the langfuse_trace_id field is
correctly passed through to the store layer.

Scoped to the two persistence functions that handle langfuse_trace_id:
  - swarm_store.save_swarm_run() — initial run creation (no trace_id at kickoff)
  - swarm_store.update_swarm_run(run_id, langfuse_trace_id=...) — set by the flow

The flow itself (DynamicSwarmFlow / hooks) would set langfuse_trace_id via
update_swarm_run. We test:
  1. update_swarm_run correctly propagates langfuse_trace_id into the DB payload.
  2. update_swarm_run does NOT include langfuse_trace_id if it is None (no key leak).
  3. save_swarm_run does not include langfuse_trace_id in the initial insert row.

All Supabase calls are mocked — no real DB, no Langfuse SDK.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch



# ── Helpers ───────────────────────────────────────────────────────────────────


def _build_tracking_stub():
    """Build a Supabase stub that records calls to table().update().eq().execute().

    Returns (stub, captured_payloads) where captured_payloads is a list that will
    be populated with each dict passed to .update().
    """
    captured: list[dict] = []

    result = MagicMock()
    result.data = [{"id": "run-id-1"}]

    chain = MagicMock()
    for method in ("table", "select", "eq", "in_", "order", "limit", "maybe_single",
                   "insert", "delete"):
        getattr(chain, method).return_value = chain

    def fake_update(payload: dict):
        captured.append(payload)
        return chain

    chain.update.side_effect = fake_update
    chain.execute.return_value = result
    return chain, captured


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestLangfuseTraceIdPropagation:
    """langfuse_trace_id must be persisted correctly by update_swarm_run."""

    def test_update_swarm_run_includes_langfuse_trace_id_when_provided(self):
        """When langfuse_trace_id is passed, it must appear in the DB update payload."""
        from src.persistence import swarm_store  # noqa: PLC0415

        stub, captured = _build_tracking_stub()
        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.update_swarm_run(
                "run-id-1",
                status="completed",
                langfuse_trace_id="trace-abc-123",
            )

        assert result is True
        assert len(captured) == 1, "One .update() call expected"
        payload = captured[0]
        assert payload.get("langfuse_trace_id") == "trace-abc-123", (
            "langfuse_trace_id must be forwarded to the DB payload"
        )
        assert payload.get("status") == "completed"

    def test_update_swarm_run_omits_langfuse_trace_id_when_none(self):
        """When langfuse_trace_id is None (default), it must NOT appear in the payload.

        The update_swarm_run implementation strips None values to avoid
        overwriting a previously set trace_id with NULL.
        """
        from src.persistence import swarm_store  # noqa: PLC0415

        stub, captured = _build_tracking_stub()
        with patch.object(swarm_store, "_get_client", return_value=stub):
            swarm_store.update_swarm_run(
                "run-id-1",
                status="failed",
                error_text="Something went wrong",
                # langfuse_trace_id intentionally omitted (defaults to None)
            )

        assert len(captured) == 1
        payload = captured[0]
        assert "langfuse_trace_id" not in payload, (
            "langfuse_trace_id=None must not be forwarded (would overwrite existing value)"
        )

    def test_save_swarm_run_does_not_include_langfuse_trace_id(self):
        """Initial run creation (save_swarm_run) must not include langfuse_trace_id.

        The trace_id is not available at kickoff time — it is set asynchronously
        once the Langfuse trace is initialised inside the flow.
        """
        from src.persistence import swarm_store  # noqa: PLC0415

        inserted_rows: list[dict] = []
        result = MagicMock()
        result.data = [{"id": "run-id-2"}]

        chain = MagicMock()
        for method in ("table", "select", "eq", "order", "limit", "maybe_single",
                       "update", "delete"):
            getattr(chain, method).return_value = chain

        def fake_insert(payload: dict):
            inserted_rows.append(payload)
            return chain

        chain.insert.side_effect = fake_insert
        chain.execute.return_value = result

        with patch.object(swarm_store, "_get_client", return_value=chain):
            swarm_store.save_swarm_run(
                run_id="run-id-2",
                swarm_id="swarm-id-1",
                trigger="on_demand",
                status="running",
            )

        assert len(inserted_rows) == 1
        row = inserted_rows[0]
        assert "langfuse_trace_id" not in row, (
            "langfuse_trace_id must not be present in the initial insert row"
        )
        assert row["id"] == "run-id-2"
        assert row["status"] == "running"

    def test_update_swarm_run_with_explicit_trace_id_and_result(self):
        """Simulate flow finalisation: both result_text and langfuse_trace_id set."""
        from src.persistence import swarm_store  # noqa: PLC0415

        stub, captured = _build_tracking_stub()
        with patch.object(swarm_store, "_get_client", return_value=stub):
            swarm_store.update_swarm_run(
                "run-id-3",
                status="completed",
                result_text="Daily brief generated.",
                langfuse_trace_id="trace-xyz-456",
                finished_at="2026-05-18T08:05:00+00:00",
            )

        assert len(captured) == 1
        payload = captured[0]
        assert payload["langfuse_trace_id"] == "trace-xyz-456"
        assert payload["status"] == "completed"
        assert payload["result_text"] == "Daily brief generated."
        assert payload["finished_at"] == "2026-05-18T08:05:00+00:00"
