"""Test — P0.4 : pagination du snapshot rollback + abort fail-closed.

Contrat (anti-corruption silencieuse) :
  - `_snapshot_rows` pagine par chunks de PAGE=1000 via `.range()` et agrège
    TOUS les chunks — un swarm de >1000 rows n'est plus tronqué silencieusement.
  - `_snapshot_rows` retourne None si la lecture lève (pas de snapshot partiel).
  - `_snapshot_swarm_tree` retourne None si UNE des 3 tables échoue.
  - `replace_agents`/`replace_tasks`/`replace_tool_bindings` abortent SANS
    supprimer de rows (aucun `.delete()`) si le snapshot est None.

Le client Supabase est simulé par un fake fluent paginé — on teste la logique
de pagination/abort, pas la vraie DB.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

SWARM_ID = "aaaaaaaa-0001-0001-0001-000000000001"


class _PaginatedChain:
    """Fake fluent Supabase chain that serves `total_rows` rows in PAGE-sized
    windows according to the `.range(start, end)` calls it receives.

    Records each (start, end) range so the test can assert the pagination
    boundaries and the number of round-trips.
    """

    def __init__(self, total_rows: int):
        self._rows = [{"id": f"row-{i}", "swarm_id": SWARM_ID} for i in range(total_rows)]
        self._range: tuple[int, int] | None = None
        self.range_calls: list[tuple[int, int]] = []

    # Fluent no-ops that return self.
    def table(self, *_a, **_k):
        return self

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._range = (start, end)
        self.range_calls.append((start, end))
        return self

    def execute(self):
        start, end = self._range
        res = MagicMock()
        # PostgREST .range is inclusive on both ends.
        res.data = self._rows[start : end + 1]
        return res


def test_snapshot_paginates_2500_rows():
    """2500 rows → 3 round-trips (1000 + 1000 + 500), all aggregated."""
    from src.persistence import swarm_store  # noqa: PLC0415

    chain = _PaginatedChain(total_rows=2500)
    with patch.object(swarm_store, "_get_client", return_value=chain):
        rows = swarm_store._snapshot_rows("swarm_agents", SWARM_ID)

    assert rows is not None
    assert len(rows) == 2500
    # 3 pages : [0,999], [1000,1999], [2000,2999] (last short → stop).
    assert chain.range_calls == [(0, 999), (1000, 1999), (2000, 2999)]


def test_snapshot_exactly_1000_rows_does_a_second_probe():
    """Exactly 1000 rows: first chunk is full → a second page is fetched and
    comes back empty → stop. No truncation, no infinite loop."""
    from src.persistence import swarm_store  # noqa: PLC0415

    chain = _PaginatedChain(total_rows=1000)
    with patch.object(swarm_store, "_get_client", return_value=chain):
        rows = swarm_store._snapshot_rows("swarm_tasks", SWARM_ID)

    assert rows is not None
    assert len(rows) == 1000
    assert chain.range_calls == [(0, 999), (1000, 1999)]


def test_snapshot_small_table_single_page():
    """A <1000 row table is fetched in a single round-trip."""
    from src.persistence import swarm_store  # noqa: PLC0415

    chain = _PaginatedChain(total_rows=50)
    with patch.object(swarm_store, "_get_client", return_value=chain):
        rows = swarm_store._snapshot_rows("swarm_tool_bindings", SWARM_ID)

    assert rows is not None and len(rows) == 50
    assert chain.range_calls == [(0, 999)]


def test_snapshot_returns_none_on_exception():
    """A read exception → None (no partial snapshot)."""
    from src.persistence import swarm_store  # noqa: PLC0415

    broken = MagicMock()
    for m in ("table", "select", "eq", "range"):
        getattr(broken, m).return_value = broken
    broken.execute.side_effect = RuntimeError("boom")

    with patch.object(swarm_store, "_get_client", return_value=broken):
        rows = swarm_store._snapshot_rows("swarm_agents", SWARM_ID)

    assert rows is None


def test_snapshot_tree_returns_none_if_one_table_fails():
    """If a single of the 3 table snapshots is None, the whole tree is None."""
    from src.persistence import swarm_store  # noqa: PLC0415

    def fake_snapshot(table, swarm_id):
        # tasks read fails (None), agents/bindings OK.
        return None if table == "swarm_tasks" else []

    with patch.object(swarm_store, "_snapshot_rows", side_effect=fake_snapshot):
        tree = swarm_store._snapshot_swarm_tree(SWARM_ID)

    assert tree is None


def test_replace_agents_aborts_without_delete_when_snapshot_none():
    """replace_agents must NOT delete rows when the snapshot is None."""
    from src.persistence import swarm_store  # noqa: PLC0415

    client = MagicMock()
    for m in ("table", "select", "eq", "delete", "insert", "range"):
        getattr(client, m).return_value = client
    client.execute.return_value = MagicMock(data=[])

    with patch.object(swarm_store, "_get_client", return_value=client), \
         patch.object(swarm_store, "_snapshot_swarm_tree", return_value=None):
        result = swarm_store.replace_agents(SWARM_ID, [{"name": "a"}])

    assert result is None
    # No destructive delete should have been issued.
    assert client.delete.call_count == 0


def test_replace_tasks_aborts_without_delete_when_snapshot_none():
    from src.persistence import swarm_store  # noqa: PLC0415

    client = MagicMock()
    for m in ("table", "select", "eq", "delete", "insert", "range"):
        getattr(client, m).return_value = client
    client.execute.return_value = MagicMock(data=[])

    with patch.object(swarm_store, "_get_client", return_value=client), \
         patch.object(swarm_store, "_snapshot_rows", return_value=None):
        result = swarm_store.replace_tasks(SWARM_ID, [{"name": "t"}])

    assert result is None
    assert client.delete.call_count == 0


def test_replace_tool_bindings_aborts_without_delete_when_snapshot_none():
    from src.persistence import swarm_store  # noqa: PLC0415

    client = MagicMock()
    for m in ("table", "select", "eq", "delete", "insert", "range"):
        getattr(client, m).return_value = client
    client.execute.return_value = MagicMock(data=[])

    with patch.object(swarm_store, "_get_client", return_value=client), \
         patch.object(swarm_store, "_snapshot_rows", return_value=None):
        result = swarm_store.replace_tool_bindings(SWARM_ID, [{"tool_id": "x"}])

    assert result is False
    assert client.delete.call_count == 0
