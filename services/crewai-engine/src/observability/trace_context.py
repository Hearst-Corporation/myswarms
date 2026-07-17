"""Tenant-safe trace / audit context.

Goal: make every run / tool / retrieval correlatable by (owner_id, run_id,
trace_id, component, status) WITHOUT ever persisting or logging private content.

Two primitives:
- `current_trace_id()` — best-effort Langfuse (v3 / OTel) trace id for the active
  span. Fail-soft: returns None if Langfuse is absent or the span is closed. Safe
  to pass straight into `run_store.update_run(langfuse_trace_id=...)` /
  `swarm_store.update_swarm_run(langfuse_trace_id=...)` — those skip the field
  when None, so a None never overwrites an existing id.
- `SafeTraceContext` + `log_event(...)` — emit a structured audit line carrying a
  FIXED whitelist of safe fields only. `log_event` has no `**kwargs`, so no
  forbidden field (inputs_json, result_text, output_text, prompts, vault
  snippets, message bodies, tokens, JWTs, service_role) can ever enter the audit
  payload — even if a caller tried.

Security invariant: this module never touches request/response bodies. It only
ever sees ids, an opaque Langfuse trace id (a UUID with no embedded content),
status, duration, and an error CLASS NAME (never an error message).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

# Dedicated audit logger — routes to the same stdout sink (Railway), greppable
# via the "audit" marker without polluting normal app logs' meaning.
logger = logging.getLogger("myswarms.audit")

# Components allowed to appear in an audit line. Anything else is normalised to
# "flow" so a typo can never smuggle free-text into the logs.
_SAFE_COMPONENTS = frozenset(
    {"chief", "architect", "vault", "telegram", "composio", "flow", "swarm"}
)


def current_trace_id() -> str | None:
    """Langfuse trace id for the active OTel span, or None (fail-soft).

    Must be called WHILE the instrumented work is on the stack (e.g. inside the
    thread running `flow.kickoff`) — once the span closes the context is gone and
    this returns None. Never raises.
    """
    try:
        from langfuse import get_client

        tid = get_client().get_current_trace_id()
        return str(tid) if tid else None
    except Exception:  # noqa: BLE001 — observability must never break a run
        return None


@dataclass(frozen=True)
class SafeTraceContext:
    """Owner-attributable correlation context. Carries ONLY safe identifiers."""

    component: str
    owner_id: str | None = None
    run_id: str | None = None
    trace_id: str | None = None
    swarm_id: str | None = None
    tenant_id: str | None = None
    request_id: str | None = None


def safe_trace_context(
    *,
    component: str,
    owner_id: str | None = None,
    run_id: str | None = None,
    trace_id: str | None = None,
    swarm_id: str | None = None,
    tenant_id: str | None = None,
    request_id: str | None = None,
) -> SafeTraceContext:
    """Build a SafeTraceContext, normalising the component to the allowlist."""
    comp = component if component in _SAFE_COMPONENTS else "flow"
    return SafeTraceContext(
        component=comp,
        owner_id=owner_id,
        run_id=run_id,
        trace_id=trace_id,
        swarm_id=swarm_id,
        tenant_id=tenant_id,
        request_id=request_id,
    )


def log_event(
    ctx: SafeTraceContext,
    event: str,
    *,
    status: str | None = None,
    duration_ms: int | None = None,
    error_class: str | None = None,
) -> None:
    """Emit one tenant-safe audit line.

    The payload is built from a FIXED set of keys — the function takes no
    `**kwargs`, so no caller can inject a forbidden/content field. `error_class`
    must be a class name (e.g. `type(exc).__name__`), never an error message.
    """
    payload = {
        "event": str(event),
        "component": ctx.component,
        "owner_id": ctx.owner_id,
        "run_id": ctx.run_id,
        "swarm_id": ctx.swarm_id,
        "tenant_id": ctx.tenant_id,
        "trace_id": ctx.trace_id,
        "request_id": ctx.request_id,
        "status": status,
        "duration_ms": duration_ms,
        "error_class": error_class,
    }
    # Drop None values to keep lines compact; never add anything else.
    payload = {k: v for k, v in payload.items() if v is not None}
    logger.info("audit:%s", event, extra={"audit": payload})


# The exhaustive set of keys log_event may emit. Tests assert nothing outside
# this set can ever appear (anti content-leak contract).
SAFE_AUDIT_KEYS = frozenset(
    {
        "event",
        "component",
        "owner_id",
        "run_id",
        "swarm_id",
        "tenant_id",
        "trace_id",
        "request_id",
        "status",
        "duration_ms",
        "error_class",
    }
)
