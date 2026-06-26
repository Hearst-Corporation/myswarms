"""Redaction des textes mémoire avant injection dans le contexte du Chief.

Miroir Python du helper TS `src/lib/platform-admin/redaction.ts`. Garantit
qu'aucun secret ni contenu privé brut n'entre dans le prompt du Chief :
JWT, Bearer, clés sk-/service_role/HF/Composio/Telegram, et troncature des
payloads longs. Aucun secret n'est jamais loggé.
"""

from __future__ import annotations

import re

_MAX_ITEM_CHARS = 800

# Patterns de secrets neutralisés dans tout texte mémoire.
_SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # JWT (header.payload.signature) — tokens Supabase / internes.
    (re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}"), "[REDACTED_JWT]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}"), "[REDACTED_JWT]"),
    # Authorization: Bearer <token>
    (re.compile(r"Bearer\s+[A-Za-z0-9._\-]+", re.IGNORECASE), "Bearer [REDACTED]"),
    # OpenAI / Anthropic / generic sk- keys (sk-, sk-ant-, sk-proj-…).
    (re.compile(r"sk-[A-Za-z0-9_-]{10,}"), "[REDACTED_KEY]"),
    # ElevenLabs sk_ (underscore).
    (re.compile(r"sk_[A-Za-z0-9]{24,}"), "[REDACTED_KEY]"),
    # Hugging Face token.
    (re.compile(r"hf_[A-Za-z0-9]{20,}"), "[REDACTED_KEY]"),
    # Supabase service_role.
    (re.compile(r"service_role", re.IGNORECASE), "[REDACTED_ROLE]"),
    # Composio API key prefix.
    (re.compile(r"ak_[A-Za-z0-9]{10,}"), "[REDACTED_KEY]"),
    # Hypercli key prefix.
    (re.compile(r"hyper_api_[A-Za-z0-9]{10,}"), "[REDACTED_KEY]"),
    # Telegram bot token (digits:base64ish).
    (re.compile(r"\b\d{6,}:[A-Za-z0-9_-]{20,}\b"), "[REDACTED_TOKEN]"),
    # Provider key prefixes (GitHub/Vercel/Cloudflare/Resend/Axiom/Inngest).
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"), "[REDACTED_KEY]"),
    (re.compile(r"\bvc[ip]_[A-Za-z0-9]{20,}"), "[REDACTED_KEY]"),
    (re.compile(r"\bcf(at|ut)_[A-Za-z0-9]{20,}"), "[REDACTED_KEY]"),
    (re.compile(r"\bre_[A-Za-z0-9_]{20,}"), "[REDACTED_KEY]"),
    (re.compile(r"\bsignkey-[A-Za-z0-9-]{20,}"), "[REDACTED_KEY]"),
    # Secret en query-string d'URL.
    (
        re.compile(
            r"([?&](?:api[_-]?key|token|secret|password|access_token|auth)=)[^&\s\"']+",
            re.IGNORECASE,
        ),
        r"\1[REDACTED]",
    ),
]


def redact_sensitive_text(text: str | None, *, max_chars: int = _MAX_ITEM_CHARS) -> str:
    """Neutralise les secrets et tronque un texte mémoire avant injection/log.

    - Remplace tout secret reconnu par un placeholder.
    - Normalise les espaces.
    - Tronque à `max_chars` (ellipsis).
    Retourne "" pour une entrée vide.
    """
    if not text:
        return ""
    out = str(text)
    for pattern, repl in _SECRET_PATTERNS:
        out = pattern.sub(repl, out)
    out = re.sub(r"\s+", " ", out).strip()
    if len(out) > max_chars:
        out = out[:max_chars].rstrip() + "…"
    return out


def contains_secret(text: str | None) -> bool:
    """True si un secret reconnaissable subsiste (utilisé par les tests no-leak)."""
    if not text:
        return False
    return redact_sensitive_text(text, max_chars=10_000) != re.sub(r"\s+", " ", str(text)).strip()


def short_id(value: str | None) -> str:
    """Raccourcit un identifiant (kickoff_id/uuid) à 8 chars + ellipsis."""
    if not value:
        return "—"
    clean = str(value).strip()
    return clean if len(clean) <= 8 else f"{clean[:8]}…"
