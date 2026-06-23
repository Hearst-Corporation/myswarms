"""Test — Global template write protection.

Security contract:
  Global templates (owner_id IS NULL, is_template=True) are read/run-only:
    - GET  /v1/swarms/{id}           → 200  (read allowed)
    - POST /v1/swarms/{id}/kickoff   → 202  (run allowed, owner-scoped)
    - PATCH /v1/swarms/{id}          → 403  (write forbidden)
    - DELETE /v1/swarms/{id}         → 403  (delete forbidden)

  User-owned swarms remain fully editable by their owner:
    - PATCH  by correct owner        → 200/OK
    - PATCH  by wrong owner          → 404  (scoped — not visible)

All Supabase calls are mocked — we test routing logic, not real DB.
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

VALID_OWNER = "11111111-1111-1111-1111-111111111111"
OTHER_OWNER = "22222222-2222-2222-2222-222222222222"
TEMPLATE_ID = "cccccccc-0001-0001-0001-000000000001"
USER_SWARM_ID = "aaaaaaaa-0001-0001-0001-000000000001"


def _make_global_template_loaded() -> dict:
    """Simulates swarm_store.get_swarm() for a global template."""
    return {
        "swarm": {
            "id": TEMPLATE_ID,
            "owner_id": None,       # NULL — global template
            "is_template": True,
            "is_active": True,
            "name": "APM — Vehicle Research",
            "description": "Test template",
            "version": 1,
            "config_json": {},
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        },
        "agents": [
            {"id": "aaa", "name": "Agent 1", "role": "executor",
             "system_prompt": "p", "model_provider": "openai", "model_name": "kimi-k2.6",
             "temperature": 0.3, "max_tokens": 4096, "parent_agent_id": None,
             "position_x": 0, "position_y": 0},
        ],
        "tasks": [
            {"id": "ttt", "agent_id": "aaa", "name": "Task 1", "description": "d",
             "expected_output": "o", "depends_on_task_id": None,
             "position_x": 0, "position_y": 0},
        ],
        "tool_bindings": [],
    }


def _make_user_swarm_loaded(owner_id: str) -> dict:
    """Simulates swarm_store.get_swarm() for a user-owned swarm."""
    return {
        "swarm": {
            "id": USER_SWARM_ID,
            "owner_id": owner_id,
            "is_template": False,
            "is_active": True,
            "name": "My User Swarm",
            "description": "",
            "version": 1,
            "config_json": {},
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        },
        "agents": [
            {"id": "bbb", "name": "Agent 2", "role": "executor",
             "system_prompt": "p", "model_provider": "openai", "model_name": "kimi-k2.6",
             "temperature": 0.3, "max_tokens": 4096, "parent_agent_id": None,
             "position_x": 0, "position_y": 0},
        ],
        "tasks": [
            {"id": "uuu", "agent_id": "bbb", "name": "Task 2", "description": "d",
             "expected_output": "o", "depends_on_task_id": None,
             "position_x": 0, "position_y": 0},
        ],
        "tool_bindings": [],
    }


# ── Tests: Global template — reads/runs allowed ───────────────────────────────

class TestGlobalTemplateReadAllowed:
    """GET and kickoff must remain accessible for global templates."""

    def test_get_template_returns_200(self, client):
        """GET /v1/swarms/{template_id} with any owner_id → 200."""
        from src.persistence import swarm_store  # noqa: PLC0415
        loaded = _make_global_template_loaded()
        with patch.object(swarm_store, "get_swarm", return_value=loaded):
            resp = client.get(
                f"/v1/swarms/{TEMPLATE_ID}",
                params={"owner_id": VALID_OWNER},
            )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json()["is_template"] is True

    def test_list_includes_templates(self, client):
        """GET /v1/swarms returns templates alongside owned swarms."""
        from src.persistence import swarm_store  # noqa: PLC0415
        stub_rows = [
            {"id": TEMPLATE_ID, "owner_id": None, "is_template": True,
             "name": "APM Template", "description": "", "version": 1,
             "is_active": True, "created_at": "2026-01-01", "updated_at": "2026-01-01"},
        ]
        mock_client = MagicMock()
        for method in ("table", "select", "eq", "or_", "in_", "order", "limit",
                       "maybe_single", "insert", "update", "delete"):
            getattr(mock_client, method).return_value = mock_client
        r = MagicMock(); r.data = stub_rows; r.count = 1
        mock_client.execute.return_value = r
        with patch.object(swarm_store, "_get_client", return_value=mock_client):
            resp = client.get("/v1/swarms", params={"owner_id": VALID_OWNER})
        assert resp.status_code == 200


class TestGlobalTemplateKickoffAllowed:
    """POST /v1/swarms/{template_id}/kickoff must remain allowed."""

    def test_kickoff_template_returns_202(self, client):
        """Kickoff a global template → 202, run_id returned, no write to swarm row."""
        from src.persistence import swarm_store  # noqa: PLC0415
        loaded = _make_global_template_loaded()

        mock_save = MagicMock(return_value=True)
        with (
            patch.object(swarm_store, "get_swarm", return_value=loaded),
            patch.object(swarm_store, "save_swarm_run", mock_save),
            # Prevent actual asyncio flow from running
            patch(
                "src.routes.swarms._execute_dynamic_flow_background",
                return_value=None,
            ),
        ):
            resp = client.post(
                f"/v1/swarms/{TEMPLATE_ID}/kickoff",
                params={"owner_id": VALID_OWNER},
                json={"trigger": "on_demand", "inputs": {"make": "BMW", "model": "330d"}},
            )

        assert resp.status_code == 202, f"Expected 202, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "run_id" in data
        assert data["swarm_id"] == TEMPLATE_ID
        # save_swarm_run called → run is persisted (owner-scoped at DB level via swarm_id)
        mock_save.assert_called_once()


# ── Tests: Global template — writes forbidden ─────────────────────────────────

class TestGlobalTemplateWriteForbidden:
    """PATCH and DELETE on global templates must return 403."""

    def test_patch_global_template_returns_403(self, client):
        """PATCH /v1/swarms/{template_id} → 403 Forbidden."""
        from src.persistence import swarm_store  # noqa: PLC0415
        loaded = _make_global_template_loaded()
        with patch.object(swarm_store, "get_swarm", return_value=loaded):
            resp = client.patch(
                f"/v1/swarms/{TEMPLATE_ID}",
                params={"owner_id": VALID_OWNER},
                json={"name": "Hacked template"},
            )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        assert "global template" in resp.json()["detail"].lower()

    def test_delete_global_template_returns_403(self, client):
        """DELETE /v1/swarms/{template_id} → 403 Forbidden."""
        from src.persistence import swarm_store  # noqa: PLC0415
        loaded = _make_global_template_loaded()
        with patch.object(swarm_store, "get_swarm", return_value=loaded):
            resp = client.delete(
                f"/v1/swarms/{TEMPLATE_ID}",
                params={"owner_id": VALID_OWNER},
            )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        assert "global template" in resp.json()["detail"].lower()

    def test_patch_missing_identity_returns_401(self, client):
        """PATCH sans identité (ni JWT ni query legacy) → 401."""
        resp = client.patch(
            f"/v1/swarms/{TEMPLATE_ID}",
            json={"name": "No owner"},
        )
        assert resp.status_code == 401

    def test_delete_missing_identity_returns_401(self, client):
        """DELETE sans identité → 401."""
        resp = client.delete(f"/v1/swarms/{TEMPLATE_ID}")
        assert resp.status_code == 401


# ── Tests: User-owned swarm — writes allowed by correct owner ─────────────────

class TestUserSwarmWriteAllowed:
    """User-owned swarms remain editable/deletable by their owner."""

    def test_patch_user_swarm_by_owner_succeeds(self, client):
        """PATCH a user-owned swarm as the correct owner → not 403 or 404."""
        from src.persistence import swarm_store  # noqa: PLC0415
        loaded = _make_user_swarm_loaded(VALID_OWNER)
        with (
            patch.object(swarm_store, "get_swarm", return_value=loaded),
            patch.object(swarm_store, "update_swarm", return_value=True),
        ):
            resp = client.patch(
                f"/v1/swarms/{USER_SWARM_ID}",
                params={"owner_id": VALID_OWNER},
                json={"description": "Updated description"},
            )
        # 200 (success) or 500 if reload fails in mock — not 403 or 404
        assert resp.status_code not in (403, 404), (
            f"User swarm PATCH must not return 403/404, got {resp.status_code}: {resp.text}"
        )

    def test_patch_user_swarm_by_wrong_owner_returns_404(self, client):
        """PATCH a user-owned swarm as a different owner → 404 (scoped, not visible)."""
        from src.persistence import swarm_store  # noqa: PLC0415
        # get_swarm returns None because other owner can't see this swarm
        with patch.object(swarm_store, "get_swarm", return_value=None):
            resp = client.patch(
                f"/v1/swarms/{USER_SWARM_ID}",
                params={"owner_id": OTHER_OWNER},
                json={"description": "Attempt"},
            )
        assert resp.status_code == 404, (
            f"Wrong-owner PATCH must return 404, got {resp.status_code}"
        )


# ── Tests: Template creation locked ──────────────────────────────────────────

class TestTemplateCreationLocked:
    """POST /v1/swarms with is_template=true must be rejected."""

    def test_create_with_is_template_true_returns_403(self, client):
        """Creating a global template via the user API is forbidden."""
        resp = client.post(
            "/v1/swarms",
            params={"owner_id": VALID_OWNER},
            json={
                "name": "Fake global template",
                "is_template": True,
            },
        )
        assert resp.status_code == 403, (
            f"Expected 403 for is_template=true, got {resp.status_code}: {resp.text}"
        )
        assert "global template" in resp.json()["detail"].lower()
        assert "migration" in resp.json()["detail"].lower()

    def test_create_with_is_template_true_in_body_and_query_owner_returns_403(self, client):
        """Combination of body is_template=true with query owner_id → still 403."""
        resp = client.post(
            "/v1/swarms",
            params={"owner_id": VALID_OWNER},
            json={
                "name": "Another attempt",
                "is_template": True,
                "owner_id": VALID_OWNER,  # even with explicit owner → blocked
            },
        )
        assert resp.status_code == 403

    def test_create_without_identity_returns_401(self, client):
        """Identité absente → 401 (gate auth interne, avant le check is_template)."""
        resp = client.post(
            "/v1/swarms",
            json={"name": "No owner"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without identity, got {resp.status_code}"
        )

    def test_create_normal_swarm_not_blocked(self, client):
        """POST with owner_id and is_template=false (default) → not 403."""
        from src.persistence import swarm_store  # noqa: PLC0415
        with (
            patch.object(swarm_store, "create_swarm", return_value="new-swarm-id"),
            patch.object(swarm_store, "get_swarm", return_value={
                "swarm": {
                    "id": "new-swarm-id", "owner_id": VALID_OWNER,
                    "is_template": False, "is_active": True,
                    "name": "Normal Swarm", "description": "",
                    "version": 1, "config_json": {},
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                },
                "agents": [], "tasks": [], "tool_bindings": [],
            }),
        ):
            resp = client.post(
                "/v1/swarms",
                params={"owner_id": VALID_OWNER},
                json={"name": "Normal Swarm"},
            )
        # 201 success, or 500 if sub-operations fail in mock — not 403
        assert resp.status_code != 403, (
            f"Normal swarm creation must not return 403, got {resp.status_code}"
        )

    def test_create_normal_swarm_with_explicit_is_template_false_not_blocked(self, client):
        """Explicit is_template=false → allowed (same as default)."""
        from src.persistence import swarm_store  # noqa: PLC0415
        with (
            patch.object(swarm_store, "create_swarm", return_value="new-swarm-id-2"),
            patch.object(swarm_store, "get_swarm", return_value={
                "swarm": {
                    "id": "new-swarm-id-2", "owner_id": VALID_OWNER,
                    "is_template": False, "is_active": True,
                    "name": "Explicit False Template", "description": "",
                    "version": 1, "config_json": {},
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                },
                "agents": [], "tasks": [], "tool_bindings": [],
            }),
        ):
            resp = client.post(
                "/v1/swarms",
                params={"owner_id": VALID_OWNER},
                json={"name": "Explicit False Template", "is_template": False},
            )
        assert resp.status_code != 403


# ── Tests: _deny_if_global_template helper directly ──────────────────────────

class TestDenyIfGlobalTemplateHelper:
    """Unit tests for the helper function itself."""

    def test_raises_403_for_global_template(self):
        from src.routes.swarms import _deny_if_global_template  # noqa: PLC0415
        import pytest
        loaded = _make_global_template_loaded()
        with pytest.raises(Exception) as exc_info:
            _deny_if_global_template(loaded, "some-id")
        # FastAPI HTTPException has status_code attribute
        assert exc_info.value.status_code == 403  # type: ignore[attr-defined]

    def test_no_raise_for_user_swarm(self):
        from src.routes.swarms import _deny_if_global_template  # noqa: PLC0415
        loaded = _make_user_swarm_loaded(VALID_OWNER)
        # Must not raise
        _deny_if_global_template(loaded, "some-id")

    def test_no_raise_for_user_template(self):
        """A template owned by a user (is_template=True but owner_id set) is NOT global."""
        from src.routes.swarms import _deny_if_global_template  # noqa: PLC0415
        loaded = _make_user_swarm_loaded(VALID_OWNER)
        loaded["swarm"]["is_template"] = True  # template but with owner — not global
        _deny_if_global_template(loaded, "some-id")  # must not raise

    def test_no_raise_for_none(self):
        """None loaded (caller will handle 404 separately)."""
        from src.routes.swarms import _deny_if_global_template  # noqa: PLC0415
        _deny_if_global_template(None, "some-id")  # must not raise

    def test_403_detail_mentions_global_template(self):
        from src.routes.swarms import _deny_if_global_template  # noqa: PLC0415
        import pytest
        loaded = _make_global_template_loaded()
        with pytest.raises(Exception) as exc_info:
            _deny_if_global_template(loaded, "my-template-id")
        detail = exc_info.value.detail  # type: ignore[attr-defined]
        assert "global template" in detail.lower()
        assert "read/run-only" in detail.lower()
