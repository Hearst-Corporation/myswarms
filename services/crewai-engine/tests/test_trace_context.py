"""Tests for tenant-safe trace/audit context (observability/trace_context.py).

No network, no Langfuse server, no private content. Proves:
- current_trace_id() is fail-soft (never raises);
- safe_trace_context() normalises the component to the allowlist;
- log_event() emits ONLY whitelisted keys (anti content-leak contract);
- error_class carries a class name only — never a message.
"""
from __future__ import annotations

import logging

import pytest

from src.observability.trace_context import (
    SAFE_AUDIT_KEYS,
    current_trace_id,
    log_event,
    safe_trace_context,
)


# ── current_trace_id — fail-soft ──────────────────────────────────────────────


def test_current_trace_id_failsoft_when_langfuse_raises(monkeypatch: pytest.MonkeyPatch):
    import langfuse

    def _boom():
        raise RuntimeError("langfuse not configured")

    monkeypatch.setattr(langfuse, "get_client", _boom, raising=False)
    assert current_trace_id() is None  # never raises


def test_current_trace_id_returns_id_when_available(monkeypatch: pytest.MonkeyPatch):
    import langfuse

    class _Client:
        def get_current_trace_id(self):
            return "trace-abc-123"

    monkeypatch.setattr(langfuse, "get_client", lambda: _Client(), raising=False)
    assert current_trace_id() == "trace-abc-123"


def test_current_trace_id_none_when_no_active_span(monkeypatch: pytest.MonkeyPatch):
    import langfuse

    class _Client:
        def get_current_trace_id(self):
            return None

    monkeypatch.setattr(langfuse, "get_client", lambda: _Client(), raising=False)
    assert current_trace_id() is None


# ── safe_trace_context — component allowlist ─────────────────────────────────


def test_safe_context_keeps_valid_component():
    ctx = safe_trace_context(component="vault", owner_id="o1", run_id="r1")
    assert ctx.component == "vault"
    assert ctx.owner_id == "o1" and ctx.run_id == "r1"


def test_safe_context_normalises_unknown_component():
    # An unexpected/free-text component can never leak into logs.
    ctx = safe_trace_context(component="inputs_json=SECRET", owner_id="o1")
    assert ctx.component == "flow"


# ── log_event — whitelist only (anti content-leak) ───────────────────────────


class _Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@pytest.fixture
def capture_audit():
    logger = logging.getLogger("myswarms.audit")
    h = _Capture()
    logger.addHandler(h)
    old = logger.level
    logger.setLevel(logging.INFO)
    yield h
    logger.removeHandler(h)
    logger.setLevel(old)


def test_log_event_emits_only_whitelisted_keys(capture_audit):
    ctx = safe_trace_context(
        component="chief", owner_id="owner-1", run_id="run-1", trace_id="t-1", swarm_id="s-1"
    )
    log_event(ctx, "chief_run_finished", status="completed", duration_ms=1200)
    assert len(capture_audit.records) == 1
    payload = capture_audit.records[0].audit
    # Every emitted key is in the safe whitelist — no content key can appear.
    assert set(payload.keys()).issubset(SAFE_AUDIT_KEYS)
    assert payload["owner_id"] == "owner-1"
    assert payload["run_id"] == "run-1"
    assert payload["trace_id"] == "t-1"
    assert payload["status"] == "completed"
    assert payload["duration_ms"] == 1200
    # Forbidden content fields are structurally impossible.
    for forbidden in ("inputs_json", "result_text", "output_text", "message", "prompt", "token"):
        assert forbidden not in payload


def test_log_event_signature_rejects_arbitrary_kwargs(capture_audit):
    ctx = safe_trace_context(component="chief", owner_id="o", run_id="r")
    # No **kwargs → a caller cannot smuggle a content field in.
    with pytest.raises(TypeError):
        log_event(ctx, "evt", result_text="PRIVATE LEAK")  # type: ignore[call-arg]


def test_log_event_error_class_is_name_only(capture_audit):
    ctx = safe_trace_context(component="chief", owner_id="o", run_id="r")
    log_event(ctx, "chief_run_finished", status="failed", error_class="ValueError")
    payload = capture_audit.records[0].audit
    assert payload["error_class"] == "ValueError"
    assert "error_text" not in payload and "message" not in payload


def test_log_event_drops_none_fields(capture_audit):
    ctx = safe_trace_context(component="flow", run_id="r")
    log_event(ctx, "evt")
    payload = capture_audit.records[0].audit
    assert "owner_id" not in payload  # None dropped
    assert payload["run_id"] == "r"
    assert payload["event"] == "evt"
