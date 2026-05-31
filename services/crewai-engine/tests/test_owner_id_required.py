"""Test — owner_id enforcement on all sensitive endpoints.

Security contract:
  - owner_id absent → 400
  - owner_id invalid (not a UUID) → 400
  - owner_id valid UUID, no data → 200 / [] (scoped, no cross-tenant leak)

Uses FastAPI TestClient with the real app (bearer token from conftest env var).
Supabase calls are mocked via monkeypatching swarm_store / run_store _get_client.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── App fixture ──────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def client():
    from src.main import app  # noqa: PLC0415
    import os
    token = os.environ.get("CREWAI_ENGINE_AUTH_TOKEN", "00000000000000000000000000000000")
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c


# ── Stub helpers ─────────────────────────────────────────────────────────────


def _empty_client():
    """Supabase stub that returns empty data for all queries."""
    stub = MagicMock()
    for method in ("table", "select", "eq", "or_", "in_", "order", "limit", "maybe_single",
                   "insert", "update", "delete"):
        getattr(stub, method).return_value = stub
    r = MagicMock()
    r.data = []
    r.count = 0
    stub.execute.return_value = r
    return stub


# ── Parametrised: endpoints that MUST enforce owner_id ───────────────────────

OWNER_REQUIRED_GET = [
    "/v1/swarms",
    "/v1/swarms/some-id",
    "/v1/swarms/some-id/runs",
    "/v1/tools",
    "/v1/crews/chief-of-staff/runs",
]

VALID_UUID = "11111111-1111-1111-1111-111111111111"
INVALID_UUID = "not-a-uuid"


class TestOwnerIdRequired:
    """All sensitive GET endpoints must return 400 when owner_id is missing."""

    @pytest.mark.parametrize("path", OWNER_REQUIRED_GET)
    def test_missing_owner_id_returns_400(self, client, path):
        resp = client.get(path)
        assert resp.status_code == 400, (
            f"Expected 400 for {path} without owner_id, got {resp.status_code}: {resp.text}"
        )
        assert "owner_id" in resp.json().get("detail", "").lower()

    @pytest.mark.parametrize("path", OWNER_REQUIRED_GET)
    def test_invalid_uuid_owner_id_returns_400(self, client, path):
        resp = client.get(path, params={"owner_id": INVALID_UUID})
        assert resp.status_code == 400, (
            f"Expected 400 for {path} with invalid UUID, got {resp.status_code}: {resp.text}"
        )
        assert "uuid" in resp.json().get("detail", "").lower()


class TestOwnerIdValidUuid:
    """Valid UUID owner_id returns 200/empty (no cross-tenant leak)."""

    def test_list_swarms_valid_owner_returns_200(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415
        stub = _empty_client()
        with patch.object(swarm_store, "_get_client", return_value=stub):
            resp = client.get("/v1/swarms", params={"owner_id": VALID_UUID})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_runs_valid_owner_returns_200(self, client):
        from src.persistence import run_store  # noqa: PLC0415
        stub = _empty_client()
        with patch.object(run_store, "_get_client", return_value=stub):
            resp = client.get("/v1/crews/chief-of-staff/runs", params={"owner_id": VALID_UUID})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_tools_valid_owner_returns_200(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415
        stub = _empty_client()
        with patch.object(swarm_store, "_get_client", return_value=stub):
            resp = client.get("/v1/tools", params={"owner_id": VALID_UUID})
        assert resp.status_code == 200
        assert resp.json() == []


class TestPostOwnerIdRequired:
    """POST endpoints must enforce owner_id too."""

    def test_kickoff_without_owner_id_returns_400(self, client):
        resp = client.post(
            "/v1/crews/chief-of-staff/kickoff",
            json={"trigger": "on_demand"},
        )
        assert resp.status_code == 400
        assert "owner_id" in resp.json().get("detail", "").lower()

    def test_kickoff_invalid_uuid_returns_400(self, client):
        resp = client.post(
            "/v1/crews/chief-of-staff/kickoff",
            json={"trigger": "on_demand"},
            params={"owner_id": "bad-uuid"},
        )
        assert resp.status_code == 400
        assert "uuid" in resp.json().get("detail", "").lower()

    def test_create_swarm_without_owner_id_returns_400(self, client):
        resp = client.post(
            "/v1/swarms",
            json={"name": "test swarm"},
        )
        assert resp.status_code == 400
        assert "owner_id" in resp.json().get("detail", "").lower()

    def test_create_swarm_owner_in_body_invalid_uuid_returns_400(self, client):
        resp = client.post(
            "/v1/swarms",
            json={"name": "test swarm", "owner_id": "not-a-uuid"},
        )
        assert resp.status_code == 400
        assert "uuid" in resp.json().get("detail", "").lower()


class TestCrossTenantIsolation:
    """owner_id=A cannot see data belonging to owner_id=B."""

    def test_list_swarms_different_owners_return_separate_results(self, client):
        """Two calls with different owner UUIDs trigger separate or_() filters.

        list_swarms now uses .or_("owner_id.eq.X,and(owner_id.is.null,is_template.eq.true)")
        instead of .eq("owner_id", X) — we verify or_() is called with the correct owner UUID.
        """
        owner_a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        owner_b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

        from src.persistence import swarm_store  # noqa: PLC0415

        # Stub: tracks or_() calls (new filter pattern after template visibility fix).
        or_calls = []

        def make_stub(rows: list):
            stub = MagicMock()
            for method in ("table", "select", "eq", "in_", "order", "limit",
                           "maybe_single", "insert", "update", "delete"):
                getattr(stub, method).return_value = stub

            def or_tracking(filter_str):
                or_calls.append(filter_str)
                return stub

            stub.or_.side_effect = or_tracking
            r = MagicMock()
            r.data = rows
            r.count = len(rows)
            stub.execute.return_value = r
            return stub

        # Call for owner_a
        with patch.object(swarm_store, "_get_client", return_value=make_stub([{"id": "s1", "owner_id": owner_a}])):
            resp_a = client.get("/v1/swarms", params={"owner_id": owner_a})
        assert resp_a.status_code == 200
        assert any(owner_a in c for c in or_calls), f"owner_a UUID must appear in or_() filter, got: {or_calls}"

        or_calls.clear()

        # Call for owner_b
        with patch.object(swarm_store, "_get_client", return_value=make_stub([])):
            resp_b = client.get("/v1/swarms", params={"owner_id": owner_b})
        assert resp_b.status_code == 200
        assert any(owner_b in c for c in or_calls), f"owner_b UUID must appear in or_() filter, got: {or_calls}"

    def test_list_runs_scoped_to_owner(self, client):
        """list_runs always passes owner_id to the DB — never returns all rows."""
        owner = "cccccccc-cccc-cccc-cccc-cccccccccccc"

        from src.persistence import run_store  # noqa: PLC0415

        calls = []
        stub = _empty_client()
        original_eq = stub.eq

        def eq_tracking(col, val):
            if col == "owner_id":
                calls.append(val)
            return stub

        stub.eq.side_effect = eq_tracking

        with patch.object(run_store, "_get_client", return_value=stub):
            resp = client.get("/v1/crews/chief-of-staff/runs", params={"owner_id": owner})

        assert resp.status_code == 200
        assert owner in calls, "owner UUID must be forwarded to DB filter in list_runs"


class TestNonTemplateNullOwnerNotExposed:
    """Swarms with owner_id=NULL and is_template=False must not appear in list results."""

    def test_null_owner_non_template_excluded_from_list(self, client):
        """Without owner_id → 400 (gate). With owner_id → or_() filter applied.

        The or_() filter pattern is:
          owner_id.eq.{X},and(owner_id.is.null,is_template.eq.true)
        A non-template row with owner_id=NULL would NOT match this filter in real DB.
        Here we verify that or_() is called (not a raw eq bypass) — the DB enforces the rest.
        """
        from src.persistence import swarm_store  # noqa: PLC0415

        # Without owner_id → 400, orphan_row never returned.
        resp_no_owner = client.get("/v1/swarms")
        assert resp_no_owner.status_code == 400

        # With valid owner_id → or_() must be called with owner UUID in the filter string.
        stub = _empty_client()
        or_calls = []

        def or_tracking(filter_str):
            or_calls.append(filter_str)
            return stub

        stub.or_.side_effect = or_tracking
        r = MagicMock()
        r.data = []
        stub.execute.return_value = r

        owner = VALID_UUID
        with patch.object(swarm_store, "_get_client", return_value=stub):
            resp = client.get("/v1/swarms", params={"owner_id": owner})

        assert resp.status_code == 200
        assert any(owner in c for c in or_calls), f"owner UUID must appear in or_() filter, got: {or_calls}"
        # Verify the filter also restricts templates (is_template.eq.true required)
        assert any("is_template" in c for c in or_calls), "Template filter must be part of or_() clause"
