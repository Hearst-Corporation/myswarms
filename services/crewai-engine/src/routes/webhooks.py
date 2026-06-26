"""Inbound webhook routes — Hive events → crewai-engine.

All endpoints in this module are protected by HMAC-SHA256 signature verification
via the ``verify_hive_signature`` dependency.

Environment variables
---------------------
HIVE_WEBHOOK_SECRET
    Shared secret used to verify ``X-Hive-Signature`` headers (hex string).
    Required in production (``fail closed`` if absent).
    Optional in development: when absent a WARNING is emitted and verification
    is skipped.  Set ``APP_ENV=development`` to enable dev mode.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])


# ---------------------------------------------------------------------------
# HMAC verification dependency
# ---------------------------------------------------------------------------

async def verify_hive_signature(
    request: Request,
    x_hive_signature: str | None = Header(default=None),
) -> None:
    """FastAPI dependency — verifies the X-Hive-Signature HMAC-SHA256 header.

    Behavior
    --------
    - ``HIVE_WEBHOOK_SECRET`` set + header present + digest matches → pass.
    - ``HIVE_WEBHOOK_SECRET`` set + header absent or digest mismatch → 401.
    - ``HIVE_WEBHOOK_SECRET`` absent in development (``APP_ENV=development``) →
      WARNING emitted, verification skipped.
    - ``HIVE_WEBHOOK_SECRET`` absent in any other environment → 500 (fail closed).
    """
    secret = os.environ.get("HIVE_WEBHOOK_SECRET", "")
    app_env = os.environ.get("APP_ENV", "production")

    if not secret:
        if app_env == "development":
            logger.warning(
                "HIVE_WEBHOOK_SECRET not set — HMAC verification disabled (development mode). "
                "Set HIVE_WEBHOOK_SECRET in .env before deploying to production."
            )
            return
        # Fail closed: refuse to accept webhooks if secret is not configured in non-dev.
        raise HTTPException(
            status_code=500,
            detail="Webhook secret not configured — contact an administrator.",
        )

    if not x_hive_signature:
        raise HTTPException(status_code=401, detail="Missing X-Hive-Signature header")

    body = await request.body()
    computed = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, x_hive_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/hive", dependencies=[Depends(verify_hive_signature)])
async def hive_webhook(request: Request) -> dict:
    """Receive an inbound Hive event.

    The signature is already verified by ``verify_hive_signature``.
    Extend this handler to dispatch events to the appropriate crew or store.
    """
    payload = await request.json()
    event_type = payload.get("event_type", "unknown") if isinstance(payload, dict) else "unknown"
    logger.info("hive_webhook received event_type=%s", event_type)
    return {"status": "received", "event_type": event_type}
