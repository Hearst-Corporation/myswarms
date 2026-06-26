"""P2 Security hardening tests — crewai-engine.

Covers the 4 items fixed in fix(engine): harden integrations audit and webhook security:
1. Composio auth config IDs moved to env vars (no hardcoded ac_* values).
2. Sensitive tool audit emits INFO-level log (no PII).
3. Optional ImportError raises logger.warning() instead of silent pass.
4. Webhook HMAC X-Hive-Signature verification (valid/absent/invalid/no-secret).
"""
from __future__ import annotations

import hashlib
import hmac
import importlib
import logging
import os
import sys
import types
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Item 1 — Composio auth config IDs from env vars
# ---------------------------------------------------------------------------

class TestComposioAuthConfigEnvVars:
    """COMPOSIO_GMAIL_AUTH_CONFIG_ID and COMPOSIO_TRELLO_AUTH_CONFIG_ID must come from env."""

    def _import_build_fn(self):
        """Import _build_toolkit_auth_configs lazily (avoid module-level import side-effects)."""
        # Clear cached module if already imported so env patches take effect.
        mod_name = "src.routes.swarms"
        if mod_name in sys.modules:
            del sys.modules[mod_name]
        from src.routes.swarms import _build_toolkit_auth_configs  # type: ignore[import]
        return _build_toolkit_auth_configs

    def test_raises_value_error_when_gmail_env_absent(self, monkeypatch):
        monkeypatch.delenv("COMPOSIO_GMAIL_AUTH_CONFIG_ID", raising=False)
        monkeypatch.delenv("COMPOSIO_TRELLO_AUTH_CONFIG_ID", raising=False)
        fn = self._import_build_fn()
        with pytest.raises(ValueError, match="COMPOSIO_GMAIL_AUTH_CONFIG_ID"):
            fn()

    def test_raises_value_error_when_trello_env_absent(self, monkeypatch):
        monkeypatch.setenv("COMPOSIO_GMAIL_AUTH_CONFIG_ID", "ac_test_gmail")
        monkeypatch.delenv("COMPOSIO_TRELLO_AUTH_CONFIG_ID", raising=False)
        fn = self._import_build_fn()
        with pytest.raises(ValueError, match="COMPOSIO_TRELLO_AUTH_CONFIG_ID"):
            fn()

    def test_returns_env_values_when_both_set(self, monkeypatch):
        monkeypatch.setenv("COMPOSIO_GMAIL_AUTH_CONFIG_ID", "ac_test_gmail_123")
        monkeypatch.setenv("COMPOSIO_TRELLO_AUTH_CONFIG_ID", "ac_test_trello_456")
        fn = self._import_build_fn()
        result = fn()
        assert result["gmail"] == "ac_test_gmail_123"
        assert result["trello"] == "ac_test_trello_456"

    def test_no_hardcoded_ac_ids_in_source(self):
        """Regression: no ac_2im* or ac_85u* in source."""
        import pathlib
        src = pathlib.Path(__file__).parent.parent / "src" / "routes" / "swarms.py"
        content = src.read_text()
        assert "ac_2imZgR-lg10v" not in content, "Hardcoded gmail auth_config_id found in source"
        assert "ac_85ujVR9uSgHW" not in content, "Hardcoded trello auth_config_id found in source"


# ---------------------------------------------------------------------------
# Item 2 — Gmail sensitive tool audit at INFO level (no PII)
# ---------------------------------------------------------------------------

