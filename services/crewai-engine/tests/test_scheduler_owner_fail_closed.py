"""Test — P0.2 fail-closed : le scheduler market-intel ne doit JAMAIS écrire un
run ownerless.

Contrat de sécurité (anti pollution cross-tenant + run invisible de l'UI) :
  - owner_id résolu depuis swarms.owner_id        → save_swarm_run(owner_id=...).
  - owner_id résolu depuis config_json.owner_id   → save_swarm_run(owner_id=...).
  - owner_id None / "" / whitespace               → SKIP contrôlé, save_swarm_run
                                                     JAMAIS appelé, warning émis.
  - aucun owner hardcodé (pas de CHIEF_SCHEDULER_OWNER_ID, pas d'UUID Adrien).

Tous les appels Supabase + le flow sont mockés — on teste la LOGIQUE de garde,
pas une vraie exécution de swarm. `_run_market_intel_scout` est `async`, donc on
le pilote via `asyncio.run`.
"""
from __future__ import annotations

import asyncio
import logging
from unittest.mock import MagicMock, patch

import pytest

VALID_OWNER = "11111111-1111-1111-1111-111111111111"
SWARM_ID = "aaaaaaaa-0001-0001-0001-000000000001"
RUN_FROM_CONFIG_OWNER = "33333333-3333-3333-3333-333333333333"


def _supabase_returning_swarm(swarm_row: dict):
    """Mock supabase client whose swarm lookup resolves to `swarm_row`."""
    mock = MagicMock()
    for method in ("table", "select", "eq", "limit", "order"):
        getattr(mock, method).return_value = mock
    res = MagicMock()
    res.data = [swarm_row]
    mock.execute.return_value = res
    return mock


def _run(swarm_row: dict):
    """Drive _run_market_intel_scout with a stubbed swarm row + mocked deps.

    Returns the swarm_store mock so the caller can assert on save_swarm_run.
    Patches the flow kickoff path so no real LLM/network call happens.
    """
    from src import scheduler  # noqa: PLC0415
    from src.persistence import swarm_store  # noqa: PLC0415

    supabase = _supabase_returning_swarm(swarm_row)

    # swarm_store mock : its _get_client returns our fake supabase; save_swarm_run
    # and the rest are spies. get_active_run_for_swarm → None (no dup → proceed).
    save_spy = MagicMock(return_value=True)
    with patch.object(swarm_store, "_get_client", return_value=supabase), \
         patch.object(swarm_store, "save_swarm_run", save_spy), \
         patch.object(swarm_store, "get_active_run_for_swarm", return_value=None), \
         patch.object(swarm_store, "get_swarm", return_value={"tasks": []}), \
         patch.object(swarm_store, "update_swarm_run", MagicMock(return_value=True)), \
         patch.object(scheduler, "_send_telegram_digest", MagicMock()), \
         patch("src.routes.swarms._adaptive_flow_timeout", return_value=1), \
         patch("src.flows.dynamic_swarm_flow.DynamicSwarmFlow") as flow_cls:
        # Flow.kickoff is a no-op — we only care about whether save_swarm_run ran.
        flow_cls.return_value.kickoff = MagicMock(return_value="ok")
        asyncio.run(scheduler._run_market_intel_scout())

    return save_spy


# ── Owner present → run IS written, scoped to that owner ─────────────────────


class TestOwnerPresentWritesScopedRun:
    def test_owner_from_swarm_row(self):
        save_spy = _run({
            "id": SWARM_ID, "name": "Market Intelligence Scout",
            "is_active": True, "owner_id": VALID_OWNER, "config_json": {},
        })
        assert save_spy.called, "save_swarm_run should run when owner is present"
        assert save_spy.call_args.kwargs["owner_id"] == VALID_OWNER

    def test_owner_from_config_json(self):
        save_spy = _run({
            "id": SWARM_ID, "name": "Market Intelligence Scout",
            "is_active": True, "owner_id": None,
            "config_json": {"owner_id": RUN_FROM_CONFIG_OWNER},
        })
        assert save_spy.called
        assert save_spy.call_args.kwargs["owner_id"] == RUN_FROM_CONFIG_OWNER

    def test_owner_whitespace_is_stripped(self):
        save_spy = _run({
            "id": SWARM_ID, "name": "Market Intelligence Scout",
            "is_active": True, "owner_id": f"  {VALID_OWNER}  ", "config_json": {},
        })
        assert save_spy.called
        assert save_spy.call_args.kwargs["owner_id"] == VALID_OWNER


# ── Owner missing → fail-closed : NO write, warning emitted ──────────────────


class TestOwnerMissingFailsClosed:
    def test_owner_none_skips_write(self):
        save_spy = _run({
            "id": SWARM_ID, "name": "Market Intelligence Scout",
            "is_active": True, "owner_id": None, "config_json": {},
        })
        assert not save_spy.called, "ownerless run must NOT be written"

    def test_owner_empty_string_skips_write(self):
        save_spy = _run({
            "id": SWARM_ID, "name": "Market Intelligence Scout",
            "is_active": True, "owner_id": "", "config_json": {"owner_id": ""},
        })
        assert not save_spy.called

    def test_owner_whitespace_only_skips_write(self):
        save_spy = _run({
            "id": SWARM_ID, "name": "Market Intelligence Scout",
            "is_active": True, "owner_id": "   ", "config_json": {},
        })
        assert not save_spy.called

    def test_warning_emitted_on_missing_owner(self, caplog):
        with caplog.at_level(logging.WARNING):
            save_spy = _run({
                "id": SWARM_ID, "name": "Market Intelligence Scout",
                "is_active": True, "owner_id": None, "config_json": {},
            })
        assert not save_spy.called
        assert any(
            "no resolvable owner_id" in r.message or "ownerless" in r.message
            for r in caplog.records
        ), "a warning explaining the skip must be logged"


# ── No hardcoded owner fallback ──────────────────────────────────────────────


class TestNoHardcodedOwnerFallback:
    def test_source_has_no_adrien_uuid_or_scheduler_fallback(self):
        """The market-intel path must not fall back to a global/hardcoded owner."""
        import inspect  # noqa: PLC0415

        from src import scheduler  # noqa: PLC0415

        src = inspect.getsource(scheduler._run_market_intel_scout)
        # Strip comment lines — a comment may legitimately *mention*
        # CHIEF_SCHEDULER_OWNER_ID to explain why it is NOT used as a fallback.
        code_lines = [
            ln for ln in src.splitlines() if not ln.lstrip().startswith("#")
        ]
        code = "\n".join(code_lines)
        # No real reference to the scheduler-owner setting in executable code
        # (owner comes from the swarm row only).
        assert "settings.CHIEF_SCHEDULER_OWNER_ID" not in code
        assert "CHIEF_SCHEDULER_OWNER_ID" not in code
        # No hardcoded UUID literal as an owner fallback.
        assert "ac_2imZgR" not in code


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-q"])
