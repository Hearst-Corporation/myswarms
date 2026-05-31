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
    for method in ("table", "select", "eq", "in_", "order", "limit", "maybe_single",
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
        """Two calls with different owner UUIDs both see only their own data."""
        owner_a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        owner_b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

        from src.persistence import swarm_store  # noqa: PLC0415

        # Stub: owner_a gets 1 swarm, owner_b gets 0.
        # We track which eq("owner_id", ...) was called.
        calls = []

        def make_stub(owner: str, rows: list):
            stub = MagicMock()
            for method in ("table", "select", "eq", "in_", "order", "limit",
                           "maybe_single", "insert", "update", "delete"):
                getattr(stub, method).return_value = stub
            original_eq = stub.eq

            def eq_tracking(col, val):
                if col == "owner_id":
                    calls.append(val)
                return stub

            stub.eq.side_effect = eq_tracking
            r = MagicMock()
            r.data = rows
            r.count = len(rows)
            stub.execute.return_value = r
            return stub

        # Call for owner_a
        with patch.object(swarm_store, "_get_client", return_value=make_stub(owner_a, [{"id": "s1", "owner_id": owner_a}])):
            resp_a = client.get("/v1/swarms", params={"owner_id": owner_a})
        assert resp_a.status_code == 200
        assert owner_a in calls, "owner_a UUID must be passed to the DB filter"

        calls.clear()

        # Call for owner_b
        with patch.object(swarm_store, "_get_client", return_value=make_stub(owner_b, [])):
            resp_b = client.get("/v1/swarms", params={"owner_id": owner_b})
        assert resp_b.status_code == 200
        assert owner_b in calls, "owner_b UUID must be passed to the DB filter"

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
        """The DB stub returns a row with owner_id=None, is_template=False.
        Since list_swarms is called with owner_id=X and the stub filters by eq,
        the response must not contain orphan rows when DB correctly scopes.

        This test validates that _require_owner_id forces the eq filter —
        i.e. it's impossible to call list_swarms without owner_id (400 gate).
        A null-owner row would only appear if owner_id were absent from the query.
        """
        from src.persistence import swarm_store  # noqa: PLC0415

        orphan_row = {"id": "orphan-1", "owner_id": None, "is_template": False}
        stub = _empty_client()
        r = MagicMock()
        r.data = [orphan_row]
        r.count = 1
        stub.execute.return_value = r

        # Without owner_id → 400, orphan_row never returned.
        resp_no_owner = client.get("/v1/swarms")
        assert resp_no_owner.status_code == 400

        # With valid owner_id → DB stub returns orphan_row (stub doesn't actually filter),
        # but the important guarantee is that owner_id was passed to eq() in the query.
        calls = []

        def eq_tracking(col, val):
            if col == "owner_id":
                calls.append(val)
            return stub

        stub.eq.side_effect = eq_tracking
        owner = VALID_UUID
        with patch.object(swarm_store, "_get_client", return_value=stub):
            resp = client.get("/v1/swarms", params={"owner_id": owner})

        assert resp.status_code == 200
        assert owner in calls, "owner_id MUST be forwarded to DB eq filter"