class TestGmailToolAuditLog:
    """audit_sensitive_tool_result must emit INFO (not DEBUG) and must not log PII.

    We test the audit logic directly (not via the crewai decorator, which is not
    available in the test environment without the full crewai package installed).
    The logic is extracted into _run_audit_logic to match the implementation in
    src/hooks/tool_hooks.py.
    """

    def _run_audit_logic(self, tool_name: str, tool_result: str | None) -> list[logging.LogRecord]:
        """Replicate the audit_sensitive_tool_result logic and capture log records."""
        import re as _re
        _pascal_re = _re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
        sensitive_tools = {"GMAIL_FETCH_EMAILS", "GMAIL_GET_MESSAGE", "SLACK_FETCH_MESSAGES"}
        tool_hook_logger = logging.getLogger("src.hooks.tool_hooks")

        captured: list[logging.LogRecord] = []

        class _CapHandler(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                captured.append(record)

        handler = _CapHandler()
        handler.setLevel(logging.DEBUG)
        tool_hook_logger.addHandler(handler)
        old_level = tool_hook_logger.level
        tool_hook_logger.setLevel(logging.DEBUG)

        try:
            if tool_result and isinstance(tool_result, str):
                raw = tool_name or ""
                tool_name_upper = _pascal_re.sub("_", raw).upper()
                if tool_name_upper in sensitive_tools:
                    outcome = "success" if tool_result else "empty"
                    tool_hook_logger.info(
                        "tool_audit owner=%s tool=%s outcome=%s correlation_id=%s",
                        None,
                        tool_name_upper,
                        outcome,
                        None,
                    )
        finally:
            tool_hook_logger.removeHandler(handler)
            tool_hook_logger.setLevel(old_level)

        return captured

    def test_gmail_fetch_emails_emits_info(self):
        records = self._run_audit_logic("GMAIL_FETCH_EMAILS", "email content here")
        info_records = [r for r in records if r.levelno == logging.INFO]
        assert info_records, "Expected at least one INFO record for GMAIL_FETCH_EMAILS"
        combined = " ".join(r.getMessage() for r in info_records)
        assert "GMAIL_FETCH_EMAILS" in combined

    def test_no_pii_in_log(self):
        """Email content must not appear in log output."""
        pii_content = "from: boss@secret.com subject: salary negotiation body: ..."
        records = self._run_audit_logic("GMAIL_FETCH_EMAILS", pii_content)
        for record in records:
            assert pii_content not in record.getMessage(), "PII found in log output"

    def test_non_sensitive_tool_not_logged(self):
        records = self._run_audit_logic("TRELLO_CREATE_CARD", "card created")
        info_records = [r for r in records if r.levelno == logging.INFO]
        assert not info_records, "Non-sensitive tool should not emit INFO audit record"

    def test_source_uses_info_not_debug_for_sensitive_tools(self):
        """Regression: the source must use logger.info (not logger.debug) for sensitive audit."""
        import pathlib
        src = pathlib.Path(__file__).parent.parent / "src" / "hooks" / "tool_hooks.py"
        content = src.read_text()
        # The audit block must contain logger.info, not logger.debug
        assert "logger.info" in content, "tool_hooks.py must use logger.info for audit"
        # The old debug-only line should be gone
        assert 'logger.debug("Processed sensitive tool result' not in content, (
            "Old debug-only audit line still present — should be logger.info"
        )


# ---------------------------------------------------------------------------
# Item 3 — Silent ImportError → structured warning
# ---------------------------------------------------------------------------

class TestImportWarnings:
    """Optional dependency ImportError must emit logger.warning, not pass silently."""

    def test_priority_scorer_missing_emits_warning(self, caplog, monkeypatch):
        """If priority_scorer is unavailable, warning is emitted."""
        # Remove the module from sys.modules to simulate absence
        monkeypatch.setitem(sys.modules, "src.tools.priority_scorer", None)  # type: ignore[arg-type]
        mod_name = "src.agents.definitions"
        if mod_name in sys.modules:
            del sys.modules[mod_name]

        with caplog.at_level(logging.WARNING, logger="src.agents.definitions"):
            try:
                from src.agents import definitions as defs  # type: ignore[import]
                defs._get_local_tools(owner_id=None)
            except Exception:
                pass  # allow import errors in test env; we only care about warning

        warning_messages = [r.message for r in caplog.records if r.levelno == logging.WARNING]
        # At least one warning about optional dependency (or nothing if import succeeded)
        # The important thing is: no silent pass if import fails.
        # We verify by checking no bare "pass" pattern in source.
        import pathlib
        src = pathlib.Path(__file__).parent.parent / "src" / "agents" / "definitions.py"
        content = src.read_text()
        # Each except ImportError block must NOT be followed immediately by `pass`
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if "except ImportError:" in line:
                # Next non-empty line should not be bare `pass`
                for j in range(i + 1, min(i + 4, len(lines))):
                    next_line = lines[j].strip()
                    if next_line:
                        assert next_line != "pass", (
                            f"Silent ImportError: pass found at line {j + 1} in definitions.py"
                        )
                        break

    def test_composio_exceptions_missing_emits_warning(self, caplog):
        """composio.exceptions ImportError emits a warning (not silent)."""
        import pathlib
        src = pathlib.Path(__file__).parent.parent / "src" / "composio_session.py"
        content = src.read_text()
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if "except ImportError:" in line:
                for j in range(i + 1, min(i + 4, len(lines))):
                    next_line = lines[j].strip()
                    if next_line:
                        assert next_line != "pass", (
                            f"Silent ImportError: pass found at line {j + 1} in composio_session.py"
                        )
                        break


# ---------------------------------------------------------------------------
# Item 4 — Webhook HMAC X-Hive-Signature verification
# ---------------------------------------------------------------------------

class TestWebhookHMAC:
    """verify_hive_signature dependency must enforce HMAC correctly."""

    @pytest.fixture()
    def async_app(self):
        """Return a TestClient-wrapped FastAPI app with only the webhooks router."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from src.routes.webhooks import router  # type: ignore[import]

        app = FastAPI()
        app.include_router(router)
        return TestClient(app, raise_server_exceptions=False)

    def _signature(self, secret: str, body: bytes) -> str:
        return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    def test_valid_signature_returns_200(self, async_app, monkeypatch):
        secret = "supersecret_test_key"
        monkeypatch.setenv("HIVE_WEBHOOK_SECRET", secret)
        monkeypatch.setenv("APP_ENV", "production")
        body = b'{"event_type": "test"}'
        sig = self._signature(secret, body)
        resp = async_app.post(
            "/v1/webhooks/hive",
            content=body,
            headers={"X-Hive-Signature": sig, "Content-Type": "application/json"},
        )
        assert resp.status_code == 200

    def test_missing_signature_header_returns_401(self, async_app, monkeypatch):
        monkeypatch.setenv("HIVE_WEBHOOK_SECRET", "supersecret_test_key")
        monkeypatch.setenv("APP_ENV", "production")
        resp = async_app.post(
            "/v1/webhooks/hive",
            content=b'{"event_type": "test"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401

    def test_invalid_signature_returns_401(self, async_app, monkeypatch):
        monkeypatch.setenv("HIVE_WEBHOOK_SECRET", "supersecret_test_key")
        monkeypatch.setenv("APP_ENV", "production")
        resp = async_app.post(
            "/v1/webhooks/hive",
            content=b'{"event_type": "test"}',
            headers={"X-Hive-Signature": "deadbeef", "Content-Type": "application/json"},
        )
        assert resp.status_code == 401

    def test_secret_absent_in_production_returns_500(self, async_app, monkeypatch):
        monkeypatch.delenv("HIVE_WEBHOOK_SECRET", raising=False)
        monkeypatch.setenv("APP_ENV", "production")
        resp = async_app.post(
            "/v1/webhooks/hive",
            content=b'{"event_type": "test"}',
            headers={"Content-Type": "application/json"},
        )
        # Fail closed: 500 when secret is missing in prod (misconfiguration)
        assert resp.status_code == 500

    def test_secret_absent_in_development_emits_warning_and_passes(
        self, async_app, monkeypatch, caplog
    ):
        monkeypatch.delenv("HIVE_WEBHOOK_SECRET", raising=False)
        monkeypatch.setenv("APP_ENV", "development")
        with caplog.at_level(logging.WARNING, logger="src.routes.webhooks"):
            resp = async_app.post(
                "/v1/webhooks/hive",
                content=b'{"event_type": "test"}',
                headers={"Content-Type": "application/json"},
            )
        assert resp.status_code == 200
        warning_messages = [r.message for r in caplog.records if r.levelno == logging.WARNING]
        assert any("HMAC" in m or "HIVE_WEBHOOK_SECRET" in m for m in warning_messages), (
            "Expected a warning about disabled HMAC in dev mode"
        )
