"""Test — H9 : durcissement du rollback snapshot (retry + signal d'échec durable).

Contrat :
  - `_retry_db_op` réessaie une op DB qui échoue puis réussit (résilience aux
    erreurs transitoires : réseau / 5xx PostgREST) — la DB n'est plus corrompue
    au premier échec.
  - `_retry_db_op` relève la dernière exception si TOUTES les tentatives échouent.
  - `_restore_swarm_tree` / `_restore_snapshot` émettent un log CRITICAL marqué
    `SWARM_RESTORE_FAILURE` (capté par Sentry) quand le restore échoue malgré les
    retries — signal durable, plus un simple warning noyé.

Backoff patché à 0 pour ne pas ralentir les tests. Supabase mocké.
"""
from __future__ import annotations

import logging
from unittest.mock import MagicMock, patch

import pytest

SWARM_ID = "aaaaaaaa-0001-0001-0001-000000000001"


@pytest.fixture(autouse=True)
def _no_backoff():
    """Neutralise le sleep pour des tests rapides (retry logique inchangée)."""
    from src.persistence import swarm_store  # noqa: PLC0415

    with patch.object(swarm_store, "_RESTORE_RETRY_BACKOFF_S", (0.0, 0.0, 0.0)):
        yield


# ── _retry_db_op ─────────────────────────────────────────────────────────────


class TestRetryDbOp:
    def test_succeeds_first_try(self):
        from src.persistence import swarm_store  # noqa: PLC0415

        op = MagicMock(return_value="ok")
        assert swarm_store._retry_db_op(op, what="t", swarm_id=SWARM_ID) == "ok"
        assert op.call_count == 1

    def test_succeeds_after_transient_failures(self):
        from src.persistence import swarm_store  # noqa: PLC0415

        op = MagicMock(side_effect=[RuntimeError("net"), RuntimeError("5xx"), "ok"])
        assert swarm_store._retry_db_op(op, what="t", swarm_id=SWARM_ID) == "ok"
        assert op.call_count == 3

    def test_raises_after_all_retries_exhausted(self):
        from src.persistence import swarm_store  # noqa: PLC0415

        op = MagicMock(side_effect=RuntimeError("always down"))
        with pytest.raises(RuntimeError, match="always down"):
            swarm_store._retry_db_op(op, what="t", swarm_id=SWARM_ID)
        # 1 initial + 3 backoff attempts.
        assert op.call_count == len(swarm_store._RESTORE_RETRY_BACKOFF_S) + 1


# ── _restore_swarm_tree ──────────────────────────────────────────────────────


def _snapshot():
    return {
        "agents": [{"id": "a1", "swarm_id": SWARM_ID}],
        "tasks": [{"id": "t1", "swarm_id": SWARM_ID}],
        "bindings": [{"id": "b1", "swarm_id": SWARM_ID}],
    }


class TestRestoreSwarmTree:
    def test_success_returns_true(self):
        from src.persistence import swarm_store  # noqa: PLC0415

        client = MagicMock()
        for m in ("table", "delete", "eq", "insert"):
            getattr(client, m).return_value = client
        client.execute.return_value = MagicMock(data=[])

        with patch.object(swarm_store, "_get_client", return_value=client):
            assert swarm_store._restore_swarm_tree(SWARM_ID, _snapshot()) is True

    def test_failure_emits_critical_marker(self, caplog):
        from src.persistence import swarm_store  # noqa: PLC0415

        client = MagicMock()
        for m in ("table", "delete", "eq", "insert"):
            getattr(client, m).return_value = client
        client.execute.side_effect = RuntimeError("db down")

        with patch.object(swarm_store, "_get_client", return_value=client), \
             caplog.at_level(logging.CRITICAL):
            ok = swarm_store._restore_swarm_tree(SWARM_ID, _snapshot())

        assert ok is False
        assert any(
            swarm_store._RESTORE_FAILURE_MARKER in r.message and r.levelno == logging.CRITICAL
            for r in caplog.records
        )


# ── _restore_snapshot ────────────────────────────────────────────────────────


class TestRestoreSnapshot:
    def test_success_returns_true(self):
        from src.persistence import swarm_store  # noqa: PLC0415

        client = MagicMock()
        for m in ("table", "delete", "eq", "insert"):
            getattr(client, m).return_value = client
        client.execute.return_value = MagicMock(data=[])

        with patch.object(swarm_store, "_get_client", return_value=client):
            ok = swarm_store._restore_snapshot("swarm_tasks", SWARM_ID, [{"id": "t1"}])
        assert ok is True

    def test_failure_emits_critical_marker(self, caplog):
        from src.persistence import swarm_store  # noqa: PLC0415

        client = MagicMock()
        for m in ("table", "delete", "eq", "insert"):
            getattr(client, m).return_value = client
        client.execute.side_effect = RuntimeError("db down")

        with patch.object(swarm_store, "_get_client", return_value=client), \
             caplog.at_level(logging.CRITICAL):
            ok = swarm_store._restore_snapshot("swarm_tasks", SWARM_ID, [{"id": "t1"}])

        assert ok is False
        assert any(
            swarm_store._RESTORE_FAILURE_MARKER in r.message and r.levelno == logging.CRITICAL
            for r in caplog.records
        )
