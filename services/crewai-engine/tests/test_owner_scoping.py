"""Test 2 — Owner scoping logic.

Tests that the owner_id filter in swarm_store functions correctly prevents
cross-owner data access. The actual Supabase client is mocked throughout —
we test the LOGIC of filtering/scoping, not real DB calls.

The key scoping logic lives in:
  - swarm_store.get_swarm(swarm_id, owner_id=...) → None if mismatch
  - swarm_store.get_swarm_run(run_id, owner_id=...) → None if mismatch
  - swarm_store.list_swarm_runs(swarm_id, owner_id=...) → [] if mismatch

Strategy:
  Mock _get_client() to return a fake Supabase client whose table/select/eq
  chain returns controlled data. This is a "stub chain" pattern: each chained
  method returns a new stub so we can control the final .execute() result.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

# Valid UUIDs used as owner_id fixtures (swarm_store now validates UUID format).
_OWNER_A = "aaaaaaaa-0000-4000-8000-000000000001"
_OWNER_B = "bbbbbbbb-0000-4000-8000-000000000002"



# ── Stub builder ─────────────────────────────────────────────────────────────


def _chain(side_effect=None, data=None):
    """Build a minimal fluent Supabase chain stub."""
    chain = MagicMock()
    for method in (
        "table", "select", "eq", "in_", "or_", "order", "limit", "maybe_single",
        "insert", "update", "delete",
    ):
        getattr(chain, method).return_value = chain
    if side_effect is not None:
        chain.execute.side_effect = side_effect
    else:
        r = MagicMock()
        r.data = data
        chain.execute.return_value = r
    return chain


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestGetSwarmOwnerScoping:
    """get_swarm() must return None when owner_id does not match the row."""

    def test_returns_none_when_owner_mismatch(self):
        """A swarm belonging to owner_A is invisible to owner_B.

        The Supabase query chains .eq("owner_id", owner_B) on the swarms table.
        If no row is found (data=None), get_swarm returns None.
        """
        from src.persistence import swarm_store  # noqa: PLC0415

        stub = _chain(data=None)
        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.get_swarm("swarm-id-1", owner_id=_OWNER_B)
        assert result is None, "Should return None for wrong owner"

    def test_returns_swarm_when_owner_matches(self):
        """A swarm belonging to owner_A is visible to owner_A.

        get_swarm now uses .or_() to include the owner's swarms AND global templates.
        The stub must support or_() in the chain (returns self like other methods).
        """
        from src.persistence import swarm_store  # noqa: PLC0415

        swarm_row = {"id": "swarm-id-1", "owner_id": _OWNER_A, "name": "My swarm"}

        result_swarm = MagicMock()
        result_swarm.data = swarm_row
        result_empty = MagicMock()
        result_empty.data = []

        # get_swarm makes: 1 swarm query (with or_ filter) + 3 sub-queries (agents/tasks/bindings).
        stub = _chain(side_effect=[result_swarm, result_empty, result_empty, result_empty])
        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.get_swarm("swarm-id-1", owner_id=_OWNER_A)

        assert result is not None, "Should find swarm for correct owner"
        assert result["swarm"] == swarm_row
        # Verify or_() was called (new filter pattern: owner OR global template)
        stub.or_.assert_called_once()


class TestGetSwarmRunOwnerScoping:
    """get_swarm_run() with owner_id scopes via swarms.owner_id secondary check."""

    def test_returns_none_when_run_found_but_swarm_owner_mismatches(self):
        """Run belongs to swarm owned by owner_A → invisible to owner_B."""
        from src.persistence import swarm_store  # noqa: PLC0415

        result_run = MagicMock()
        result_run.data = {"id": "run-1", "swarm_id": "swarm-1"}

        # Owner check: no swarm found for owner_B.
        result_no_swarm = MagicMock()
        result_no_swarm.data = None

        stub = _chain(side_effect=[result_run, result_no_swarm])
        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.get_swarm_run("run-1", owner_id=_OWNER_B)

        assert result is None, "Run should be invisible when owner mismatches"

    def test_returns_run_when_owner_matches(self):
        """Run belongs to swarm owned by owner_A → visible to owner_A."""
        from src.persistence import swarm_store  # noqa: PLC0415

        run_row = {"id": "run-1", "swarm_id": "swarm-1", "status": "completed"}

        result_run = MagicMock()
        result_run.data = run_row

        # Owner check succeeds for owner_A.
        result_owner_ok = MagicMock()
        result_owner_ok.data = {"id": "swarm-1"}

        stub = _chain(side_effect=[result_run, result_owner_ok])
        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.get_swarm_run("run-1", owner_id=_OWNER_A)

        assert result is not None
        assert result["id"] == "run-1"


class TestListSwarmRunsOwnerScoping:
    """list_swarm_runs() with owner_id returns [] when swarm belongs to different owner."""

    def test_returns_empty_list_when_owner_mismatches(self):
        """Runs of swarm owned by owner_A are invisible to owner_B."""
        from src.persistence import swarm_store  # noqa: PLC0415

        # Owner check query: no swarm matches (wrong owner).
        result_owner_check = MagicMock()
        result_owner_check.data = None

        stub = _chain(data=None)
        stub.execute.return_value = result_owner_check
        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.list_swarm_runs("swarm-1", owner_id=_OWNER_B)

        assert result == [], "Should return empty list for wrong owner"

    def test_no_owner_filter_returns_all_runs(self):
        """Without owner_id, list_swarm_runs skips the owner check."""
        from src.persistence import swarm_store  # noqa: PLC0415

        runs = [
            {"id": "run-1", "swarm_id": "s1", "status": "completed", "total_cost_usd": "1.5"},
            {"id": "run-2", "swarm_id": "s1", "status": "running", "total_cost_usd": None},
        ]
        result_runs = MagicMock()
        result_runs.data = runs

        stub = _chain(data=runs)
        stub.execute.return_value = result_runs
        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.list_swarm_runs("swarm-1")  # no owner_id

        assert len(result) == 2
        # float cast applied by list_swarm_runs
        assert result[0]["total_cost_usd"] == 1.5
        assert result[1]["total_cost_usd"] == 0.0
